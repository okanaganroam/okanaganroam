// Build My Trip, round 14 (2026-10-20): less repetition across plans (a wider, seeded rotation of good places, and the
// town's default first stop and lunch give way), the ski timeline, the brewery-crawl summary, appointment-only places
// kept out of default stops and Swap, brunch that serves brunch, French evening/afternoon wording and the doubled
// hours line, café hopping as a plan, « une journée vins », "dog-friendly day", "drinks and dinner tonight", event pins
// and "Other options" that never repeat a stop. Fixes from drafts/site-review-2026-10-20-pass12.md (items 2 and 5) and
// scripts/trip-battery.js. PURE tests on a small fixture valley (no server.js, no database), like r12-planner.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../discovery-intent.js');
const r = require('../trip-requirements.js');
const tp = require('../trip-planner.js');
const fr = require('../trip-planner-fr.js');
const v3 = require('../trip-planner-v3-page.js');
const { t3FrenchStory, t3FrenchPlan } = require('../trip-french-copy.js');
const { resolveEventLocation } = require('../trip-event-location.js');

const REGIONS = { vernon: 'Vernon', kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', penticton: 'Penticton', oliver: 'Oliver', 'big-white': 'Big White' };
const TAXONOMY = {
  regions: Object.keys(REGIONS), regionLabels: REGIONS,
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'golf', 'beach', 'outdoor', 'tour', 'indoor', 'sport'],
  features: ['dog_friendly', 'kid_friendly', 'patio', 'vegan', 'vegetarian', 'lake_view'], collections: ['hidden_gem', 'local_favorite'],
  activities: ['hiking', 'winter', 'viewpoints', 'nature'], cuisines: [], budgets: ['budget', 'moderate', 'upscale'], paces: ['relaxed', 'standard', 'packed'],
  datePresets: ['today', 'this-weekend', 'this-week', 'this-month'], eventCategories: ['live-music', 'family-kids', 'holiday-seasonal', 'arts-culture', 'markets-fairs', 'nightlife', 'community-events'], venues: [],
};
const T = (s, p) => ({ singular: s, plural: p });
const LABELS = {
  regions: REGIONS,
  types: { restaurant: T('Restaurant', 'Restaurants'), winery: T('Winery', 'Wineries'), cafe: T('Cafe', 'Cafes'), brewery: T('Brewery', 'Breweries'), pub: T('Pub', 'Pubs'), cocktail: T('Cocktail Lounge', 'Cocktail Lounges'),
    golf: T('Golf Course', 'Golf Courses'), beach: T('Beach', 'Beaches'), outdoor: T('Outdoor Destination', 'Outdoor Destinations'), tour: T('Tour', 'Tours'), indoor: T('Indoor', 'Indoor'), sport: T('Sport', 'Sports') },
  activities: { hiking: 'Hiking & Trails', winter: 'Winter', viewpoints: 'Viewpoints', nature: 'Nature' }, features: { dog_friendly: 'Dog-Friendly', kid_friendly: 'Kid-Friendly', lake_view: 'Lake View' }, featureNouns: {}, collections: {},
};
const CENTRES = { vernon: [50.267, -119.272], kelowna: [49.888, -119.47], 'west-kelowna': [49.863, -119.583], penticton: [49.48, -119.585], oliver: [49.183, -119.551], 'big-white': [49.72, -118.93] };
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
let nextId = 1;
const FACTS = [];
function add(o) {
  const id = nextId++;
  const [lat, lng] = CENTRES[o.region];
  const v = {
    id, name: o.name, region: o.region, type: o.type, url: `/${o.region}/${o.type}/${id}`,
    rating: o.rating === undefined ? 4.5 : o.rating, reviews: o.reviews === undefined ? 200 : o.reviews, price: o.price === undefined ? 2 : o.price, address: null,
    lat: lat + (o.dLat || 0), lng: lng + (o.dLng || 0), cuisine: o.cuisine || null, cuisineLabel: o.cuisine || null,
    textName: d.normalizeDiscoveryText(o.name), textCuisine: d.normalizeDiscoveryText(o.cuisine || ''), textDesc: d.normalizeDiscoveryText(o.desc || ''), description: o.desc || '', plannerDescription: o.desc || '',
    features: o.features || {}, collections: o.collections || [], fdTypes: [], hours: o.hours ? JSON.stringify(o.hours) : null,
    seasonClosed: null, seasonClosedToday: false, advisory: o.advisory ? { note: o.advisory, addedAt: '2026-10-01' } : null, ownerClosures: o.ownerClosures,
  };
  v.activities = [...new Set([...(o.activities || []), ...r.inferPlannerActivities(v)])];
  v.plannerKinds = r.inferPlannerKinds(v);
  FACTS.push(v);
  return v;
}
// Kelowna: six lake-view parks a few km apart (no ratings, as on the real site), a balloon company and a far-off
// forest-road campsite with the same badge, restaurants, wineries (one by appointment only), cafés, an indoor playground.
const PARKS = ['Knoll Mountain Park', 'Mission Flats Park', 'Dillon Ridge Park', 'McKenzie Bluffs Park', 'Lakeshore Loop Park', 'Pine Point Park']
  .map((name, i) => add({ name, region: 'kelowna', type: 'outdoor', rating: null, features: { lake_view: true }, activities: ['hiking', 'viewpoints'], desc: 'A city park with trails and a lookout over the lake.', dLat: 0.012 * i, dLng: 0.01 * (i % 2), collections: i === 0 ? ['local_favorite'] : [] }));
const BALLOON = add({ name: 'Kelowna Sky Ballooning', region: 'kelowna', type: 'outdoor', rating: null, features: { lake_view: true }, desc: 'Hot air balloon flights at sunrise over the lake.', dLat: 0.02 });
const FAR_SITE = add({ name: 'Upland Lake Recreation Site', region: 'kelowna', type: 'outdoor', rating: null, features: { lake_view: true }, desc: 'Free campsites on a forest service road lake, forty minutes up the hill.', dLat: 0.3, dLng: 0.2 });
const KITCHENS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => add({ name: `Kelowna Kitchen ${i + 1}`, region: 'kelowna', type: 'restaurant', rating: 4.6 - (i % 3) * 0.05, price: 2, hours: open('11:00', '22:00'), dLat: 0.003 * i, dLng: 0.002 * (i % 3) }));
const WINERIES = [0, 1, 2, 3].map((i) => add({ name: `Kelowna Bench Winery ${i + 1}`, region: 'kelowna', type: 'winery', rating: 4.7 - i * 0.05, price: null, hours: open('10:00', '18:00'), dLat: 0.01 * i, dLng: 0.02 }));
const PRIVATE_WINERY = add({ name: 'Kelowna Lane Winery', region: 'kelowna', type: 'winery', rating: 4.9, price: null, hours: open('10:00', '18:00'), dLat: 0.015, dLng: 0.02,
  advisory: 'Visits are by appointment only: a private tour and tasting ($200 per person) that you request ahead.' });
const BRUNCH_HOUSE = add({ name: 'Kelowna Morning Table', region: 'kelowna', type: 'restaurant', rating: 4.5, price: 2, hours: open('08:00', '14:00'), desc: 'Brunch every day: eggs benedict, pancakes and good coffee.', dLat: 0.002 });
const ROASTERS = [0, 1, 2, 3].map((i) => add({ name: `Kelowna Roasters ${i + 1}`, region: 'kelowna', type: 'cafe', rating: 4.8, price: 1, hours: open('07:00', '17:00'), desc: 'A small coffee roastery with espresso drinks.', dLat: 0.002 * i }));
const SUBS = add({ name: 'Kelowna Subs', region: 'kelowna', type: 'cafe', rating: 5, price: 1, hours: open('10:00', '20:00'), desc: 'Subs and sandwiches.' });
const CLOSED_CAFE = add({ name: 'Kelowna Bakeshop', region: 'kelowna', type: 'cafe', rating: 5, price: 1, hours: open('07:00', '16:00'), desc: 'A bakery and coffee shop.', ownerClosures: [{ from: '2026-10-20', to: '2026-11-03' }] });
const PLAY = add({ name: 'Kelowna Play Area', region: 'kelowna', type: 'indoor', rating: null, hours: open('09:00', '17:00'), desc: 'Indoor playground for young kids with a ball pit and play structures.' });
const MUSEUM = add({ name: 'Kelowna History Museum', region: 'kelowna', type: 'indoor', rating: null, hours: open('10:00', '17:00'), desc: 'A local history museum.' });
// Vernon: two breweries (a crawl of three can only have two) and lunch places.
const VERNON_BREWS = [0, 1].map((i) => add({ name: `Vernon Hop Works ${i + 1}`, region: 'vernon', type: 'brewery', rating: 4.6, hours: open('11:00', '22:00'), dLat: 0.003 * i }));
for (let i = 0; i < 3; i++) add({ name: `Vernon Diner ${i + 1}`, region: 'vernon', type: 'restaurant', rating: 4.5, price: 2, hours: open('11:00', '21:00'), dLat: 0.002 * i });
// Penticton: five breweries for a full crawl.
for (let i = 0; i < 5; i++) add({ name: `Penticton Ale Works ${i + 1}`, region: 'penticton', type: 'brewery', rating: 4.7 - i * 0.05, hours: open('11:00', '22:00'), dLat: 0.003 * i });
for (let i = 0; i < 3; i++) add({ name: `Penticton Grill ${i + 1}`, region: 'penticton', type: 'restaurant', rating: 4.5, price: 2, hours: open('11:00', '21:00'), dLat: 0.002 * i });
for (let i = 0; i < 2; i++) add({ name: `Penticton Pub ${i + 1}`, region: 'penticton', type: 'pub', rating: 4.5, price: 2, hours: open('11:00', '23:59'), dLat: 0.002 * i });
// Oliver: wineries and their restaurants.
for (let i = 0; i < 4; i++) add({ name: `Oliver Estate Winery ${i + 1}`, region: 'oliver', type: 'winery', rating: 4.7 - i * 0.05, price: null, hours: open('10:00', '17:00'), dLat: 0.01 * i });
for (let i = 0; i < 3; i++) add({ name: `Oliver Bistro ${i + 1}`, region: 'oliver', type: 'restaurant', rating: 4.5, price: 2, hours: open('11:00', '21:00'), dLat: 0.002 * i });
add({ name: 'Oliver Bakery', region: 'oliver', type: 'cafe', rating: 4.8, price: 1, hours: open('07:00', '15:00'), desc: 'Coffee and pastries.' });
// Big White: the hill and a lunch and dinner on it.
const HILL = add({ name: 'Big White Ski Resort', region: 'big-white', type: 'outdoor', rating: null, activities: ['winter'], desc: 'Ski resort with 119 runs and the lifts open 8:30 to 3:30.' });
add({ name: 'Big White Lodge Grill', region: 'big-white', type: 'restaurant', rating: 4.4, price: 2, hours: open('11:00', '21:00'), dLat: 0.002 });
add({ name: 'Big White Village Bistro', region: 'big-white', type: 'restaurant', rating: 4.5, price: 2, hours: open('11:00', '21:00'), dLat: 0.003 });

function build(text, opts = {}) {
  const t = opts.french ? fr.tripPlannerText(text, TAXONOMY) : text;
  const intent = d.interpretDiscoveryQuery(t, TAXONOMY);
  let trip = d.interpretTripComponents(t, TAXONOMY, intent);
  const requirements = r.extractTripRequirements({ text: t, intent, trip, taxonomy: TAXONOMY, referenceDate: opts.today || '2026-10-20' });
  if (opts.startDate) { requirements.startDate = opts.startDate; requirements.endDate = null; requirements.startMinutes = 540; }
  const used = requirements.startDate || requirements.daypart || requirements.items.some((i) => !['days', 'base', 'type'].includes(i.kind)) ? requirements : null;
  if (used) trip = r.expandTripComponents(trip.multi ? trip : { ...trip, regions: intent.regions || [], party: intent.party || trip.party, when: intent.when || trip.when }, used);
  return { text: t, intent, trip, requirements: used, opts };
}
function run(b, extra = {}) {
  return tp.planTrip({ intent: b.intent, trip: b.trip.multi ? b.trip : null, requirements: b.requirements, facts: FACTS, labels: LABELS, text: b.text,
    tripDate: (b.requirements && b.requirements.startDate) || b.opts.tripDate || '2026-10-24', tripEvents: b.trip.multi ? b.trip.components.map(() => []) : [], ...extra });
}
const plan = (text, opts) => run(build(text, opts || {}));
const allStops = (p) => ((p.days && p.days.length) ? p.days.flatMap((x) => x.stops) : ((p.itinerary && p.itinerary.stops) || (p.outing && p.outing.stops) || [])).filter((s) => s.venue || s.event);
const names = (p) => allStops(p).filter((s) => s.venue).map((s) => s.venue.name);

// ---- 1. Repetition ----
test('Repetition (round 14): different Kelowna requests open the day and have lunch at different good places', () => {
  const texts = ['a day in Kelowna', 'a weekend in Kelowna', '3 days in Kelowna', 'one day in Kelowna', 'a day in Kelowna with good food', 'a relaxed day in Kelowna',
    'a packed day in Kelowna', 'a cheap day in Kelowna', 'a day in Kelowna in November', 'a long weekend in Kelowna', '2 days in Kelowna', 'a day trip to Kelowna'];
  const openers = new Map(), lunches = new Map(), sequences = new Map();
  for (const text of texts) {
    const p = plan(text);
    assert.ok((p.days || []).length >= 1, `${text}: ${p.kind}`);
    const day = p.days[0].stops.filter((s) => s.venue);
    openers.set(day[0].venue.name, (openers.get(day[0].venue.name) || 0) + 1);
    const lunch = day.find((s) => s.daypart === 'midday');
    if (lunch) lunches.set(lunch.venue.name, (lunches.get(lunch.venue.name) || 0) + 1);
    const seq = day.slice(0, 3).map((s) => s.venue.name).join(' > ');
    sequences.set(seq, (sequences.get(seq) || 0) + 1);
    // Quality: never the balloon company, the far-off campsite, the appointment-only winery or the kids' playground.
    for (const n of names(p)) assert.ok(![BALLOON.name, FAR_SITE.name, PRIVATE_WINERY.name, PLAY.name].includes(n), `${text}: ${n}`);
  }
  const most = (m) => Math.max(...m.values());
  assert.ok(openers.size >= 3, `openers ${JSON.stringify([...openers])}`);
  assert.ok(most(openers) <= 6, `opener repeats ${JSON.stringify([...openers])}`);
  assert.ok(lunches.size >= 3, `lunches ${JSON.stringify([...lunches])}`);
  assert.ok(most(sequences) <= 3, `sequences ${JSON.stringify([...sequences])}`);
});

test('Repetition (round 14): the rotation is steady for one request, and English and French plan the same day', () => {
  assert.deepEqual(names(plan('a weekend in Kelowna')), names(plan('a weekend in Kelowna')));
  assert.deepEqual(names(plan('un week-end à Kelowna', { french: true })), names(plan('a weekend in Kelowna')));
});

test('Repetition (round 14): rotateWithinType only swaps in a near-equal place of the same kind that is close, walk-in and as good', () => {
  const ctx = { rotationKey: 'kelowna|test', queryText: 'a day in kelowna' };
  const c = (v, score, reasons = []) => ({ v, score, reasons });
  const best = c(PARKS[0], 39, [{ code: 'collection_bonus', text: 'An Okanagan Roam Local Favourite', weight: 3 }]);
  const picks = new Set();
  for (let i = 0; i < 40; i++) picks.add(tp.rotateWithinType([best, c(PARKS[1], 36), c(PARKS[2], 36), c(BALLOON, 36), c(FAR_SITE, 36), c(KITCHENS[0], 36)], { ...ctx, rotationKey: `k${i}` }, undefined, { slot: '1-morning', opening: true }).v.name);
  assert.ok(picks.has(PARKS[1].name) || picks.has(PARKS[2].name), [...picks].join(', '));
  for (const n of [BALLOON.name, FAR_SITE.name, KITCHENS[0].name]) assert.ok(!picks.has(n), n);
  // A badge the best place was picked for must be one the other place has too; a place far below never rotates in.
  const withBadge = c(PARKS[0], 40, [{ code: 'feature', text: 'Has the Lake View badge', weight: 8 }]);
  for (let i = 0; i < 20; i++) assert.equal(tp.rotateWithinType([withBadge, c(PARKS[1], 39)], { ...ctx, rotationKey: `b${i}` }).v.id, PARKS[0].id);
  for (let i = 0; i < 20; i++) assert.equal(tp.rotateWithinType([c(PARKS[0], 40), c(PARKS[1], 30)], { ...ctx, rotationKey: `g${i}` }).v.id, PARKS[0].id);
  // Dinner never rotates from a $$ restaurant down to a $ one.
  const cheap = { ...KITCHENS[1], id: 9001, price: 1 };
  for (let i = 0; i < 20; i++) assert.equal(tp.rotateWithinType([c(KITCHENS[0], 30), c(cheap, 30)], { ...ctx, rotationKey: `d${i}` }, undefined, { dinner: true }).v.id, KITCHENS[0].id);
});

// ---- 2. Appointment-only places ----
test('Appointment only (round 14): a by-appointment winery is never a default stop or a Swap pick, unless asked for', () => {
  assert.equal(tp.appointmentOnly(PRIVATE_WINERY), true);
  assert.equal(tp.appointmentOnly({ advisory: { note: 'Summer hours are noon to 5 pm; in winter, visits are by appointment only unless the winery posts otherwise.' }, description: '' }), false);
  assert.equal(tp.appointmentOnly({ advisory: { note: 'Open daily 1 to 5 pm until December 14, then by appointment after December 14.' }, description: '' }), false);
  assert.equal(tp.appointmentOnly({ advisory: { note: 'Tastings are by reservation only; book ahead on the website.' }, description: '' }), true);
  assert.equal(tp.appointmentKept(PRIVATE_WINERY, { queryText: 'a private tasting at a kelowna winery' }), true);
  // Swap the day's winery again and again, like /trip does: the appointment-only winery never comes back.
  const b = build('wineries in Kelowna, a day trip');
  let p = run(b);
  const exclude = [];
  const key = (day, s) => `${day}-${s.daypart}`;
  for (let i = 0; i < 6; i++) {
    const day = p.days[0];
    const wine = day.stops.find((s) => s.venue && s.venue.type === 'winery');
    if (!wine) break;
    assert.notEqual(wine.venue.id, PRIVATE_WINERY.id);
    exclude.push(wine.venue.id);
    const pinned = {};
    for (const s of day.stops) if (s.venue && s !== wine) pinned[key(1, s)] = s.venue.id;
    p = run(b, { excludeIds: exclude.slice(), pinned, swap: { key: key(1, wine), type: 'winery', id: wine.venue.id, locked: [] } });
    for (const s of allStops(p)) if (s.venue) assert.notEqual(s.venue.id, PRIVATE_WINERY.id, `swap ${i + 1}`);
  }
});

// ---- 3. Ski day timeline ----
test('Ski day (round 14): no sunset margin on the ski hill, a lift-hours note, and no "free interval" while skiing', () => {
  const p = plan('ski day at Big White on January 16 2027', { today: '2026-10-20' });
  const ski = allStops(p).find((s) => s.venue && s.venue.id === HILL.id);
  assert.ok(ski, names(p).join(', '));
  const row = (p.schedule || []).find((x) => x.venueId === HILL.id);
  assert.ok(row, 'the ski day is timed');
  assert.equal(row.daylight, undefined, 'lift hours, not daylight');
  assert.doesNotMatch(ski.scheduleNote || '', /sunset|Trail duration/);
  assert.match(ski.scheduleNote || '', /ski day/i);
  // The page's timeline: lunch on the hill inside the ski day, then the next stop right after the lifts close.
  const rows = v3.t3TimelineRows({ days: [{ day: 1, stops: [{ daypart: 'morning', venue: { id: 1, name: 'Hill' } }, { daypart: 'midday', venue: { id: 2, name: 'Lunch' } }, { daypart: 'afternoon', venue: { id: 3, name: 'Tubes' } }] }],
    schedule: [{ day: 1, venueId: 1, startMinutes: 540, endMinutes: 930, transferMinutes: 0 }, { day: 1, venueId: 2, startMinutes: 720, endMinutes: 780, transferMinutes: 0, onHill: true }, { day: 1, venueId: 3, startMinutes: 935, endMinutes: 1025, transferMinutes: 5 }] });
  assert.equal(rows[2].gapMinutes, 0, 'was a 150-minute free interval');
});

// ---- 4. Brewery crawl summary, Other options ----
test('Crawl (round 14): a crawl with two breweries and a lunch says so, and its other options never repeat a stop', () => {
  const p = plan('brewery crawl in Vernon');
  assert.equal(p.kind, 'itinerary');
  const text = p.experience.text;
  assert.doesNotMatch(text, /try a local craft beer first, then try a local craft beer/i);
  assert.match(text, /two craft breweries, with lunch at Vernon Diner \d in between/);
  assert.match(text, /All three stops are in Vernon/);
  assert.ok(!(p.warnings || []).some((w) => /No breweries matched/.test(w)), JSON.stringify(p.warnings));
  assert.ok((p.notes || []).some((n) => /only two fit the plan/.test(n)), JSON.stringify(p.notes));
  for (const q of ['brewery crawl in Penticton', 'brewery crawl in Vernon']) {
    const x = plan(q);
    const ids = new Set(allStops(x).filter((s) => s.venue).map((s) => s.venue.id));
    for (const s of allStops(x)) for (const a of s.alternates || []) assert.ok(!ids.has(a.venue.id), `${q}: ${a.venue.name}`);
  }
  // The same check on a hand-made outing.
  const stop = (id) => ({ venue: { id, name: `V${id}` } });
  const out = tp.withoutRepeatedAlternates({ outing: { stops: [stop(1), stop(2)], alternates: [stop(2), stop(3)] }, days: [] });
  assert.deepEqual(out.outing.alternates.map((a) => a.venue.id), [3]);
});

// ---- 5. Brunch, café hopping, closures ----
test('Brunch (round 14): brunch is a place that serves it, timed as a meal, not a 40-minute coffee', () => {
  const p = plan('brunch and a walk in Kelowna', { startDate: '2026-10-25' });
  const brunch = allStops(p).find((s) => /brunch/i.test(s.label || ''));
  assert.ok(brunch, names(p).join(', '));
  assert.match(`${brunch.venue.name}`, /Morning Table/);
  const row = p.schedule.find((x) => x.venueId === brunch.venue.id);
  assert.ok(row.endMinutes - row.startMinutes >= 60, `${row.startMinutes}-${row.endMinutes}`);
});

test('Café hopping (round 14): a dated café hop is a plan of three cafés (not subs, not a closed bakery), with no "safe ride home"', () => {
  const p = plan('cafe hopping in Kelowna on October 24');
  assert.equal(p.kind, 'itinerary');
  const stops = allStops(p);
  assert.equal(stops.length, 3);
  for (const s of stops) assert.equal(s.venue.type, 'cafe');
  assert.ok(!names(p).includes(SUBS.name));
  assert.ok(!names(p).includes(CLOSED_CAFE.name), 'closed Oct 20 - Nov 3');
  assert.match(p.experience.text, /three cafés/);
  assert.doesNotMatch(p.experience.text, /safe ride/);
});

test('Kids (round 14): an indoor playground for small children is not an afternoon for adults', () => {
  for (const q of ['a weekend in Kelowna', '3 days in Kelowna', 'a long weekend in Kelowna']) assert.ok(!names(plan(q)).includes(PLAY.name), q);
  assert.ok(tp.KIDS_ONLY_RE.test(PLAY.textDesc));
});

// ---- 6. Request reading ----
test('Requests (round 14): « une journée vins », "dog-friendly day" and "drinks and dinner tonight" plan what was asked', () => {
  assert.equal(fr.tripPlannerText('une journée vins à Oliver', TAXONOMY), 'a wine day in oliver');
  assert.equal(fr.tripPlannerText('un week-end vins à Penticton', TAXONOMY), 'a wine weekend in penticton');
  const wine = plan('une journée vins à Oliver', { french: true });
  assert.equal(wine.kind, 'day_plan');
  assert.ok(allStops(wine).filter((s) => s.venue && s.venue.type === 'winery').length >= 2, names(wine).join(', '));
  const dog = d.interpretDiscoveryQuery('dog-friendly day in Vernon', TAXONOMY);
  assert.equal(dog.days, 1);
  const b = build('drinks and dinner tonight in Penticton');
  assert.ok(b.trip.multi);
  const kinds = b.trip.components.map((c) => c.types.join('/'));
  assert.ok(kinds.some((k) => /pub|cocktail/.test(k)) && kinds.some((k) => k === 'restaurant'), kinds.join(', '));
  const p = run(b);
  assert.equal(allStops(p).length, 2, names(p).join(', '));
});

// ---- 7. French copy ----
test('French (round 14): evening and afternoon plans say « Votre soirée » / « Votre après-midi », and the hours line is shown once', () => {
  const st = (name, type, daypart) => ({ daypart, label: '', venue: { name, type } });
  assert.match(t3FrenchStory({ itinerary: { stops: [st('A', 'restaurant', 'evening'), st('B', 'pub', 'evening')] } }), /^Votre soirée commence par un souper à A/);
  assert.match(t3FrenchStory({ itinerary: { stops: [st('A', 'indoor', 'afternoon'), st('B', 'brewery', 'afternoon')] } }), /^Votre après-midi commence par/);
  assert.match(t3FrenchStory({ days: [{ day: 1, regionLabel: 'Oliver', stops: [st('A', 'cafe', 'morning'), st('B', 'winery', 'afternoon')] }] }), /^Votre journée à Oliver commence par/);
  const frPlan = t3FrenchPlan({ kind: 'itinerary', itinerary: { stops: [{ daypart: 'afternoon', label: 'Wineries', why: ['Listed hours vary by day — see the venue page', 'Rated 4.7'], caveats: [], venue: { name: 'X', type: 'winery', listedHours: 'Listed hours vary by day — see the venue page' } }] }, experience: { text: '' } });
  const lines = v3.t3WhyLines(frPlan.itinerary.stops[0]);
  assert.ok(!lines.some((w) => /^Les horaires varient/.test(w)), lines.join(' | '));
  assert.equal(lines.length, 1);
});

// ---- 8. Event pins ----
test('Event pins (round 14): holiday markets at a hall or a school get a pin; the trip map counts them', () => {
  assert.deepEqual(resolveEventLocation({ venue_name_text: 'Penticton Trade & Convention Centre', region: 'penticton' }, []), { venueId: null, lat: 49.4964026, lng: -119.6058051 });
  assert.deepEqual(resolveEventLocation({ venue_name_text: 'West Bench Elementary, 1604 W Bench Dr', region: 'penticton' }, []), { venueId: null, lat: 49.5010705, lng: -119.631027 });
  const hall = { id: 7, name: 'Okanagan Wine and Orchard Museum', region: 'kelowna', latitude: 49.89, longitude: -119.49, redirect_to: null };
  assert.deepEqual(resolveEventLocation({ venue_name_text: 'Okanagan Wine & Orchard Museum', region: 'kelowna' }, [hall]), { venueId: 7, lat: 49.89, lng: -119.49 });
  // Another town after the comma is never matched by the name alone.
  assert.equal(resolveEventLocation({ venue_name_text: 'Okanagan Wine and Orchard Museum, Vernon', region: 'kelowna' }, [hall]), null);
  const m = v3.t3MapPoints([{ day: 1, stops: [{ daypart: 'morning', kind: 'event', event: { name: 'Market', location: { lat: 49.4964, lng: -119.6058 } } }, { daypart: 'evening', kind: 'event', event: { name: 'Somewhere', location: null } }] }], {});
  assert.equal(m.count, 1);
  assert.equal(m.skipped, 1);
});

// ---- 9. Round 15: the town's best place still wins sometimes ----
test('Rotation (round 15): a town’s top pick still wins about a third of the time, steadily per request', () => {
  const c = (v, score) => ({ v, score, reasons: [] });
  const cands = [c(PARKS[0], 39), c(PARKS[1], 37), c(PARKS[2], 37), c(PARKS[3], 36), c(PARKS[4], 36)];
  let wins = 0;
  for (let i = 0; i < 300; i++) {
    const ctx = { rotationKey: `town-${i}`, queryText: 'x' };
    const pick = tp.rotateWithinType(cands, ctx, undefined, { slot: '1-morning', opening: true });
    if (pick.v.id === PARKS[0].id) wins++;
    assert.equal(tp.rotateWithinType(cands, ctx, undefined, { slot: '1-morning', opening: true }).v.id, pick.v.id, 'same request, same pick');
  }
  assert.ok(wins >= 75 && wins <= 150, `top pick won ${wins} of 300`);
  // Across the Kelowna requests, the top park opens at least one day.
  const texts = ['a day in Kelowna', 'a weekend in Kelowna', '3 days in Kelowna', 'one day in Kelowna', 'a day in Kelowna with good food', 'a relaxed day in Kelowna',
    'a packed day in Kelowna', 'a cheap day in Kelowna', 'a day in Kelowna in November', 'a long weekend in Kelowna', '2 days in Kelowna', 'a day trip to Kelowna'];
  assert.ok(texts.some((t) => plan(t).days.some((day) => day.stops.some((s) => s.venue && s.venue.id === PARKS[0].id))), 'the top park is in some plans');
});

// ---- 10. Round 15: times on every plan, plain-words summaries, day shape ----
const { buildStory, BANNED_RE } = require('../trip-story.js');
const GARDEN = add({ name: 'Kelowna Waterfront Gardens', region: 'kelowna', type: 'outdoor', rating: null, features: { lake_view: true }, desc: 'Flower beds and lawns on the waterfront.', dLat: 0.004 });
const timedStops = (p) => allStops(p).map((s) => ({ s, row: (p.schedule || []).find((r) => (s.venue && r.venueId === s.venue.id) || (s.event && r.eventId === s.event.id)) }));
test('Times (round 15): every stop of an undated plan has a suggested start and end, with no date', () => {
  for (const q of ['a day in Kelowna', 'a weekend in Kelowna', 'brewery crawl in Penticton', 'dinner and drinks in Penticton', 'a wine day in Oliver', 'brunch and a walk in Kelowna', 'cafe hopping in Kelowna']) {
    const p = plan(q);
    assert.ok(['day_plan', 'multi_day', 'itinerary', 'outing'].includes(p.kind), `${q}: ${p.kind}`);
    for (const { s, row } of timedStops(p)) {
      assert.ok(row, `${q}: ${(s.venue || s.event).name} has a row`);
      assert.ok(Number.isFinite(row.startMinutes) && Number.isFinite(row.endMinutes) && row.endMinutes > row.startMinutes, `${q}: ${(s.venue || s.event).name} ${row.startMinutes}-${row.endMinutes}`);
      assert.equal(row.suggested, true);
      assert.equal(row.date, undefined, 'a suggested schedule carries no date');
    }
    assert.ok(p.notes.includes(tp.SUGGESTED_TIMES_NOTE), q);
  }
  // A dated plan keeps its own dated schedule.
  const dated = plan('a day in Kelowna', { startDate: '2026-10-24' });
  assert.ok(dated.schedule.length && dated.schedule.every((r) => r.date === '2026-10-24' && !r.suggested));
  // The page's timeline reads a suggested schedule like any other.
  const rows = v3.t3TimelineRows(plan('a day in Kelowna'));
  assert.ok(rows.length >= 3 && rows.every((r) => Number.isFinite(r.startMinutes)));
});

test('Summaries (round 15): name every stop in order, in English and French, with no claims the data does not hold', () => {
  for (const q of ['a day in Kelowna', 'a weekend in Kelowna', 'brewery crawl in Penticton', 'dinner and drinks in Penticton', 'a wine day in Oliver', 'brunch and a walk in Kelowna', 'ski day at Big White on January 16 2027']) {
    const p = plan(q);
    assert.ok(p.story && p.story.text && p.story.textFr, q);
    let at = -1;
    for (const s of allStops(p)) {
      const name = (s.venue || s.event).name;
      assert.ok(p.story.text.includes(name), `${q}: ${name} in “${p.story.text}”`);
      assert.ok(p.story.textFr.includes(name), `${q}: ${name} in « ${p.story.textFr} »`);
      if ((p.days || []).length <= 1) { const k = p.story.text.indexOf(name); assert.ok(k > at, `${q}: order`); at = k; }
    }
    assert.doesNotMatch(p.story.text, BANNED_RE, q);
    assert.doesNotMatch(p.story.textFr, BANNED_RE, q);
    assert.doesNotMatch(p.story.textFr, /^Votre journée commence par/, q);
  }
  // French crawls and evenings never open with « Votre journée commence par ».
  const crawl = t3FrenchPlan(plan('brewery crawl in Penticton'));
  assert.match(crawl.story.text, /^Goûtez la bière à /);
  const st = (name, type, daypart) => ({ daypart, label: '', venue: { name, type } });
  assert.match(t3FrenchStory({ itinerary: { stops: [st('A', 'brewery', 'afternoon'), st('L', 'restaurant', 'midday'), st('B', 'brewery', 'afternoon')] } }), /^Votre tournée commence par/);
  // A reason is only what the data holds: a lake-view park mentions the lake; a stop without the badge does not.
  const story = buildStory({ kind: 'itinerary', days: [], itinerary: { stops: [{ daypart: 'morning', venue: { id: PARKS[1].id, name: PARKS[1].name, type: 'outdoor', regionLabel: 'Kelowna' } }, { daypart: 'midday', label: 'Lunch', venue: { id: KITCHENS[0].id, name: KITCHENS[0].name, type: 'restaurant', regionLabel: 'Kelowna' } }] } }, FACTS, {});
  assert.match(story.text, /^Walk the trails at Mission Flats Park, (?:which looks out over the lake|with views over the lake|with a lake view), then have lunch at Kelowna Kitchen 1\.$/);
  const plainStory = buildStory({ kind: 'itinerary', days: [], itinerary: { stops: [{ daypart: 'afternoon', venue: { id: MUSEUM.id, name: MUSEUM.name, type: 'indoor', regionLabel: 'Kelowna' } }] } }, FACTS, {});
  assert.equal(plainStory.text, 'Visit Kelowna History Museum.');
  assert.equal(plainStory.textFr, 'Visitez Kelowna History Museum.');
});

test('Day shape (round 15): two days of a weekend do not both open on a trail when another good place is open', () => {
  assert.ok(GARDEN.id > 0);
  const p = plan('a weekend in Kelowna');
  const open = p.days.map((d) => d.stops.find((s) => s.venue).venue.id);
  const trail = (id) => PARKS.some((x) => x.id === id);
  assert.ok(!(trail(open[0]) && trail(open[1])), JSON.stringify(p.days.map((d) => d.stops[0].venue && d.stops[0].venue.name)));
});
