// Weekly audit (2026-10-25): Build My Trip ended some plans with a stop that could not fit before it closed, shown
// only as a small "Timing conflict" tag with no warning (Origin Wines after three Naramata tastings; dinner at Gerni's
// after a 90-minute drink on a Vernon date night). PURE tests on a small fixture valley, like r15b-planner.test.js.
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

const REGIONS = { vernon: 'Vernon', naramata: 'Naramata', osoyoos: 'Osoyoos' };
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
const CENTRES = { vernon: [50.267, -119.272], naramata: [49.595, -119.59], osoyoos: [49.032, -119.468] };
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
// Naramata: four tasting rooms open noon to 5 and a pub for lunch (Saturday plan: the fourth tasting cannot fit).
for (let i = 0; i < 4; i++) add({ name: `Naramata Bench Winery ${i + 1}`, region: 'naramata', type: 'winery', rating: 4.8 - i * 0.05, price: null, hours: open('12:00', '17:00'), dLat: 0.006 * i });
add({ name: 'Naramata Village Pub', region: 'naramata', type: 'pub', rating: 4.4, price: 2, hours: open('12:00', '21:00'), dLat: 0.002 });
// Vernon: a pub for a drink and a farmhouse restaurant that closes at 9 (date night).
add({ name: 'Vernon Lakeview Pub', region: 'vernon', type: 'pub', rating: 4.6, price: 2, hours: open('11:00', '22:00'), features: { lake_view: true } });
add({ name: 'Vernon Farmhouse Kitchen', region: 'vernon', type: 'restaurant', rating: 4.7, price: 3, hours: open('12:00', '21:00'), dLat: 0.01, desc: 'Farm-to-table dinners with views over the lake.' });
// Osoyoos: a dog swimming area by the lake, two ordinary beaches, lunch and dinner places and an ice cream shop.
const DOG_SWIM = add({ name: 'Goodmanly Park Dog Swimming Area', region: 'osoyoos', type: 'beach', rating: null, features: { lake_view: true, dog_friendly: true }, desc: 'A fenced swimming area for dogs on the lake.', collections: ['local_favorite'] });
add({ name: 'Osoyoos Gyro Beach', region: 'osoyoos', type: 'beach', rating: null, features: { lake_view: true }, desc: 'A sandy town beach with a playground.', dLat: 0.004 });
add({ name: 'Osoyoos Lakeside Beach Park', region: 'osoyoos', type: 'beach', rating: null, features: { lake_view: true }, desc: 'A beach park with picnic tables.', dLat: 0.008 });
for (let i = 0; i < 3; i++) add({ name: `Osoyoos Grill ${i + 1}`, region: 'osoyoos', type: 'restaurant', rating: 4.5, price: 2, hours: open('11:00', '21:00'), dLat: 0.002 * i });
add({ name: 'Osoyoos Scoops', region: 'osoyoos', type: 'cafe', rating: 4.7, price: 1, hours: open('10:00', '21:00'), desc: 'Ice cream and coffee.' });

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

const hm = (m) => (Number.isFinite(m) ? `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` : '--');
const show = (p) => allStops(p).map((s) => { const row = (p.schedule || []).find((x) => x.venueId === (s.venue && s.venue.id)) || {}; return `${hm(row.startMinutes)}-${hm(row.endMinutes)} ${row.status} ${s.venue && s.venue.name}`; });
const rowFor = (p, name) => { const st = allStops(p).find((s) => s.venue && s.venue.name === name); return st && (p.schedule || []).find((r) => r.venueId === st.venue.id); };

test('A tasting that cannot fit before closing is left out with a note, not kept with no time (Naramata on a Saturday)', () => {
  const p = plan('wine tasting in Naramata on Saturday');
  assert.ok((p.schedule || []).length >= 3, show(p).join(' | '));
  assert.equal((p.schedule || []).filter((r) => !Number.isFinite(r.startMinutes)).length, 0, `every stop is timed: ${show(p).join(' | ')}`);
  const note = (p.notes || []).find((n) => / was left out: it closes at \d\d:\d\d, before the plan would get there\.$/.test(n));
  assert.ok(note, JSON.stringify(p.notes));
  const leftOut = note.split(' was left out')[0];
  assert.ok(!names(p).includes(leftOut), 'the stop named in the note is no longer in the plan');
  assert.ok(!new RegExp(leftOut.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(JSON.stringify(p.story || '')), 'the summary does not mention it');
  assert.match(t3FrenchPlan ? JSON.stringify(t3FrenchPlan(p)) : '', /a été retiré : il ferme à \d\d:\d\d, avant que le programme y arrive\./);
});

test('"A drink first" is about an hour, so dinner still fits before a 9 PM close (date night in Vernon)', () => {
  const p = plan('date night in Vernon');
  const drink = rowFor(p, 'Vernon Lakeview Pub'), dinner = rowFor(p, 'Vernon Farmhouse Kitchen');
  assert.ok(drink && dinner, show(p).join(' | '));
  assert.ok(drink.endMinutes - drink.startMinutes <= 60, `drink ${hm(drink.startMinutes)}-${hm(drink.endMinutes)}`);
  assert.ok(Number.isFinite(dinner.startMinutes) && dinner.endMinutes <= 21 * 60, `dinner ${hm(dinner.startMinutes)}-${hm(dinner.endMinutes)}`);
});
test('A late-October beach day: no dog swimming area without a dog, and the cold water is mentioned (Osoyoos)', () => {
  const p = plan('a day at the beach in Osoyoos on October 31');
  assert.ok(!names(p).includes(DOG_SWIM.name), names(p).join(', '));
  const beach = allStops(p).find((s) => s.venue && s.venue.type === 'beach');
  assert.ok(beach, names(p).join(', '));
  assert.ok((beach.caveats || []).some((c) => /usually too cold for a swim in October/.test(typeof c === 'string' ? c : c.text)), JSON.stringify(beach.caveats));
  const row = (p.schedule || []).find((r) => r.venueId === beach.venue.id);
  assert.ok(row.endMinutes - row.startMinutes <= 60, `an October beach is a walk of about an hour: ${show(p).join(' | ')}`);
  const lunch = (p.schedule || [])[1];
  assert.ok(lunch && lunch.waitMinutes <= 45, `no long wait for lunch: ${show(p).join(' | ')}`);
  const july = plan('a day at the beach in Osoyoos on July 18');
  const julyBeach = allStops(july).find((s) => s.venue && s.venue.type === 'beach');
  const julyRow = julyBeach && (july.schedule || []).find((r) => r.venueId === julyBeach.venue.id);
  assert.ok(julyRow && julyRow.endMinutes - julyRow.startMinutes >= 90, `a July beach keeps its longer visit: ${show(july).join(' | ')}`);
  assert.ok(!(julyBeach.caveats || []).some((c) => /too cold/.test(typeof c === 'string' ? c : c.text)));
  const withDog = plan('a day at the beach in Osoyoos with our dog on October 31');
  assert.ok(names(withDog).length, 'a trip with a dog still gets a plan');
});

test('Every beach stop on an off-season trip date says the lake is cold, even when no month was asked for (and not in July)', () => {
  for (const q of ['a day at the beach in Osoyoos', 'a day at the beach in Osoyoos on Saturday']) {
    const p = plan(q);
    const beach = allStops(p).find((s) => s.venue && s.venue.type === 'beach');
    assert.ok(beach, q);
    assert.equal((beach.caveats || []).filter((c) => /too cold for a swim/.test(typeof c === 'string' ? c : c.text)).length, 1, `${q}: ${JSON.stringify(beach.caveats)}`);
  }
  const july = run(build('a day at the beach in Osoyoos'), { tripDate: '2027-07-17' });
  const beach = allStops(july).find((s) => s.venue && s.venue.type === 'beach');
  assert.ok(beach && !(beach.caveats || []).some((c) => /too cold/.test(typeof c === 'string' ? c : c.text)), JSON.stringify(beach && beach.caveats));
});
