// Build My Trip realism pass (2026-10-18): live music and family events from What's On, lunch every day, winery
// opening times, road travel times, one "confirm times" note a day, nearby-town meals, family/budget/ski picks and the
// requests the planner mishandled. The requests are the real ones from drafts/site-review-2026-10-18-pass3.md. PURE
// tests on a fixture valley shaped like the live data (opening hours, What's On occurrences); no server, no database.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../discovery-intent.js');
const r = require('../trip-requirements.js');
const tp = require('../trip-planner.js');
const v3 = require('../trip-planner-v3-page.js');
const { t3FrenchPlan } = require('../trip-french-copy.js');

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

const ROAD = '4 day road trip from Vernon down to Osoyoos Oct 23-26, wineries, an easy hike each day and some live music';

test('Events: the road trip gets live music from What’s On on its dates, in an evening slot after dinner, along the route', () => {
  const { p } = plan(ROAD, { events: ROAD_EVENTS });
  assert.equal(p.days.length, 4);
  const shows = p.days.flatMap((day) => day.stops.filter((s) => s.event).map((s) => ({ day, s })));
  assert.equal(shows.length, 1, 'one show for "some live music"');
  const { day, s } = shows[0];
  assert.notEqual(s.event.name, 'Hungry for Laughs Comedy Tour', 'comedy is not live music');
  assert.equal(s.daypart, 'night');
  assert.ok(day.stops.some((x) => x.daypart === 'evening' && x.venue && x.venue.type === 'restaurant'), 'dinner stays');
  assert.ok([].concat(day.regions || day.region).includes(s.event.region) || s.caveats.some((c) => /minutes’ drive from/.test(c)), 'in the day’s town or a nearby one');
  const music = p.requirementResults.find((i) => i.kind === 'event');
  assert.equal(music.status, 'satisfied', music.reason);
  assert.ok(!p.warnings.some((w) => /Not met: live music/.test(w)));
  // The dinner before a 7:30 show ends in time for it.
  const dinner = rows(p, day.day).find((x) => x.venueId && day.stops.find((y) => y.daypart === 'evening').venue.id === x.venueId);
  const show = rows(p, day.day).find((x) => x.eventId);
  if (dinner && Number.isFinite(dinner.endMinutes)) assert.ok(dinner.endMinutes + 30 <= show.startMinutes, `${dinner.endMinutes} -> ${show.startMinutes}`);
});

test('Lunch: every full day of the road trip has lunch, even with an evening event requested', () => {
  const { p } = plan(ROAD, { events: ROAD_EVENTS });
  for (const day of p.days) {
    const lunch = stopsOf(day).find((x) => x.daypart === 'midday');
    assert.ok(lunch && ['restaurant', 'cafe', 'pub'].includes(lunch.fact.type), `day ${day.day}: ${day.stops.map((x) => x.daypart).join(', ')}`);
  }
});

test('Winery times: tastings start at opening (11:00 when unknown), road travel is realistic, one confirm note a day', () => {
  const { p } = plan('2 days in Naramata wineries Oct 24-25');
  for (const day of p.days) {
    for (const x of rows(p, day.day)) {
      const v = BY_ID.get(x.venueId);
      if (v && v.type === 'winery' && Number.isFinite(x.startMinutes)) assert.ok(x.startMinutes >= 11 * 60, `${v.name} at ${x.startMinutes}`);
      if (day.day === 1 && x.transferMinutes) assert.ok(x.transferMinutes <= 15, `${x.transferMinutes} min inside Naramata`);
    }
    assert.match(day.confirmNote || '', /^Day \d: Confirm times before you go\./);
  }
  const all = JSON.stringify(p);
  assert.ok(!/minutes waiting/.test(all), 'no "includes N minutes waiting" text');
  assert.ok(!p.warnings.some((w) => /Provisional visit/.test(w)), 'no per-stop provisional warnings');
  assert.equal(p.warnings.filter((w) => /Confirm times before you go/.test(w)).length, p.days.length);
  assert.ok(!p.days.some((day) => day.stops.some((s) => (s.caveats || []).some((c) => /^(?:Provisional|Estimated) visit/.test(c)))), 'timing is not repeated on every card');
  // The road model: 8.5 km is about a quarter hour, never 43 minutes; a stop next door is 5 minutes.
  const t = r.estimateTransfer({ lat: 49.55, lng: -119.59 }, { lat: 49.6265, lng: -119.59 });
  assert.ok(t.maxMinutes >= 10 && t.maxMinutes <= 16, JSON.stringify(t));
  assert.equal(r.estimateTransfer({ lat: 49.5, lng: -119.5 }, { lat: 49.5, lng: -119.5 }).maxMinutes, 5);
  const far = r.estimateTransfer({ lat: CENTRES.vernon[0], lng: CENTRES.vernon[1] }, { lat: CENTRES.kelowna[0], lng: CENTRES.kelowna[1] });
  assert.ok(far.maxMinutes >= 35 && far.maxMinutes <= 60, JSON.stringify(far));
});

test('Dinner fallback: Naramata on a Sunday with nothing open falls back to Penticton, about 15 minutes away, and says so', () => {
  const { p } = plan('2 days in Naramata wineries Oct 24-25');
  const sunday = p.days[1];
  const dinner = stopsOf(sunday).find((x) => x.daypart === 'evening');
  assert.ok(dinner, 'day 2 has dinner');
  assert.equal(dinner.fact.region, 'penticton');
  assert.ok(dinner.caveats.some((c) => /^In Penticton, about \d+ minutes’ drive: nothing in Naramata fits dinner that day$/.test(c)), dinner.caveats.join(' | '));
  assert.ok(!p.warnings.some((w) => /No sit-down dinner/.test(w)));
});

test('Family: the family weekend includes O’Keefe Ranch’s fall weekend, three food stops a day at most, and an indoor option', () => {
  const { p } = plan('Family weekend in Vernon (kids 6 and 9)', { startDate: '2026-10-24', endDate: '2026-10-25', events: FAMILY_EVENTS, familyEvents: true });
  const events = p.days.flatMap((day) => day.stops.filter((s) => s.event));
  assert.equal(events.length, 1, 'the ranch once, not both days');
  assert.equal(events[0].event.id, OKEEFE_ID);
  assert.ok(!events.some((s) => /Booze/.test(s.event.name)), 'not the bar night');
  assert.ok(events[0].dropIn && events[0].caveats.some((c) => /about 2\.5 hours/.test(c)));
  for (const day of p.days) assert.ok(stopsOf(day).filter((x) => ['restaurant', 'cafe', 'pub', 'cocktail', 'brewery'].includes(x.fact.type)).length <= 3, `day ${day.day}`);
  assert.ok(p.days.flatMap(stopsOf).some((x) => x.fact.type === 'indoor'), 'an attraction or indoor place in late October');
  const okeefe = p.schedule.find((x) => x.eventId === OKEEFE_ID);
  assert.ok(okeefe.endMinutes - okeefe.startMinutes <= 150, 'a drop-in visit, not the whole 10-4 window');
});

test('Family ski: "Ski with the kids at SilverStar" is a ski day with the tube park or snowshoe trails, never the snowmobile club', () => {
  const { p } = plan('Ski with the kids at SilverStar');
  assert.ok(p.days.length >= 1, p.kind);
  const names = p.days.flatMap(stopsOf).map((x) => x.fact.id);
  assert.ok(!names.includes(SNOWMOBILE.id));
  const extra = stopsOf(p.days[0]).find((x) => x.daypart === 'afternoon');
  assert.ok(extra && /tube|snowshoe|skating/i.test(extra.fact.name), extra && extra.fact.name);
  const weekend = plan('ski weekend at SilverStar with the kids').p;
  const dinners = weekend.days.map((day) => stopsOf(day).find((x) => x.daypart === 'evening')?.fact.id);
  assert.notEqual(dinners[0], dinners[1], 'a different dinner each night when there is one');
  assert.ok(weekend.days.flatMap(stopsOf).some((x) => x.fact.id === TUBES.id));
});

test('Budget: no spa, paid tour or outfitter on a budget weekend; free parks and markets instead', () => {
  const { p } = plan('budget weekend in Penticton');
  const ids = p.days.flatMap(stopsOf).map((x) => x.fact.id);
  for (const bad of [SPA, OUTFITTER, TOUR]) assert.ok(!ids.includes(bad.id), bad.name);
  assert.ok(p.days.flatMap(stopsOf).some((x) => /park|market|walk/i.test(x.fact.name)));
});

test('"No driving after 6pm" is an evening rule, not a car-free trip: a full wine day, and nothing reported as ignored', () => {
  const parsed = r.extractTripRequirements({ text: 'wine tour in Naramata, no driving after 6pm', intent: {}, trip: {}, taxonomy: TAXONOMY, referenceDate: '2026-10-18' }).items;
  assert.ok(!parsed.some((i) => i.kind === 'transport'));
  assert.deepEqual(parsed.filter((i) => i.kind === 'evening_walk').map((i) => i.value), [18 * 60]);
  assert.ok(r.extractTripRequirements({ text: 'no car in Kelowna', intent: {}, trip: {}, taxonomy: TAXONOMY }).items.some((i) => i.kind === 'transport'), '"no car" is still car-free');
  const { p } = plan('wine tour in Naramata, no driving after 6pm', { startDate: '2026-10-24' });
  assert.equal(p.days.length, 1);
  assert.ok(stopsOf(p.days[0]).filter((x) => x.fact.type === 'winery').length >= 3, stopsOf(p.days[0]).map((x) => x.fact.name).join(', '));
  assert.ok(!(p.unsupported || []).some((u) => /driv/.test(u)), JSON.stringify(p.unsupported));
  assert.ok(p.notes.some((n) => /^No driving after 18:00: dinner is each day’s last drive/.test(n)));
  assert.equal(p.requirementResults.find((i) => i.kind === 'evening_walk').status, 'satisfied');
  const weekend = plan('Kelowna wine weekend, no driving after 6pm').p;
  assert.ok(weekend.days.every((day) => stopsOf(day).filter((x) => x.fact.type === 'winery').length >= 2));
});

test('"What can we do in Kelowna tonight" in October: no golf course or daytime tour', () => {
  const { p } = plan('what can we do in Kelowna tonight', { clock: { weekday: 'sun', minutes: 19 * 60 }, startWeekday: 'sun' });
  const ids = (p.recommendations || []).map((s) => s.venue.id);
  assert.ok(ids.length > 0);
  assert.ok(!ids.includes(GOLF.id) && !ids.includes(DAY_TOUR.id), (p.recommendations || []).map((s) => s.venue.name).join(', '));
});

test('Summaries: "brewery crawl in Penticton with the dog" names breweries once', () => {
  const { p } = plan('brewery crawl in Penticton with the dog');
  assert.ok(!/breweries, breweries|breweries and breweries/i.test(p.summary), p.summary);
});

test('Ski dinner: "a nice dinner" is $$$ at the hill even while it is closed for the season today; otherwise it says so', () => {
  const { p } = plan('ski weekend at Big White with a nice dinner');
  const dinners = p.days.flatMap((day) => stopsOf(day).filter((x) => x.daypart === 'evening'));
  assert.ok(dinners.some((x) => x.fact.id === STEAKHOUSE.id), dinners.map((x) => x.fact.name).join(', '));
  for (const x of dinners) assert.ok(x.fact.price >= 3 || x.caveats.some((c) => /No \$\$\$ or fine-dining/.test(c)), `${x.fact.name}`);
});

test('Times read like the venue pages: "12 PM – 6 PM" in English, "12 h–18 h" in French', () => {
  assert.equal(v3.t3LocalTimes('Listed hours: 12:00–18:00 Thu–Sun', 'en'), 'Listed hours: 12 PM – 6 PM Thu–Sun');
  assert.equal(v3.t3LocalTimes('Event at 7:30 pm; visit 09:00–10:15', 'en'), 'Event at 7:30 PM; visit 9 AM – 10:15 AM');
  assert.equal(v3.t3LocalTimes('Heures : 12:00–18:00, spectacle 19:30, 07 h', 'fr'), 'Heures : 12 h–18 h, spectacle 19 h 30, 7 h');
  const { p } = plan('2 days in Naramata wineries Oct 24-25');
  const fr = v3.t3LocalTimes(t3FrenchPlan(p), 'fr');
  assert.ok(!/\b\d{2}:\d{2}\b/.test(JSON.stringify(fr.days.map((day) => day.stops.map((s) => [s.why, s.caveats, s.venue && s.venue.listedHours])))), 'no 24-hour colon times left in French');
  assert.ok(fr.warnings.some((w) => /^Jour 1 : confirmez les heures avant de partir\./.test(w)), fr.warnings.join(' | '));
  const en = v3.t3LocalTimes(p, 'en');
  assert.ok(!/\b[0-2]\d:\d{2}\b(?! ?[AP]M)/.test(JSON.stringify(en.days.map((day) => day.stops.map((s) => [s.why, s.caveats])))));
});
