'use strict';
// Build My Trip quality pass (2026-10-14): requests a visitor would type, and what a good plan does with them.
const test = require('node:test'), assert = require('node:assert/strict');
const d = require('../discovery-intent'), r = require('../trip-requirements'), tp = require('../trip-planner');
const { t3FrenchText, t3FrenchPlan } = require('../trip-french-copy');

const regions = ['kelowna', 'penticton', 'oliver', 'osoyoos', 'vernon'];
const regionLabels = { kelowna: 'Kelowna', penticton: 'Penticton', oliver: 'Oliver', osoyoos: 'Osoyoos', vernon: 'Vernon' };
const types = ['restaurant', 'cafe', 'winery', 'indoor', 'outdoor', 'tour', 'beach', 'golf', 'pub', 'brewery', 'cocktail', 'distillery'];
const taxonomy = { regions, regionLabels, types, features: ['dog_friendly', 'kid_friendly', 'vegetarian'], activities: ['hiking', 'viewpoints', 'nature'], collections: [], venues: [], eventCategories: ['live-music', 'holiday-seasonal'], datePresets: ['this-weekend', 'today'], paces: ['relaxed', 'standard', 'packed'] };
const labels = { regions: regionLabels, types: Object.fromEntries(types.map((t) => [t, { singular: t, plural: `${t}s` }])) };

let nextId = 1;
const v = (region, type, name, description = '', extra = {}) => ({ id: nextId++, region, type, name, description, ...extra });
const raw = [
  // Penticton: a family beach trip
  v('penticton', 'beach', 'Skaha Beach', 'Sandy beach with a playground.'),
  v('penticton', 'beach', 'Okanagan Beach', 'Downtown beach on the lake.'),
  v('penticton', 'beach', 'Sudbury Beach', 'Quiet beach.'),
  v('penticton', 'indoor', 'Penticton Museum & Archives', 'Local history museum.'),
  v('penticton', 'indoor', 'Penticton Curling Club', 'Curling leagues.'),
  v('penticton', 'indoor', 'Community Pool & Lazy River', 'Indoor pool with a lazy river and waterslide.'),
  v('penticton', 'restaurant', 'Tratto Pizzeria', 'Neapolitan pizza.', { rating: 4.7 }),
  v('penticton', 'restaurant', 'Slice Pizza', 'Pizza by the slice.', { rating: 4.5 }),
  v('penticton', 'restaurant', 'Lakeside Grill', 'Burgers and salads by the lake.', { rating: 4.6 }),
  v('penticton', 'restaurant', 'Curry House', 'Indian curries.', { rating: 4.6 }),
  v('penticton', 'restaurant', 'Noodle Bar', 'Ramen and noodles.', { rating: 4.4 }),
  v('penticton', 'cafe', 'Beach Cafe', 'Coffee and ice cream.', { rating: 4.5 }),
  v('penticton', 'brewery', 'Cannery Brewing', 'Craft beer taproom.', { rating: 4.7, kid_friendly: 1 }),
  v('penticton', 'brewery', 'Barley Mill Brew Pub', 'Brewpub.', { rating: 4.4 }),
  v('penticton', 'brewery', 'Neighbourhood Brewing', 'Craft brewery.', { rating: 4.3 }),
  // Oliver and Osoyoos: a wine day
  v('oliver', 'winery', 'Golden Mile Winery', 'Tasting room.', { rating: 4.7, hours: JSON.stringify({ mon: [['10:00', '18:00']], tue: [['10:00', '18:00']], wed: [['10:00', '18:00']], thu: [['10:00', '18:00']], fri: [['10:00', '18:00']], sat: [['10:00', '18:00']], sun: [['10:00', '18:00']] }) }),
  v('oliver', 'restaurant', 'Vineyard View Kitchen', 'Lunch with a view over the vineyards.', { rating: 4.6 }),
  v('oliver', 'cafe', 'Oliver Coffee', 'Espresso.', { rating: 4.4 }),
  v('osoyoos', 'winery', 'Lakeside Estate Winery', 'Tasting room above the lake.', { rating: 4.6 }),
  v('osoyoos', 'restaurant', 'Osoyoos Bistro', 'Dinner bistro.', { rating: 4.6 }),
  v('osoyoos', 'outdoor', 'Desert RV Resort & Campground', 'Campsites on the lake.'),
  // Kelowna: things to do, teens, a dog
  v('kelowna', 'restaurant', 'Top Rated Diner', 'Breakfast and lunch.', { rating: 4.9 }),
  v('kelowna', 'cafe', 'Top Rated Cafe', 'Coffee.', { rating: 4.9 }),
  v('kelowna', 'indoor', 'Exit Escape Rooms', 'Escape rooms for groups.'),
  v('kelowna', 'pub', 'Downtown Pub', 'Pub with sports on TV.', { rating: 4.8 }),
  v('kelowna', 'outdoor', 'Knox Mountain Park', 'Hiking trails and a lookout.', { dog_friendly: 1 }),
  v('kelowna', 'beach', 'City Beach', 'Beach downtown.'),
];
const facts = raw.map((x) => ({
  ...x, url: `/${x.region}/${x.type}/${x.id}`, textName: d.normalizeDiscoveryText(x.name), textDesc: d.normalizeDiscoveryText(x.description), textCuisine: '',
  features: { dog_friendly: !!x.dog_friendly, kid_friendly: x.kid_friendly !== undefined ? !!x.kid_friendly : true, lake_view: false }, activities: r.inferPlannerActivities ? r.inferPlannerActivities(x) : [],
  collections: [], fdTypes: [], plannerKinds: r.inferPlannerKinds(x), rating: x.rating || null, reviews: x.rating ? 100 : 0, hours: x.hours || null,
}));
function plan(text, extra = {}) {
  const intent = d.interpretDiscoveryQuery(text, taxonomy), trip = d.interpretTripComponents(text, taxonomy, intent);
  const requirements = r.extractTripRequirements({ text, intent, trip, taxonomy, referenceDate: '2026-10-14' });
  const p = tp.planTrip({ intent, trip: trip.multi ? trip : null, requirements, facts, labels, text, tripEvents: trip.components.map(() => []), ...extra });
  return { p, intent, trip };
}
const stops = (p) => (p.days || []).flatMap((day) => day.stops.filter((s) => s.venue).map((s) => ({ ...s, day: day.day })));

test('"next weekend" is the Saturday after the coming one', () => {
  const at = (ref) => r.extractTripRequirements({ text: '2 days in Kelowna next weekend', referenceDate: ref }).startDate;
  assert.equal(at('2026-10-14'), '2026-10-24'); // a Wednesday
  assert.equal(at('2026-10-17'), '2026-10-24'); // a Saturday
  assert.equal(at('2026-10-18'), '2026-10-24'); // a Sunday
  const { p } = plan('2 days in Kelowna next weekend');
  assert.ok(!p.unsupported.includes('next weekend'), 'no longer reported as not understood');
});

test('"a beach day" and "a day out" are one-day plans that keep what the day is for', () => {
  const beach = d.interpretDiscoveryQuery('A beach day in Kelowna', taxonomy);
  assert.equal(beach.mode, 'plan'); assert.equal(beach.days, 1); assert.ok(beach.types.includes('beach'));
  const out = d.interpretDiscoveryQuery('Cheap day out in Vernon', taxonomy);
  assert.equal(out.mode, 'plan'); assert.equal(out.days, 1);
});

test('counts and party words are never search words', () => {
  const i = d.interpretDiscoveryQuery('3 days in Penticton with our two kids', taxonomy);
  assert.ok(!(i.foodTerms || []).some((f) => f.term === 'two'));
  assert.ok(!(i.textTerms || []).includes('two'));
});

test('a craft beer crawl is three breweries in a row', () => {
  const { p, trip } = plan('Craft beer crawl in Penticton');
  assert.equal(trip.components.length, 3);
  assert.equal(p.kind, 'itinerary');
  const picked = p.itinerary.stops.filter((s) => s.venue);
  assert.equal(picked.length, 3);
  assert.ok(picked.every((s) => s.venue.type === 'brewery'));
  assert.equal(new Set(picked.map((s) => s.venue.id)).size, 3);
  assert.match(p.experience.text, /three craft breweries/);
});

test('"something indoors if it rains" keeps the sunny plan and names indoor backups, attractions first', () => {
  const { p } = plan("3 days in Penticton with our two kids. We don't drink. Beach if it's nice, something indoors if it rains, pizza one night.");
  assert.ok(stops(p).every((s) => s.venue.type !== 'indoor'), 'the days stay a beach trip');
  const names = (p.rainBackup || []).map((x) => x.name);
  assert.ok(names.length >= 1);
  assert.ok(!names.includes('Penticton Curling Club'), 'a curling club is not a rainy-day pick');
  assert.equal(names[0], 'Community Pool & Lazy River', 'kids get the pool first');
  assert.match(p.notes[0], /^If it rains: /);
  assert.equal(p.requirementResults.find((i) => i.kind === 'rainy').status, 'satisfied');
  assert.ok(!p.contextNotes.some((n) => /Indoor kinds of places come first/.test(n)), 'not planned as a rainy trip');
});

test('"pizza one night" is one pizza dinner; a family day ends at a restaurant, not a brewery', () => {
  const { p } = plan("3 days in Penticton with our two kids. Beach if it's nice, pizza one night.");
  const pizza = stops(p).filter((s) => /pizz/i.test(s.venue.name));
  assert.equal(pizza.length, 1);
  assert.equal(pizza[0].daypart, 'evening');
  for (const s of stops(p).filter((x) => x.daypart === 'evening')) assert.equal(s.venue.type, 'restaurant');
});

test('a dish asked for without a count is at most once a day and on about half the days', () => {
  const { p } = plan('3 days in Penticton, beach and pizza');
  const pizza = stops(p).filter((s) => /pizz/i.test(s.venue.name));
  assert.ok(pizza.length >= 1 && pizza.length <= 2, `pizza meals: ${pizza.length}`);
  assert.equal(new Set(pizza.map((s) => s.day)).size, pizza.length, 'never twice in one day');
});

test('a one-day wine trip for two towns visits both, with lunch at midday and no campground', () => {
  const { p, intent } = plan('One day in Osoyoos and Oliver: wineries and lunch');
  const day = p.days[0];
  assert.deepEqual(new Set(stops(p).map((s) => s.venue.region)), new Set(['oliver', 'osoyoos']));
  const midday = day.stops.find((s) => s.daypart === 'midday');
  assert.ok(midday && midday.venue && midday.venue.type === 'restaurant', 'lunch is its own midday stop');
  assert.ok(stops(p).filter((s) => s.venue.type === 'winery').length >= 1);
  assert.ok(!stops(p).some((s) => /campground|rv resort/i.test(s.venue.name)));
  const understood = tp.buildUnderstood(intent, null, labels, { dayRegions: p.days.flatMap((x) => x.regions || [x.region]) });
  assert.ok(!understood.notUsed.includes('Osoyoos') && !understood.notUsed.includes('Oliver'));
  assert.match(p.headline, /Oliver and Osoyoos|Osoyoos and Oliver/);
});

test('"something fun to do" lists things to do before food and drink; teens get no pubs', () => {
  const fun = plan('Something fun to do in Kelowna').p;
  assert.ok(!['restaurant', 'cafe', 'pub', 'brewery', 'cocktail'].includes(fun.recommendations[0].venue.type));
  const teens = plan('Something fun to do with teenagers in Kelowna').p;
  assert.equal(teens.recommendations[0].venue.name, 'Exit Escape Rooms');
  assert.ok(!teens.recommendations.some((s) => s.venue.type === 'pub'));
});

test('French copy for the new notes and headlines', () => {
  assert.equal(t3FrenchText('If it rains: Penticton Museum is indoors nearby, so swap it in for a beach or outdoor stop.'), 'S’il pleut : Penticton Museum est une option intérieure à proximité; remplacez une plage ou une sortie en plein air par celle-ci.');
  assert.equal(t3FrenchText('Listed hours: 11:00–22:00 Mon–Fri; 10:00–20:00 Sun'), 'Horaires indiqués : 11:00–22:00 lun.–ven.; 10:00–20:00 dim.');
  const fr = t3FrenchPlan({ summary: 'Dog-friendly cafes and dinner in Vernon.', itinerary: { stops: [{ venue: { name: 'Bean to Cup', regionLabel: 'Vernon' } }] } });
  assert.equal(fr.headline, 'Votre itinéraire à Vernon');
  assert.equal(t3FrenchPlan({ understood: { when: 'Sat, Oct 24 – Sun, Oct 25' }, days: [] }).understood.when, 'sam. 24 oct. – dim. 25 oct.');
});

test('a dish missing in town names the closest place that has it', () => {
  const { p } = plan('A day in Oliver with a winery and pizza');
  const w = p.warnings.find((x) => /pizza/.test(x));
  assert.match(w, /is listed in Oliver; the closest is (?:Tratto Pizzeria|Slice Pizza) in Penticton\./);
});

test('"nothing too active" is a relaxed day: no golf, no hikes', () => {
  const { p, intent } = plan('A day in Kelowna with my grandparents, nothing too active');
  assert.equal(intent.pace, 'relaxed');
  assert.ok(stops(p).length >= 2);
  assert.ok(!stops(p).some((s) => s.venue.type === 'golf' || /mountain/i.test(s.venue.name)));
});

test('"a walk by the lake" keeps the lake on the walk instead of reporting it unused', () => {
  const text = 'Breakfast and a walk by the lake in Kelowna';
  const i = d.interpretDiscoveryQuery(text, taxonomy), trip = d.interpretTripComponents(text, taxonomy, i);
  assert.deepEqual(trip.leftoverTerms, []);
  assert.ok(trip.components.some((c) => c.lake));
});

test('a weekend with one dinner asked for leaves the other evening free, with places to eat if they want', () => {
  const { p } = plan('A relaxed weekend in Penticton with a beach and a nice dinner');
  const evenings = p.days.map((day) => day.stops.find((s) => s.daypart === 'evening'));
  assert.equal(evenings.filter((s) => s && s.venue && s.venue.type === 'restaurant').length, 1);
  const free = evenings.find((s) => s && !s.venue);
  assert.ok(free && free.freeEvening && free.freeEvening.length >= 1, 'the free evening names a dinner spot or two');
  assert.ok(free.freeEvening.every((x) => x.url && x.name));
});

test('lakeside walks: walkways and strolls count as walks', () => {
  assert.ok(r.inferPlannerKinds({ type: 'outdoor', name: 'Pioneer Walkway Park', description: 'A short lakeside stroll in the middle of Osoyoos.' }).includes('walk'));
});

test('a place whose advisory says it may not be operating is not picked over open places', () => {
  const extra = facts.concat([{ ...facts.find((x) => x.name === 'Golden Mile Winery'), id: 999, name: 'Receivership Winery', rating: 4.9, reviews: 500, advisory: { note: 'The winery is in court-ordered receivership and the property is for sale; check it is open before visiting.' } }]);
  const text = 'One day in Oliver with a winery';
  const intent = d.interpretDiscoveryQuery(text, taxonomy), trip = d.interpretTripComponents(text, taxonomy, intent);
  const requirements = r.extractTripRequirements({ text, intent, trip, taxonomy, referenceDate: '2026-10-14' });
  const p = tp.planTrip({ intent, trip: trip.multi ? trip : null, requirements, facts: extra, labels, text, tripEvents: [] });
  assert.ok(stops(p).some((s) => s.venue.type === 'winery'));
  assert.ok(!stops(p).some((s) => s.venue.id === 999));
});

test('a place outside the Okanagan is named as not covered, not searched for', () => {
  const i = d.interpretDiscoveryQuery('Weekend in Vancouver', taxonomy);
  assert.ok(!(i.textTerms || []).includes('vancouver'));
  assert.ok(i.unsupported.includes('Vancouver'));
  const { p } = plan('Weekend in Vancouver');
  assert.match(p.contextNotes[0], /only covers the Okanagan Valley, so Vancouver isn’t included/);
});

test('"pizza one night" is a dinner even when nothing else in the request needs checking', () => {
  const { p } = plan('2 days in Penticton, beach and pizza one night');
  const pizza = stops(p).filter((s) => /pizz/i.test(s.venue.name));
  assert.equal(pizza.length, 1);
  assert.equal(pizza[0].daypart, 'evening');
});

test('the trip page loads, with the phone-friendly card controls in its script', () => {
  const page = require('../trip-planner-v3-page.js'); // a syntax slip here silently falls back to the old page
  assert.equal(typeof page.renderTripPlannerV3Page, 'function');
  const src = require('node:fs').readFileSync(require.resolve('../trip-planner-v3-page.js'), 'utf8');
  for (const marker of ['data-t3-badges-more', 't3-more-menu', 't3-sched', 'is-swapped', 'Swapped ']) assert.ok(src.includes(marker), `missing ${marker}`);
});

test('every inline script on the trip page is valid JavaScript (the page code lives in a template string, where a stray backslash breaks it)', () => {
  const v3 = require('../trip-planner-v3-page.js');
  const html = v3.renderTripPlannerV3Page({ esc: (s) => String(s), title: '', description: '', canonical: '', breadcrumbJson: '{}', headerHtml: '', tripTrayHtml: '', footerHtml: '', footerStyles: '', analyticsHead: '', regions: [], regionImages: {}, preview: false });
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length > 0);
  for (const code of scripts) assert.doesNotThrow(() => new Function(code), 'a page script has a syntax error');
});
