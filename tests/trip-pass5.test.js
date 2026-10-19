// Build My Trip, fifth review pass (2026-10-19): request reading (budget, free and students are not romance; "3 wineries a
// day"; "lunch at a winery"; shows, comedy and pizzerias), requests the plan could not use, an event every evening, meal
// times, drive legs between towns, French copy, "no driving after 18 h" and Swap on a plan with a borrowed dinner.
// The requests are the real ones from drafts/site-review-2026-10-19-pass4.md. PURE tests on the realism fixture valley.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../discovery-intent.js');
const r = require('../trip-requirements.js');
const tp = require('../trip-planner.js');
const v3 = require('../trip-planner-v3-page.js');
const fr = require('../trip-planner-fr.js');
const { t3FrenchPlan, t3FrenchText } = require('../trip-french-copy.js');

const REGIONS = { vernon: 'Vernon', 'lake-country': 'Lake Country', kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', penticton: 'Penticton', naramata: 'Naramata', oliver: 'Oliver', osoyoos: 'Osoyoos', silverstar: 'SilverStar', 'big-white': 'Big White' };
const TAXONOMY = {
  regions: Object.keys(REGIONS), regionLabels: REGIONS,
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'golf', 'beach', 'outdoor', 'tour', 'indoor'],
  features: ['dog_friendly', 'kid_friendly', 'patio'], collections: ['hidden_gem', 'local_favorite'],
  activities: ['hiking', 'winter', 'viewpoints', 'nature'], cuisines: [], budgets: ['budget', 'moderate', 'upscale'], paces: ['relaxed', 'standard', 'packed'],
  datePresets: ['today', 'this-weekend', 'this-week', 'this-month'], eventCategories: ['live-music', 'family-kids', 'nightlife'], venues: [],
};
const T = (s, p) => ({ singular: s, plural: p });
const LABELS = {
  regions: REGIONS,
  types: { restaurant: T('Restaurant', 'Restaurants'), winery: T('Winery', 'Wineries'), cafe: T('Cafe', 'Cafes'), brewery: T('Brewery', 'Breweries'), pub: T('Pub', 'Pubs'), cocktail: T('Cocktail Lounge', 'Cocktail Lounges'),
    golf: T('Golf Course', 'Golf Courses'), beach: T('Beach', 'Beaches'), outdoor: T('Outdoor Destination', 'Outdoor Destinations'), tour: T('Tour', 'Tours'), indoor: T('Indoor', 'Indoor') },
  activities: { hiking: 'Hiking & Trails', winter: 'Winter', viewpoints: 'Viewpoints', nature: 'Nature' }, features: { dog_friendly: 'Dog-Friendly', kid_friendly: 'Kid-Friendly' }, featureNouns: {}, collections: {},
};
// Town centres roughly where they are, so road times between them are realistic (Naramata ~15 min from Penticton).
const CENTRES = { vernon: [50.267, -119.272], 'lake-country': [50.053, -119.414], kelowna: [49.888, -119.496], 'west-kelowna': [49.863, -119.564], penticton: [49.491, -119.589], naramata: [49.596, -119.592], oliver: [49.183, -119.551], osoyoos: [49.032, -119.468], silverstar: [50.359, -119.062], 'big-white': [49.722, -118.929] };
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to, closed = []) => Object.fromEntries(WEEK.map((k) => [k, closed.includes(k) ? [] : [[from, to]]]));
let nextId = 1;
const FACTS = [];
function add(o) {
  const id = nextId++;
  const [lat, lng] = CENTRES[o.region];
  const v = {
    id, name: o.name, region: o.region, type: o.type, url: `/${o.region}/${o.type}/${id}`,
    rating: o.rating === undefined ? 4.5 : o.rating, reviews: 200, price: o.price === undefined ? null : o.price, address: null,
    lat: lat + (o.dLat || 0), lng: lng + (o.dLng || 0), cuisine: null, cuisineLabel: null,
    textName: d.normalizeDiscoveryText(o.name), textCuisine: '', textDesc: d.normalizeDiscoveryText(o.desc || ''), description: o.desc || '', plannerDescription: o.desc || '',
    features: o.features || {}, collections: [], fdTypes: [], hours: o.hours ? JSON.stringify(o.hours) : null,
    seasonClosed: o.seasonClosed || null, seasonClosedToday: !!o.seasonClosedToday, seasonReopens: o.seasonReopens,
  };
  v.activities = [...new Set([...(o.activities || []), ...r.inferPlannerActivities(v)])];
  v.plannerKinds = r.inferPlannerKinds(v);
  FACTS.push(v);
  return v;
}
// Every valley town on the road trip: an easy walk, two wineries with listed hours, cafés and restaurants.
for (const region of ['vernon', 'kelowna', 'penticton', 'oliver', 'osoyoos']) {
  const L = REGIONS[region];
  for (let i = 0; i < 2; i++) add({ name: `${L} Lakeshore Walk ${i + 1}`, region, type: 'outdoor', rating: 4.6, activities: ['hiking', 'nature'], desc: 'An easy walk on a flat lakeshore trail.', dLat: 0.01 * i });
  for (let i = 0; i < (region === 'kelowna' ? 5 : 3); i++) add({ name: `${L} Estate Winery ${i + 1}`, region, type: 'winery', rating: 4.8 - i * 0.05, hours: open('11:00', '17:00'), dLat: 0.012 * i, dLng: 0.01 });
  for (let i = 0; i < 4; i++) add({ name: `${L} Kitchen ${i + 1}`, region, type: 'restaurant', rating: 4.6 - i * 0.05, price: 2 + (i % 2), hours: open('11:00', '22:00'), dLat: 0.004 * i, features: { kid_friendly: true } });
  add({ name: `${L} Coffee Co`, region, type: 'cafe', rating: 4.6, price: 1, desc: 'Coffee and lunch.', hours: open('07:00', '16:00') });
}
// Naramata as listed: tasting rooms without hours, three restaurants closed on Sundays.
const NARAMATA_WINERIES = [0, 1, 2, 3, 4].map((i) => add({ name: `Naramata Bench Winery ${i + 1}`, region: 'naramata', type: 'winery', rating: 4.9 - i * 0.05, dLat: 0.012 * i, dLng: 0.01 * (i % 2) }));
for (let i = 0; i < 3; i++) add({ name: `Naramata Bistro ${i + 1}`, region: 'naramata', type: 'restaurant', rating: 4.7, price: 3, hours: open('11:30', '21:00', ['sun']), dLat: 0.005 * i });
// Vernon family places, an indoor attraction and a gelato stop.
add({ name: 'Vernon Science Centre', region: 'vernon', type: 'indoor', rating: 4.5, hours: open('10:00', '17:00'), desc: 'Hands-on science for kids.', features: { kid_friendly: true } });
add({ name: 'Vernon Bowling Lanes', region: 'vernon', type: 'indoor', rating: 4.4, hours: open('10:00', '22:00'), desc: 'Ten-pin bowling for families.', features: { kid_friendly: true } });
add({ name: 'Vernon Gelato', region: 'vernon', type: 'cafe', rating: 4.8, price: 1, desc: 'Gelato and ice cream.', hours: open('11:00', '21:00'), features: { kid_friendly: true } });
// Penticton budget traps and free places.
const SPA = add({ name: 'Tality Wellness Penticton', region: 'penticton', type: 'indoor', rating: 4.9, reviews: 900, desc: 'A social bathhouse with sauna and cold plunge.', hours: open('09:00', '21:00') });
const OUTFITTER = add({ name: 'Hoodoo Adventure Company', region: 'penticton', type: 'outdoor', rating: 4.9, desc: 'Guided tours and rentals.' });
const TOUR = add({ name: 'Penticton Wine Tours', region: 'penticton', type: 'tour', rating: 4.9, desc: 'Guided wine tours.' });
add({ name: 'Penticton Farmers Market', region: 'penticton', type: 'outdoor', rating: 4.7, desc: 'A free Saturday market downtown.' });
add({ name: 'Okanagan Lake Park', region: 'penticton', type: 'outdoor', rating: 4.6, desc: 'A free waterfront park and promenade.', activities: ['nature'] });
// Kelowna for "tonight": a golf course, a daytime tour, evening places.
const GOLF = add({ name: 'Kelowna Golf Club', region: 'kelowna', type: 'golf', rating: 4.9 });
const DAY_TOUR = add({ name: 'Kelowna Bike Tours', region: 'kelowna', type: 'tour', rating: 4.9, desc: 'Guided daytime rides.' });
add({ name: 'Kelowna Escape Rooms', region: 'kelowna', type: 'indoor', rating: 4.7, hours: open('12:00', '23:00'), desc: 'Escape rooms.' });
add({ name: 'Kelowna Taproom', region: 'kelowna', type: 'pub', rating: 4.5, price: 2, hours: open('11:00', '24:00') });
// SilverStar: the resort and its winter extras.
add({ name: 'SilverStar Mountain Resort', region: 'silverstar', type: 'outdoor', rating: null, activities: ['winter'], desc: 'The North Okanagan ski resort.' });
const SNOWMOBILE = add({ name: 'Vernon Snowmobile Association Trails', region: 'silverstar', type: 'outdoor', rating: 4.9, activities: ['winter'], desc: 'Snowmobile trails.' });
const TUBES = add({ name: 'Tube Town Tube Park', region: 'silverstar', type: 'outdoor', rating: 4.2, activities: ['winter'], desc: 'Snow tubing lanes.' });
add({ name: 'SilverStar Snowshoe Trails', region: 'silverstar', type: 'outdoor', rating: 4.3, activities: ['winter'], desc: 'Snowshoe trails.' });
for (const [n, type, price] of [['The Red Antler', 'restaurant', 2], ['The Den', 'restaurant', 2], ['Bugaboos Bakery', 'cafe', 1]]) add({ name: n, region: 'silverstar', type, rating: 4.5, price, desc: type === 'cafe' ? 'Coffee and breakfast.' : '', features: { kid_friendly: true } });
// Big White: closed for the season today; its fine dining is closed until the lifts open.
add({ name: 'Big White Ski Resort', region: 'big-white', type: 'outdoor', rating: null, activities: ['winter'], desc: 'Big mountain skiing.', seasonClosed: { from: '2026-10-15', to: '2026-11-25' }, seasonClosedToday: true, seasonReopens: '2026-11-26' });
const STEAKHOUSE = add({ name: 'Kettle Valley Steakhouse', region: 'big-white', type: 'restaurant', rating: 4.6, price: 4, seasonClosed: { from: '2026-10-15', to: '2026-11-25' }, seasonClosedToday: true, seasonReopens: '2026-11-26' });
add({ name: 'The Woods', region: 'big-white', type: 'restaurant', rating: 4.3, price: 2 });
add({ name: 'Snowshoe Sams', region: 'big-white', type: 'pub', rating: 4.4, price: 2 });
add({ name: 'Big White Cafe', region: 'big-white', type: 'cafe', rating: 4.4, price: 1, desc: 'Coffee and breakfast.' });
// Penticton brewery crawl with a dog.
for (let i = 0; i < 4; i++) add({ name: `Penticton Brewing ${i + 1}`, region: 'penticton', type: 'brewery', rating: 4.6, price: 2, hours: open('12:00', '22:00'), features: { dog_friendly: true }, dLat: 0.002 * i });
// Listing counts like the live towns (a road trip only stops in towns with 25+ listings): sports clubs nobody asks for.
for (const region of ['kelowna', 'penticton', 'oliver']) for (let i = 0; i < (region === 'kelowna' ? 40 : 20); i++) add({ name: `${REGIONS[region]} Curling Club ${i + 1}`, region, type: 'sport', rating: 3 });
const BY_ID = new Map(FACTS.map((v) => [v.id, v]));

// What's On, as server.js passes it to the planner: one item per occurrence (tripEventOccurrenceItems).
let eventId = 900;
const ev = (o) => ({ id: o.id || eventId++, name: o.name, description: '', region: o.region, venueName: o.venueName || '', url: `/${o.region}/events/x`, valleyWide: false, categories: o.categories, dateLabel: '', time: o.time, startDate: o.date, endDate: o.date, startTime: o.startTime || null, endTime: o.endTime || null, endsNextDay: 0, location: null });
const ROAD_EVENTS = [
  ev({ name: "Hungry for Laughs Comedy Tour", region: 'vernon', categories: ['live-music', 'nightlife'], date: '2026-10-23', time: '7:30 pm' }),
  ev({ name: 'Live Music: Eric Kane at The Hub', region: 'penticton', categories: ['live-music'], date: '2026-10-23', time: '7 pm' }),
  ev({ name: 'GEDfest YLW', region: 'kelowna', categories: ['live-music'], date: '2026-10-24', time: '7:30 pm' }),
  ev({ name: 'Coverboy', region: 'west-kelowna', categories: ['live-music'], date: '2026-10-23', time: '9 pm' }),
];
const OKEEFE_ID = 1025;
const FAMILY_EVENTS = ['2026-10-24', '2026-10-25'].map((date) => ev({ id: OKEEFE_ID, name: "Fall Weekends at O'Keefe Ranch: Corn Maze, Kids Haunted House & Haunted Mini Golf", region: 'vernon', categories: ['family-kids', 'holiday-seasonal'], date, time: '10 am', startTime: '10:00', endTime: '16:00' }))
  .concat(ev({ name: 'Boos and Booze Ghost Tour', region: 'vernon', categories: ['nightlife', 'family-kids'], date: '2026-10-24', time: '8 pm' }));

function plan(text, opts = {}) {
  const intent = d.interpretDiscoveryQuery(text, TAXONOMY);
  const trip = d.interpretTripComponents(text, TAXONOMY, intent);
  const requirements = r.extractTripRequirements({ text, intent, trip, taxonomy: TAXONOMY, referenceDate: '2026-10-18' });
  if (opts.startDate) { requirements.startDate = opts.startDate; requirements.endDate = opts.endDate || null; }
  const p = tp.planTrip({ intent, trip: trip.multi ? trip : null, requirements, facts: FACTS, labels: LABELS, text, tripDate: requirements.startDate || opts.today || '2026-10-18', events: opts.events || null, familyEvents: !!opts.familyEvents, tripEvents: trip.multi ? trip.components.map((c) => (c.kind === 'event' ? [] : null)) : [], clock: opts.clock, startWeekday: opts.startWeekday });
  return { p, intent, requirements };
}
const stopsOf = (day) => day.stops.filter((s) => s.venue).map((s) => ({ ...s, fact: BY_ID.get(s.venue.id) }));
const rows = (p, day) => (p.schedule || []).filter((x) => x.day === day);

const I = (text) => d.interpretDiscoveryQuery(text, TAXONOMY);
const NIGHTS = [
  ev({ name: 'Live Music: The Kelowna Set', region: 'kelowna', categories: ['live-music'], date: '2026-10-24', time: '7:30 pm' }),
  ev({ name: 'Live Music: Penticton Hall Night', region: 'penticton', categories: ['live-music'], date: '2026-10-25', time: '8 pm' }),
  ev({ name: 'Live Music: Oliver Saloon', region: 'oliver', categories: ['live-music'], date: '2026-10-26', time: '7 pm' }),
];

test('Reading: budget, cheap, free and students are a budget trip, never romance', () => {
  for (const text of ['A budget day in Kelowna for two students, mostly free things and cheap eats', 'A cheap weekend in Kelowna on a budget, free things to do', 'a weekend in Kelowna on a budget', 'free things to do in Penticton', 'a student day in Vernon']) {
    const i = I(text);
    assert.equal(i.budget, 'budget', text);
    assert.notEqual(i.occasion, 'romantic', text);
    assert.ok(!i.textTerms.some((w) => ['free', 'mostly', 'students'].includes(w)), `${text}: ${i.textTerms}`);
  }
  assert.equal(I('A budget day in Kelowna for two students').days, 1, '"a budget day" is a one-day plan');
  assert.equal(I('a romantic dinner for two in Kelowna').occasion, 'romantic', 'romance itself still reads as romance');
  assert.equal(I('dinner for two in Kelowna').occasion, 'romantic');
  assert.notEqual(I('gluten free cafe in Kelowna').budget, 'budget', '"gluten free" is not a budget');
  assert.notEqual(I('car free day in Kelowna').budget, 'budget');
  const { p } = plan('A budget day in Kelowna for two students, mostly free things and cheap eats');
  assert.notEqual(p.kind, 'outing');
  assert.ok(!/romantic/i.test(p.summary), p.summary);
  assert.ok(p.days.length === 1 && p.days[0].stops.some((s) => s.venue && s.venue.type === 'outdoor'), 'a free walk or park');
  assert.equal(tp.buildUnderstood(I('a cheap weekend in Kelowna'), null, LABELS, {}).budget, 'budget', 'the budget is shown as understood');
  // French: "pas cher", "gratuit", "étudiants".
  const frText = fr.tripPlannerText('Une journée pas chère à Kelowna pour deux étudiants, surtout des choses gratuites', TAXONOMY);
  assert.equal(I(frText).budget, 'budget', frText);
  assert.notEqual(I(frText).occasion, 'romantic');
});

test('Reading: "3 wineries a day" plans three a day, and "lunch at a winery" is a winery lunch', () => {
  const winery = (day) => stopsOf(day).filter((x) => x.fact.type === 'winery');
  const { p } = plan('2 days of wine in Naramata, 3 wineries a day, lunch at a winery restaurant');
  assert.equal(p.theme, 'wine', 'the wine planner, not one winery a day');
  for (const day of p.days) assert.ok(winery(day).length >= 3 || p.warnings.some((w) => new RegExp(`day ${day.day}`).test(w)), `day ${day.day}: ${stopsOf(day).map((x) => x.fact.name).join(', ')}`);
  assert.ok(p.days.every((day) => winery(day).length >= 2), 'never one a day');
  // A winery with its own kitchen is the lunch when there is one.
  const KITCHEN = add({ name: 'Naramata Estate Winery Bistro', region: 'naramata', type: 'winery', rating: 4.7, desc: 'Tasting room and a restaurant on the patio for lunch.', hours: open('10:00', '18:00') });
  BY_ID.set(KITCHEN.id, KITCHEN);
  try {
    const again = plan('one day in Naramata, 3 wineries, lunch at a winery', { startDate: '2026-10-24' }).p;
    const lunch = stopsOf(again.days[0]).find((x) => x.daypart === 'midday');
    assert.equal(lunch && lunch.fact.id, KITCHEN.id, again.days[0].stops.map((s) => `${s.daypart}:${s.venue && s.venue.name}`).join(', '));
    const req = again.requirementResults.find((i) => i.kind === 'type' && i.value === 'restaurant');
    assert.ok(!req || req.status === 'satisfied', 'the winery lunch counts as the restaurant asked for');
  } finally { FACTS.splice(FACTS.indexOf(KITCHEN), 1); BY_ID.delete(KITCHEN.id); }
  const items = r.extractTripRequirements({ text: 'lunch at a winery', intent: {}, trip: {}, taxonomy: TAXONOMY }).items;
  assert.ok(items.some((i) => i.kind === 'type' && i.value === 'restaurant' && i.wineryLunch));
});

test('Reading: shows, comedy and pizzerias are understood; "show us" is not a show', () => {
  assert.equal(I('a comedy show in Kelowna').mode, 'events');
  assert.deepEqual(I('a comedy show in Kelowna').textTerms, ['comedy']);
  assert.equal(I('comedy night tonight in Penticton').mode, 'events');
  assert.equal(I('a show in Vernon this weekend').mode, 'events');
  assert.deepEqual(I('pizzeria in Penticton').textTerms, ['pizza']);
  assert.notEqual(I('show us the best of Kelowna').mode, 'events');
  const trip = d.interpretTripComponents('dinner and a show in Kelowna', TAXONOMY, I('dinner and a show in Kelowna'));
  assert.ok(trip.multi && trip.components.some((c) => c.kind === 'event'), 'dinner and a show is an outing with an event');
  assert.ok(!d.interpretTripComponents('show me wineries and a beach', TAXONOMY, I('show me wineries and a beach')).components.some((c) => c.kind === 'event'));
  const comedy = r.extractTripRequirements({ text: '3 days in Penticton with a comedy show', intent: {}, trip: {}, taxonomy: TAXONOMY }).items.find((i) => i.kind === 'event');
  assert.equal(comedy.eventKind, 'comedy');
  assert.ok(r.eventMatches({ name: 'Hungry for Laughs Comedy Tour', categories: ['nightlife'] }, comedy));
  assert.ok(!r.eventMatches({ name: 'Live Music: Eric Kane', categories: ['live-music'] }, comedy));
  assert.ok(tp.eventSuitsKind({ name: 'Hungry for Laughs Comedy Tour', categories: [] }, 'comedy'));
  assert.equal(fr.tripPlannerText('spectacle d’humour à Kelowna ce soir', TAXONOMY), 'comedy show in kelowna tonight');
});

test('Evenings: "live music in the evenings" gets a show every evening that has one; "some live music" stays one', () => {
  const { p } = plan('A 3-day road trip from Kelowna to Osoyoos Oct 24-26 with live music in the evenings', { events: NIGHTS });
  const shows = p.days.map((day) => day.stops.filter((s) => s.event).length);
  assert.deepEqual(shows, [1, 1, 1], JSON.stringify(shows));
  for (const day of p.days) assert.ok(stopsOf(day).some((x) => x.daypart === 'evening' && x.fact.type === 'restaurant'), `day ${day.day} has dinner`);
  assert.equal(p.requirementResults.find((i) => i.kind === 'event').status, 'satisfied');
  assert.ok(!p.warnings.some((w) => /“evenings”/.test(w)), '"evenings" is not something to search for');
  // With nothing on the last evening, the check says so instead of "matched".
  const short = plan('A 3-day road trip from Kelowna to Osoyoos Oct 24-26 with live music in the evenings', { events: NIGHTS.slice(0, 2) }).p;
  const music = short.requirementResults.find((i) => i.kind === 'event');
  assert.equal(music.status, 'unverified');
  assert.match(music.reason, /^Found for 2 of 3 evenings; nothing matching is listed on What’s On for day 3\.$/);
  assert.ok(short.warnings.some((w) => /^Not verified: live music — Found for 2 of 3 evenings/.test(w)));
  assert.equal(plan('4 day road trip from Vernon down to Osoyoos Oct 23-26, wineries, an easy hike each day and some live music', { events: ROAD_EVENTS }).p.days.flatMap((day) => day.stops.filter((s) => s.event)).length, 1);
  assert.ok(!tp.eventsEachEvening('2 nights in Kelowna with live music') && tp.eventsEachEvening('a show every night') && tp.eventsEachEvening('concerts in Penticton'));
});

test('Meals: a place that opens at 3:30 PM is never the lunch, and every evening is dinner rather than a bar', () => {
  const LATE = add({ name: 'Penticton Late Greek', region: 'penticton', type: 'restaurant', rating: 5, reviews: 2000, price: 2, hours: open('15:30', '21:30'), dLat: 0.001 });
  BY_ID.set(LATE.id, LATE);
  try {
    const { p } = plan('A 3-day road trip from Kelowna to Osoyoos Oct 24-26 with live music in the evenings', { events: NIGHTS });
    for (const row of p.schedule.filter((x) => x.venueId)) {
      const day = p.days.find((dd) => dd.day === row.day), stop = day.stops.find((s) => s.venue && s.venue.id === row.venueId);
      if (stop.daypart === 'midday' && Number.isFinite(row.startMinutes)) assert.ok(row.startMinutes >= 11 * 60 + 30 && row.startMinutes <= 13 * 60 + 30, `${stop.venue.name} lunch at ${row.startMinutes}`);
    }
    assert.ok(!p.days.some((day) => day.stops.some((s) => s.daypart === 'midday' && s.venue && s.venue.id === LATE.id)), 'not lunch');
    for (const day of p.days) {
      const dinner = stopsOf(day).find((x) => x.daypart === 'evening');
      assert.ok(dinner && dinner.fact.type === 'restaurant', `day ${day.day}: ${dinner && dinner.fact.name}`);
    }
  } finally { FACTS.splice(FACTS.indexOf(LATE), 1); BY_ID.delete(LATE.id); }
});

test('Drive legs: a road trip day starts with the drive from the last town, shown in English and French', () => {
  const { p } = plan('A 3-day road trip from Kelowna to Osoyoos Oct 24-26');
  assert.equal(p.days[0].driveIn, undefined);
  const leg = p.days[1].driveIn;
  assert.ok(leg && leg.fromLabel === 'Kelowna' && leg.toLabel === 'Penticton', JSON.stringify(leg));
  assert.ok(leg.maxMinutes >= 35 && leg.maxMinutes <= 75, JSON.stringify(leg));
  assert.match(v3.t3DriveText(leg, 'en'), /^Drive from Kelowna to Penticton: about \d+–\d+ min \(estimate\)$/);
  assert.match(v3.t3DriveText(leg, 'fr'), /^Trajet de Kelowna à Penticton : environ \d+ à \d+ min \(estimation\)$/);
  // A dinner borrowed from the next town says how far it is.
  const sunday = plan('2 days in Naramata wineries Oct 24-25').p.days[1];
  const borrowed = sunday.stops.find((s) => s.venue && s.venue.region === 'penticton' && s.driveFrom);
  assert.ok(borrowed, sunday.stops.map((s) => `${s.daypart}:${s.venue && s.venue.region}`).join(', '));
});

test('Not used: a request the plan could not use is listed, never hidden behind "all matched"', () => {
  assert.deepEqual(v3.t3DroppedRequests({ understood: { notUsed: ['hot air balloon'] }, unsupported: ['hot air balloon', 'helicopter'] }), ['hot air balloon', 'helicopter']);
  assert.deepEqual(v3.t3DroppedRequests({ understood: { notUsed: [] } }), []);
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.match(src, /checks\.every\(function\(i\)\{ return i\.status === 'satisfied'; \}\)\) return html;/);
  assert.match(src, /if \(html && t3DroppedRequests\(p\)\.length\)/, 'the "all matched" line is skipped when something was not used');
});

test('No driving after 18 h (French) is an evening rule, not a car-free day', () => {
  for (const [text, minutes] of [['Route des vins à Naramata, pas de conduite après 18 h', 18 * 60], ['pas de conduite après 18h30', 18 * 60 + 30], ['no driving after 6:30pm', 18 * 60 + 30], ['no driving after 9', 21 * 60]]) {
    const items = r.extractTripRequirements({ text: fr.tripPlannerText(text, TAXONOMY), intent: {}, trip: {}, taxonomy: TAXONOMY }).items;
    assert.ok(!items.some((i) => i.kind === 'transport'), `${text}: ${JSON.stringify(items)}`);
    assert.deepEqual(items.filter((i) => i.kind === 'evening_walk').map((i) => i.value), [minutes], text);
  }
  const en = fr.tripPlannerText('Route des vins à Naramata le 24 octobre, pas de conduite après 18 h', TAXONOMY);
  const { p } = plan(en, { startDate: '2026-10-24' });
  assert.ok(stopsOf(p.days[0]).filter((x) => x.fact.type === 'winery').length >= 2, 'a full wine day');
  assert.equal(t3FrenchText(p.notes.find((n) => /^No driving after/.test(n))), 'Pas de voiture après 18:00 : le souper est le dernier trajet de chaque jour, et ce qui suit est à quelques pas.');
});

test('French: the planner’s notes, reasons, checks and dates read in French', () => {
  const { p } = plan('A 3-day road trip from Kelowna to Osoyoos Oct 24-26 with live music in the evenings', { events: NIGHTS.slice(0, 2) });
  const f = v3.t3LocalTimes(t3FrenchPlan(p), 'fr');
  const shown = [...f.notes, ...f.warnings, ...f.days.flatMap((day) => [day.confirmNote || '', ...day.stops.flatMap((s) => s.why || [])]), ...f.requirementResults.map((i) => i.reason || '')];
  const english = shown.filter((t) => /\b(?:Listed hours|Stops are|planned as a|Trip starts|Confirm times|Found for|evenings|days planned|Price level)\b/.test(t));
  assert.deepEqual(english, []);
  assert.ok(!shown.some((t) => /\b20\d\d-\d\d-\d\d\b/.test(t)), 'no ISO dates');
  assert.ok(f.notes.some((n) => /^Le voyage commence le 24 octobre 2026/.test(n)), f.notes.join(' | '));
  assert.equal(t3FrenchText('Listed hours Saturday: 11:00–17:00'), 'Horaires indiqués le samedi : 11 h–17 h');
  assert.equal(t3FrenchText('Price level $ fits your budget preference'), 'Niveau de prix $ : convient à votre budget');
  assert.equal(t3FrenchText('Found for 2 of 3 evenings; nothing matching is listed on What’s On for day 3.'), 'Trouvé pour 2 soirées sur 3; rien de correspondant n’est répertorié à l’affiche pour le jour 3.');
});

test('Swap: a plan whose dinner comes from the next town can still swap another stop (no 409 on the kept dinner)', () => {
  const text = '2 days in Naramata Oct 24-25, a walk and dinner each day';
  const first = plan(text);
  const pinned = {};
  for (const day of first.p.days) for (const s of day.stops) if (s.venue) pinned[`${day.day}-${s.daypart}`] = s.venue.id;
  const borrowed = Object.entries(pinned).find(([key, id]) => BY_ID.get(id).region === 'penticton');
  assert.ok(borrowed, 'the fixture borrows a Penticton dinner');
  const swapKey = Object.keys(pinned).find((k) => k !== borrowed[0]);
  const avoid = [pinned[swapKey]];
  delete pinned[swapKey];
  const again = tp.planTrip({ intent: I(text), trip: null, requirements: first.requirements, facts: FACTS, labels: LABELS, text, tripDate: first.requirements.startDate, pinned, avoidIds: avoid, tripEvents: [] });
  const [day, part] = borrowed[0].split('-');
  assert.ok(again.days[Number(day) - 1].stops.some((s) => s.daypart === part && s.venue && s.venue.id === borrowed[1]), 'the borrowed dinner is kept');
});
