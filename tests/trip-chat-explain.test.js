'use strict';
// Travel agent chat: targeted clarification, honest gluten-free wording, explained planner decisions (2026-11-22,
// Dayton's report on the live site, 390 px phone). The request: "Plan a 3-day Kelowna weekend for 6 friends: two
// wineries, gluten-free dining, easy walks, a hotel with a pool, and live music. One person does not drink."
// (a) "Only one person does not drink; the rest want wineries. Can you add a winery on day 2 with a non-alcoholic
//     option?" (day 2 already had Azhadi Vineyards) answered "Done. Changed 7 stops. I couldn't find a fit for the rest."
// (b) "Why did you say you could not fit gluten free when the restaurants are marked gluten-free-friendly?" answered
//     "Which stop do you mean?"
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

process.env.TRIP_PLANNER_V3 = 'on';
process.env.TRIP_CHAT_TIMING = 'off';
delete process.env.ANTHROPIC_API_KEY;
const app = require('../server.js');
const tc = require('../trip-chat.js');
const ex = require('../trip-chat-explain.js');
test.after(() => { app.setTripChatReader(null); try { app.server.close(); } catch (e) { /* not listening */ } });

const REQ = 'Plan a 3-day Kelowna weekend for 6 friends: two wineries, gluten-free dining, easy walks, a hotel with a pool, and live music. One person does not drink.';
const S = (o) => ({ badges: [], feats: [], price: 2, role: '', ...o });
const GF = ['gluten_free'];
// The plan the live site made for that request (names, slots and times as on screen; badges as on the listings).
const PLAN = [
  S({ key: '1-morning', id: 1915, name: 'Tree of Wisdom Trail', type: 'outdoor', day: 1, start: 615 }),
  S({ key: '1-midday', id: 222, name: 'Frankie We Salute You!', type: 'restaurant', day: 1, start: 690, role: 'lunch', feats: ['gluten_free', 'nonalcoholic'] }),
  S({ key: '1-afternoon', id: 401, name: 'Meadow Vista Honey Wines', type: 'winery', day: 1, start: 795 }),
  S({ key: '1-evening', id: 170, name: 'Dawett Fine Indian Cuisine', type: 'restaurant', day: 1, start: 1080, role: 'dinner', feats: GF }),
  S({ key: '1-night', id: 83, name: 'Blue Gator Bar', type: 'pub', day: 1, start: 1200, role: 'dinner', badges: ['live_music'] }),
  S({ key: '2-morning', id: 1222, name: 'Mill Creek Regional Park', type: 'outdoor', day: 2, start: 615 }),
  S({ key: '2-midday', id: 645, name: 'Table Nineteen Kelowna', type: 'restaurant', day: 2, start: 690, role: 'lunch', feats: ['gluten_free', 'nonalcoholic'] }),
  S({ key: '2-late', id: 812, name: 'Azhadi Vineyards', type: 'winery', day: 2, start: 930, badges: ['nonalcoholic'], feats: ['gluten_free', 'nonalcoholic'] }),
  S({ key: '2-evening', id: 255, name: 'Gulfstream', type: 'restaurant', day: 2, start: 1080, role: 'dinner', feats: ['gluten_free', 'nonalcoholic'] }),
  S({ key: '2-night', id: 256, name: 'HUMO Kelowna', type: 'restaurant', day: 2, start: 1200, role: 'dinner', feats: GF }),
  S({ key: '3-morning', id: 1849, name: 'Eagle View and Quail Flume Trails', type: 'outdoor', day: 3, start: 615 }),
  S({ key: '3-midday', id: 528, name: 'Pur & Simple', type: 'restaurant', day: 3, start: 690, role: 'lunch', feats: ['gluten_free', 'nonalcoholic'] }),
];
const WARN = 'Not every stop is listed as gluten-free friendly.';
const CAVEAT = 'A badge means the place lists gluten-free options; it isn’t a guarantee against cross-contamination, so tell the restaurant when you book.';
const MSG_A = 'Only one person does not drink; the rest want wineries. Can you add a winery on day 2 with a non-alcoholic option?';
const MSG_B = 'Why did you say you could not fit gluten free when the restaurants are marked gluten-free-friendly?';
const OP = (o) => ({ stops: [], kind: null, time: null, day: null, value: null, n: null, ages: [], region: null, date: null, ...o });
const R = (m, stops = PLAN, extra = {}) => tc.rulesRead(m, stops, { regions: ['kelowna'], regionLabels: { kelowna: 'Kelowna' }, days: 3, request: REQ, ...extra });
const dayPlan = (stops) => ({ kind: 'multi_day', days: [1, 2, 3].map((d) => ({ day: d, stops: stops.filter((s) => s.day === d).map((s) => ({ daypart: s.key.split('-')[1], venue: { id: s.id, name: s.name, type: s.type, price: 2, badges: [...(s.badges || []), ...(s.feats || [])].map((b) => ({ key: b })) } })) })), schedule: stops.map((s) => ({ day: s.day, venueId: s.id, startMinutes: s.start })) });
const ctxFor = (run, extra = {}) => ({ args: { text: REQ, seed: 0 }, locks: {}, removed: [], stops: PLAN, days: 3, run, regionLabels: {}, lang: 'en', hasFeature: (id, f) => (PLAN.find((s) => s.id === id) || { feats: [] }).feats.includes(f), ...extra });
const facts = (extra = {}) => ({ stops: PLAN, request: REQ, evidence: null, warnings: [WARN], missing: [{ kind: 'feature', value: 'gluten_free', label: 'gluten free' }], events: [], dated: false,
  KINDS: tc.KINDS, kindMatches: tc.kindMatches, kindRe: (k) => (tc.KIND_WORDS.find(([kk]) => kk === k) || [])[1] || null, plural: (k, l) => (l === 'en' && tc.TYPE_PLURAL[(tc.KINDS[k] || {}).type]) || `${tc.kindNoun(k, l)}s`, noun: tc.kindNoun, joinList: tc.joinList, fold: tc.fold, legacy: (o) => tc.explainReply(o, { stops: PLAN, request: REQ }, 'en'), ...extra });
const idTimes = (stops) => stops.map((s) => `${s.key}:${s.id}@${s.start}`).sort();

test('(a) day 2 already has a winery with the Non-Alcoholic Options badge: said with the venue, its time and the source; no stop, time or request text changes', () => {
  const r = R(MSG_A);
  assert.deepEqual(r.ops.map((o) => [o.o, o.kind, o.day, o.features || null]), [['party_some', null, null, null], ['add', 'winery', 2, ['nonalcoholic']]]);
  const out = tc.planTurn(r.ops.filter((o) => o.o !== 'party_some'), ctxFor(() => { throw new Error('the planner is never run'); }));
  assert.equal(out.plan, null);
  assert.equal(out.req, null);
  assert.deepEqual(out.changed, []);
  assert.deepEqual(out.actions, { remove: [], keep: [] });
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Day 2 already has a winery for that: Azhadi Vineyards at 3:30 PM. Its Okanagan Roam listing has the Non-Alcoholic Options badge, so I left your plan as it is.');
  assert.equal(tc.buildReply(out, { lang: 'fr' }), 'Le jour 2 a déjà un vignoble pour ça : Azhadi Vineyards à 15 h 30. Sa fiche Okanagan Roam a le badge « Options sans alcool », donc je n’ai rien changé à votre plan.');
  assert.doesNotMatch(tc.buildReply(out, { lang: 'en' }), /Changed \d+ stops|couldn’t find a fit/);
  // The same in French.
  const fr = R('Une seule personne ne boit pas; les autres veulent des vignobles. Peux-tu ajouter un vignoble au jour 2 avec une option sans alcool?');
  assert.deepEqual(fr.ops.map((o) => [o.o, o.kind, o.day, o.features || null]), [['party_some', null, null, null], ['add', 'winery', 2, ['nonalcoholic']]]);
});

test('(a) day 2 without such a winery: ONE winery is added; every other stop keeps its id and start time; the reply names it, its time and the badge', () => {
  const before = PLAN.map((s) => (s.id === 812 ? { ...s, id: 813, name: 'Plain Cellars', badges: [], feats: [] } : s));
  const NEW = S({ key: '2-afternoon', id: 900, name: 'Zero Proof Estate', type: 'winery', day: 2, start: 795, feats: ['nonalcoholic'] });
  const calls = [];
  const run = (a) => { calls.push(a); return dayPlan([...before, NEW]); };
  const out = tc.planTurn(R(MSG_A, before).ops.filter((o) => o.o !== 'party_some'), ctxFor(run, { stops: before, hasFeature: (id, f) => id === 900 && f === 'nonalcoholic' }));
  assert.ok(out.plan);
  const after = tc.planStops(out.plan);
  // The diff of every stop id and start time, before and after: only the new stop differs.
  assert.deepEqual(idTimes(after.filter((s) => s.id !== 900)), idTimes(before));
  assert.deepEqual(after.filter((s) => !before.some((b) => b.id === s.id)).map((s) => [s.key, s.name, s.start]), [['2-afternoon', 'Zero Proof Estate', 795]]);
  assert.deepEqual(out.changed, ['2-afternoon']);
  assert.equal(calls[0].swap.key, '2-afternoon');
  assert.deepEqual(Object.keys(calls[0].pinned).sort(), before.map((s) => s.key).sort(), 'every other stop is pinned');
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Done. Added Zero Proof Estate at 1:15 PM. Its Okanagan Roam listing has the Non-Alcoholic Options badge.');
  assert.equal(tc.guardTurn(out, before, R(MSG_A, before).ops.filter((o) => o.o !== 'party_some')), null, 'one stop added: nothing to ask first');
  // A planner that moved another stop is refused: the plan stays as it was.
  const moved = (a) => dayPlan([...before.map((s) => (s.id === 1222 ? { ...s, id: 1223, name: 'Another Park' } : s)), NEW]);
  const o2 = tc.planTurn(R(MSG_A, before).ops.filter((o) => o.o !== 'party_some'), ctxFor(moved, { stops: before }));
  assert.equal(o2.plan, null, 'a result that changes an unrelated stop is never used');
});

test('1. "add another winery on day 2": one MORE winery (never a swap of the one there); the request’s "two wineries" becomes "three"; a full day offers a swap by name or another day, and the answer is acted on', () => {
  for (const [m, day] of [['add another winery on day 2', 2], ['a second winery on day 2 please, add it', 2], ['ajoute un autre vignoble au jour 2', 2], ['add one more winery', null]]) {
    const r = R(m);
    assert.deepEqual(r.ops.map((o) => [o.o, o.kind, o.day, !!o.more, (o.stops || []).length]), [['add', 'winery', day, true, 0]], m);
  }
  assert.ok(R('swap the winery on day 2 for another winery').ops.every((o) => !o.more), 'a swap stays a swap');
  assert.ok(R('add another day').ops.every((o) => o.o !== 'add' || !o.more));
  // Room on day 2 (the afternoon is free): added there, every other stop as it was, the cap raised in the request.
  const NEW = S({ key: '2-afternoon', id: 21, name: 'Ancient Hill Winery', type: 'winery', day: 2, start: 795 });
  let seen = null;
  const out = tc.planTurn(R('add another winery on day 2').ops, ctxFor((a) => { seen = a; return dayPlan([...PLAN, NEW]); }));
  assert.match(seen.text, /three wineries/);
  assert.equal(out.req.text, REQ.replace('two wineries', 'three wineries'));
  assert.deepEqual(idTimes(tc.planStops(out.plan).filter((s) => s.id !== 21)), idTimes(PLAN));
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Done. Added Ancient Hill Winery at 1:15 PM.');
  assert.equal(ex.raiseCountText('a weekend with wineries', (tc.KIND_WORDS.find(([k]) => k === 'winery') || [])[1], 3, tc.fold), null, 'no number named: nothing to raise');
  assert.equal(ex.raiseCountText('fin de semaine avec deux vignobles', (tc.KIND_WORDS.find(([k]) => k === 'winery') || [])[1], 3, tc.fold), 'fin de semaine avec trois vignobles');
  // Day 2 full: nothing changes; a swap by name (never a meal) or a free time on another day is offered.
  const full = [...PLAN, NEW];
  const o2 = tc.planTurn(R('add another winery on day 2', full).ops, ctxFor(() => { throw new Error('no run'); }, { stops: full }));
  assert.equal(o2.plan, null);
  const rep = tc.buildReply(o2, { lang: 'en' });
  assert.equal(rep, 'Day 2 has no free spot for another winery. I can swap Mill Creek Regional Park (10:15 AM) for a winery, or add one on day 1 at 2:30 PM. Which?');
  assert.equal(tc.buildReply(o2, { lang: 'fr' }), 'Le jour 2 n’a pas de place libre pour un autre vignoble. Je peux remplacer Mill Creek Regional Park (10 h 15) par un vignoble, ou en ajouter un au jour 1 à 14 h 30. Lequel?');
  const offer = ex.fullReply(o2.results[0].full, { KINDS: tc.KINDS, noun: tc.kindNoun, clock: tc.clock }, 'en').offer.map((o) => o.say);
  assert.deepEqual(offer, ['swap Mill Creek Regional Park for a winery', 'add another winery on day 1']);
  // The answer picks one; each offered message is read by the rules as exactly that change.
  const pick = (m) => ex.pickOffer(m, offer, tc.fold);
  assert.equal(pick('day 1'), offer[1]);
  assert.equal(pick('the second one'), offer[1]);
  assert.equal(pick('swap the park'), offer[0]);
  assert.equal(pick('Mill Creek'), offer[0]);
  assert.equal(pick('the first'), offer[0]);
  assert.equal(pick('yes'), null, 'two choices: a bare yes picks neither');
  assert.equal(pick('no thanks'), null);
  assert.equal(pick('make day 3 cheaper'), null);
  assert.deepEqual(R(offer[0], full).ops.map((o) => [o.o, o.kind, o.stops.map((s) => s.id)]), [['replace', 'winery', [1222]]]);
  assert.deepEqual(R(offer[1], full).ops.map((o) => [o.o, o.kind, o.day, !!o.more]), [['add', 'winery', 1, true]]);
  // The body carries the offer; anything else is refused.
  const body = { message: 'day 1', lang: 'en', plan: { text: REQ, seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops: PLAN.map((s) => ({ key: s.key, id: s.id, start: s.start })) };
  assert.deepEqual(app.parseTripChatBody({ ...body, offer }, {}).value.offer, offer);
  assert.ok(app.parseTripChatBody({ ...body, offer: [1] }, {}).error);
  assert.ok(app.parseTripChatBody({ ...body, offer: ['a', 'b', 'c', 'd'] }, {}).error);
});

test('2. gluten-free evidence: verified / partial / unknown / unmet from the listings’ badges, or from plan.evidence when the planner gives it; EN and FR; never a menu item or a safety promise', () => {
  const ev = ex.tripEvidenceFor('gluten_free', PLAN, null, 'en');
  assert.deepEqual([ev.status, ev.source, ev.total, ev.has.length], ['verified', 'badges', 6, 6], 'the six meal stops; the bar after dinner and the wineries are not meals');
  assert.equal(ev.line, 'Every meal stop here has the Gluten-Free-Friendly badge on its listing.');
  assert.equal(ev.caveat, CAVEAT);
  assert.equal(ex.tripEvidenceFor('gluten_free', PLAN, null, 'fr').line, 'Chaque arrêt repas ici a le badge « Sans gluten » sur sa fiche.');
  const partial = PLAN.map((s) => ([170, 256].includes(s.id) ? { ...s, feats: [] } : s));
  const pv = ex.tripEvidenceFor('gluten_free', partial, null, 'en');
  assert.equal(pv.status, 'partial');
  assert.equal(pv.line, '4 of 6 meal stops have the Gluten-Free-Friendly badge; Dawett Fine Indian Cuisine and HUMO Kelowna don’t say. Want me to swap those two?');
  assert.equal(ex.tripEvidenceFor('gluten_free', partial, null, 'fr').line, '4 des 6 arrêts repas ont le badge « Sans gluten »; Dawett Fine Indian Cuisine et HUMO Kelowna ne le disent pas. Voulez-vous que je remplace ces deux-là?');
  const none = PLAN.map((s) => ({ ...s, feats: [] }));
  const nv = ex.tripEvidenceFor('gluten_free', none, null, 'en');
  assert.equal(nv.status, 'unknown');
  assert.equal(nv.line, 'None of the meal stops here has the Gluten-Free-Friendly badge on its listing, so I can’t confirm gluten-free options. Ask the restaurant when you book.');
  // plan.evidence, when the planner gives it, is what is said (the badges are not read again).
  const given = [{ ask: 'gluten_free', label: 'Gluten-free dining', status: 'partial', text: '5 of 6 meal stops have the Gluten-Free-Friendly badge.', textFr: '5 des 6 arrêts repas ont le badge « Sans gluten ».', stops: [{ id: 222, name: 'Frankie We Salute You!', has: true }, { id: 170, name: 'Dawett Fine Indian Cuisine', has: null }] }];
  const gv = ex.tripEvidenceFor('gluten_free', PLAN, given, 'en');
  assert.deepEqual([gv.status, gv.source], ['partial', 'plan']);
  assert.equal(gv.line, '5 of 6 meal stops have the Gluten-Free-Friendly badge. Want me to swap it?');
  assert.equal(ex.tripEvidenceFor('gluten_free', PLAN, given, 'fr').line, '5 des 6 arrêts repas ont le badge « Sans gluten ». Voulez-vous que je le remplace?');
  const unmet = ex.tripEvidenceFor('gluten_free', PLAN, [{ ask: 'gluten_free', status: 'unmet', stops: [{ id: 170, name: 'Dawett Fine Indian Cuisine', has: false }] }], 'en');
  assert.deepEqual([unmet.status, unmet.line], ['unmet', 'Dawett Fine Indian Cuisine doesn’t list gluten-free options.']);
  assert.equal(ex.tripEvidenceFor('gluten_free', PLAN, [{ ask: 'gluten_free', status: 'verified', text: '', stops: PLAN.filter((s) => s.type === 'restaurant').map((s) => ({ id: s.id, name: s.name, has: true })) }], 'en').line, 'Every meal stop here has the Gluten-Free-Friendly badge on its listing.');
  assert.equal(ex.tripEvidenceFor('gluten_free', PLAN, [{ ask: 'pool', status: 'verified', stops: [] }], 'en').source, 'badges', 'evidence for another ask is not used');
  assert.equal(ex.tripEvidenceFor('pool', PLAN, null, 'en'), null);
  // No line ever names a dish or promises safety.
  for (const e of [ev, pv, nv, gv, unmet]) { assert.doesNotMatch(`${e.line}`, /safe|guarantee|menu|dish|celiac-safe/i); assert.match(e.caveat, /isn’t a guarantee against cross-contamination/); }
});

test('(b) and 3. the chat explains its own warnings and choices from the plan and the evidence; a wrong line is called wrong; an unknown cause is said so', () => {
  const A = (m, f = facts(), lang = 'en', stops = PLAN) => { const r = R(m, stops); assert.ok(r.ops.length && r.ops.every((o) => o.o === 'ask'), `${m}: read as a question`); return ex.answer(r.ops[0], f, lang); };
  const b = A(MSG_B);
  assert.equal(b.reply, 'That line was wrong: every meal stop here has the Gluten-Free-Friendly badge on its listing. They are Frankie We Salute You!, Dawett Fine Indian Cuisine, Table Nineteen Kelowna and 3 more. It came from the planner’s note “Not every stop is listed as gluten-free friendly.”, which is about Meadow Vista Honey Wines and Blue Gator Bar: they don’t have the badge.');
  assert.equal(b.note, CAVEAT);
  assert.doesNotMatch(b.reply, /Which stop do you mean/);
  assert.match(A('why does it say I couldn’t fit gluten free?').reply, /^That line was wrong: every meal stop here has the Gluten-Free-Friendly badge/);
  assert.match(A('pourquoi as-tu dit que tu n’as pas pu inclure le sans gluten?', facts(), 'fr').reply, /^Cette ligne était fausse : chaque arrêt repas ici a le badge « Sans gluten » sur sa fiche\./);
  // With plan.evidence (the planner's own words) the answer follows it.
  const given = [{ ask: 'gluten_free', status: 'partial', text: '4 of 6 meal stops have the Gluten-Free-Friendly badge; Gulfstream and HUMO Kelowna don’t say.', stops: PLAN.filter((s) => s.type === 'restaurant').map((s) => ({ id: s.id, name: s.name, has: [255, 256].includes(s.id) ? null : true })) }];
  const pe = A(MSG_B, facts({ evidence: given }));
  assert.match(pe.reply, /^That line was only partly right: 4 of 6 meal stops have the Gluten-Free-Friendly badge; Gulfstream and HUMO Kelowna don’t say\. Want me to swap them\?/);
  assert.deepEqual(pe.offer, [{ say: 'swap Gulfstream and HUMO Kelowna for gluten-free places' }]);
  // "is everything gluten-free?", "which restaurants are gluten-free?"
  assert.equal(A('is everything gluten-free?').reply, 'Every meal stop here has the Gluten-Free-Friendly badge on its listing.');
  assert.equal(A('which restaurants are gluten-free?').reply, 'Every meal stop here has the Gluten-Free-Friendly badge on its listing. They are Frankie We Salute You!, Dawett Fine Indian Cuisine, Table Nineteen Kelowna and 3 more.');
  assert.equal(A('est-ce que tout est sans gluten?', facts(), 'fr').reply, 'Chaque arrêt repas ici a le badge « Sans gluten » sur sa fiche.');
  const partial = PLAN.map((s) => ([170, 256].includes(s.id) ? { ...s, feats: [] } : s));
  const p = A('is everything gluten-free?', facts({ stops: partial }), 'en', partial);
  assert.equal(p.reply, '4 of 6 meal stops have the Gluten-Free-Friendly badge; Dawett Fine Indian Cuisine and HUMO Kelowna don’t say. Want me to swap those two?');
  assert.deepEqual(p.offer, [{ say: 'swap Dawett Fine Indian Cuisine and HUMO Kelowna for gluten-free places' }]);
  // The offered message is read as exactly those two swaps, each asked with the badge; the reply names what changed.
  const sw = R(p.offer[0].say, partial);
  assert.deepEqual(sw.ops.map((o) => [o.o, o.stops.map((s) => s.id), o.features]), [['replace', [170], GF], ['replace', [256], GF]]);
  const fresh = { 170: S({ key: '1-evening', id: 700, name: 'Basil & Mint', type: 'restaurant', day: 1, start: 1080, feats: GF }), 256: S({ key: '2-night', id: 701, name: 'Broken Anchor', type: 'restaurant', day: 2, start: 1200, feats: GF }) };
  let cur = partial;
  const run = (a) => { const old = cur.find((s) => s.key === a.swap.key); assert.deepEqual(a.swap.features, GF); cur = cur.map((s) => (s.key === a.swap.key ? fresh[old.id] : s)); return dayPlan(cur); };
  const out = tc.planTurn(sw.ops, ctxFor(run, { stops: partial, hasFeature: (id) => [700, 701].includes(id) }));
  assert.deepEqual(out.changed.sort(), ['1-evening', '2-night']);
  assert.deepEqual(idTimes(tc.planStops(out.plan).filter((s) => ![700, 701].includes(s.id))), idTimes(partial.filter((s) => ![170, 256].includes(s.id))));
  assert.match(tc.buildReply(out, { lang: 'en' }), /^Done\. Swapped Dawett Fine Indian Cuisine for Basil & Mint at 6 PM\. Its Okanagan Roam listing has the Gluten-Free-Friendly badge\. Swapped HUMO Kelowna for Broken Anchor at 8 PM\./);
  // An allergy: never a promise.
  const al = A('is this safe for someone with celiac disease?');
  assert.match(al.reply, /^I can’t confirm that\. Listings only carry badges such as Gluten-Free-Friendly; they don’t list allergens/);
  assert.equal(al.note, CAVEAT);
  assert.match(A('is there anything for a peanut allergy?').reply, /^I can’t confirm that\./);
  // "what does the warning mean?": the note is quoted and explained as far as the facts go.
  assert.equal(A('what does the warning mean?').reply, 'There’s no warning on this plan right now. Every meal stop here has the Gluten-Free-Friendly badge on its listing.');
  assert.equal(A('what does the warning mean?', facts({ stops: PLAN.map((s) => ([170, 256].includes(s.id) ? { ...s, feats: [] } : s)) })).reply, 'The line about gluten-free food means this: 4 of 6 meal stops have the Gluten-Free-Friendly badge; Dawett Fine Indian Cuisine and HUMO Kelowna don’t say. Want me to swap those two?');
  assert.equal(A('what does the warning mean?', facts({ warnings: [], missing: [] })).reply, 'There’s no warning on this plan right now. Everything you asked for that I can check is in it.');
  assert.equal(A('what does the warning mean?', facts({ warnings: ['A note the page never shows.'], missing: [{ kind: 'type', value: 'brewery', label: 'brewery' }] })).reply, 'The plan says it could not include brewery. I don’t know the exact reason. Say “add brewery” and I’ll try again.');
  assert.equal(A('que veut dire l’avertissement?', facts(), 'fr').reply, 'Il n’y a aucun avertissement sur ce plan en ce moment. Chaque arrêt repas ici a le badge « Sans gluten » sur sa fiche.');
  // "why does it say you couldn't fit a winery?" with wineries on the plan: wrong, said plainly.
  assert.equal(A('why does it say you couldn’t fit a winery?').reply, 'That line was wrong: your plan has a winery: Meadow Vista Honey Wines on day 1 and Azhadi Vineyards on day 2.');
  // "why two wineries?"
  assert.equal(A('why two wineries?').reply, 'You asked for two wineries, so the plan has two: Meadow Vista Honey Wines on day 1 and Azhadi Vineyards on day 2.');
  assert.equal(A('pourquoi deux vignobles?', facts(), 'fr').reply, 'Vous avez demandé deux vignobles, donc le plan en a deux : Meadow Vista Honey Wines au jour 1 et Azhadi Vineyards au jour 2.');
  const one = PLAN.filter((s) => s.id !== 812);
  assert.equal(A('why only one winery?', facts({ stops: one }), 'en', one).reply, 'You asked for two wineries, but the plan has only one: Meadow Vista Honey Wines on day 1. I don’t know why the planner found no more; say “add another winery” and I’ll try.');
  assert.match(A('why two wineries?', facts({ request: 'a weekend in Kelowna' })).reply, /^Your request didn’t ask for wineries; the planner added .* and I don’t know more than that\./);
  // "why is there an event on day 3?"
  const evs = [{ name: 'The Passion of Amy Winehouse: Back to Black', place: 'Kelowna Community Theatre', categories: ['live-music'], dateLabel: 'Tue, Nov 24' }];
  assert.equal(A('why is there an event on day 3?', facts({ events: evs })).reply, 'The Passion of Amy Winehouse: Back to Black at Kelowna Community Theatre is there because you asked for live music, and it’s a What’s On listing for live music on Tue, Nov 24. You haven’t given dates, so tell me when you’re coming and I’ll check what’s on then.');
  assert.doesNotMatch(A('why is there an event on day 3?', facts({ events: evs, dated: true })).reply, /haven’t given dates/);
  assert.match(A('why is there an event on day 3?', facts({ events: [{ ...evs[0], categories: ['family'] }], request: 'a weekend in Kelowna', dated: true })).reply, /^I don’t know exactly why the planner chose The Passion of Amy Winehouse: Back to Black at Kelowna Community Theatre; it’s a What’s On listing on Tue, Nov 24\. Say “remove the event”/);
  assert.equal(A('why is there an event on day 3?').reply, 'There’s no event on your plan right now.');
  // "why this hotel?" is the place to stay (answered from its own listing by the server).
  assert.deepEqual(R('why this hotel?').ops.map((o) => [o.o, o.value, o.stay]), [['ask', 'q_why', true]]);
});

const EXPLAIN = [MSG_B, 'why does it say I couldn’t fit gluten free?', 'is everything gluten-free?', 'which restaurants are gluten-free?', 'why this hotel?', 'why is there an event on day 3?', 'why two wineries?', 'what does the warning mean?',
  'why are there no breweries?', 'what did you change?', 'why did you pick these restaurants?', 'explain the plan',
  'pourquoi as-tu dit que tu n’as pas pu inclure le sans gluten?', 'est-ce que tout est sans gluten?', 'quels restaurants sont sans gluten?', 'pourquoi cet hôtel?', 'pourquoi y a-t-il un événement au jour 3?', 'pourquoi deux vignobles?', 'que veut dire l’avertissement?'];

test('3. an explanation question NEVER modifies the itinerary: plan, stops, times, stay and request text identical, on the rules path and on the AI path (a model that answers with edits)', async () => {
  for (const m of EXPLAIN) assert.ok(ex.isExplainQuestion(tc.fold(m)) || (R(m).ops.length && R(m).ops.every((o) => o.o === 'ask')), `${m}: a question`);
  assert.equal(ex.isExplainQuestion(tc.fold('why not add a brewery on day 2')), false, 'a request stays a request');
  assert.equal(ex.isExplainQuestion(tc.fold('add a winery on day 2')), false);
  // A real plan from the planner (the test listings), so a changed plan would be possible.
  const TEXT = 'Plan a 2-day Kelowna weekend for 6 friends: two wineries, gluten-free dining and easy walks. One person does not drink.';
  const plan = app.runTripPlanRequest(app.parseTripPlanBody({ text: TEXT }, { v4: true, stays: true }).value, true);
  const stops = tc.planStops(plan).map((s) => ({ key: s.key, id: s.id, ...(s.start !== null ? { start: s.start } : {}) }));
  assert.ok(stops.length >= 4, 'a plan with stops');
  const stayId = plan.whereToStay && plan.whereToStay.pick ? plan.whereToStay.pick.id : null;
  const bodyOf = (message, lang) => ({ message, lang, plan: { text: TEXT, seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops, ...(stayId ? { stayId } : {}) });
  // The AI "reads" every question as edits: start over, no alcohol for everyone, take out a stop, add a winery, a new hotel.
  const first = { id: stops[0].id, key: stops[0].key };
  const hostile = async (message, opts) => ({ ok: true, cant: null, ops: [OP({ o: 'start_over' }), OP({ o: 'party', value: 'no_alcohol' }), OP({ o: 'remove', stops: [opts.stops.find((s) => s.id === first.id)] }), OP({ o: 'add', kind: 'winery', day: 1 }), OP({ o: 'stay', value: 'upscale' }), OP({ o: 'pace', value: 'packed' })] });
  for (const reader of [null, hostile]) {
    app.setTripChatReader(reader);
    for (const m of EXPLAIN) {
      const lang = /pourquoi|est-ce|quels|que veut/.test(m) ? 'fr' : 'en';
      const parsed = app.parseTripChatBody(bodyOf(m, lang), { stays: true });
      assert.ok(!parsed.error, parsed.error);
      const before = JSON.stringify(parsed.value.args);
      const turn = await app.runTripChatTurn(parsed.value, { staysOn: true, lang });
      const j = turn.response, tag = `${reader ? 'AI' : 'rules'}: ${m}`;
      assert.equal(j.plan, null, `${tag}: no new plan`);
      assert.equal(j.req, null, `${tag}: no new request`);
      assert.deepEqual(j.changed, [], `${tag}: no stop changed`);
      assert.deepEqual(j.actions, { remove: [], keep: [] }, `${tag}: nothing removed, kept, or moved`);
      for (const k of ['stayBlock', 'stayPref', 'stayForce', 'stayArrive', 'party', 'text', 'card', 'diff', 'confirm']) assert.equal(j[k], undefined, `${tag}: no ${k}`);
      assert.equal(turn.plan, null, tag);
      assert.ok(typeof j.reply === 'string' && j.reply.length > 10, `${tag}: an answer`);
      assert.doesNotMatch(j.reply, /^(?:Done|C’est fait)\b|Changed \d+ stops/, `${tag}: not an edit reply (${j.reply})`);
      assert.equal(JSON.stringify(parsed.value.args.text), JSON.stringify(TEXT), `${tag}: the request text is as it was`);
      assert.equal(JSON.stringify({ ...parsed.value.args, tourStops: undefined }), JSON.stringify({ ...JSON.parse(before), tourStops: undefined }), `${tag}: the plan inputs are as they were`);
    }
  }
  app.setTripChatReader(null);
  // The same six-person request and (b), end to end on the test listings: answered from the stops' own badges.
  const parsed = app.parseTripChatBody(bodyOf(MSG_B, 'en'), { stays: true });
  const turn = await app.runTripChatTurn(parsed.value, { staysOn: true, lang: 'en' });
  assert.match(turn.response.reply, /Gluten-Free-Friendly badge|meal stop/);
  assert.doesNotMatch(turn.response.reply, /Which stop do you mean|on these dates/);
  assert.equal(turn.response.note.text, CAVEAT);
});

test('the whole group does not drink: no wineries are planned, and "add a winery" is read as before', () => {
  const TEXT = 'Plan a 2-day Kelowna weekend for 6 friends: easy walks and good food. We don’t drink.';
  const plan = app.runTripPlanRequest(app.parseTripPlanBody({ text: TEXT }, { v4: true }).value, false);
  const stops = tc.planStops(plan);
  assert.ok(stops.length >= 3);
  assert.ok(!stops.some((s) => ['winery', 'brewery', 'distillery'].includes(s.type)), 'no winery, brewery or distillery');
  assert.ok(tc.rulesRead('we don’t drink', PLAN, { days: 3 }).ops.some((o) => o.o === 'party' && o.value === 'no_alcohol'), 'still the whole group');
  const r = tc.rulesRead('add a winery', PLAN.filter((s) => s.type !== 'winery'), { days: 3, request: TEXT });
  assert.deepEqual(r.ops.map((o) => [o.o, o.kind, !!o.more, o.features || null]), [['add', 'winery', false, null]]);
  assert.equal(tc.explainReply({ value: 'q_why_not', kind: 'winery' }, { stops: PLAN.filter((s) => s.type !== 'winery'), request: TEXT, wholeDry: true }, 'en'), 'Your request said the group doesn’t drink, so I left wineries out. If only one of you doesn’t, say so and I’ll add them.');
});

test('2. the page: the agent’s first line reads the same evidence (never "couldn’t fit gluten free", never "on these dates" without dates); the caveat once; offers ride along', () => {
  const page = app.renderTripPlannerV3Page({ v4: 'preview', stays: 'preview', chat: 'preview' });
  assert.match(page, /function tripEvidenceFor\(ask, stops, planEvidence, lang\)/);
  assert.match(page, /missingNoDates: 'I couldn’t fit \{what\} into this plan/);
  assert.match(page, /chatHasDates\(\) \|\| \(t3StayInputBase\(\) \|\| \{\}\)\.arrive \? 'missing' : 'missingNoDates'/);
  assert.match(page, /!diet\(x\.label\)/);
  assert.match(page, /body\.offer = chat\.offer\.slice\(0, 3\)/);
  assert.match(page, /chat\.notes\[j\.note\.key\]/);
  assert.match(page, /v4-agent-note/);
  // The function the page runs is the one the server answers with: the same line for the same stops.
  const src = /function tripEvidenceFor\(ask, stops, planEvidence, lang\) \{[\s\S]*?\n\}\n/.exec(page);
  assert.ok(src, 'the page carries the evidence function');
  const onPage = vm.runInNewContext(`(${src[0].trim()})`);
  for (const lang of ['en', 'fr']) {
    for (const stops of [PLAN, PLAN.map((s) => ([170, 256].includes(s.id) ? { ...s, feats: [] } : s)), PLAN.map((s) => ({ ...s, feats: [] }))]) {
      const a = onPage('gluten_free', stops, null, lang), b = ex.tripEvidenceFor('gluten_free', stops, null, lang);
      assert.equal(a.line, b.line);
      assert.equal(a.caveat, b.caveat);
      assert.doesNotMatch(a.line, /on these dates|à ces dates|couldn’t fit|pas pu inclure/);
    }
  }
});
