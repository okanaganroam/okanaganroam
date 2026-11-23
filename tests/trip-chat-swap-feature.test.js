'use strict';
// Travel agent chat: a badge asked of a REPLACEMENT is a requirement (2026-11-22, Dayton's report on the live site,
// 390 px phone). The request: "Plan a 3-day Kelowna weekend for 6 friends: two wineries, gluten-free dining, easy
// walks, a hotel with a pool, and live music. One person does not drink." Day 2 had Azhadi Vineyards, whose listing has
// the Non-Alcoholic Options badge. "Can you swap the day 2 winery for another with non-alcoholic options?" answered
// "Done. Swapped Azhadi Vineyards for Summerhill Pyramid Winery at 3:15 PM." and the plan then said none of the
// tasting stops lists non-alcoholic options.
//  1. a qualifying replacement exists -> swapped to it; the reply cites the listing's badge
//  2. none exists -> plan, stops, times, stay and request text identical; the reply explains and names an option whose
//     listing does not say; "yes" swaps to it with the "listing doesn't say" wording; "no" keeps the plan
//  3. the requested day and the stop's time are preserved
//  4. unrelated stops unchanged (every stop id and start time)
//  5. Undo restores the original plan (the page's snapshot of what the server returned)
//  6. a general swap without the requirement still works
//  plus the AI path (a reader that omits the badge: the rules add it), English and French, and another badge.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TRIP_PLANNER_V3 = 'on';
process.env.TRIP_CHAT_TIMING = 'off';
delete process.env.ANTHROPIC_API_KEY;
const app = require('../server.js');
const tc = require('../trip-chat.js');
const ex = require('../trip-chat-explain.js');
const db = require('../db.js');
test.after(() => { app.setTripChatReader(null); try { app.server.close(); } catch (e) { /* not listening */ } });

// The same tests run on both sites: wineries in the Okanagan, breweries on Whistler Roam (it lists no wineries).
const SITE = tc.agent.AREA.site;
const WR = /whistler/i.test(SITE);
const TYPE = WR ? 'brewery' : 'winery';
const NOUN = TYPE; // "winery" / "brewery"
const FR = WR ? { the: 'la microbrasserie', other: 'une autre microbrasserie', none: 'aucune autre microbrasserie' } : { the: 'le vignoble', other: 'un autre vignoble', none: 'aucun autre vignoble' };
const TOWN = WR ? 'Whistler' : 'Kelowna';
const REQ = `Plan a 3-day ${TOWN} weekend for 6 friends: two ${WR ? 'breweries' : 'wineries'}, gluten-free dining, easy walks, a hotel with a pool, and live music. One person does not drink.`;
const MSG = `Can you swap the day 2 ${NOUN} for another with non-alcoholic options?`;
const MSG_FR = `Peux-tu remplacer ${FR.the} du jour 2 par ${FR.other} avec des options sans alcool?`;
const NA = ['nonalcoholic'];

const S = (o) => ({ badges: [], feats: [], price: 2, role: '', ...o });
// The plan of the report (names, slots and times as on screen; the day 2 tasting stop has the badge).
const OLD = S({ key: '2-late', id: 812, name: 'Azhadi Vineyards', type: TYPE, day: 2, start: 930, badges: NA, feats: NA });
const PLAN = [
  S({ key: '1-morning', id: 1915, name: 'Tree of Wisdom Trail', type: 'outdoor', day: 1, start: 615 }),
  S({ key: '1-midday', id: 222, name: 'Frankie We Salute You!', type: 'restaurant', day: 1, start: 690, role: 'lunch' }),
  S({ key: '1-afternoon', id: 401, name: 'Meadow Vista Honey Wines', type: TYPE, day: 1, start: 795 }),
  S({ key: '1-evening', id: 170, name: 'Dawett Fine Indian Cuisine', type: 'restaurant', day: 1, start: 1080, role: 'dinner' }),
  S({ key: '2-morning', id: 1222, name: 'Mill Creek Regional Park', type: 'outdoor', day: 2, start: 615 }),
  S({ key: '2-midday', id: 645, name: 'Table Nineteen', type: 'restaurant', day: 2, start: 690, role: 'lunch' }),
  OLD,
  S({ key: '2-evening', id: 255, name: 'Gulfstream', type: 'restaurant', day: 2, start: 1080, role: 'dinner' }),
  S({ key: '3-morning', id: 1849, name: 'Eagle View and Quail Flume Trails', type: 'outdoor', day: 3, start: 615 }),
  S({ key: '3-midday', id: 528, name: 'Pur & Simple', type: 'restaurant', day: 3, start: 690, role: 'lunch' }),
];
const GOOD = S({ key: '2-late', id: 900, name: 'Zero Proof Estate', type: TYPE, day: 2, start: 930, badges: NA, feats: NA });
const PLAIN = S({ key: '2-late', id: 622, name: 'Summerhill Pyramid', type: TYPE, day: 2, start: 930 });
const OP = (o) => ({ stops: [], kind: null, time: null, day: null, value: null, n: null, ages: [], region: null, date: null, ...o });
const R = (m, stops = PLAN, extra = {}) => tc.rulesRead(m, stops, { regions: [], regionLabels: {}, days: 3, request: REQ, ...extra });
const read = (m, stops = PLAN) => R(m, stops).ops.map((o) => [o.o, (o.stops[0] || {}).id || null, o.kind, o.features || null]);
const dayPlan = (stops) => ({ kind: 'multi_day', days: [1, 2, 3].map((d) => ({ day: d, stops: stops.filter((s) => s.day === d).map((s) => ({ daypart: s.key.split('-')[1], venue: { id: s.id, name: s.name, type: s.type, price: 2, badges: [...new Set([...(s.badges || []), ...(s.feats || [])])].map((b) => ({ key: b })) } })) })), schedule: stops.map((s) => ({ day: s.day, venueId: s.id, startMinutes: s.start })) });
const ALL = [...PLAN, GOOD, PLAIN];
const hasFeature = (id, f) => (ALL.find((s) => s.id === id) || { feats: [] }).feats.includes(f);
const ctxFor = (run, extra = {}) => ({ args: { text: REQ, seed: 0 }, locks: {}, removed: [], stops: PLAN, days: 3, run, regionLabels: {}, lang: 'en', hasFeature, ...extra });
const idTimes = (stops) => stops.map((s) => `${s.key}:${s.id}@${s.start}`).sort();
const swapIn = (fresh) => dayPlan(PLAN.map((s) => (s.id === OLD.id ? fresh : s)));
const missed = (a) => ({ ...dayPlan(PLAN), swapMissed: { key: a.swap.key } });
const BADGE = 'Non-Alcoholic Options';

test('the rules read a badge asked of the replacement as a requirement of that swap (EN + FR), and nothing else', () => {
  const want = [['replace', OLD.id, null, NA]];
  for (const m of [MSG, `swap the day 2 ${NOUN} for another with non-alcoholic options`, `find a different ${NOUN} for day 2 that has NA options`, `swap the day 2 ${NOUN} for one with alcohol-free drinks`,
    `replace Azhadi Vineyards with a ${NOUN} that has mocktails`, `switch the day 2 ${NOUN} to another one with zero-proof options`, MSG_FR, `remplace ${FR.the} du jour 2 par ${FR.other} avec des options sans alcool`,
    `change ${FR.the} du jour 2 pour ${FR.other} qui a des boissons sans alcool`]) assert.deepEqual(read(m), want, m);
  // The same words never become a rule for the whole trip ("no alcohol", "one person doesn't drink") or a second stop.
  for (const m of [MSG, MSG_FR]) assert.ok(R(m).ops.every((o) => o.o === 'replace'), m);
  assert.deepEqual(read(MSG, PLAN), read(MSG, PLAN.map((s) => ({ ...s }))));
  // With the message read as "one of us doesn't drink" too (the server's partySome), it is still that swap.
  assert.deepEqual(R(MSG, PLAN, { partySome: true }).ops.map((o) => [o.o, o.features || null]), [['replace', NA]]);
  // Other badges: the same kind of place, with that badge.
  assert.deepEqual(read(`swap the day 2 ${NOUN} for another with a patio`), [['replace', OLD.id, null, ['patio']]]);
  assert.deepEqual(read(`swap the day 2 ${NOUN} for another with a lake view`), [['replace', OLD.id, null, ['lake_view']]]);
  assert.deepEqual(read(`swap the day 2 ${NOUN} for one that’s dog friendly`), [['replace', OLD.id, null, ['dog_friendly']]], 'never "planned for your dog"');
  assert.deepEqual(read(`swap the day 2 ${NOUN} for another that is kid friendly`), [['replace', OLD.id, null, ['kid_friendly']]]);
  assert.deepEqual(read(`swap the day 2 ${NOUN} for another with live music and a patio`), [['replace', OLD.id, null, ['patio', 'live_music']]]);
  assert.deepEqual(read('swap day 2 dinner for one with gluten-free options'), [['replace', 255, null, ['gluten_free']]], 'never the whole trip gluten-free');
  assert.deepEqual(read('swap day 2 lunch for one with vegan options'), [['replace', 645, null, ['vegan']]]);
  assert.deepEqual(read('remplace le dîner du jour 2 par un autre restaurant sans gluten'), [['replace', 645, null, ['gluten_free']]], '« sans gluten » is the badge, not a "without"');
  assert.deepEqual(read(`remplace ${FR.the} du jour 2 par ${FR.other} avec une terrasse`), [['replace', OLD.id, null, ['patio']]]);
  // What is asked of the new place never names a stop ("a lake view" is not "Eagle View … Trails").
  assert.deepEqual(read(`swap the day 1 ${NOUN} for another with a lake view`), [['replace', 401, null, ['lake_view']]]);
  // "without a patio" asks for nothing; a stop named by a kind that is not on the plan is said, never a re-plan.
  assert.deepEqual(read(`swap the day 2 ${NOUN} for a different one without a patio`), [['replace', OLD.id, null, null]]);
  const none = R('swap the day 2 distillery for another that’s dog friendly');
  assert.deepEqual(none.ops, []);
  assert.equal(none.cant, 'not_found');
  // 6. A general swap carries no requirement.
  for (const m of [`swap the day 2 ${NOUN} for another`, `a different ${NOUN} on day 2`, `remplace ${FR.the} du jour 2 par ${FR.other}`]) assert.deepEqual(read(m), [['replace', OLD.id, null, null]], m);
  // A kind of place asked for stays a kind ("something for the kids" is a thing to do, not a badge on a winery).
  assert.deepEqual(read(`swap the day 2 ${NOUN} for something for the kids`), [['replace', OLD.id, 'kids', null]]);
  // A meal asked by its kind keeps its own reading (a dinner with a lake view).
  assert.deepEqual(read('swap day 2 dinner for one with a lake view'), [['replace', 255, 'lake_view', null]]);
});

test('the AI path: a reader that leaves the badge out (or reads something else) still asks the planner for it', () => {
  const ai = (ops) => ({ ok: true, cant: null, ops });
  const feats = (m, ops) => { const r = tc.reconcileReads(ai(ops), R(m), m); return r.ops.map((o) => [o.o, (o.stops[0] || {}).id || null, o.kind, o.features || null]); };
  const want = [['replace', OLD.id, null, NA]];
  for (const m of [MSG, MSG_FR]) {
    // The model's own answer has no key for a badge: a plain swap of that stop.
    assert.deepEqual(feats(m, [OP({ o: 'replace', stops: [OLD] })]), want, m);
    // …with "no alcohol for everyone" beside it,
    assert.deepEqual(feats(m, [OP({ o: 'party', value: 'no_alcohol' }), OP({ o: 'replace', stops: [OLD] })]), want, m);
    // …as a swap for a café, an added stop, or a swap of another stop: the rules' reading of that stop stands.
    assert.deepEqual(feats(m, [OP({ o: 'replace', stops: [OLD], kind: 'cafe' })]), want, m);
    assert.deepEqual(feats(m, [OP({ o: 'add', kind: TYPE, day: 2 })]), want, m);
    assert.deepEqual(feats(m, [OP({ o: 'replace', stops: [PLAN[2]] })]), want, m);
    assert.ok(tc.reconcileReads(ai([OP({ o: 'replace', stops: [OLD] })]), R(m), m).fixes.includes('swap_feature'), m);
  }
  // A swap only the model read (the rules found no stop): the badge still comes from the message's own words.
  const odd = 'the second tasting stop could be another with non-alcoholic options';
  const r = tc.reconcileReads(ai([OP({ o: 'replace', stops: [OLD] })]), { ops: [], cant: 'unclear' }, odd);
  assert.deepEqual(r.ops.map((o) => [o.o, o.features || null]), [['replace', NA]]);
  // Another badge, and "gluten-free" read by the model as the whole party's diet.
  assert.deepEqual(feats(`swap the day 2 ${NOUN} for another with a patio`, [OP({ o: 'replace', stops: [OLD] })]), [['replace', OLD.id, null, ['patio']]]);
  assert.deepEqual(feats('swap day 2 dinner for one with gluten-free options', [OP({ o: 'party', value: 'gluten_free' }), OP({ o: 'replace', stops: [PLAN[7]] })]), [['replace', 255, null, ['gluten_free']]]);
  // A general swap gains nothing.
  assert.deepEqual(feats(`swap the day 2 ${NOUN} for another`, [OP({ o: 'replace', stops: [OLD] })]), [['replace', OLD.id, null, null]]);
  // The model is told: a badge asked of a replacement is a plain replace.
  assert.match(tc.systemPrompt(['kelowna'], { kelowna: 'Kelowna' }), /another with non-alcoholic options.*replace only/);
});

test('1, 3, 4. a qualifying replacement exists: only that stop changes, at its day and time, and the reply says where the claim comes from', () => {
  const calls = [];
  const run = (a) => { calls.push(a); return swapIn(GOOD); };
  for (const [m, lang, reply] of [
    [MSG, 'en', `Done. Swapped Azhadi Vineyards for Zero Proof Estate at 3:30 PM. Its ${SITE} listing has the ${BADGE} badge.`],
    [MSG_FR, 'fr', `C’est fait. J’ai remplacé Azhadi Vineyards par Zero Proof Estate à 15 h 30. Sa fiche ${SITE} a le badge « Options sans alcool ».`]]) {
    calls.length = 0;
    const out = tc.planTurn(R(m).ops, ctxFor(run, { lang }));
    // The planner's Swap is asked for that slot only, the same kind of place, with the badge, at the time it had.
    assert.equal(calls.length, 1);
    assert.equal(calls[0].swap.key, '2-late');
    assert.deepEqual(calls[0].swap.features, NA);
    assert.deepEqual(calls[0].swap.types, [TYPE]);
    assert.equal(calls[0].swap.times['2-late'], 930);
    assert.equal(calls[0].pinned['2-late'], undefined);
    assert.deepEqual(Object.keys(calls[0].pinned).sort(), PLAN.filter((s) => s.id !== OLD.id).map((s) => s.key).sort());
    assert.deepEqual(out.changed, ['2-late']);
    const after = tc.planStops(out.plan);
    assert.deepEqual(after.find((s) => s.id === 900) && [after.find((s) => s.id === 900).day, after.find((s) => s.id === 900).start], [2, 930], 'day 2, 3:30 PM');
    assert.deepEqual(idTimes(after.filter((s) => s.id !== 900)), idTimes(PLAN.filter((s) => s.id !== OLD.id)), 'every other stop keeps its id and start time');
    assert.equal(out.req.text, REQ);
    assert.equal(tc.buildReply(out, { lang }), reply);
  }
  // A planner that came back with a place whose listing lacks the badge: never accepted, never claimed.
  const out = tc.planTurn(R(MSG).ops, ctxFor((a) => (a.swap.features ? swapIn(PLAIN) : missed(a))));
  assert.equal(out.plan, null);
  assert.doesNotMatch(tc.buildReply(out, { lang: 'en' }), /Swapped|Summerhill Pyramid/);
  // A kind of place with a badge ("a café with a patio"): the kind and the badge both go to the planner.
  calls.length = 0;
  tc.planTurn([OP({ o: 'replace', stops: [OLD], kind: 'cafe', features: ['patio'] })], ctxFor((a) => { calls.push(a); return missed(a); }));
  assert.deepEqual(calls[0].swap.features, ['patio']);
  assert.deepEqual(calls[0].swap.types, ['cafe']);
});

test('2, 5. no qualifying replacement: nothing changes; the reply explains and names an option whose listing does not say; yes swaps to it, no keeps the plan', () => {
  const calls = [];
  const run = (a) => { calls.push(a); return a.swap.features ? missed(a) : swapIn(PLAIN); };
  const out = tc.planTurn(R(MSG).ops, ctxFor(run));
  // Plan, stops, times and request text identical: no plan and no request go back to the page.
  assert.equal(out.plan, null);
  assert.equal(out.req, null);
  assert.deepEqual(out.changed, []);
  assert.deepEqual(out.actions, { remove: [], keep: [] });
  assert.ok(calls.filter((a) => a.swap.features).length >= 1);
  const reply = tc.buildReply(out, { lang: 'en' });
  assert.equal(reply, `Azhadi Vineyards has the ${BADGE} badge on its ${SITE} listing, and I couldn’t find another ${NOUN} for day 2 that does, so I kept it. I can swap it for Summerhill Pyramid instead, but its listing doesn’t say if it has non-alcoholic options. Want that?`);
  assert.equal(tc.buildReply(out, { lang: 'fr' }), `La fiche ${SITE} de Azhadi Vineyards a le badge « Options sans alcool », et je n’ai trouvé ${FR.none} pour le jour 2 qui l’a aussi, donc je n’ai rien changé. Je peux le remplacer par Summerhill Pyramid, mais sa fiche ne dit pas s’il y a des options sans alcool. Ça vous va?`);
  assert.doesNotMatch(reply, /Done|Swapped|unchanged/);
  // The offer is the message a "yes" stands for; it carries the two ids, so the place named is the place swapped in.
  const offer = tc.featOffers(out.results);
  assert.deepEqual(offer, ['swap Azhadi Vineyards for Summerhill Pyramid [unverified 812>622 nonalcoholic]']);
  for (const yes of ['yes', 'Yes please', 'ok', 'sure', 'do that', 'go ahead', 'oui', 'd’accord', 'swap it', 'Summerhill is fine']) assert.equal(ex.pickOffer(yes, offer, tc.fold), offer[0], yes);
  for (const no of ['no', 'No thanks', 'nope', 'leave it', 'keep it', 'non merci', 'never mind']) { assert.equal(ex.pickOffer(no, offer, tc.fold), null, no); assert.equal(ex.declinesOffer(no, tc.fold), true, no); }
  // Another request, a question, or the old stop's own name is not a yes.
  for (const m of [MSG, 'remove Azhadi Vineyards', 'is Summerhill open on Sunday?', 'Azhadi is fine', 'no more wineries please', 'make day 3 cheaper']) assert.equal(ex.pickOffer(m, offer, tc.fold), null, m);
  assert.equal(ex.declinesOffer('no more wineries please', tc.fold), false);
  assert.equal(ex.declinesOffer(MSG, tc.fold), false);
  // Yes: that swap, with the "listing doesn't say" wording; only that stop, at its time.
  const ops = tc.offerOps(offer[0], PLAN);
  assert.deepEqual(ops.map((o) => [o.o, o.stops[0].id, o.kind, o.features, o.toId]), [['replace', 812, null, null, 622]]);
  calls.length = 0;
  const yes = tc.planTurn(ops, ctxFor(run));
  assert.equal(calls[0].swap.features, undefined);
  assert.deepEqual(calls[0].swap.types, [TYPE], 'the same kind of place');
  assert.equal(calls[0].swap.times['2-late'], 930);
  assert.deepEqual(yes.changed, ['2-late']);
  assert.deepEqual(idTimes(tc.planStops(yes.plan).filter((s) => s.id !== 622)), idTimes(PLAN.filter((s) => s.id !== OLD.id)));
  assert.equal(tc.buildReply(yes, { lang: 'en' }), `Done. Swapped Azhadi Vineyards for Summerhill Pyramid at 3:30 PM. Its ${SITE} listing doesn’t say if it has non-alcoholic options, so ask when you book.`);
  assert.equal(tc.buildReply(yes, { lang: 'fr' }), `C’est fait. J’ai remplacé Azhadi Vineyards par Summerhill Pyramid à 15 h 30. Sa fiche ${SITE} ne dit pas s’il y a des options sans alcool; demandez en réservant.`);
  // The planner's first pick is another place: the one named in the offer is the one swapped in.
  const ELSE = S({ ...PLAIN, id: 623, name: 'Somewhere Else' });
  const run2 = (a) => swapIn((a.excludeVenueIds || []).includes(623) ? PLAIN : ELSE);
  assert.equal(tc.planStops(tc.planTurn(ops, ctxFor(run2)).plan).find((s) => s.key === '2-late').id, 622);
  // A tag that names no stop of the plan, or no badge we know, is not an offer.
  assert.equal(tc.offerOps('swap X for Y [unverified 1>622 nonalcoholic]', PLAN), null);
  assert.equal(tc.offerOps('swap X for Y [unverified 812>622 anything]', PLAN), null);
  assert.equal(tc.offerOps(MSG, PLAN), null);
  // The old stop without the badge, and nothing at all to swap to: said plainly, no offer.
  const bare = PLAN.map((s) => (s.id === OLD.id ? { ...s, badges: [], feats: [] } : s));
  const o3 = tc.planTurn(R(MSG, bare).ops, ctxFor(missed, { stops: bare, hasFeature: () => false }));
  assert.equal(o3.plan, null);
  assert.equal(tc.buildReply(o3, { lang: 'en' }), `I couldn’t find ${tc.KINDS[TYPE].en} for day 2 whose ${SITE} listing has the ${BADGE} badge, so I kept Azhadi Vineyards.`);
  assert.deepEqual(tc.featOffers(o3.results), []);
  // The planner's plain Swap came back with another kind of place (a trail for a brewery): never offered.
  const TRAIL = S({ ...PLAIN, id: 624, name: 'River Loop Trail', type: 'outdoor' });
  const o4 = tc.planTurn(R(MSG).ops, ctxFor((a) => (a.swap.features ? missed(a) : swapIn(TRAIL))));
  assert.deepEqual(tc.featOffers(o4.results), []);
  assert.doesNotMatch(tc.buildReply(o4, { lang: 'en' }), /River Loop|Want that/);
});

test('2. a place with the badge that fits on another day is offered by name, with its day and time; yes adds it there', () => {
  const D3 = S({ key: '3-afternoon', id: 901, name: 'Day Three Cellars', type: TYPE, day: 3, start: 795, badges: NA, feats: NA });
  // No place with the badge fits day 2 or day 1; one fits on day 3.
  const run = (a) => (/^3-/.test(a.swap.key) && a.swap.features ? dayPlan([...PLAN, D3]) : missed(a));
  const hf = (id, f) => id === 901 || hasFeature(id, f);
  const out = tc.planTurn(R(MSG).ops, ctxFor(run, { hasFeature: hf }));
  assert.equal(out.plan, null);
  assert.deepEqual(out.changed, []);
  assert.equal(tc.buildReply(out, { lang: 'en' }), `Azhadi Vineyards has the ${BADGE} badge on its ${SITE} listing, and I couldn’t find another ${NOUN} for day 2 that does, so I kept it. Day Three Cellars has that badge and fits on day 3 at 1:15 PM. Want me to add it there?`);
  const offer = tc.featOffers(out.results);
  assert.deepEqual(offer, [`add Day Three Cellars on day 3 [verified ${TYPE} d3 nonalcoholic 901]`]);
  assert.equal(ex.pickOffer('yes', offer, tc.fold), offer[0]);
  const ops = tc.offerOps(offer[0], PLAN);
  assert.deepEqual(ops.map((o) => [o.o, o.kind, o.day, o.features, o.strict]), [['add', TYPE, 3, NA, true]]);
  const yes = tc.planTurn(ops, ctxFor(run, { hasFeature: hf }));
  assert.deepEqual(yes.changed, ['3-afternoon']);
  assert.deepEqual(idTimes(tc.planStops(yes.plan).filter((s) => s.id !== 901)), idTimes(PLAN));
  assert.match(tc.buildReply(yes, { lang: 'en' }), new RegExp(`^Done\\. Added Day Three Cellars at 1:15 PM\\. Its ${SITE} listing has the ${BADGE} badge\\.$`));
});

test('another badge (a patio, a lake view): the same rule, and the same honest wording when none fits', () => {
  const PATIO = S({ ...GOOD, id: 902, name: 'Terrace Cellars', badges: ['patio'], feats: [] });
  const hf = (id, f) => (id === 902 && f === 'patio');
  const calls = [];
  let out = tc.planTurn(R(`swap the day 2 ${NOUN} for another with a patio`).ops, ctxFor((a) => { calls.push(a); return swapIn(PATIO); }, { hasFeature: hf }));
  assert.deepEqual(calls[0].swap.features, ['patio']);
  assert.deepEqual(out.changed, ['2-late']);
  assert.equal(tc.buildReply(out, { lang: 'en' }), `Done. Swapped Azhadi Vineyards for Terrace Cellars at 3:30 PM. Its ${SITE} listing has the Patio badge.`);
  out = tc.planTurn(R(`swap the day 2 ${NOUN} for another with a lake view`).ops, ctxFor((a) => (a.swap.features ? missed(a) : swapIn(PLAIN)), { hasFeature: () => false }));
  assert.equal(out.plan, null);
  assert.equal(tc.buildReply(out, { lang: 'en' }), `I couldn’t find ${tc.KINDS[TYPE].en} for day 2 whose ${SITE} listing has the Lake View badge, so I kept Azhadi Vineyards. I can swap it for Summerhill Pyramid instead, but its listing doesn’t say if it has a lake view. Want that?`);
  assert.deepEqual(tc.featOffers(out.results), ['swap Azhadi Vineyards for Summerhill Pyramid [unverified 812>622 lake_view]']);
});

test('6. a general swap without the requirement works as before', () => {
  const calls = [];
  const out = tc.planTurn(R(`swap the day 2 ${NOUN} for another`).ops, ctxFor((a) => { calls.push(a); return swapIn(PLAIN); }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].swap.features, undefined);
  assert.equal(calls[0].swap.types, undefined);
  assert.equal(calls[0].swap.type, TYPE);
  assert.deepEqual(out.changed, ['2-late']);
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Done. Swapped Azhadi Vineyards for Summerhill Pyramid at 3:30 PM.');
  // Nothing fits at all: the old words, and no offer.
  const none = tc.planTurn(R(`swap the day 2 ${NOUN} for another`).ops, ctxFor(missed));
  assert.equal(tc.buildReply(none, { lang: 'en' }), 'Nothing else nearby fits there, so Azhadi Vineyards stays. Your plan is unchanged.');
  assert.deepEqual(tc.featOffers(none.results), []);
});

// ---- End to end: the real planner and the chat handler on the test listings (the page's state is emulated) ----
// The Okanagan test listings have many wineries near Kelowna; Whistler's have three breweries in all, so there the
// stop swapped is the day's lunch (a restaurant), as the brief says: "use breweries/restaurants with the badge".
const E = WR
  ? { type: 'restaurant', word: 'lunch', frThe: 'le dîner', frOther: 'un autre restaurant', noun: 'restaurant', drink: false, pick: (st) => st.find((s) => s.type === 'restaurant' && s.role === 'lunch' && s.day === 2) || st.find((s) => s.type === 'restaurant' && s.role === 'lunch') }
  : { type: 'winery', word: 'winery', frThe: 'le vignoble', frOther: 'un autre vignoble', noun: 'winery', drink: true, pick: (st) => st.filter((s) => s.type === 'winery' && s.day === 2)[0] || st.filter((s) => s.type === 'winery').pop() };
const venueCount = db.prepare('SELECT COUNT(*) AS n FROM venues WHERE type = ? AND redirect_to IS NULL').get(E.type).n;
const planNow = () => app.runTripPlanRequest(app.parseTripPlanBody({ text: REQ }, { v4: true, stays: true }).value, true);
// What the page keeps and what Undo puts back (trip-chat-page.js: the request, its inputs and the plan on screen).
const pageOf = (plan) => ({ text: REQ, seed: 0, overrides: {}, exclude: [], locks: {}, soft: {}, tourStops: [], avoid: [], plan });
const stopsOf = (page) => tc.planStops(page.plan).map((s) => ({ key: s.key, id: s.id, ...(s.start !== null ? { start: s.start } : {}) }));
const bodyOf = (page, message, lang = 'en', offer = null) => {
  const w = page.plan.whereToStay; const ch = w && (w.chosen || w.pick);
  return { message, lang, plan: { text: page.text, seed: page.seed, excludeVenueIds: page.exclude, ...(Object.keys(page.overrides).length ? { overrides: page.overrides } : {}), ...(page.avoid.length ? { avoidVenueIds: page.avoid } : {}), ...(page.tourStops.length ? { tourStops: page.tourStops } : {}) },
    locks: page.locks, removed: [], stops: stopsOf(page), ...(Object.keys(page.soft).length ? { soft: page.soft } : {}), ...(ch && ch.id > 0 ? { stayId: ch.id } : {}), ...(offer ? { offer } : {}) };
};
const say = async (page, message, lang = 'en', offer = null) => {
  const parsed = app.parseTripChatBody(bodyOf(page, message, lang, offer), { stays: true });
  assert.ok(!parsed.error, parsed.error);
  return (await app.runTripChatTurn(parsed.value, { staysOn: true, lang })).response;
};
// The page applies a reply that changed the plan (chatSend), and returns the new page state.
const apply = (page, j) => (j.plan && j.req && (j.changed || []).length ? { text: j.req.text, seed: j.req.seed, overrides: j.req.overrides || {}, exclude: (j.req.excludeVenueIds || []).slice(), locks: j.req.locks || {}, soft: j.req.soft || {}, tourStops: j.req.tourStops || [], avoid: j.req.avoidVenueIds || [], plan: j.plan } : page);
const setBadge = (f, v, where = 'type = ?', args = [E.type]) => db.prepare(`UPDATE venues SET ${f} = ${v ? 1 : 0} WHERE ${where}`).run(...args);
const nothingChanged = (j, tag) => {
  assert.equal(j.plan, null, `${tag}: no new plan`);
  assert.equal(j.req, null, `${tag}: no new request`);
  assert.deepEqual(j.changed, [], `${tag}: no stop changed`);
  assert.deepEqual(j.actions, { remove: [], keep: [] }, `${tag}: nothing removed or kept`);
  for (const k of ['stayBlock', 'stayPref', 'stayForce', 'stayArrive', 'party', 'text', 'card', 'confirm']) assert.equal(j[k], undefined, `${tag}: no ${k}`);
};

test('end to end, rules and AI paths: the owner’s message on a real plan (qualifying, none + yes / no, Undo, a general swap, a lake view)', { skip: venueCount < 6 ? `needs ${E.type} listings` : false }, async () => {
  const saved = db.prepare('SELECT id, nonalcoholic, lake_view FROM venues WHERE type = ?').all(E.type);
  try {
    setBadge('nonalcoholic', false);
    const plan0 = planNow();
    const page0 = pageOf(plan0);
    const before = tc.planStops(plan0);
    const old = E.pick(before);
    assert.ok(old, `the plan has a ${E.word} stop`);
    const msg = `Can you swap the day ${old.day} ${E.word} for another with non-alcoholic options?`;
    const msgFr = `Peux-tu remplacer ${E.frThe} du jour ${old.day} par ${E.frOther} avec des options sans alcool?`;
    const snapshot = JSON.stringify(page0);
    // The model answers with a plain swap of that stop and "no alcohol for everyone": the badge never rides on it.
    const aiReader = async (message, opts) => ({ ok: true, cant: null, ops: [OP({ o: 'party', value: 'no_alcohol' }), OP({ o: 'replace', stops: [opts.stops.find((s) => s.id === old.id)] })] });

    // --- 2. Only the stop on the plan has the badge: no qualifying replacement.
    setBadge('nonalcoholic', true, 'id = ?', [old.id]);
    for (const [reader, m, lang] of [[null, msg, 'en'], [aiReader, msg, 'en'], [null, msgFr, 'fr'], [aiReader, msgFr, 'fr']]) {
      app.setTripChatReader(reader);
      const tag = `${reader ? 'AI' : 'rules'} ${lang}`;
      const j = await say(page0, m, lang);
      nothingChanged(j, tag);
      assert.equal(JSON.stringify(apply(page0, j)), snapshot, `${tag}: plan, stops, times, stay and request text identical`);
      if (lang === 'en') assert.match(j.reply, new RegExp(`^${old.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} has the ${BADGE} badge on its ${SITE} listing, and I couldn’t find another ${E.noun} for day ${old.day} that does, so I kept it\\. I can swap it for .+ instead, but its listing doesn’t say if it has non-alcoholic options\\. Want that\\?$`), tag);
      else assert.match(j.reply, /a le badge « Options sans alcool », et je n’ai trouvé aucune? autre .+ donc je n’ai rien changé\. Je peux le remplacer par .+, mais sa fiche ne dit pas s’il y a des options sans alcool\. Ça vous va\?$/, tag);
      assert.equal((j.offer || []).length, 1, `${tag}: one option offered by name`);
      const named = /^swap .+ for (.+) \[unverified \d+>(\d+) nonalcoholic\]$/.exec(j.offer[0]);
      assert.ok(named, j.offer[0]);
      assert.ok(j.reply.includes(named[1]), `${tag}: the reply names the place offered`);
      assert.equal(db.prepare('SELECT nonalcoholic FROM venues WHERE id = ?').get(Number(named[2])).nonalcoholic, 0, 'its listing really has no badge');

      // "no": the plan stays, and the reply says so.
      const no = await say(page0, lang === 'fr' ? 'non' : 'no', lang, j.offer);
      nothingChanged(no, `${tag} no`);
      assert.equal(no.reply, tc.T[lang].offerKept);
      assert.equal(JSON.stringify(apply(page0, no)), snapshot);

      // "yes": that place, in that slot, at that time; every other stop as it was; the wording says the listing doesn't say.
      const yes = await say(page0, lang === 'fr' ? 'oui' : 'yes', lang, j.offer);
      assert.deepEqual(yes.changed, [old.key], `${tag} yes: ${yes.reply}`);
      const after = tc.planStops(yes.plan);
      const fresh = after.find((s) => s.key === old.key);
      assert.equal(fresh.id, Number(named[2]), `${tag}: the place named is the place swapped in`);
      assert.equal(fresh.day, old.day);
      assert.equal(fresh.start, old.start, `${tag}: the stop keeps its time`);
      assert.deepEqual(idTimes(after.filter((s) => s.key !== old.key)), idTimes(before.filter((s) => s.key !== old.key)), `${tag}: every other stop keeps its id and start time`);
      assert.equal(yes.req.text, REQ);
      assert.match(yes.reply, lang === 'fr' ? /ne dit pas s’il y a des options sans alcool; demandez en réservant\.$/ : new RegExp(`Its ${SITE} listing doesn’t say if it has non-alcoholic options, so ask when you book\\.$`), tag);
      assert.doesNotMatch(yes.reply, /has the Non-Alcoholic|a le badge/, `${tag}: never claimed`);
      // The plan's own line for the non-drinker agrees with the reply: the new stop is not said to list them.
      if (yes.plan.partyNote) assert.ok(!(yes.plan.partyNote.venueIds || []).includes(fresh.id) && !new RegExp(`${fresh.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^;]*lists? non-alcoholic`).test(yes.plan.partyNote.text.split(';')[0]), yes.plan.partyNote.text);

      // 5. Undo: the page puts back its snapshot; it is the original plan exactly, and the chat answers from it as before.
      const page1 = apply(page0, yes);
      assert.notEqual(JSON.stringify(page1), snapshot);
      const undone = JSON.parse(snapshot);
      assert.deepEqual(undone, JSON.parse(JSON.stringify(page0)));
      assert.deepEqual(idTimes(tc.planStops(undone.plan)), idTimes(before));
      assert.equal(tc.planStops(undone.plan).find((s) => s.key === old.key).id, old.id, 'the original stop is back');
      const again = await say(undone, m, lang);
      nothingChanged(again, `${tag} after Undo`);
      assert.equal(again.reply, j.reply, `${tag}: the same answer from the restored plan`);
      assert.equal(JSON.stringify(page0), snapshot, 'the server never changed the page’s plan');
    }

    // --- 1, 3, 4. Other listings have the badge: swapped to one of them, in place, and the reply cites the listing.
    setBadge('nonalcoholic', true);
    for (const [reader, m, lang] of [[null, msg, 'en'], [aiReader, msg, 'en'], [null, msgFr, 'fr'], [aiReader, msgFr, 'fr']]) {
      app.setTripChatReader(reader);
      const tag = `${reader ? 'AI' : 'rules'} ${lang}`;
      const j = await say(page0, m, lang);
      assert.deepEqual(j.changed, [old.key], `${tag}: ${j.reply}`);
      const after = tc.planStops(j.plan);
      const fresh = after.find((s) => s.key === old.key);
      assert.notEqual(fresh.id, old.id);
      assert.equal(fresh.type, E.type);
      assert.equal(db.prepare('SELECT nonalcoholic FROM venues WHERE id = ?').get(fresh.id).nonalcoholic, 1, 'the listing has the badge');
      assert.ok(fresh.badges.includes('nonalcoholic'), 'the plan stop carries the badge');
      assert.equal(fresh.day, old.day);
      assert.equal(fresh.start, old.start, `${tag}: the stop keeps its time`);
      assert.deepEqual(idTimes(after.filter((s) => s.key !== old.key)), idTimes(before.filter((s) => s.key !== old.key)), `${tag}: every other stop keeps its id and start time`);
      assert.equal(j.req.text, REQ, `${tag}: the request text is as it was`);
      assert.ok(!j.offer, `${tag}: nothing to ask`);
      if (lang === 'en') assert.match(j.reply, new RegExp(`^Done\\. Swapped .+ for .+ at .+\\. Its ${SITE} listing has the ${BADGE} badge\\.$`), tag);
      else assert.match(j.reply, new RegExp(`^C’est fait\\. J’ai remplacé .+ par .+\\. Sa fiche ${SITE} a le badge « Options sans alcool »\\.$`), tag);
      assert.ok(j.reply.includes(fresh.name));
      // The plan's line for the non-drinker names the new stop.
      if (E.drink) assert.ok(j.plan.partyNote && j.plan.partyNote.venueIds.includes(fresh.id) && j.plan.partyNote.text.includes(fresh.name), `${tag}: ${j.plan.partyNote && j.plan.partyNote.text}`);
      // Undo is the snapshot again.
      assert.equal(JSON.stringify(page0), snapshot);
    }
    app.setTripChatReader(null);

    // --- 6. A general swap, with no listing carrying the badge: works as before, and claims nothing.
    setBadge('nonalcoholic', false);
    const gen = await say(page0, `swap the day ${old.day} ${E.word} for another`);
    assert.deepEqual(gen.changed, [old.key], gen.reply);
    assert.match(gen.reply, /^Done\. Swapped .+ for .+ at [^.]+\.$/);
    const g = tc.planStops(gen.plan);
    assert.equal(g.find((s) => s.key === old.key).start, old.start);
    assert.deepEqual(idTimes(g.filter((s) => s.key !== old.key)), idTimes(before.filter((s) => s.key !== old.key)));

    // --- Another badge: a lake view. Every other listing of that kind has it -> swapped and cited; none has it -> kept.
    setBadge('lake_view', true);
    setBadge('lake_view', false, 'id = ?', [old.id]);
    const lake = await say(page0, `swap the day ${old.day} ${E.word} for another with a lake view`);
    assert.deepEqual(lake.changed, [old.key], lake.reply);
    assert.match(lake.reply, new RegExp(`^Done\\. Swapped .+ for .+ at .+\\. Its ${SITE} listing has the Lake View badge\\.$`));
    assert.deepEqual(idTimes(tc.planStops(lake.plan).filter((s) => s.key !== old.key)), idTimes(before.filter((s) => s.key !== old.key)));
    setBadge('lake_view', false);
    const noLake = await say(page0, `swap the day ${old.day} ${E.word} for another with a lake view`);
    nothingChanged(noLake, 'no lake view');
    // (A meal asked "with a lake view" keeps its own words; any other stop is said with the badge and its source.)
    assert.match(noLake.reply, E.drink ? new RegExp(`^I couldn’t find ${tc.KINDS[E.type].en} for day ${old.day} whose ${SITE} listing has the Lake View badge, so I kept `) : /^I couldn’t find a lake view that fits there, so .+ stays\./);
    assert.doesNotMatch(noLake.reply, /^Done|Swapped/);
  } finally {
    app.setTripChatReader(null);
    const put = db.prepare('UPDATE venues SET nonalcoholic = ?, lake_view = ? WHERE id = ?');
    for (const r of saved) put.run(r.nonalcoholic, r.lake_view, r.id);
  }
});
