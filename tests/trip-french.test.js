// Build My Trip: French requests and the French V3 interface (2026-10-04).
//
// PURE, like tests/trip-golden.test.js: no server.js, no database. Requests run
// through the same pipeline as runTripPlan() in server.js -- trip-planner-fr.js
// first, then the interpreter and the planner -- on the production snapshot in
// tests/fixtures/trip-golden-inputs.json.gz.
//
// 1. The required French vocabulary is understood.
// 2. Each French request is understood exactly like its English counterpart
//    and gets the identical stops.
// 3. Every English request is returned as the same string, so English plans
//    are byte-for-byte unchanged (the English suites themselves are untouched).
// 4. The V3 interface strings exist in English and French in /scripts/app.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const d = require('../discovery-intent.js');
const tp = require('../trip-planner.js');
const fr = require('../trip-planner-fr.js');
const v3 = require('../trip-planner-v3-page.js');

const INPUTS = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'fixtures', 'trip-golden-inputs.json.gz'))).toString('utf8'));
const { facts: FACTS, taxonomy: TAXONOMY, labels: LABELS } = INPUTS;
const CLOCK = { weekday: 'tue', minutes: 12 * 60 };
const TRIP_DATE = '2026-09-29';
const START_FOR = { 'this-weekend': 'sat', today: 'tue' };

function plan(raw, seed = 0) {
  const text = fr.tripPlannerText(raw, TAXONOMY);
  const intent = d.interpretDiscoveryQuery(text, TAXONOMY);
  const trip = d.interpretTripComponents(text, TAXONOMY, intent);
  const w = intent.when || {};
  const startWeekday = w.weekday ? w.weekday.slice(0, 3) : (START_FOR[w.preset] || (w.relative === 'tomorrow' ? 'wed' : null));
  const common = { intent, facts: FACTS, labels: LABELS, seed, clock: CLOCK, startWeekday };
  const p = trip.multi
    ? tp.planTrip({ ...common, trip, tripEvents: trip.components.map(() => []), tripDate: TRIP_DATE })
    : tp.planTrip({ ...common, events: null });
  const u = tp.buildUnderstood(intent, trip, LABELS, { kind: p.kind, days: (p.days || []).length || null, dayRegions: (p.days || []).map((x) => x.region) });
  return { text, intent, trip, p, u };
}
// What the planner understood, in the fields a visitor sees or a plan uses.
function understanding({ intent: i, p, u }) {
  return {
    kind: p.kind, mode: i.mode, days: (p.days || []).length, regions: i.regions, types: [...i.types].sort(), features: [...i.features].sort(),
    collections: i.collections, activities: i.activities, occasion: i.occasion, budget: i.budget, pace: u.pace, when: u.when, season: u.season,
    party: u.party, themes: u.themes, route: u.route, foodTerms: i.foodTerms.map((f) => f.term), excluded: (i.excluded && i.excluded.phrases) || [],
  };
}
function stopIds({ p }) {
  return [
    ...(p.days || []).flatMap((x) => x.stops),
    ...((p.outing && p.outing.stops) || []),
    ...((p.itinerary && p.itinerary.stops) || []),
    ...(p.recommendations || []),
  ].map((s) => (s.venue ? s.venue.id : s.kind || null));
}
function translations() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'scripts', 'app.js'), 'utf8');
  return new Function(src.slice(src.indexOf('var TRANSLATIONS = '), src.indexOf('function getCurrentLang')) + '; return TRANSLATIONS;')();
}
const PAGE_DEPS = { esc: (s) => String(s), title: '', description: '', canonical: '', breadcrumbJson: '{}', headerHtml: '', tripTrayHtml: '', footerHtml: '', footerStyles: '', analyticsHead: '', regions: [], regionImages: {}, preview: false };

// ---------- 1. vocabulary ----------

test('French: jours / journée / nuits set the trip length', () => {
  assert.equal(plan('3 jours à Kelowna').p.days.length, 3);
  assert.equal(plan('Trois jours dans l’Okanagan').p.days.length, 3);
  assert.equal(plan('Une journée à Penticton').p.kind, 'day_plan');
  assert.equal(plan('2 nuits à Osoyoos').intent.days, plan('2 nights in Osoyoos').intent.days);
});

test('French: week-end and fin de semaine are a 2-day trip; longue fin de semaine is 3', () => {
  for (const q of ['Un week-end à Penticton', 'Une fin de semaine à Penticton', 'Un weekend à Penticton']) assert.equal(plan(q).p.days.length, 2, q);
  assert.equal(plan('Une longue fin de semaine à Penticton').p.days.length, 3);
  assert.equal(plan('Que faire à Kelowna cette fin de semaine ?').intent.when.preset, 'this-weekend');
});

test('French: enfants and chien are the same party as kids and a dog', () => {
  const kids = plan('Un week-end à Vernon avec les enfants');
  assert.ok(kids.intent.features.includes('kid_friendly'));
  assert.deepEqual(kids.u.party, ['with kids']);
  const dog = plan('Un week-end à Vernon avec mon chien');
  assert.ok(dog.intent.features.includes('dog_friendly'));
  assert.deepEqual(dog.u.party, ['with a dog']);
});

test('French: vin and vignobles are wineries', () => {
  for (const q of ['Du vin à Naramata', 'Vignobles à Oliver', 'Un vignoble à Summerland', 'Dégustation de vin à Osoyoos']) assert.deepEqual(plan(q).intent.types, ['winery'], q);
});

test('French: souper and restaurant are dinner / restaurants; café is a cafe', () => {
  assert.deepEqual(plan('Souper à Kelowna').intent.types, ['restaurant']);
  assert.deepEqual(plan('Restaurants à Penticton').intent.types, ['restaurant']);
  assert.deepEqual(plan('Un resto à Vernon').intent.types, ['restaurant']);
  assert.deepEqual(plan('Un café à Summerland').intent.types, ['cafe']);
  const parts = (r) => r.trip.components.map((c) => c.meal || c.types.join('/'));
  const it = plan('Café et souper à Kelowna');
  assert.equal(it.p.kind, 'itinerary');
  assert.deepEqual(parts(it), parts(plan('Coffee and dinner in Kelowna')));
});

test('French: randonnée is hiking, plage is a beach, pluie is a rainy day', () => {
  assert.deepEqual(plan('Randonnée à Vernon').intent.activities, ['hiking']);
  assert.deepEqual(plan('Randonnées à Vernon').intent.activities, ['hiking']);
  assert.deepEqual(plan('Une plage à Penticton').intent.types, ['beach']);
  assert.deepEqual(plan('Plages à Penticton').intent.types, ['beach']);
  for (const q of ['Que faire à Penticton s’il pleut ?', 'Une journée de pluie à Kelowna', 'Kelowna sous la pluie']) assert.equal(plan(q).intent.occasion, 'rainy_day', q);
});

test('French: a long French request leaves no French words behind', () => {
  const r = plan('Planifie-moi un voyage de 3 jours en septembre avec du vin, de la bonne bouffe et du golf, avec une journée relaxe au bord du lac');
  assert.deepEqual(r.intent.foodTerms, []);
  assert.deepEqual(r.u.notUsed, []);
});

// ---------- 2. French = English ----------

const PAIRS = [
  ["3 jours à Kelowna avec des vignobles", "3 days in Kelowna with vineyards"],
  ["Trois jours à Penticton", "Three days in Penticton"],
  ["Un week-end à Penticton avec les enfants", "A weekend in Penticton with the kids"],
  ["Une fin de semaine à Vernon avec mon chien", "A weekend in Vernon with my dog"],
  ["Une longue fin de semaine à Osoyoos", "A long weekend in Osoyoos"],
  ["Un week-end romantique à Naramata avec des vignobles et un bon souper", "A romantic weekend in Naramata with wineries and a great dinner"],
  ["Une fin de semaine avec notre chien à Vernon", "A dog-friendly weekend in Vernon"],
  ["Café, randonnée, vignoble et souper à Kelowna", "Coffee, a hike, a winery and dinner in Kelowna"],
  ["Que faire à Penticton s'il pleut ?", "What can we do around Penticton if it rains?"],
  ["Une journée de pluie à Kelowna", "A rainy day in Kelowna"],
  ["Planifie-moi un voyage de 3 jours en septembre avec du vin, de la bonne bouffe et du golf, avec une journée relaxe au bord du lac", "Plan me a 3-day September trip with wine, great food and golf, with one relaxed day by the lake"],
  ["2 jours à Penticton avec les enfants — plages, parcs et bouffe simple", "2 days in Penticton with the kids — beaches, parks and easy food"],
  ["Plages à Penticton", "Beaches in Penticton"],
  ["Une plage pour chiens à Kelowna", "A dog beach in Kelowna"],
  ["Randonnées à Vernon", "Hikes in Vernon"],
  ["Des sentiers de randonnée à Summerland", "Hiking trails in Summerland"],
  ["Dégustation de vin à Oliver", "Wine tasting in Oliver"],
  ["Les meilleurs vignobles d'Osoyoos", "The best wineries in Osoyoos"],
  ["Souper à Kelowna", "Dinner in Kelowna"],
  ["Restaurants à West Kelowna", "Restaurants in West Kelowna"],
  ["Un restaurant avec terrasse à Penticton", "A restaurant with a patio in Penticton"],
  ["Restos végétaliens à Kelowna", "Vegan restaurants in Kelowna"],
  ["Restaurants sans gluten à Vernon", "Gluten-free restaurants in Vernon"],
  ["Un café à Summerland", "A cafe in Summerland"],
  ["Cafés à Penticton", "Cafes in Penticton"],
  ["Déjeuner et café à Kelowna", "Breakfast and coffee in Kelowna"],
  ["Microbrasseries à Penticton", "Breweries in Penticton"],
  ["Bière artisanale à Kelowna", "Craft beer in Kelowna"],
  ["Distilleries à Kelowna", "Distilleries in Kelowna"],
  ["Golf à Vernon", "Golf in Vernon"],
  ["Un terrain de golf à Osoyoos", "A golf course in Osoyoos"],
  ["Vélo de montagne à Kelowna", "Mountain biking in Kelowna"],
  ["Kayak et planche à pagaie à Penticton", "Kayaking and paddleboarding in Penticton"],
  ["Camping à Oliver", "Camping in Oliver"],
  ["Points de vue à Naramata", "Viewpoints in Naramata"],
  ["Ski et raquette à Big White", "Skiing and snowshoeing at Big White"],
  ["Joyaux cachés à Kelowna", "Hidden gems in Kelowna"],
  ["Les favoris locaux à Penticton", "Local favourites in Penticton"],
  ["Restaurants pas chers à Kelowna", "Cheap restaurants in Kelowna"],
  ["Un souper haut de gamme à Kelowna", "An upscale dinner in Kelowna"],
  ["Un vignoble avec vue sur le lac à Summerland", "A winery with a lake view in Summerland"],
  ["Deux jours relaxes à Kelowna", "Two relaxed days in Kelowna"],
  ["Trois jours chargés à Penticton", "Three packed days in Penticton"],
  ["Une journée en famille à Vernon", "A day in Vernon with the family"],
  ["Un week-end entre filles à Kelowna", "A girls weekend in Kelowna"],
  ["Une soirée en amoureux à Kelowna", "A date night in Kelowna"],
  ["Un anniversaire à Penticton", "A birthday in Penticton"],
  ["Vignobles mais pas de brasseries à Kelowna", "Wineries but no breweries in Kelowna"],
  ["Plages sans chiens à Penticton", "Beaches without dogs in Penticton"],
  ["De Kelowna à Penticton : cafés et plages", "Cafes and beaches from Kelowna to Penticton"],
  ["Souper et une partie de hockey à Kelowna", "Dinner and a hockey game in Kelowna"],
  ["Que faire ce soir à Kelowna ?", "What to do tonight in Kelowna?"],
  ["Que faire demain à Penticton ?", "What to do tomorrow in Penticton?"],
  ["Un plan pour samedi à Kelowna", "A plan for Saturday in Kelowna"],
  ["Un week-end à Penticton en juillet", "A weekend in Penticton in July"],
  ["Une semaine dans l'Okanagan en été", "A week in the Okanagan in summer"],
  ["Une journée à Big White en hiver", "A day at Big White in winter"],
  ["Vin et plage à Naramata", "Wine and a beach in Naramata"],
  ["Musique live à Kelowna", "Live music in Kelowna"],
  ["Des activités pour les enfants à Vernon", "Kid-friendly activities in Vernon"],
  ["Un dîner à Oliver", "Lunch in Oliver"],
  ["Quoi faire à Kelowna avec un chien ?", "What to do in Kelowna with a dog?"],
  ["Un 5 à 7 à Kelowna", "Happy hour in Kelowna"],
  ["Un bar à cocktails à Penticton", "A cocktail bar in Penticton"],
  ["Parcs à Lake Country", "Parks in Lake Country"],
  ["Trois jours à Kelowna avec des enfants et un chien", "Three days in Kelowna with kids and a dog"],
  ["Quatre jours dans l'Okanagan : vin, golf, plages", "Four days in the Okanagan: wine, golf, beaches"],
  ["Une escapade de 2 jours à Osoyoos avec des vignobles et une plage", "A 2 day getaway in Osoyoos with wineries and a beach"]
];

test(`French: ${PAIRS.length} French requests are understood exactly like their English counterparts, with identical stops`, () => {
  for (const [french, english] of PAIRS) {
    const a = plan(french), b = plan(english);
    assert.deepEqual(understanding(a), understanding(b), `${french}\n  read as: ${a.text}`);
    assert.deepEqual(stopIds(a), stopIds(b), french);
  }
});

test('French: the V3 page’s French example chips plan exactly like its English examples', () => {
  const T = translations();
  v3.T3_EXAMPLES.forEach((english, n) => {
    assert.equal(T.en[`tripv3.example${n + 1}`], english, 'the English chip text is the example itself');
    const french = T.fr[`tripv3.example${n + 1}`];
    const a = plan(french), b = plan(english);
    assert.deepEqual(understanding(a), understanding(b), french);
    assert.deepEqual(stopIds(a), stopIds(b), french);
  });
});

test('French: a venue’s own name inside a French request is never translated', () => {
  const r = plan('Souper chez Le Vieux Pin');
  assert.ok(` ${r.text} `.includes(' le vieux pin '), r.text);
  assert.ok(fr.tripPlannerText('Une dégustation à La Frenz Winery', TAXONOMY).includes('la frenz winery'));
});

// ---------- 3. English is unchanged ----------

test('English: every English request is returned as the very same string, so English plans are unchanged', () => {
  const english = [
    ...v3.T3_EXAMPLES,
    ...require('./fixtures/trip-parser-baseline.json').fixtures.map((f) => f.text),
    ...PAIRS.map(([, e]) => e),
    // French words English visitors use.
    'café', 'Cafés in Kelowna', 'Steak à la carte in Kelowna', 'Pie à la mode in Penticton', 'apres ski at Big White', 'a wine soiree in Naramata',
    'rosé and crêpes in Kelowna', 'an escapade to Osoyoos', 'Le Vieux Pin and La Frenz wine tasting', 'brasserie dinner in Kelowna', 'a cave tour',
    'peche picking in Oliver', 'Plan a 3 day trip with my dog', 'Where can I swim with the kids?', 'Things to do in Vernon in September',
    'Pour-over coffee in Kelowna', 'Propose a winery tour', 'Organise a trip to Penticton', 'Belvedere viewpoint hike', 'Distilleries and breweries',
  ];
  for (const text of english) assert.equal(fr.tripPlannerText(text, TAXONOMY), text, text);
  for (const v of TAXONOMY.venues) {
    for (const text of [v.name, `dinner at ${v.name}`, `Plan a day around ${v.name} in Kelowna`]) assert.equal(fr.tripPlannerText(text, TAXONOMY), text, text);
  }
  assert.equal(fr.isFrenchTripRequest('3 days in Kelowna with wineries', TAXONOMY), false);
  assert.equal(fr.isFrenchTripRequest('3 jours à Kelowna avec des vignobles', TAXONOMY), true);
  // Anything that is not a string passes through untouched.
  for (const x of [undefined, null, 42]) assert.equal(fr.tripPlannerText(x, TAXONOMY), x);
});

test('English: runTripPlan() reads the French layer’s text; the request shown and shared stays the visitor’s own', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const fn = src.slice(src.indexOf('function runTripPlan('), src.indexOf('// ---------- Temporary-condition advisories'));
  assert.ok(fn.includes('const planText = tripPlannerFrModule ? tripPlannerFrModule.tripPlannerText(text, taxonomy) : text;'));
  assert.ok(fn.includes('interpretDiscoveryQuery(planText, taxonomy)') && fn.includes('interpretTripComponents(planText, taxonomy, intent)'));
  assert.equal((fn.match(/plan\.query = text;/g) || []).length, 2, 'plan.query is the visitor’s own text');
  // Site search does not use it.
  for (const f of ['discovery-search.js', 'discovery-intent.js']) assert.ok(!fs.readFileSync(path.join(__dirname, '..', f), 'utf8').includes('trip-planner-fr'), f);
});

// ---------- 4. the French V3 interface ----------

test('V3 interface: every string the page uses has an English and a French translation', () => {
  const T = translations();
  const html = v3.renderTripPlannerV3Page(PAGE_DEPS);
  const used = new Set([
    ...[...html.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/tx\('([a-z0-9_.]+)'/gi)].map((m) => m[1]).filter((k) => !k.endsWith('.')),
    ...[...html.matchAll(/frLabel\('([a-z0-9_.]+)'/gi)].map((m) => m[1]).filter((k) => !k.endsWith('.')),
  ]);
  assert.ok(used.size > 100, `${used.size} keys`);
  for (const key of used) {
    assert.ok(typeof T.en[key] === 'string' && T.en[key], `en ${key}`);
    assert.ok(typeof T.fr[key] === 'string' && T.fr[key], `fr ${key}`);
  }
  for (const key of Object.keys(T.en).filter((k) => k.startsWith('tripv3.'))) assert.ok(key in T.fr, `fr ${key}`);
  // Fixed planner labels the page translates in French only.
  for (const type of Object.keys(LABELS.types)) assert.ok(T.fr[`tripv3.type.${type}`], type);
  for (const k of ['hidden_gem', 'local_favorite', 'dog_friendly']) assert.ok(T.fr[`tripv3.collection.${k}`], k);
  for (const k of ['morning', 'midday', 'afternoon', 'evening']) assert.ok(T.fr[`tripv3.daypart.${k}`], k);
});

test('V3 interface: in English the static text is the page’s original text', () => {
  const T = translations();
  const html = v3.renderTripPlannerV3Page(PAGE_DEPS);
  const decode = (s) => s.replace(/&rsquo;/g, '’').replace(/&mdash;/g, '—').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”');
  const tagged = [...html.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)];
  assert.ok(tagged.length >= 20, `${tagged.length} tagged elements`);
  for (const m of tagged) assert.equal(T.en[m[1]], decode(m[2]), m[1]);
  const ph = /placeholder="([^"]+)" data-i18n-placeholder="([^"]+)"/.exec(html);
  assert.equal(T.en[ph[2]], ph[1]);
});
