'use strict';
// Build My Trip QA pass (2026-11-05): overseas visitors, same-day and next-day trips, different groups.
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../discovery-intent.js');
const tr = require('../trip-requirements.js');
const tp = require('../trip-planner.js');

const TAXONOMY = {
  regions: ['kelowna', 'west-kelowna', 'vernon', 'penticton'],
  regionLabels: { kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', vernon: 'Vernon', penticton: 'Penticton' },
  types: ['restaurant', 'cafe', 'winery', 'brewery', 'pub', 'cocktail', 'distillery', 'beach', 'outdoor', 'golf', 'indoor', 'tour', 'sport'],
  features: ['dog_friendly', 'kid_friendly', 'patio', 'lake_view'],
  collections: [],
  activities: ['hiking', 'nature', 'viewpoints', 'water', 'winter', 'cycling'],
  budgets: ['budget', 'moderate', 'upscale'],
  cuisines: [],
  datePresets: ['today', 'this-weekend', 'this-week', 'this-month'],
  eventCategories: [],
};
const parse = (text) => d.interpretDiscoveryQuery(text, TAXONOMY, { tripPlanner: true });
const leftovers = (i) => [...i.textTerms, ...i.foodTerms.map((f) => f.term), ...i.unsupported];

test('where the visitor is travelling from is not a thing to search for', () => {
  for (const [text, word] of [
    ['I am flying in from Sydney next July for 5 days, wineries', 'sydney'],
    ['Honeymoon from Tokyo, 4 days, romantic wine', 'tokyo'],
    ['Family from Germany, a week in August', 'germany'],
    ['Solo traveller from India, vegetarian, 3 days in Kelowna', 'india'],
    ['Visiting from Brazil for 2 days in Vernon in December', 'brazil'],
    ['Wedding guests arriving from the UK in October, 3 days of wineries', 'uk'],
  ]) assert.ok(!leftovers(parse(text)).some((w) => String(w).toLowerCase().includes(word)), text);
  // A cuisine named after a country is still a cuisine.
  assert.ok(!/german|indian/.test(JSON.stringify(parse('3 days in Kelowna, Indian food').unsupported)));
});

test('travel words (traveller, land, airport, layover, free time, conference) are not search words', () => {
  const i = parse('We land at Kelowna airport from London on June 12 and have 5 days, couple in our 60s, wineries');
  assert.deepEqual(leftovers(i), []);
  assert.deepEqual(i.regions, ['kelowna']);
  assert.equal(i.days, 5);
  assert.deepEqual(leftovers(parse('I have a 5 hour layover at Kelowna airport on Saturday')).filter((w) => /layover|airport/.test(w)), []);
  assert.deepEqual(leftovers(parse('I am in Kelowna for a conference tomorrow and have free time from 3pm to 7pm')), []);
  // The airport venue itself still resolves by name when it is the whole request.
  assert.ok(!/airport/.test(JSON.stringify(parse('a quick coffee near the airport in Kelowna').unsupported)));
});

test('"10 days" plans the first week (it fell back to a one-day plan)', () => {
  const i = parse('10 days in the Okanagan, wineries and beaches');
  assert.equal(i.days, 7);
  assert.ok(i.unsupported.some((u) => /10 days/.test(u) && /first 7/.test(u)), JSON.stringify(i.unsupported));
  assert.equal(parse('3 days in Kelowna').days, 3);
});

test('"in four months" becomes that month, so the season rules apply', () => {
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const i = parse('in four months, 5 days of wineries in Kelowna');
  const want = months[new Date(Date.now() + 120 * 86400000).getUTCMonth()];
  assert.ok(i.month === want || i.season, JSON.stringify({ month: i.month, season: i.season, want }));
  assert.ok(!leftovers(i).some((w) => /months?/.test(w)));
});

test('money no object is an upscale trip; a nap, ages and the kind of party are not search words', () => {
  assert.equal(parse('luxury trip for two, 3 days, money no object, Kelowna').budget, 'upscale');
  assert.deepEqual(leftovers(parse('two toddlers and a baby, an easy day in Vernon with a nap in the middle')), []);
  assert.deepEqual(leftovers(parse('family, kids aged 8 and 11, 3 days in Kelowna')), []);
  assert.deepEqual(leftovers(parse('a retirement party for 20 people, lunch and a winery tour, Penticton')), []);
  assert.deepEqual(leftovers(parse('school group of 30 kids aged 10, a day in Kelowna')), []);
});

test('cyclists and educational trips are understood; lake towns means the whole valley', () => {
  assert.ok(parse('cyclists, 3 days in Penticton').activities.includes('cycling'));
  assert.ok(parse('educational day in Kelowna').types.includes('indoor'));
  assert.deepEqual(parse('a week next summer, lake towns').regions, []);
  assert.ok(!leftovers(parse('a week next summer, lake towns')).includes('towns'));
});

test('a SilverStar ski plan counts SilverStar Mountain Resort as skiing (only "Ski Resort" names did)', () => {
  for (const name of ['SilverStar Mountain Resort', 'Apex Mountain Resort', 'Big White Ski Resort']) {
    assert.ok(tr.inferPlannerActivities({ type: 'outdoor', name, description: '' }).includes('skiing'), name);
  }
  assert.ok(!tr.inferPlannerActivities({ type: 'outdoor', name: 'SilverStar Fat Bike Trails', description: 'Groomed trails.' }).includes('skiing'));
});

test('"a sunset and dinner" is two stops, like "a sunset viewpoint then dinner" (it was an empty Ideas list)', () => {
  const text = 'a sunset and dinner in Kelowna tomorrow';
  const intent = parse(text);
  const trip = d.interpretTripComponents(text, TAXONOMY, intent);
  const req = tr.extractTripRequirements({ text, intent, trip, taxonomy: TAXONOMY, referenceDate: '2026-11-05' });
  const out = tr.expandTripComponents(trip, req);
  assert.equal(out.multi, true);
  assert.ok(out.components.some((c) => (c.plannerKinds || []).includes('sunset')), JSON.stringify(out.components));
  assert.ok(out.components.some((c) => c.meal === 'dinner'));
});

test('"not skiing" is not a ski trip (a week in February "not skiing" was seven days at Big White)', () => {
  for (const text of ['a week in the okanagan in february not skiing i hate the cold', 'no skiing please', 'we do not ski', 'we don t want to ski', 'winter weekend without skiing']) {
    assert.equal(tp.skiWordsAsked(text), false, text);
  }
  for (const text of ['3 days skiing at big white', 'a ski trip in january', 'skiing but not snowboarding', 'we love skiing no cooking']) {
    assert.equal(tp.skiWordsAsked(text), true, text);
  }
  assert.deepEqual(parse('a week in February, not skiing, I hate the cold').textTerms, []);
});

test('a dated meal is that part of the day, so a lunch-only café is not listed for dinner', () => {
  assert.equal(parse('dinner for 6 in Kelowna tomorrow').when.daypart, 'evening');
  assert.equal(parse('lunch in Kelowna on Saturday').when.daypart, 'afternoon');
  assert.equal(parse('brunch in Kelowna tomorrow').when.daypart, 'morning');
  assert.equal(parse('dinner in Kelowna').when, null, 'no day, no daypart');
});

test('"a birthday dinner, then drinks" keeps the dinner as the meal, so the drinks come after it', () => {
  const text = 'a birthday dinner on Friday in Penticton, then drinks';
  const intent = parse(text);
  const trip = d.interpretTripComponents(text, TAXONOMY, intent);
  assert.equal(trip.components[0].meal, 'dinner');
  assert.ok(trip.components[1].types.some((ty) => ['pub', 'cocktail'].includes(ty)));
});

test('"what\'s open right now in Vernon" asks for things to do now, not places that mention "open"', () => {
  const i = parse("what's open right now in Vernon");
  assert.deepEqual(i.textTerms, []);
  assert.equal(i.when.now, true);
  assert.deepEqual(i.regions, ['vernon']);
});

test('date ranges: "June 12 to June 16", "from July 3rd until the 9th", "arriving Dec 20, leaving Dec 27", "Dec 20 to Jan 2"', () => {
  const cal = (text) => tr.tripCalendar(text, '2026-11-05');
  let r = cal('June 12 to June 16, Kelowna, wineries and beaches');
  assert.deepEqual([r.startDate, r.endDate, r.days], ['2027-06-12', '2027-06-16', 5]);
  r = cal('we are there from July 3rd until the 9th, couple');
  assert.deepEqual([r.startDate, r.endDate, r.days], ['2027-07-03', '2027-07-09', 7]);
  r = cal('from the 3rd to the 9th of July');
  assert.deepEqual([r.startDate, r.endDate], ['2027-07-03', '2027-07-09']);
  r = cal('arrive Oct 5 and leave Oct 9, wine');
  assert.deepEqual([r.startDate, r.endDate, r.days], ['2027-10-05', '2027-10-09', 5]);
  r = cal('arriving December 20, leaving December 27');
  assert.equal(r.startDate, '2026-12-20');
  assert.equal(r.endDate, '2026-12-26', 'a week at a time: the first seven days');
  assert.equal(r.trimmed, 8);
  assert.equal(r.conflict, null);
  r = cal('Dec 20 to Jan 2');
  assert.equal(r.startDate, '2026-12-20');
  assert.equal(r.trimmed, 14);
  // Existing forms are unchanged.
  r = cal('Aug 1-4 Kelowna');
  assert.deepEqual([r.startDate, r.endDate, r.days], ['2027-08-01', '2027-08-04', 4]);
  assert.equal(cal('May 5th, we have a wedding').endDate, null);
  assert.ok(cal('Jan 1 to Dec 31').conflict, 'a whole year is still not planned');
});

test('Server: a date range with two kinds of stop is a day-by-day trip of that length (it was a two-stop outing)', () => {
  process.env.TRIP_PLANNER_V2 = 'on';
  const app = require('../server.js');
  const p = app.runTripPlan({ text: 'June 12 to June 16, Kelowna, wineries and dinner' });
  assert.equal(p.kind, 'multi_day');
  assert.equal(p.days.length, 5);
  const q = app.runTripPlan({ text: 'arriving December 20, leaving December 27, Kelowna, wineries and dinner' });
  assert.equal(q.kind, 'multi_day');
  assert.equal(q.days.length, 7);
  assert.ok(q.warnings.some((w) => /cover 8 days/.test(w)), JSON.stringify(q.warnings));
});

test('Server: a craft beer tour is a run of breweries, not a tour company (it was a farm tour)', () => {
  process.env.TRIP_PLANNER_V2 = 'on';
  const app = require('../server.js');
  const p = app.runTripPlan({ text: 'craft beer tour in Kelowna for 6 people Saturday afternoon' });
  const stops = (p.itinerary && p.itinerary.stops || []).filter((s) => s.venue);
  assert.ok(stops.length >= 2, JSON.stringify(stops.map((s) => s.venue.name)));
  assert.ok(stops.every((s) => s.venue.type === 'brewery'), JSON.stringify(stops.map((s) => [s.venue.name, s.venue.type])));
});

test('"for my sister\'s wedding" and "we have the Friday free" are not search words', () => {
  const i = parse("I'm visiting for my sister's wedding in Penticton in June, we have the Friday free, 6 of us");
  assert.deepEqual(leftovers(i), []);
  assert.deepEqual(i.when, { weekday: 'friday' });
});

test('holiday weekends are the dates of that long weekend', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  assert.match(d.holidayWeekendDates('thanksgiving', now), /october 9 to october 11 2027/);
  assert.match(d.holidayWeekendDates('canada day', now), /july 1 to july 4 2027/);
  assert.match(d.holidayWeekendDates('easter', now), /march 27 to march 29 2027/);
  assert.equal(d.holidayWeekendDates('nonsense', now), null);
});

test('Server: "Canada Day weekend in Penticton" plans the four days of that break', () => {
  process.env.TRIP_PLANNER_V2 = 'on';
  const app = require('../server.js');
  const p = app.runTripPlan({ text: 'Canada Day weekend in Penticton' });
  assert.equal(p.kind, 'multi_day');
  assert.equal(p.days.length, 4);
});

test('"remote worker", "solo", "bachelor party" and "cold and rainy" are not search words', () => {
  for (const text of ['remote worker, 5 days in Vernon, a good cafe to work from', 'solo trip to Kelowna, 2 days, good coffee', 'bachelor party in Penticton, 3 days', 'cold and rainy weekend in Kelowna']) {
    const i = parse(text);
    assert.deepEqual(leftovers(i), [], text + ' -> ' + JSON.stringify(leftovers(i)));
  }
});

test('"we don\'t drive" and "relying on transit" are a car-free trip, not search words', () => {
  const cal = (text) => { const i = parse(text); return tr.extractTripRequirements({ text, intent: i, trip: {}, taxonomy: TAXONOMY, referenceDate: '2026-11-05' }); };
  for (const text of ["we don't drive, 3 days in Kelowna", '4 days in Kelowna, relying on transit']) {
    const r = cal(text);
    assert.ok(r.items.some((i) => i.kind === 'transport'), text + ' ' + JSON.stringify(r.items.map((i) => i.kind)));
  }
});

test('"before our flight", "spending 2 nights", "beginners", "colours" and "spring break" are not search words', () => {
  for (const text of ['3 afternoon hours in Penticton before our flight', 'road trip stopping for lunch in Vernon and spending 2 nights in Kelowna', 'first time wine tasting in Naramata for beginners', 'fall colours weekend in Kelowna, wine']) {
    const i = parse(text);
    assert.deepEqual(leftovers(i).filter((w) => /flight|spending|stopping|beginner|first|colou?r/i.test(w)), [], text);
  }
});

test('"two days Kelowna and one day Vernon" is one trip of the total length', () => {
  assert.equal(d.mergeSegmentStays('two days kelowna and one day vernon wine and food couple'), '3 days in kelowna and vernon wine and food couple');
  assert.equal(d.mergeSegmentStays('2 nights penticton then 2 nights vernon, hiking'), '5 days in penticton and vernon, hiking');
  assert.equal(d.mergeSegmentStays('2 days in kelowna and 1 day hiking'), '2 days in kelowna and 1 day hiking');
  const i = parse('two days Kelowna and one day Vernon, wine and food, couple');
  assert.equal(i.days, 3);
});

test('"Instagrammable", "locals only", "3 generations", "I have a car with a bike rack" and "a snowy day" are read, not searched', () => {
  for (const text of ['the most Instagrammable spots in Kelowna for a day', 'we are 3 generations, 6 people, 2 days in Vernon, mostly outdoors', 'I have a car with a bike rack, 3 days cycling, Penticton', 'dinner in Kelowna for kids on a snowy day']) {
    const i = parse(text);
    assert.deepEqual(leftovers(i).filter((w) => /instagram|generation|^car$|^rack$|snowy/i.test(w)), [], text);
  }
  assert.equal(parse('dinner in Kelowna for kids on a snowy day').occasion, 'rainy_day');
});

test('a sunrise hike is a morning hike', () => {
  const i = parse('sunrise hike then breakfast in Kelowna tomorrow');
  assert.ok(!leftovers(i).includes('sunrise'), JSON.stringify(leftovers(i)));
  assert.equal(i.when && i.when.daypart, 'morning');
});
