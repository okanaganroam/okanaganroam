// Build My Trip, round 10 (2026-10-19): Swap on short plans changes one stop only; a winery-lunch swap stays a winery
// restaurant at another estate; French routes run in the direction asked; a named month beats "weekend" and dates the
// shows; shows are performances (never a coffee social); Christmas markets; dinner moved earlier after a long empty
// afternoon; trail times from their length; golf simulators, tours and gelato in November; the page's swap request and
// 12-hour times. The requests are the real ones from drafts/site-review-2026-10-19-pass9.md. PURE tests on a small
// fixture valley (no server.js, no database), plus the page's serialized helpers run in a vm.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const d = require('../discovery-intent.js');
const r = require('../trip-requirements.js');
const tp = require('../trip-planner.js');
const fr = require('../trip-planner-fr.js');
const { t3FrenchText } = require('../trip-french-copy.js');

const REGIONS = { vernon: 'Vernon', 'lake-country': 'Lake Country', kelowna: 'Kelowna', 'west-kelowna': 'West Kelowna', peachland: 'Peachland', summerland: 'Summerland', penticton: 'Penticton', naramata: 'Naramata', kaleden: 'Kaleden', 'okanagan-falls': 'Okanagan Falls', oliver: 'Oliver', osoyoos: 'Osoyoos' };
const TAXONOMY = {
  regions: Object.keys(REGIONS), regionLabels: REGIONS,
  types: ['restaurant', 'winery', 'cafe', 'brewery', 'pub', 'cocktail', 'golf', 'beach', 'outdoor', 'tour', 'indoor', 'sport'],
  features: ['dog_friendly', 'kid_friendly', 'patio', 'vegan', 'vegetarian'], collections: ['hidden_gem', 'local_favorite'],
  activities: ['hiking', 'winter', 'viewpoints', 'nature'], cuisines: [], budgets: ['budget', 'moderate', 'upscale'], paces: ['relaxed', 'standard', 'packed'],
  datePresets: ['today', 'this-weekend', 'this-week', 'this-month'], eventCategories: ['live-music', 'family-kids', 'holiday-seasonal', 'arts-culture', 'markets-fairs', 'nightlife', 'community-events'], venues: [],
};
const T = (s, p) => ({ singular: s, plural: p });
const LABELS = {
  regions: REGIONS,
  types: { restaurant: T('Restaurant', 'Restaurants'), winery: T('Winery', 'Wineries'), cafe: T('Cafe', 'Cafes'), brewery: T('Brewery', 'Breweries'), pub: T('Pub', 'Pubs'), cocktail: T('Cocktail Lounge', 'Cocktail Lounges'),
    golf: T('Golf Course', 'Golf Courses'), beach: T('Beach', 'Beaches'), outdoor: T('Outdoor Destination', 'Outdoor Destinations'), tour: T('Tour', 'Tours'), indoor: T('Indoor', 'Indoor'), sport: T('Sport', 'Sports') },
  activities: { hiking: 'Hiking & Trails', winter: 'Winter', viewpoints: 'Viewpoints', nature: 'Nature' }, features: { dog_friendly: 'Dog-Friendly', kid_friendly: 'Kid-Friendly', vegan: 'Vegan-Friendly', vegetarian: 'Vegetarian-Friendly' }, featureNouns: {}, collections: {},
};
const CENTRES = { vernon: [50.267, -119.272], 'lake-country': [50.054, -119.41], kelowna: [49.888, -119.47], 'west-kelowna': [49.863, -119.583], peachland: [49.773, -119.736], summerland: [49.602, -119.677], penticton: [49.48, -119.585], naramata: [49.594, -119.588], kaleden: [49.39, -119.6], 'okanagan-falls': [49.34, -119.57], oliver: [49.183, -119.551], osoyoos: [49.032, -119.468] };
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
    seasonClosed: null, seasonClosedToday: false,
  };
  v.activities = [...new Set([...(o.activities || []), ...r.inferPlannerActivities(v)])];
  v.plannerKinds = r.inferPlannerKinds(v);
  FACTS.push(v);
  return v;
}
for (const region of ['vernon', 'kelowna', 'west-kelowna', 'peachland', 'summerland', 'penticton', 'naramata', 'oliver', 'osoyoos']) {
  const L = REGIONS[region];
  for (let i = 0; i < 2; i++) add({ name: `${L} Creek Trail ${i + 1}`, region, type: 'outdoor', rating: 4.6, activities: ['hiking', 'nature'], desc: 'An easy walk on a creek trail.', dLat: 0.01 * i });
  for (let i = 0; i < 3; i++) add({ name: `${L} Ridge Winery ${i + 1}`, region, type: 'winery', rating: 4.8 - i * 0.05, hours: open('10:00', '18:00'), dLat: 0.012 * i, dLng: 0.01 });
  for (let i = 0; i < 4; i++) add({ name: `${L} Kitchen ${i + 1}`, region, type: 'restaurant', rating: 4.6 - i * 0.05, price: 2 + (i % 2), hours: open('11:00', '22:00'), dLat: 0.004 * i });
  add({ name: `${L} Coffee Co`, region, type: 'cafe', rating: 4.6, price: 1, desc: 'Coffee and lunch.', hours: open('07:00', '16:00') });
  add({ name: `${L} Heritage Museum`, region, type: 'indoor', rating: 4.5, hours: open('10:00', '17:00'), desc: 'A local history museum.', dLat: 0.003 });
}
for (const region of ['kelowna', 'penticton']) for (let i = 0; i < 150; i++) add({ name: `${REGIONS[region]} Curling Club ${i + 1}`, region, type: 'sport', rating: 3 });
// Penticton breweries (a crawl), none a brewpub by name.
const BREWERIES = [0, 1, 2, 3, 4].map((i) => add({ name: `Penticton Ale House Brewing ${i + 1}`, region: 'penticton', type: 'brewery', rating: 4.7 - i * 0.05, hours: open('11:00', '22:00'), dLat: 0.003 * i }));
// Oliver: winery estates and their restaurants (Hester Creek / Terrafina, Tinhorn / Miradoro, Burrowing Owl / Sonora).
const HESTER = add({ name: 'Hester Creek Estate Winery', region: 'oliver', type: 'winery', rating: 4.7, hours: open('10:00', '17:00'), desc: 'Hester Creek pairs its wines with a gorgeous patio restaurant.', dLat: 0.02 });
const TERRAFINA = add({ name: 'Terrafina at Hester Creek', region: 'oliver', type: 'restaurant', rating: 4.5, price: 3, hours: open('11:30', '20:00'), desc: 'Terrafina at Hester Creek is the patio restaurant at this Oliver winery estate.', dLat: 0.021 });
const TINHORN = add({ name: 'Tinhorn Creek Vineyards', region: 'oliver', type: 'winery', rating: 4.6, hours: open('11:00', '17:00'), desc: 'Tinhorn Creek Vineyards has a restaurant and tasting room with a patio.', dLat: 0.03 });
const MIRADORO = add({ name: 'Miradoro Restaurant', region: 'oliver', type: 'restaurant', rating: 4.5, price: 3, hours: open('11:30', '21:00'), desc: 'Miradoro Restaurant is the fine-dining room at Tinhorn Creek Vineyards in Oliver.', dLat: 0.031 });
const OWL = add({ name: 'Burrowing Owl Estate Winery', region: 'oliver', type: 'winery', rating: 4.7, hours: open('10:00', '17:00'), desc: 'Burrowing Owl does triple duty as restaurant, inn and winery.', dLat: 0.04 });
const SONORA = add({ name: 'Sonora Room Restaurant', region: 'oliver', type: 'restaurant', rating: 4.6, price: 3, hours: open('11:30', '20:00'), desc: 'Sonora Room Restaurant sits at Burrowing Owl Estate Winery in Oliver, with a balcony over the vineyards.', dLat: 0.041 });
const BOARDS = add({ name: 'Vasanti Estate Winery', region: 'oliver', type: 'winery', rating: 5, hours: open('10:00', '17:00'), desc: 'The charcuterie boards are generous.', dLat: 0.05 });
// Trails, a golf simulator, a tour company and a gelato bar.
const FALLS = add({ name: 'Naramata Creek Park Waterfall Trail', region: 'naramata', type: 'outdoor', rating: 4.7, activities: ['hiking'], desc: 'Naramata Creek Park is the village’s waterfall walk: a 2.5 km round trip on a packed trail up the creek.' });
const SIM = add({ name: 'Kelowna Sim Golf', region: 'kelowna', type: 'golf', rating: 4.8, hours: open('09:00', '23:00'), desc: 'An indoor golf simulator lounge.' });
SIM.indoorGolf = true; SIM.indoorEvidence = 'explicit';
const TOUR = add({ name: 'Kelowna Adventure Tours', region: 'kelowna', type: 'tour', rating: 4.9, hours: open('09:00', '17:00'), desc: 'Guided e-bike tours.' });
const GELATO = add({ name: 'Kelowna Gelato Bar', region: 'kelowna', type: 'cafe', rating: 5, price: 1, hours: open('11:00', '21:00'), desc: 'Gelato and sorbet.' });
const BY_ID = new Map(FACTS.map((v) => [v.id, v]));

let eventId = 900;
const ev = (o) => ({ id: o.id || eventId++, name: o.name, description: o.description || '', region: o.region, venueName: '', url: `/${o.region}/events/x`, valleyWide: false, categories: o.categories || ['arts-culture'], dateLabel: '', time: o.time, startDate: o.date, endDate: o.date, startTime: null, endTime: null, endsNextDay: 0, location: null });

function build(text, opts = {}) {
  const t = opts.french ? fr.tripPlannerText(text, TAXONOMY) : text;
  const intent = d.interpretDiscoveryQuery(t, TAXONOMY);
  const trip = d.interpretTripComponents(t, TAXONOMY, intent);
  const requirements = r.extractTripRequirements({ text: t, intent, trip, taxonomy: TAXONOMY, referenceDate: '2026-10-19' });
  if (opts.startDate) { requirements.startDate = opts.startDate; requirements.endDate = null; requirements.startMinutes = 540; }
  return { text: t, intent, trip, requirements, opts };
}
function run(b, extra = {}) {
  return tp.planTrip({ intent: b.intent, trip: b.trip.multi ? b.trip : null, requirements: b.requirements, facts: FACTS, labels: LABELS, text: b.text, tripDate: b.requirements.startDate || '2026-10-24',
    tripEvents: b.trip.multi ? b.trip.components.map((c) => (c.kind === 'event' ? (b.opts.tripEvents || []) : null)) : [], ...extra });
}
const shortStops = (p) => (p.itinerary && p.itinerary.stops) || (p.outing && p.outing.stops) || [];
const rowOf = (p, s) => (p.schedule || []).find((x) => (s.venue && x.venueId === s.venue.id) || (s.event && x.eventId === s.event.id));
const refOf = (s) => (s.kind !== 'event' && s.venue ? `venue:${s.venue.id}` : s.event ? `event:${s.event.id}` : null);
// What /trip sends for a short-plan Swap: the stops on screen in order, and their starts.
function swapShort(b, prev, n, exclude) {
  const list = shortStops(prev), st = list[n];
  if (!exclude.includes(st.venue.id)) exclude.push(st.venue.id);
  const stops = list.map((s) => ({ ref: refOf(s), label: s.label, daypart: s.daypart, component: s.component, ...(s.gapFill ? { gapFill: true } : {}) }));
  const times = {};
  list.forEach((s, j) => { const row = rowOf(prev, s); if (row && Number.isInteger(row.startMinutes)) times[`it-${j}`] = row.startMinutes; });
  const next = run(b, { excludeIds: exclude.slice(), swap: { key: `it-${n}`, type: st.venue.type, id: st.venue.id, stops, times } });
  if (next.swapKept) exclude.splice(exclude.indexOf(next.swapKept.id), 1);
  return next;
}

// ---- 1. Swap on short plans ----
test('Swap (round 10): a short plan swapped in the same slot three times changes only that stop, keeps the stop count and times', () => {
  const kelownaShow = ev({ name: 'Comedy Night at the Theatre', region: 'kelowna', time: '7:30 pm', date: '2026-10-24', description: 'Stand-up comedy.' });
  const cases = [
    build('brewery crawl in Penticton', { startDate: '2026-10-24' }),
    build('dinner and a show in Kelowna', { startDate: '2026-10-24', tripEvents: [kelownaShow] }),
  ];
  for (const b of cases) {
    const first = run(b);
    const before = shortStops(first);
    assert.ok(before.filter((s) => s.venue || s.event).length >= 2, `${b.text}: a real short plan`);
    const n = before.findIndex((s) => s.kind !== 'event' && s.venue);
    let cur = first;
    const exclude = [], seen = [before[n].venue.id];
    for (let k = 1; k <= 3; k++) {
      const prevName = shortStops(cur)[n].venue.name;
      cur = swapShort(b, cur, n, exclude);
      const now = shortStops(cur);
      assert.equal(now.length, before.length, `${b.text}: swap #${k} kept the stop count`);
      assert.ok(now[n].venue && now[n].venue.type === before[n].venue.type, `${b.text}: swap #${k} kept the kind of place`);
      assert.ok(!seen.includes(now[n].venue.id) || cur.swapKept, `${b.text}: swap #${k} offered something new (was ${prevName})`);
      seen.push(now[n].venue.id);
      assert.ok(now[n].swapSlot, `${b.text}: the swapped stop is marked for the page`);
      before.forEach((s, j) => {
        if (j === n) return;
        assert.equal(refOf(now[j]), refOf(s), `${b.text}: swap #${k} changed stop ${j}`);
        const a = rowOf(first, s), z = rowOf(cur, now[j]);
        if (a && Number.isInteger(a.startMinutes)) assert.ok(z && Math.abs(z.startMinutes - a.startMinutes) <= 20, `${b.text}: swap #${k}: stop ${j} moved from ${a.startMinutes} to ${z && z.startMinutes}`);
      });
    }
  }
});

test('Swap (round 10): a crawl swap adds no food stop and no café', () => {
  const b = build('brewery crawl in Penticton', { startDate: '2026-10-24' });
  const first = run(b);
  const types = shortStops(first).map((s) => s.venue && s.venue.type);
  const after = swapShort(b, first, 0, []);
  assert.deepEqual(shortStops(after).map((s) => s.venue && s.venue.type), types);
});

// ---- 2. Winery lunch ----
test('Winery lunch (round 10): estates, tasting rooms and the restaurant listings at them', () => {
  const words = tp.wineryNameWords(FACTS);
  assert.equal(tp.estateKey(HESTER, words), 'hester');
  assert.equal(tp.estateKey(TERRAFINA, words), 'hester');
  assert.equal(tp.estateKey(MIRADORO, words), 'tinhorn');
  assert.equal(tp.estateKey(SONORA, words), 'burrowing');
  assert.ok(tp.wineryRestaurant(SONORA, words), '"sits at Burrowing Owl Estate Winery" is a winery restaurant');
  assert.ok(tp.tastingRoomWithRestaurant(HESTER, FACTS), 'Hester Creek has Terrafina');
  assert.ok(!tp.tastingRoomWithRestaurant(BOARDS, FACTS));
});

test('Winery lunch (round 10): swapping Miradoro offers another winery restaurant, never a tasting room or the dinner’s estate', () => {
  const text = 'lunch at a winery in Oliver, 2 days';
  const day = { days: [{ day: 1, region: 'oliver', stops: [
    { daypart: 'midday', label: 'Midday', venue: { id: MIRADORO.id, type: 'restaurant', name: MIRADORO.name } },
    { daypart: 'evening', label: 'Evening', venue: { id: TERRAFINA.id, type: 'restaurant', name: TERRAFINA.name } },
  ] }] };
  const b = build(text);
  tp.applySwapPreference(day, { swap: { key: '1-midday', type: 'restaurant', id: MIRADORO.id }, pinned: { '1-evening': TERRAFINA.id }, facts: FACTS, labels: LABELS, intent: b.intent, requirements: b.requirements, text, tripDate: '2026-10-24', excludeIds: [MIRADORO.id] });
  const lunch = day.days[0].stops.find((s) => s.daypart === 'midday');
  assert.notEqual(lunch.venue.id, HESTER.id, 'not the tasting room of the dinner’s estate');
  assert.notEqual(lunch.venue.id, TINHORN.id, 'not Miradoro’s own tasting room');
  assert.notEqual(lunch.venue.id, BOARDS.id, 'a charcuterie board is not lunch');
  assert.equal(lunch.venue.id, SONORA.id);
});

test('Winery lunch (round 10): every day of "lunch at a winery" has lunch at midday', () => {
  const p = run(build('lunch at a winery in Oliver, 2 days', { startDate: '2026-10-24' }));
  for (const day of p.days) {
    const mid = day.stops.find((s) => s.daypart === 'midday' && s.venue);
    assert.ok(mid, `day ${day.day} has a midday stop`);
    const v = BY_ID.get(mid.venue.id);
    assert.ok(v.type === 'restaurant' || mid.wineryLunch, `day ${day.day}: ${v.name} is lunch`);
    assert.ok(!tp.tastingRoomWithRestaurant(v, FACTS), `day ${day.day}: ${v.name} is not a tasting room`);
  }
});

// ---- 3. Request parsing ----
test('French routes (round 10): « d’Osoyoos à Vernon » and « Osoyoos à Vernon » read from Osoyoos to Vernon', () => {
  for (const q of ['d’Osoyoos à Vernon en 2 jours', "d'Osoyoos à Vernon en 2 jours", 'Osoyoos à Vernon en 2 jours', "road trip d'Osoyoos à Vernon, 2 jours"]) {
    assert.match(fr.tripPlannerText(q, TAXONOMY), /\bfrom osoyoos to vernon\b/, q);
  }
  assert.equal(fr.tripPlannerText('3 jours à Vernon', TAXONOMY), '3 days in vernon');
  const p = run(build('Osoyoos à Vernon en 2 jours', { french: true, startDate: '2026-11-14' }));
  assert.equal(p.days.length, 2);
  assert.equal([].concat(p.days[0].regions || p.days[0].region)[0], 'osoyoos');
  assert.equal([].concat(p.days[1].regions || p.days[1].region).slice(-1)[0], 'vernon');
});

test('Road trips (round 10): "Kelowna to Osoyoos road trip" with no length is a 2-day road trip south; a short one is one day in both towns', () => {
  const p = run(build('Kelowna to Osoyoos road trip', { startDate: '2026-10-31' }));
  assert.equal(p.kind, 'multi_day');
  assert.equal(p.days.length, 2);
  assert.equal([].concat(p.days[0].regions || p.days[0].region)[0], 'kelowna');
  assert.equal([].concat(p.days[1].regions || p.days[1].region).slice(-1)[0], 'osoyoos');
  const one = run(build('Kelowna to Penticton road trip', { startDate: '2026-10-31' }));
  assert.equal(one.days.length, 1);
  const towns = new Set(one.days[0].stops.filter((s) => s.venue).map((s) => s.venue.region));
  assert.ok(towns.has('kelowna') && towns.has('penticton'), [...towns].join(','));
});

test('French notes (round 10): the visitor’s own words, with accents', () => {
  const q = '3 jours à Vernon en novembre avec des marchés et un événement minecraft';
  const words = fr.frenchWordsFor(q, TAXONOMY, ['november', 'markets', 'event', 'minecraft']);
  assert.equal(words.get('november'), 'novembre');
  assert.equal(words.get('markets'), 'marchés');
  assert.equal(words.get('event'), 'événement');
  assert.equal(words.get('minecraft'), 'minecraft');
  assert.equal(fr.tripPlannerText('marchés de Noël à Kelowna', TAXONOMY), 'christmas markets in kelowna');
  assert.match(fr.tripPlannerText('3 jours à Vernon en novembre avec des spectacles et de la musique', TAXONOMY), /in november with shows and live music/);
  assert.equal(t3FrenchText('Not verified: event — x'), 'Non vérifié : événement — x');
  assert.equal(t3FrenchText('Not met: show — x'), 'Non satisfait : spectacle — x');
  assert.equal(t3FrenchText('Not part of this plan: “minecraft” — Okanagan Roam couldn’t match that word to a kind of place it lists.'), 'Pas pris en compte dans ce plan : « minecraft » — Okanagan Roam n’a pas pu associer ce mot à un type de lieu répertorié.');
  assert.equal(t3FrenchText('Nothing matching “géantes” was available in Kelowna.'), 'Aucune option correspondant à « géantes » à Kelowna n’était disponible.');
});

test('Months (round 10): a month named with a length and shows is kept (not an unparsed word)', () => {
  const i = d.interpretDiscoveryQuery('3 days in Vernon in November with shows and live music', TAXONOMY);
  assert.equal(i.month, 11);
  assert.ok(!(i.unsupported || []).includes('november'));
  // Without a length an events search keeps the old reading.
  assert.equal(d.interpretDiscoveryQuery('concerts in November', TAXONOMY).month, null);
});

test('Shows (round 10): "shows and live music" asks for both; a coffee social or a boutique night is not a show', () => {
  const b = build('3 days in Vernon in November with shows and live music');
  const kinds = b.requirements.items.filter((i) => i.kind === 'event').map((i) => i.eventKind).sort();
  assert.deepEqual(kinds, ['live-music', 'show']);
  const show = b.requirements.items.find((i) => i.eventKind === 'show');
  const social = ev({ name: 'Young Professional Coffee Social', region: 'vernon', categories: ['community-events', 'nightlife'] });
  const boutique = ev({ name: 'Ladies Night Boutique Experience in Downtown Vernon', region: 'vernon', categories: ['community-events', 'nightlife'] });
  const play = ev({ name: 'Bury the Hatchet', region: 'vernon', categories: ['arts-culture'], description: 'A touring play.' });
  for (const e of [social, boutique]) { assert.equal(tp.eventSuitsKind(e, 'show'), false, e.name); assert.equal(r.eventMatches(e, show), false, e.name); }
  assert.equal(tp.eventSuitsKind(play, 'show'), true);
  assert.equal(r.eventMatches(play, show), true);
});

test('Christmas markets (round 10): a Christmas market request takes holiday markets only', () => {
  const b = build('weekend in Kelowna in December with Christmas markets');
  const item = b.requirements.items.find((i) => i.kind === 'event');
  assert.equal(item.eventKind, 'market');
  assert.equal(item.holiday, true);
  assert.equal(r.eventMatches(ev({ name: 'Kelowna Farmers Market', region: 'kelowna', categories: ['markets-fairs'] }), item), false);
  assert.equal(r.eventMatches(ev({ name: 'Craft Culture Holiday Market', region: 'kelowna', categories: ['holiday-seasonal', 'markets-fairs'] }), item), true);
});

// ---- 4. Timing realism ----
test('Timing (round 10): a long empty afternoon moves dinner earlier, or the wait is a Free time card', () => {
  const p = { kind: 'multi_day', days: [{ day: 1, region: 'kelowna', stops: [
    { daypart: 'morning', label: 'Morning', venue: { id: BY_ID.get(FACTS.find((v) => v.name === 'Kelowna Heritage Museum').id).id, type: 'indoor', name: 'Museum' } },
    { daypart: 'midday', label: 'Midday', venue: { id: FACTS.find((v) => v.name === 'Kelowna Kitchen 2').id, type: 'restaurant', name: 'Lunch' } },
    { daypart: 'evening', label: 'Evening', venue: { id: FACTS.find((v) => v.name === 'Kelowna Kitchen 1').id, type: 'restaurant', name: 'Dinner' } },
  ] }], notes: [], warnings: [] };
  const input = { facts: FACTS, labels: LABELS, intent: d.interpretDiscoveryQuery('one day in Kelowna', TAXONOMY), tripDate: '2026-10-24' };
  const req = { items: [], conflicts: [], startDate: '2026-10-24', startMinutes: 540 };
  tp.scheduleTripByHours(p, input, req);
  const dinnerRow = () => p.schedule.find((x) => x.venueId === p.days[0].stops.find(tp.isDinnerStop).venue.id);
  assert.ok(dinnerRow().waitMinutes >= 90, 'a long wait to start with');
  tp.pullDinnersForward(p, input, req);
  const stops = p.days[0].stops, k = stops.findIndex(tp.isDinnerStop);
  assert.ok(dinnerRow().startMinutes < 18 * 60, 'dinner moved before 6 PM');
  assert.ok(dinnerRow().startMinutes >= 17 * 60 + 30, 'but not before 5:30 PM');
  assert.ok(dinnerRow().waitMinutes < 90 || (stops[k - 1] && stops[k - 1].freeTime), 'what is left is short, or a Free time card');
});

test('Timing (round 10): trail length, golf simulators, tours and gelato in November', () => {
  assert.equal(tp.trailMinutes(FALLS), 60, 'a 2.5 km round trip is about an hour');
  assert.equal(tp.trailMinutes({ description: 'A 10 km loop above the lake.' }), 210);
  assert.equal(tp.trailMinutes({ description: 'Lovely views.' }), null);
  assert.equal(tp.publicVenue(SIM, null).typeLabel, 'Indoor golf');
  const sim = run(build('rainy day in Kelowna with indoor golf', { startDate: '2026-11-21' }));
  const simStop = sim.days.flatMap((x) => x.stops).find((s) => s.venue && s.venue.id === SIM.id);
  if (simStop) { assert.equal(simStop.venue.typeLabel, 'Indoor golf'); assert.ok(simStop.venue.indoorGolf); }
  assert.doesNotMatch(JSON.stringify(sim.experience || ''), /round of golf/);
  const tourStop = run(build('a tour in Kelowna', { startDate: '2026-10-24' }));
  const tourCaveats = JSON.stringify(tourStop);
  if (tourCaveats.includes(TOUR.name)) assert.match(tourCaveats, /book ahead/);
  assert.equal(tp.coldMonthIceCream(GELATO, '2026-11-14'), true);
  assert.equal(tp.coldMonthIceCream(GELATO, '2026-07-14'), false);
  assert.equal(tp.coldMonthIceCream(FACTS.find((v) => v.name === 'Kelowna Coffee Co'), '2026-11-14'), false);
});

// ---- 5. The page ----
test('Page (round 10): a short-plan Swap sends the stops on screen; suggested starts read as 12-hour times', () => {
  const page = require('../trip-planner-v3-page.js');
  const html = page.renderTripPlannerV3Page({ esc: (s) => String(s == null ? '' : s), title: 't', description: 'd', canonical: '/trip', breadcrumbJson: '{}', headerHtml: '', tripTrayHtml: '', footerHtml: '', footerStyles: '', analyticsHead: '', regions: [], regionImages: {}, preview: false });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const s of scripts) new vm.Script(s); // every inline script parses
  const main = scripts.find((s) => s.includes('function shortShown('));
  assert.ok(main, 'the planner script ships the short-plan helpers');
  const from = main.indexOf('  function clockLabel('), to = main.indexOf('  function shownIds(');
  const ctx = { state: { last: null }, langValue: 'en' };
  vm.createContext(ctx);
  vm.runInContext('function lang(){ return langValue; }\n' + main.slice(from, to) + '\nthis.api={ clockLabel: clockLabel, shortShown: shortShown, shortTimes: shortTimes, shortStops: shortStops };', ctx);
  assert.equal(ctx.api.clockLabel(690), '11:30 AM');
  assert.equal(ctx.api.clockLabel(1020), '5 PM');
  ctx.langValue = 'fr';
  assert.equal(ctx.api.clockLabel(690), '11 h 30');
  const plan = { itinerary: { stops: [
    { kind: 'venue', label: 'Breweries', daypart: 'afternoon', component: 0, venue: { id: 53, type: 'brewery' } },
    { kind: 'free', label: 'Free time', daypart: 'late', venue: null, freeTime: { minutes: 90 } },
    { kind: 'event', label: 'Show', daypart: 'evening', component: 1, event: { id: 645 } },
  ] }, schedule: [{ venueId: 53, startMinutes: 660 }, { eventId: 645, startMinutes: 1170 }] };
  ctx.state.last = plan;
  const shown = JSON.parse(JSON.stringify(ctx.api.shortShown(ctx.api.shortStops())));
  assert.deepEqual(shown, [{ ref: 'venue:53', label: 'Breweries', daypart: 'afternoon', component: 0 }, { ref: null, label: 'Free time', daypart: 'late' }, { ref: 'event:645', label: 'Show', daypart: 'evening', component: 1 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.api.shortTimes(ctx.api.shortStops()))), { 'it-0': 660, 'it-2': 1170 });
  // The Swap button on a short plan sends that request, and "+N more" keeps focus on the badges it shows.
  assert.match(main, /swap: \{ key: skey, type: list\[si\]\.venue\.type, id: sid, stops: shortShown\(list\), times: shortTimes\(list\) \}/);
  assert.match(main, /shown\[0\]\.focus\(/);
});
