// Build My Trip, round 7 (2026-10-19): season checks on the trip's own dates, Swap that never drops or repeats a stop,
// Okanagan Lake crossings, lunch at a winery that serves food, event times and lengths, thin afternoons and themes,
// road-trip direction and start times, dated one-day plans in My Trip, and the French chips. The requests are the real
// ones from drafts/site-review-2026-10-19-pass6.md. PURE tests on a small fixture valley (no server.js, no database).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const d = require('../discovery-intent.js');
const r = require('../trip-requirements.js');
const tp = require('../trip-planner.js');
const { t3FrenchPlan, t3FrenchText } = require('../trip-french-copy.js');

const REGIONS = { vernon: 'Vernon', kelowna: 'Kelowna', penticton: 'Penticton', naramata: 'Naramata', summerland: 'Summerland', oliver: 'Oliver', osoyoos: 'Osoyoos', silverstar: 'SilverStar', 'big-white': 'Big White' };
const TAXONOMY = {
  regions: Object.keys(REGIONS), regionLabels: REGIONS,
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'golf', 'beach', 'outdoor', 'tour', 'indoor'],
  features: ['dog_friendly', 'kid_friendly', 'patio', 'vegan'], collections: ['hidden_gem', 'local_favorite'],
  activities: ['hiking', 'winter', 'viewpoints', 'nature'], cuisines: [], budgets: ['budget', 'moderate', 'upscale'], paces: ['relaxed', 'standard', 'packed'],
  datePresets: ['today', 'this-weekend', 'this-week', 'this-month'], eventCategories: ['live-music', 'family-kids', 'holiday-seasonal', 'arts-culture'], venues: [],
};
const T = (s, p) => ({ singular: s, plural: p });
const LABELS = {
  regions: REGIONS,
  types: { restaurant: T('Restaurant', 'Restaurants'), winery: T('Winery', 'Wineries'), cafe: T('Cafe', 'Cafes'), brewery: T('Brewery', 'Breweries'), pub: T('Pub', 'Pubs'), cocktail: T('Cocktail Lounge', 'Cocktail Lounges'),
    golf: T('Golf Course', 'Golf Courses'), beach: T('Beach', 'Beaches'), outdoor: T('Outdoor Destination', 'Outdoor Destinations'), tour: T('Tour', 'Tours'), indoor: T('Indoor', 'Indoor') },
  activities: { hiking: 'Hiking & Trails', winter: 'Winter', viewpoints: 'Viewpoints', nature: 'Nature' }, features: { dog_friendly: 'Dog-Friendly', kid_friendly: 'Kid-Friendly', vegan: 'Vegan-Friendly' }, featureNouns: {}, collections: {},
};
// Town centres where they are, so the lake and the road times are real (Naramata and Summerland face each other).
const CENTRES = { vernon: [50.267, -119.272], kelowna: [49.888, -119.47], penticton: [49.48, -119.585], naramata: [49.594, -119.588], summerland: [49.602, -119.677], oliver: [49.183, -119.551], osoyoos: [49.032, -119.468], silverstar: [50.359, -119.062], 'big-white': [49.722, -118.929] };
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
let nextId = 1;
const FACTS = [];
function add(o) {
  const id = nextId++;
  const [lat, lng] = CENTRES[o.region];
  const v = {
    id, name: o.name, region: o.region, type: o.type, url: `/${o.region}/${o.type}/${id}`,
    rating: o.rating === undefined ? 4.5 : o.rating, reviews: 200, price: o.price === undefined ? 2 : o.price, address: null,
    lat: lat + (o.dLat || 0), lng: lng + (o.dLng || 0), cuisine: null, cuisineLabel: null,
    textName: d.normalizeDiscoveryText(o.name), textCuisine: '', textDesc: d.normalizeDiscoveryText(o.desc || ''), description: o.desc || '', plannerDescription: o.desc || '',
    features: o.features || {}, collections: [], fdTypes: [], hours: o.hours ? JSON.stringify(o.hours) : null,
    seasonClosed: o.seasonClosed || null, seasonClosedToday: !!o.seasonClosedToday, seasonReopens: o.seasonReopens, openMonths: o.openMonths,
  };
  v.activities = [...new Set([...(o.activities || []), ...r.inferPlannerActivities(v)])];
  v.plannerKinds = r.inferPlannerKinds(v);
  FACTS.push(v);
  return v;
}
for (const region of ['vernon', 'kelowna', 'penticton', 'oliver', 'osoyoos']) {
  const L = REGIONS[region];
  for (let i = 0; i < 2; i++) add({ name: `${L} Creek Trail ${i + 1}`, region, type: 'outdoor', rating: 4.6, activities: ['hiking', 'nature'], desc: 'An easy family walk on a creek trail.', dLat: 0.01 * i, features: { kid_friendly: true } });
  for (let i = 0; i < 3; i++) add({ name: `${L} Estate Winery ${i + 1}`, region, type: 'winery', rating: 4.8 - i * 0.05, hours: open('10:00', '18:00'), dLat: 0.012 * i, dLng: 0.01 });
  for (let i = 0; i < 4; i++) add({ name: `${L} Kitchen ${i + 1}`, region, type: 'restaurant', rating: 4.6 - i * 0.05, price: 2 + (i % 2), hours: open('11:00', '22:00'), dLat: 0.004 * i, features: { kid_friendly: true } });
  add({ name: `${L} Coffee Co`, region, type: 'cafe', rating: 4.6, price: 1, desc: 'Coffee and lunch.', hours: open('07:00', '16:00'), features: { kid_friendly: true } });
  add({ name: `${L} Kids Science Centre`, region, type: 'indoor', rating: 4.5, hours: open('10:00', '18:00'), desc: 'Hands-on science for kids and families.', features: { kid_friendly: true }, dLat: 0.003 });
  add({ name: `${L} Lookout Park`, region, type: 'outdoor', rating: 4.4, activities: ['viewpoints'], desc: 'A park with a lookout over the lake.', dLat: -0.006 });
}
// Kelowna's vegan places.
for (let i = 0; i < 3; i++) add({ name: `Kelowna Plant Kitchen ${i + 1}`, region: 'kelowna', type: 'restaurant', rating: 4.7, price: 2, hours: open('11:00', '21:00'), features: { vegan: true, vegetarian: true }, dLat: 0.002 * i });
add({ name: 'Kelowna Vegan Bakery', region: 'kelowna', type: 'cafe', rating: 4.8, price: 1, desc: 'Vegan baking and coffee.', hours: open('08:00', '17:00'), features: { vegan: true } });
add({ name: 'Kelowna Food Tours', region: 'kelowna', type: 'tour', rating: 4.9, desc: 'Guided food tours.' });
// Road-trip towns need 25+ listings to be a stop.
for (const region of ['kelowna', 'penticton']) for (let i = 0; i < 25; i++) add({ name: `${REGIONS[region]} Curling Club ${i + 1}`, region, type: 'sport', rating: 3 });
// Naramata: tasting rooms, one that serves wood-fired pizza, a village bistro; Summerland across the lake.
for (let i = 0; i < 4; i++) add({ name: `Naramata Bench Winery ${i + 1}`, region: 'naramata', type: 'winery', rating: 4.8 - i * 0.05, hours: open('11:00', '17:00'), dLat: 0.01 * i, dLng: 0.005 });
const PIZZA_WINERY = add({ name: 'Chain Link Winery', region: 'naramata', type: 'winery', rating: 4.7, hours: open('11:00', '17:00'), desc: 'A winery that pairs wood-fired pizza with wine tastings.', dLat: 0.02 });
add({ name: 'Naramata Village Bistro', region: 'naramata', type: 'restaurant', rating: 4.4, price: 3, hours: open('11:30', '21:00'), dLat: 0.008 });
const ACROSS = add({ name: 'Summerland Lakeside Bistro', region: 'summerland', type: 'restaurant', rating: 4.95, price: 3, hours: open('11:30', '22:00'), dLng: 0.03 });
add({ name: 'Summerland Waterfront Grill', region: 'summerland', type: 'restaurant', rating: 4.9, price: 3, hours: open('11:30', '22:00'), dLng: 0.028 });
// SilverStar: closed for the off-season today, reopening not announced (live on 2026-10-19).
const OFF = { seasonClosed: { from: '2026-10-15', to: '2027-05-02' }, seasonClosedToday: true, seasonReopens: null };
const SILVERSTAR = add({ name: 'SilverStar Mountain Resort', region: 'silverstar', type: 'outdoor', rating: null, activities: ['winter'], desc: 'The North Okanagan ski resort.', ...OFF });
for (const n of ['The Den', 'Black Pine', "d'argento"]) add({ name: n, region: 'silverstar', type: 'restaurant', rating: 4.5, price: 3, hours: { ...open('08:30', '14:00'), sat: [], sun: [] }, ...OFF });
add({ name: 'Bugaboos Bakery', region: 'silverstar', type: 'cafe', rating: 4.6, price: 1, desc: 'Coffee and breakfast.', ...OFF });
add({ name: 'Tube Town Tube Park', region: 'silverstar', type: 'outdoor', rating: 4.3, activities: ['winter'], desc: 'Snow tubing lanes.' });
add({ name: "Brewer's Pond Skating", region: 'silverstar', type: 'outdoor', rating: 4.4, activities: ['winter'], desc: 'A skating pond in the village.' });
// Big White, open in winter.
add({ name: 'Big White Ski Resort', region: 'big-white', type: 'outdoor', rating: null, activities: ['winter'], desc: 'Big mountain skiing.' });
add({ name: 'Big White Tube Park', region: 'big-white', type: 'outdoor', rating: 4.5, activities: ['winter'], desc: 'Snow tubing.' });
add({ name: 'Big White Guided Snowshoe Tours', region: 'big-white', type: 'tour', rating: 4.8, activities: ['winter'], desc: 'Guided snowshoe tours.' });
add({ name: 'The Woods', region: 'big-white', type: 'restaurant', rating: 4.3, price: 2 });
add({ name: 'Big White Village Grill', region: 'big-white', type: 'restaurant', rating: 4.4, price: 2 });
add({ name: 'Big White Cafe', region: 'big-white', type: 'cafe', rating: 4.4, price: 1, desc: 'Coffee and breakfast.' });
const BY_ID = new Map(FACTS.map((v) => [v.id, v]));

let eventId = 900;
const ev = (o) => ({ id: o.id || eventId++, name: o.name, description: '', region: o.region, venueName: '', url: `/${o.region}/events/x`, valleyWide: false, categories: o.categories, dateLabel: '', time: o.time, startDate: o.date, endDate: o.date, startTime: o.startTime || null, endTime: o.endTime || null, endsNextDay: 0, location: o.location || null });

function plan(text, opts = {}) {
  const intent = d.interpretDiscoveryQuery(text, TAXONOMY);
  const trip = d.interpretTripComponents(text, TAXONOMY, intent);
  const requirements = r.extractTripRequirements({ text, intent, trip, taxonomy: TAXONOMY, referenceDate: '2026-10-19' });
  if (opts.startDate) { requirements.startDate = opts.startDate; requirements.endDate = null; }
  if (opts.startMinutes != null) requirements.startMinutes = opts.startMinutes;
  const p = tp.planTrip({ intent, trip: trip.multi ? trip : null, requirements, facts: FACTS, labels: LABELS, text, tripDate: requirements.startDate || opts.tripDate || '2026-10-19', events: opts.events || null, familyEvents: !!opts.familyEvents, tripEvents: trip.multi ? trip.components.map((c) => (c.kind === 'event' ? [] : null)) : [], pinned: opts.pinned, excludeIds: opts.excludeIds, swap: opts.swap });
  return { p, intent, requirements, trip };
}
const venues = (day) => day.stops.filter((s) => s.venue).map((s) => BY_ID.get(s.venue.id));
const rowOf = (p, day, s) => (p.schedule || []).find((x) => x.day === day && ((s.venue && x.venueId === s.venue.id) || (s.event && x.eventId === s.event.id)));

// ---- 1. Season checks use the trip's dates or the month asked for ----
test('Seasons: a January ski trip at SilverStar keeps the village restaurants that are only closed for the off-season', () => {
  // server.js now passes a January date for "in January" (tripRequestedMonthDate); the village is closed today.
  const { p } = plan('ski SilverStar 3 days in January', { tripDate: '2027-01-15' });
  assert.equal(p.days.length, 3);
  for (const day of p.days) {
    assert.equal(venues(day)[0].id, SILVERSTAR.id, `day ${day.day} skis`);
    const dinner = day.stops.find((s) => s.daypart === 'evening');
    assert.ok(dinner && dinner.venue, `day ${day.day} has dinner at the hill`);
  }
  assert.ok(!p.warnings.some((w) => /No dinner spot open that evening/.test(w)), p.warnings.join(' | '));
  // Undated ("for when the lifts are running") too.
  const undated = plan('3 days skiing at SilverStar').p;
  assert.ok(undated.days.every((day) => day.stops.some((s) => s.daypart === 'evening' && s.venue)), 'dinner every night');
});

test('Seasons: closures are judged on the trip date (owner seasons, ski villages), not today', () => {
  assert.equal(tp.seasonClosedOnTrip({ openMonths: '5-10' }, { date: '2027-01-15' }), true, 'a May–October business is closed in January');
  assert.equal(tp.seasonClosedOnTrip({ openMonths: '5-10' }, { date: '2027-07-15' }), false);
  assert.equal(tp.seasonClosedOnTrip({ openMonths: '11-4' }, { date: '2027-01-15' }), false, 'a winter business is open in January');
  const village = { region: 'silverstar', ...OFF };
  assert.equal(tp.seasonClosedOnTrip(village, { date: '2027-01-15' }), false, 'opens with the lifts');
  assert.equal(tp.seasonClosedOnTrip(village, { date: '2026-10-25' }), true, 'still closed this month');
  assert.equal(tp.seasonClosedOnTrip({ ...village, region: 'kelowna' }, { date: '2027-01-15' }), true, 'only at the ski hills');
});

test('Seasons: skiing asked for out of season is said in one line, and the other interests are planned', () => {
  const { p } = plan('skiing and wineries in Kelowna 3 days', { startDate: '2027-07-10' });
  assert.notEqual(p.theme, 'ski');
  assert.match(p.contextNotes[0], /^The Okanagan’s ski hills usually run from December to early April, so skiing isn’t part of this July plan\.$/);
  const all = p.days.flatMap(venues);
  assert.ok(all.some((v) => v.type === 'winery'), 'wineries are planned');
  assert.ok(!all.some((v) => v.region === 'big-white'), 'no Big White days');
  assert.ok(!(p.requirementResults || []).some((i) => i.kind === 'activity' && i.value === 'skiing'));
  // Only skiing, in July: no snowshoe tours or tube parks either.
  const july = plan('ski Big White 2 days in July', { tripDate: '2027-07-15' }).p;
  assert.ok(july.contextNotes.some((n) => /isn’t part of this July plan/.test(n)), july.contextNotes.join(' | '));
  assert.ok(!july.days.flatMap(venues).some((v) => /tube|snowshoe|skating/i.test(v.name)), july.days.flatMap(venues).map((v) => v.name).join(', '));
  // January is ski season.
  assert.equal(plan('ski Big White 2 days in January', { tripDate: '2027-01-15' }).p.theme, 'ski');
  assert.equal(tp.skiOffSeasonMonth('ski weekend', { season: 'summer' }, null, '2026-10-19'), 'July');
  assert.equal(tp.skiOffSeasonMonth('ski weekend', {}, null, '2026-10-19'), null, 'an undated ski trip is for when the lifts run');
});

// ---- 2. Swap ----
test('Swap: the optional ski activity is never dropped; with nothing left it stays, with a friendly note', () => {
  const text = 'ski SilverStar 2 days in January';
  let { p, requirements, intent } = plan(text, { tripDate: '2027-01-15' });
  const exclude = [];
  let kept = null;
  for (let n = 0; n < 4 && !kept; n++) {
    const stop = p.days[0].stops.find((s) => s.daypart === 'afternoon');
    assert.ok(stop && stop.venue, `swap ${n}: the afternoon stop is there`);
    exclude.push(stop.venue.id);
    const pinned = {};
    for (const day of p.days) for (const s of day.stops) if (s.venue && `${day.day}-${s.daypart}` !== '1-afternoon') pinned[`${day.day}-${s.daypart}`] = s.venue.id;
    p = tp.planTrip({ intent: d.interpretDiscoveryQuery(text, TAXONOMY), trip: null, requirements, facts: FACTS, labels: LABELS, text, tripDate: '2027-01-15', pinned, excludeIds: exclude.slice(), swap: { key: '1-afternoon', type: stop.venue.type, id: stop.venue.id }, tripEvents: [] });
    const now = p.days[0].stops.find((s) => s.daypart === 'afternoon');
    const others = p.days.flatMap((day) => day.stops.filter((s) => s.venue && s !== now).map((s) => s.venue.id));
    assert.ok(now && now.venue && !others.includes(now.venue.id), `swap ${n}: ${now && now.venue && now.venue.name} is not already in the plan`);
    if (p.swapKept) kept = { stop: p.days[0].stops.find((s) => s.daypart === 'afternoon'), was: stop.venue };
  }
  assert.ok(kept, 'the extras run out');
  assert.equal(kept.stop.venue.id, kept.was.id, 'the last one stays');
  assert.match(p.swapNote, /^No other after-ski activity nearby fits this part of the day, so .+ stays in your plan\.$/);
  void intent;
});

test('Swap: a replacement already in the plan is replaced by another place of the same kind', () => {
  const k1 = FACTS.find((v) => v.name === 'Kelowna Kitchen 1'), k2 = FACTS.find((v) => v.name === 'Kelowna Kitchen 2');
  const fake = { days: [{ day: 1, region: 'kelowna', stops: [
    { daypart: 'midday', label: 'Midday', venue: { id: k1.id, type: 'restaurant', name: k1.name } },
    { daypart: 'evening', label: 'Evening', venue: { id: k1.id, type: 'restaurant', name: k1.name } },
  ] }] };
  tp.applySwapPreference(fake, { swap: { key: '1-evening', type: 'restaurant', id: k2.id }, facts: FACTS, labels: LABELS, intent: d.interpretDiscoveryQuery('dinner in Kelowna', TAXONOMY), tripDate: '2026-10-24', excludeIds: [k2.id] });
  const now = fake.days[0].stops[1].venue;
  assert.equal(now.type, 'restaurant');
  assert.ok(![k1.id, k2.id].includes(now.id), now.name);
  // A slot the planner left empty gets one back, in the day's order.
  const gone = { days: [{ day: 1, region: 'kelowna', stops: [{ daypart: 'morning', label: 'Morning', venue: { id: k1.id, type: 'restaurant', name: k1.name } }, { daypart: 'evening', label: 'Evening', venue: { id: k2.id, type: 'restaurant', name: k2.name } }] }] };
  tp.applySwapPreference(gone, { swap: { key: '1-afternoon', type: 'indoor' }, facts: FACTS, labels: LABELS, intent: d.interpretDiscoveryQuery('Kelowna', TAXONOMY), tripDate: '2026-10-24' });
  assert.deepEqual(gone.days[0].stops.map((s) => s.daypart), ['morning', 'afternoon', 'evening']);
  assert.equal(gone.days[0].stops[1].venue.type, 'indoor');
  // The page sends the place's id and keeps a kept stop out of the exclusions.
  const page = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(page.includes('swap: { key: sk, type: ss.venue.type, id: ss.venue.id, locked: '));
  assert.ok(page.includes('if (res.j && res.j.swapKept) state.exclude = state.exclude.filter(function(x){ return x !== res.j.swapKept.id; });'));
  assert.ok(page.includes("Aucune autre option à proximité ne convient à ce moment de la journée : "));
});

// ---- 3. Okanagan Lake ----
test('Lake: Naramata to Summerland is measured round the lake (about 40 minutes), not across it', () => {
  const nar = { lat: 49.594, lng: -119.588 }, sum = { lat: 49.602, lng: -119.677 }, pen = { lat: 49.495, lng: -119.585 }, kel = { lat: 49.886, lng: -119.496 }, wk = { lat: 49.86, lng: -119.58 };
  const t = r.estimateTransfer(nar, sum);
  assert.ok(t.maxMinutes >= 35 && t.maxMinutes <= 50, JSON.stringify(t));
  assert.equal(t.aroundLake, 'Penticton');
  assert.ok(r.estimateTransfer(nar, kel).maxMinutes >= 60, 'no road along the east shore: Naramata to Kelowna goes round');
  assert.equal(r.estimateTransfer(nar, pen).aroundLake, undefined, 'same shore');
  assert.equal(r.estimateTransfer(wk, kel).aroundLake, undefined, 'the bridge is on the way');
  assert.ok(r.travelKm(nar, sum) > 20 && r.travelKm(nar, sum) > 3 * r.estimateTransfer(nar, pen).maxMinutes / 10);
  // The drive row says so, and drops the straight line.
  const page = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(page.includes("var lake = leg.aroundLake ? (fr ? ' en contournant le lac' : ' around the lake') : '';"));
  assert.ok(page.includes('var km = s.driveFrom && s.driveFrom.aroundLake ? null : kmText(t3Km(prev.venue, s.venue));'));
});

test('Lake: "no driving after 6pm" keeps dinner in Naramata, and the rule is said up front', () => {
  const { p } = plan('2 days Naramata wineries, no driving after 6pm', { startDate: '2026-10-24' });
  for (const day of p.days) {
    const dinner = day.stops.find((s) => s.daypart === 'evening' && s.venue);
    assert.ok(dinner, `day ${day.day} dinner`);
    assert.notEqual(BY_ID.get(dinner.venue.id).region, 'summerland', `day ${day.day}: ${dinner.venue.name} is across the lake`);
  }
  assert.ok(!p.days.flatMap(venues).includes(ACROSS));
  assert.ok((p.contextNotes || []).some((n) => /^No driving after 18:00:/.test(n)), (p.contextNotes || []).join(' | '));
});

// ---- 4. Lunch at a winery ----
test('Lunch at a winery: one stop at a winery that serves food, and both requests are met', () => {
  for (const text of ['lunch at a winery Naramata', 'winery lunch in Naramata']) {
    const { p } = plan(text, { startDate: '2026-10-24' });
    const stops = (p.itinerary && p.itinerary.stops) || [];
    assert.equal(stops.length, 1, `${text}: ${stops.map((s) => s.venue && s.venue.name).join(', ')}`);
    assert.equal(stops[0].label, 'Lunch at a winery');
    assert.equal(stops[0].venue.id, PIZZA_WINERY.id);
    const row = p.schedule.find((x) => x.venueId === PIZZA_WINERY.id);
    assert.ok(row.startMinutes >= 690 && row.startMinutes <= 810, `lunch time ${row.startMinutes}`);
    assert.ok(p.requirementResults.every((i) => i.status === 'satisfied'), JSON.stringify(p.requirementResults));
    assert.ok(!p.warnings.some((w) => /could be fitted|No lunch matched/.test(w)), p.warnings.join(' | '));
  }
  assert.equal(t3FrenchText('Lunch at a winery'), 'Dîner dans un vignoble');
});

// ---- 5. Events ----
test('Events: a show is at its listed time, an unlisted end gets an allowance, and later stops are timed', () => {
  // Listed 10 AM with the venue's 10–5 hours as its "end": a musical, never a drop-in at 1:35 PM.
  const bunnicula = ev({ name: 'Bunnicula - The Musical', region: 'kelowna', categories: ['family-kids', 'arts-culture', 'live-music'], date: '2026-10-31', time: '10 am', startTime: '10:00', endTime: '17:00' });
  const { p } = plan('family day in Kelowna with kids', { startDate: '2026-10-31', startMinutes: 540, events: [bunnicula], familyEvents: true });
  const day = p.days[0], show = day.stops.find((s) => s.event);
  assert.ok(show, 'the show is planned');
  assert.equal(rowOf(p, 1, show).startMinutes, 600);
  assert.ok(!show.dropIn);
  // No end time: about two hours for a show, and nothing after it is "Timing unverified".
  const noEnd = ev({ name: 'Bunnicula - The Musical', region: 'kelowna', categories: ['family-kids', 'arts-culture'], date: '2026-10-31', time: '10 am' });
  const q = plan('family day in Kelowna with kids', { startDate: '2026-10-31', startMinutes: 540, events: [noEnd], familyEvents: true }).p;
  const row = q.schedule.find((x) => x.eventId === noEnd.id);
  assert.equal(row.startMinutes, 600); assert.equal(row.endMinutes, 720); assert.equal(row.assumedEnd, true); assert.equal(row.status, 'provisional');
  assert.ok(q.schedule.every((x) => x.status !== 'unverified'), JSON.stringify(q.schedule.map((x) => x.status)));
  assert.equal(tp.eventAllowanceMinutes({ name: 'Kelowna Rockets Hockey', categories: ['sports-recreation'] }), 150);
  assert.equal(tp.eventAllowanceMinutes({ name: 'Pumpkin Patch Storytime', categories: ['family-kids'] }), 90);
  assert.match(t3FrenchText('Listed event start 10:00 on 2026-10-31; its end time isn’t listed, so about 2 hours are allowed.'), /heure de fin non indiquée, environ 2 h prévues/);
});

test('Events: dinner is never booked on top of an evening show, with or without a start time', () => {
  const show = ev({ name: 'GEDfest YLW', region: 'kelowna', categories: ['live-music'], date: '2026-10-24', time: '7 pm' });
  for (const startMinutes of [540, undefined]) {
    const { p } = plan('live music every evening Kelowna 2 days', { startDate: '2026-10-24', startMinutes, events: [show] });
    const day = p.days[0], dinner = day.stops.find((s) => s.daypart === 'evening' && s.venue), gig = day.stops.find((s) => s.event);
    assert.ok(dinner && gig, 'dinner and the show');
    const d1 = rowOf(p, 1, dinner), g = rowOf(p, 1, gig);
    assert.equal(g.startMinutes, 1140);
    assert.ok(d1.endMinutes + 30 <= g.startMinutes, `dinner ${d1.startMinutes}-${d1.endMinutes} before the 19:00 show (start ${startMinutes})`);
    assert.notEqual(g.status, 'unmet');
  }
});

// ---- 6. Thin afternoons and themes ----
test('Thin afternoons: a 2.5–4 hour wait before dinner gets a nearby stop or a free-time row', () => {
  for (const text of ['romantic weekend in Kelowna', '2 days in Oliver', 'dog-friendly weekend Vernon', 'family day in Penticton with young kids']) {
    const { p } = plan(text, { startDate: '2026-10-24', startMinutes: 540 });
    for (const day of p.days) {
      const dinner = day.stops.find((s) => s.daypart === 'evening' && s.venue && ['restaurant', 'pub'].includes(s.venue.type));
      if (!dinner) continue;
      const row = rowOf(p, day.day, dinner);
      const free = day.stops.find((s) => s.freeTime);
      assert.ok((row && row.waitMinutes < 150) || free, `${text} day ${day.day}: waits ${row && row.waitMinutes} before dinner`);
    }
  }
});

test('Themes: a family day has lunch and a kids’ activity; "young kids" is not a search word', () => {
  const { p, intent } = plan('family day in Penticton with young kids', { startDate: '2026-10-25', startMinutes: 540 });
  assert.ok(!(intent.foodTerms || []).some((f) => f.term === 'young'));
  const day = p.days[0], stops = day.stops.filter((s) => s.venue);
  const lunch = stops.find((s) => s.daypart === 'midday');
  assert.ok(lunch && ['restaurant', 'cafe'].includes(lunch.venue.type), 'lunch');
  assert.ok(stops.some((s) => ['indoor', 'outdoor', 'beach'].includes(s.venue.type) && (BY_ID.get(s.venue.id).features.kid_friendly || /kids|family/i.test(BY_ID.get(s.venue.id).description))), stops.map((s) => s.venue.name).join(', '));
});

test('Themes: Halloween with kids picks a Halloween event first and says so; a morning show still leaves lunch', () => {
  const events = [
    ev({ name: 'Bunnicula - The Musical', region: 'kelowna', categories: ['family-kids', 'arts-culture'], date: '2026-10-31', time: '10 am' }),
    ev({ name: 'Mission Park Halloween Treat Trail', region: 'kelowna', categories: ['family-kids', 'holiday-seasonal'], date: '2026-10-31', time: '11 am' }),
  ];
  const { p } = plan('Halloween weekend Kelowna with kids', { startDate: '2026-10-31', startMinutes: 540, events, familyEvents: true });
  const first = p.days[0].stops.find((s) => s.event);
  assert.equal(first.event.name, 'Mission Park Halloween Treat Trail');
  assert.match(p.headline, /Halloween/);
  assert.ok(p.days[0].stops.some((s) => s.daypart === 'midday' && s.venue), 'lunch after the trail');
  const show = plan('family day in Kelowna with kids', { startDate: '2026-10-31', startMinutes: 540, events: [events[0]], familyEvents: true }).p;
  assert.ok(show.days[0].stops.some((s) => s.daypart === 'midday' && s.venue), 'a 10 AM show is over by lunch');
});

test('Themes: a vegan food tour is cafés and restaurants with the vegan badge, not a tour company', () => {
  const { p } = plan('vegan food tour Kelowna one day', { startDate: '2026-10-24', startMinutes: 540 });
  const stops = p.days.flatMap(venues);
  assert.ok(stops.length >= 3, stops.map((v) => v.name).join(', '));
  assert.ok(!stops.some((v) => v.type === 'tour'));
  for (const v of stops.filter((x) => ['restaurant', 'cafe'].includes(x.type))) assert.ok(v.features.vegan, `${v.name} is vegan friendly`);
  assert.match(p.headline, /vegan food/);
  assert.ok(!p.warnings.some((w) => /No tour could be fitted/.test(w)), p.warnings.join(' | '));
  assert.equal(tp.foodTourMeansFood('guided food tour in Kelowna'), false, 'a guided tour is still a tour');
  // "food tour Kelowna" is not "Hungry for Laughs Comedy Tour (Kelowna)".
  assert.equal(r.namedEventInterpretationText('vegan food tour Kelowna one day', [{ id: 1, name: 'Hungry for Laughs Comedy Tour (Kelowna)', region: 'kelowna' }]), 'vegan food tour Kelowna one day');
});

// ---- 7. Road trips ----
test('Road trips: "Osoyoos to Vernon" runs south to north, and a day with a long drive leaves about 9 AM', () => {
  const { p } = plan('4 days Okanagan road trip Osoyoos to Vernon, wineries and hikes', { startDate: '2026-10-22', startMinutes: 540 });
  assert.equal(p.days[0].region, 'osoyoos');
  assert.equal(p.days[p.days.length - 1].region, 'vernon');
  assert.match(p.headline, /Osoyoos to Vernon road trip/);
  let checked = 0;
  for (const day of p.days) {
    if (!day.driveIn || day.driveIn.maxMinutes < 30) continue;
    const first = p.schedule.filter((x) => x.day === day.day)[0];
    assert.ok(first.startMinutes - day.driveIn.maxMinutes >= 540, `day ${day.day}: leaves at ${first.startMinutes - day.driveIn.maxMinutes}`);
    checked++;
  }
  assert.ok(checked >= 1, 'a day with a drive in');
});

// ---- 8. My Trip keeps a dated one-day plan's date ----
test('My Trip: a dated one-day itinerary saves its stops as Day 1 with the date', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(page.includes("(key ? ' data-plan-day=\"' + esc(key.split('-')[0]) + '\"' : datedOneDay() ? ' data-plan-day=\"1\"' : '')"));
  // Round 8: the function lives inside a template literal, so its doubled backslashes are single ones on the page.
  const fn = /function datedOneDay\(\)\{[\s\S]*?\n {2}\}/.exec(page)[0].replace(/\\\\/g, '\\');
  const datedOneDay = (last) => new Function('state', `${fn}; return datedOneDay();`)({ last });
  assert.equal(datedOneDay({ days: [], schedule: [{ day: 1, date: '2026-10-24', venueId: 1 }] }), true);
  assert.equal(datedOneDay({ days: [{ day: 1 }], schedule: [{ day: 1, date: '2026-10-24' }] }), false, 'day plans already carry their day');
  assert.equal(datedOneDay({ days: [], schedule: [{ day: 1, venueId: 1 }] }), false, 'undated');
});

// ---- 9. French ----
test('French: the When chip and the Winter interest are translated', () => {
  const fall = t3FrenchPlan({ kind: 'multi_day', understood: { season: { label: 'fall', named: 'season' }, interests: ['Winter'], notUsed: [] }, days: [], notes: [], warnings: [] });
  assert.equal(fall.understood.season.label, 'Automne');
  assert.deepEqual(fall.understood.interests, ['Hiver']);
  assert.equal(t3FrenchPlan({ kind: 'multi_day', understood: { season: { label: 'January', named: 'month' }, notUsed: [] }, days: [], notes: [], warnings: [] }).understood.season.label, 'Janvier');
  assert.equal(t3FrenchText('The Okanagan’s ski hills usually run from December to early April, so skiing isn’t part of this August plan.'), 'Les stations de ski de l’Okanagan sont en général ouvertes de décembre au début avril; le ski ne fait donc pas partie de ce plan d’août.');
  assert.equal(t3FrenchText('Late afternoon'), 'Fin d’après-midi');
});
