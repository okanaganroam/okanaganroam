'use strict';
// Travel agent chat, round 6 (2026-11-22, fresh-eyes test 6 on live Okanagan): adds that were refused though the place
// is listed and open, questions that dead-ended, a wine tour on a wine trip, replies that matched the plan.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.TRIP_PLANNER_V3 = 'on';
process.env.TRIP_CHAT_TIMING = 'off';
const app = require('../server.js');
const tc = require('../trip-chat.js');

test.after(() => { try { app.server.close(); } catch (e) { /* not listening */ } });

const S = (o) => ({ badges: [], price: 2, role: '', ...o });
// A family Kelowna weekend like the tester's (Nov 28-29).
const PLAN = [
  S({ key: '1-morning', id: 11, name: 'Knox Mountain Park', type: 'outdoor', day: 1, start: 585 }),
  S({ key: '1-midday', id: 12, name: 'Broken Anchor Cafe', type: 'restaurant', day: 1, start: 690, role: 'lunch' }),
  S({ key: '1-afternoon', id: 13, name: 'Kelowna Art Gallery', type: 'indoor', day: 1, start: 795 }),
  S({ key: '1-late', id: 14, name: 'Planet Lazer Kelowna', type: 'indoor', day: 1, start: 945 }),
  S({ key: '1-evening', id: 15, name: 'Frankie We Salute You!', type: 'restaurant', day: 1, start: 1080, role: 'dinner' }),
  S({ key: '2-midday', id: 22, name: 'Sunny’s a modern diner', type: 'restaurant', day: 2, start: 690, role: 'lunch' }),
  S({ key: '2-evening', id: 25, name: 'Palmer Kitchen + Spirits', type: 'restaurant', day: 2, start: 1080, role: 'dinner', badges: ['lake_view'] }),
];
const OP = (o) => ({ stops: [], kind: null, time: null, day: null, value: null, n: null, ages: [], region: null, date: null, ...o });
const WD = tc.weekdayDays(['2026-11-28', '2026-11-29'], 2);
const R = (m, stops = PLAN, extra = {}) => tc.rulesRead(m, stops, { regions: ['kelowna'], regionLabels: { kelowna: 'Kelowna' }, days: 2, weekdays: WD, ...extra });
const dayPlan = (stops) => ({ kind: 'multi_day', days: [1, 2].map((d) => ({ day: d, stops: stops.filter((s) => s.day === d).map((s) => ({ daypart: s.key.split('-')[1], venue: { id: s.id, name: s.name, type: s.type, price: s.price || 2, badges: (s.badges || []).map((b) => ({ key: b })) } })) })), schedule: stops.map((s) => ({ day: s.day, venueId: s.id, startMinutes: s.start })) });
const ctxFor = (run, extra = {}) => ({ args: { text: 'family weekend in Kelowna with our kids', seed: 0 }, locks: {}, removed: [], stops: PLAN, days: 2, run, regionLabels: {}, lang: 'en', ...extra });
// A small planner: the swap slot gets the first listing that has the words asked and is open at the time asked.
const LIST = [
  { id: 90, name: 'Work of Art Pottery Studio', type: 'indoor', words: 'pottery', open: [600, 1260] },
  { id: 91, name: 'McCurdy Bowling Centre', type: 'indoor', words: 'bowling lanes', open: [720, 1440] },
  { id: 92, name: 'Landmark Cinemas Grand 10 Kelowna', type: 'indoor', words: 'cinema movie', open: [660, 1380] },
  { id: 93, name: 'Okanagan Bowling Club (OBC)', type: 'indoor', words: 'bowling', open: [600, 1200] },
  { id: 94, name: 'Parlour Ice Cream', type: 'cafe', words: 'ice cream', open: [660, 1320] },
];
function planner(listing = LIST) {
  const calls = [];
  const run = (a) => {
    calls.push(a);
    const sw = a.swap || {};
    const at = (sw.times || {})[sw.key];
    const pick = listing.find((v) => !(a.excludeVenueIds || []).includes(v.id) && (!sw.words || sw.words.some((w) => v.words.includes(w))) && (!sw.want || (sw.want === 'ice_cream' && /ice cream/.test(v.words))) && (!Number.isInteger(at) || (at + 45 <= v.open[1] && v.open[0] <= at + 120)));
    const keep = PLAN.filter((s) => Object.entries(a.pinned || {}).some(([k, id]) => k === s.key && id === s.id));
    if (!pick) return { ...dayPlan(keep), swapMissed: { key: sw.key } };
    const [d] = sw.key.split('-');
    return dayPlan([...keep, { key: sw.key, id: pick.id, name: pick.name, type: pick.type, day: Number(d), start: Number.isInteger(at) ? Math.max(at, pick.open[0]) : 1185, badges: [] }]);
  };
  return { run, calls };
}

test('5. « quilles ou cinéma après le souper » (family with kids) adds bowling or a cinema after dinner, never a pottery studio (fails three rounds running)', () => {
  const msg = 'quilles ou cinéma après le souper';
  const r = R(msg);
  assert.deepEqual(r.ops.map((o) => [o.o, o.kind, o.alt, (o.stops || []).map((s) => s.id)]), [['add', 'bowling', ['cinema'], [15]]], 'one stop: bowling, else a cinema');
  // The AI's broader reading ("an activity", "arts") never wins over the listing words.
  for (const kind of ['activity', 'arts', 'kids', 'indoor']) {
    const m = tc.reconcileReads({ ok: true, cant: null, ops: [OP({ o: 'add', kind, time: 'evening', stops: [PLAN[4]] })] }, r, msg);
    assert.deepEqual(m.ops.map((o) => o.kind), ['bowling'], kind);
  }
  let p = planner();
  let out = tc.planTurn(r.ops, ctxFor(p.run, { lang: 'fr' }));
  assert.ok(out.plan);
  const added = out.added.map((s) => s.name);
  assert.deepEqual(added, ['McCurdy Bowling Centre']);
  assert.ok(!JSON.stringify(out.plan).includes('Pottery'));
  assert.ok(p.calls.every((a) => a.swap.words && !a.swap.words.includes('pottery')));
  let reply = tc.buildReply(out, { lang: 'fr' });
  assert.match(reply, /^C’est fait\. J’ai ajouté McCurdy Bowling Centre à/);
  assert.doesNotMatch(reply, /rien trouvé|Choisi à la place/);
  // No bowling open then: the cinema, said as one stop.
  p = planner(LIST.filter((v) => !/Bowling/.test(v.name)));
  out = tc.planTurn(r.ops, ctxFor(p.run, { lang: 'fr' }));
  assert.deepEqual(out.added.map((s) => s.name), ['Landmark Cinemas Grand 10 Kelowna']);
  reply = tc.buildReply(out, { lang: 'fr' });
  assert.doesNotMatch(reply, /quilles/);
  // Neither: one plain line naming both.
  p = planner(LIST.filter((v) => v.id === 90));
  out = tc.planTurn(r.ops, ctxFor(p.run, { lang: 'en' }));
  assert.match(tc.buildReply(out, { lang: 'en' }), /bowling or a movie/);
});

test('1. an add into a free part of the day asks for a real time (a place opening at 10 is open on a Sunday morning); a near miss is put later and said', () => {
  const stops = PLAN.filter((s) => s.key !== '1-morning');
  const r = R('add bowling on Sunday morning', stops);
  assert.deepEqual(r.ops.map((o) => [o.o, o.kind, o.time, o.day]), [['add', 'bowling', 'morning', 2]]);
  const p = planner();
  const out = tc.planTurn(r.ops, ctxFor(p.run, { stops }));
  const sw = p.calls[0].swap;
  assert.equal(sw.key, '2-morning');
  assert.ok(Number.isInteger(sw.times['2-morning']) && sw.times['2-morning'] < 690, 'a real time before lunch');
  assert.deepEqual(out.added.map((s) => s.name), ['Okanagan Bowling Club (OBC)']);
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Done. Added Okanagan Bowling Club (OBC) at 10 AM.');
  // Only McCurdy (opens at noon): a near miss, later the same day, said plainly.
  const p2 = planner(LIST.filter((v) => v.id === 91));
  const out2 = tc.planTurn(r.ops, ctxFor(p2.run, { stops }));
  assert.match(tc.buildReply(out2, { lang: 'en' }), /^Done\. (?:No bowling was open in the morning, so I added|Nothing that fits opens earlier, so I added) McCurdy Bowling Centre at 12 PM\.$/);
});

test('1. "a dinner with a lake view": an added dinner keeps the lake view; a dinner that already has one is said, nothing changes', () => {
  const r = R('add a dinner with a lake view on day 2');
  assert.deepEqual(r.ops.map((o) => [o.o, o.kind, (o.stops || []).map((s) => s.id)]), [['replace', 'lake_view', [25]]]);
  const out = tc.planTurn(r.ops, ctxFor(() => { throw new Error('no planner run'); }));
  assert.equal(out.plan, null);
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Palmer Kitchen + Spirits already has a lake view, so I kept it.');
  const noDinner = PLAN.filter((s) => s.key !== '2-evening');
  assert.deepEqual(R('add a dinner with a lake view on day 2', noDinner).ops.map((o) => [o.o, o.kind, o.time]), [['add', 'lake_view', 'evening']]);
  assert.equal(tc.placeAdd(OP({ o: 'add', kind: 'lake_view', time: 'evening', day: 2 }), 'lake_view', { stops: noDinner, removed: new Set(), locks: {} }).slot, '2-evening');
  // The stop the planner came back with must have the badge.
  const fake = () => dayPlan([...noDinner, { key: '2-evening', id: 541, name: 'Ramen Arashi Kelowna', type: 'restaurant', day: 2, start: 1050 }]);
  const o2 = tc.planTurn(R('add a dinner with a lake view on day 2', noDinner).ops, ctxFor(fake, { stops: noDinner }));
  assert.equal(o2.plan, null, 'a ramen shop is not a lake view');
});

test('1. a place whose name or cuisine says it comes first (ice cream: not a crêpe café); weak matches only when none fits', () => {
  const p = planner([{ id: 80, name: 'Crepe Delicious Urban Cafe', type: 'cafe', words: 'ice cream', open: [600, 1260] }, ...LIST]);
  const r = R('add ice cream after lunch on Saturday', PLAN.filter((s) => s.key !== '1-afternoon'));
  const out = tc.planTurn(r.ops, ctxFor(p.run, { stops: PLAN.filter((s) => s.key !== '1-afternoon'), weakFor: (k) => (k === 'ice_cream' ? [80] : []) }));
  assert.deepEqual(out.added.map((s) => s.name), ['Parlour Ice Cream']);
  assert.ok(!out.req.excludeVenueIds.includes(80), 'the weak match is not kept out for later');
});

test('2. questions: a kind not on the plan is said; "this restaurant" is the plan\'s meal; « le musée »; "where\'s the spa?"; why only claims what was asked', () => {
  assert.equal(R('is the first winery open Sunday?').cant, 'q_none');
  assert.equal(tc.cantReply('q_none', 'en', 'winery', PLAN), 'There’s no winery in your plan. Say “add a winery” if you’d like one.');
  const fr = R('est-ce que le musée est ouvert dimanche?', PLAN.filter((s) => s.id !== 13));
  assert.equal(fr.cant, 'q_none');
  assert.equal(tc.cantReply('q_none', 'fr', fr.what, PLAN), 'Il n’y a pas de musée dans votre plan. Dites « ajoute un musée » si vous en voulez un.');
  const why = R('why this restaurant?', PLAN, { recent: ['1-evening'] });
  assert.deepEqual(why.ops.map((o) => [o.o, o.value, o.stops.map((s) => s.id)]), [['ask', 'q_why', [15]]]);
  assert.deepEqual(R('why this restaurant? on day 2').ops.map((o) => o.stops.map((s) => s.id)), [[22]]);
  const spa = R('where\'s the spa?');
  assert.equal(spa.cant, 'q_missing');
  assert.match(tc.cantReply('q_missing', 'en', 'spa', PLAN, { asked: true }), /^The spa you asked for isn’t in your plan/);
  const fact = { name: 'KINTON RAMEN Kelowna Downtown', type: 'restaurant', cuisine: 'Ramen', description: 'Kinton Ramen has a solid vegetarian ramen selection. More.', kid_friendly: 1, vegetarian: 1 };
  assert.equal(tc.agent.answerQuestion({ value: 'q_why' }, fact, {}, 'en'), 'KINTON RAMEN Kelowna Downtown is close to your other stops. Its listing says: Kinton Ramen has a solid vegetarian ramen selection.');
  assert.match(tc.agent.answerQuestion({ value: 'q_why' }, fact, { matches: ['somewhere good for kids'] }, 'en'), /^I picked KINTON RAMEN Kelowna Downtown because you asked for somewhere good for kids\./);
});

test('3. a wine tour moved to another day moves its tourStops entry; 4. "start the days at 10:30" leaves an afternoon day as it is', () => {
  const W = [S({ key: '1-morning', id: 31, name: 'Signature Connections Wine Tours', type: 'tour', day: 1, start: 660 }), S({ key: '1-evening', id: 32, name: 'Kitchen @ Da Silva', type: 'restaurant', day: 1, start: 1080, role: 'dinner' }), S({ key: '2-midday', id: 33, name: 'Sushi Heaven', type: 'restaurant', day: 2, start: 720, role: 'lunch' }), S({ key: '2-afternoon', id: 34, name: 'Poplar Grove', type: 'winery', day: 2, start: 840 })];
  const r = tc.rulesRead('do the wine tour on Sunday instead', W, { regions: [], regionLabels: {}, days: 2, weekdays: WD });
  assert.deepEqual(r.ops.map((o) => [o.o, o.stops.map((s) => s.id), o.day]), [['move', [31], 2]]);
  let seen = null;
  const run = (a) => { seen = a; const t = a.tourStops[0]; return dayPlan([...W.filter((s) => a.pinned[s.key] === s.id), { ...W[0], key: `${t.day}-${t.part}`, day: t.day, start: t.startMinutes }]); };
  const out = tc.planTurn(r.ops, { args: { text: 'wine weekend in Penticton', seed: 0, tourStops: [{ day: 1, part: 'morning', listingId: 31, startMinutes: 660, durationMinutes: 240, covers: ['winery'] }] }, locks: {}, removed: [], stops: W, days: 2, run, hooks: { tourStops: true, moves: true, stopStarts: true }, lang: 'en' });
  assert.equal(seen.tourStops[0].day, 2);
  assert.ok(!seen.moves, 'not a move: the tour entry itself');
  assert.equal(out.req.tourStops[0].day, 2);
  assert.match(tc.buildReply(out, { lang: 'en' }), /Signature Connections Wine Tours/);
  assert.match(tc.buildReply(out, { lang: 'en' }), /took out Poplar Grove/);
  // 4.
  const late = [S({ key: '1-afternoon', id: 41, name: 'Löyly Floating Sauna', type: 'indoor', day: 1, start: 930 }), S({ key: '1-evening', id: 42, name: 'Olympia', type: 'restaurant', day: 1, start: 1110, role: 'dinner' }), S({ key: '2-morning', id: 43, name: 'Cleopatra’s', type: 'indoor', day: 2, start: 570 })];
  const rt = tc.rulesRead('start the days at 10:30', late, { regions: [], regionLabels: {}, days: 2 });
  const shifted = late.map((s) => (s.day === 2 ? { ...s, start: 630 } : s));
  const o4 = tc.planTurn(rt.ops, { args: { text: 'x', seed: 0 }, locks: {}, removed: [], stops: late, days: 2, run: () => dayPlan(shifted), lang: 'en' });
  const rep = tc.buildReply(o4, { lang: 'en' });
  assert.doesNotMatch(rep, /earlier/);
  assert.match(rep, /Day 1 starts in the afternoon, so I left it as it is\./);
});

test('6. a trip elsewhere names what we cover and the sister site; the wine tour offer is never made to a no-alcohol or kids\' plan', () => {
  const r = R('a trip to Vancouver');
  assert.equal(r.cant, 'elsewhere');
  assert.match(tc.cantReply(r.cant, 'en', r.what, PLAN), /only covers the Okanagan, from Vernon to Osoyoos/);
  const w = R('plan a weekend in Whistler instead');
  assert.match(tc.cantReply(w.cant, 'fr', w.what, PLAN), /Whistler Roam \(whistlerroam\.com\)/);
  assert.ok(R('add a winery in Kelowna').ops.length, 'a town we cover is not elsewhere');
});

test('7. "something cheaper" on a stop the chat changed to pizza keeps it pizza', () => {
  const stops = PLAN.map((s) => (s.key === '1-evening' ? { ...s, id: 59, name: 'Antico Pizza Napoletana', cuisine: 'Pizza', soft: true, price: 2 } : s));
  const r = R('something cheaper for dinner on Saturday', stops);
  let seen = null;
  tc.planTurn(r.ops, ctxFor((a) => { seen = a; return dayPlan(stops); }, { stops }));
  assert.equal(seen.swap.priceMax, 1);
  assert.deepEqual(seen.swap.words, ['pizza', 'pizzeria']);
});

// Whistler fresh-eyes test 6 (live, Nov 22): the chat-side items, on a ski weekend like the tester's (Dec 11-13, kids 7 and 10, no alcohol).
const SKI = [
  S({ key: '1-morning', id: 346, name: 'Whistler Blackcomb', type: 'outdoor', day: 1, start: 540 }),
  S({ key: '1-midday', id: 448, name: 'Chic Pea', type: 'restaurant', day: 1, start: 720, role: 'lunch' }),
  S({ key: '1-afternoon', id: 655, name: 'bubly Tube Park', type: 'outdoor', day: 1, start: 945 }),
  S({ key: '1-evening', id: 422, name: 'Splitz Grill', type: 'restaurant', day: 1, start: 1080, role: 'dinner' }),
  S({ key: '2-morning', id: 346, name: 'Whistler Blackcomb', type: 'outdoor', day: 2, start: 540 }),
  S({ key: '2-midday', id: 446, name: 'Crystal Hut', type: 'restaurant', day: 2, start: 720, role: 'lunch' }),
  S({ key: '2-afternoon', id: 700, name: 'Blackcomb Snowmobile', type: 'tour', day: 2, start: 945 }),
  S({ key: '3-morning', id: 346, name: 'Whistler Blackcomb', type: 'outdoor', day: 3, start: 540 }),
  S({ key: '3-midday', id: 444, name: 'Steeps Grill', type: 'restaurant', day: 3, start: 720, role: 'lunch' }),
];
const SKI_REQ = 'ski weekend in Whistler Dec 11-13 with our kids aged 7 and 10, no alcohol';
const RS = (m) => tc.rulesRead(m, SKI, { regions: [], regionLabels: {}, days: 3, weekdays: tc.weekdayDays(['2026-12-11', '2026-12-12', '2026-12-13'], 3), request: SKI_REQ });
test('Whistler 1-3, 7-8: skiing never gives way to "more indoor things"; a day that ends with lunch keeps it; a tour on the plan is said; lunch on each day; questions', () => {
  const more = RS('more indoor things');
  assert.ok(!more.ops.some((o) => (o.stops || []).some((s) => s.id === 346)), 'the skiing stays');
  assert.deepEqual(more.ops.map((o) => [o.o, o.kind, (o.stops || []).map((s) => s.id)]), [['replace', 'indoor', [655]]]);
  const light = RS('make Sunday lighter, we drive home after lunch');
  assert.deepEqual([light.ops.length, light.cant], [0, 'ends_lunch'], 'nothing comes off; lunch stays');
  const snow = RS('add a snowmobile tour on Saturday afternoon');
  const out = tc.planTurn(snow.ops, { args: { text: SKI_REQ, seed: 0 }, locks: {}, removed: [], stops: SKI, days: 3, run: () => { throw new Error('no run'); }, lang: 'en' });
  assert.equal(tc.buildReply(out, { lang: 'en' }), 'Blackcomb Snowmobile is already on your plan at 3:45 PM.');
  assert.equal(RS('add lunch on each ski day').cant, 'meals_lunch');
  const noLunch = SKI.filter((s) => s.key !== '3-midday');
  assert.deepEqual(tc.rulesRead('add lunch on each ski day', noLunch, { days: 3 }).ops.map((o) => [o.o, o.kind, o.time, o.day]), [['add', 'restaurant', 'midday', 3]]);
  assert.equal(RS('how do we get here from Vancouver?').cant, 'getting_here');
  assert.deepEqual(RS('why this hotel?').ops.map((o) => [o.o, o.value, o.stay]), [['ask', 'q_why', true]]);
  assert.deepEqual(RS('something fun').ops.map((o) => [o.o, o.kind]), [['add', 'activity']]);
  // « le premier restaurant » and "the first restaurant": the same stop, the earliest meal (of the day named).
  assert.deepEqual(RS('le premier restaurant est ouvert dimanche?').ops.map((o) => o.stops.map((s) => s.id)), [[444]]);
  assert.deepEqual(RS('is the first restaurant open Sunday?').ops.map((o) => o.stops.map((s) => s.id)), [[444]]);
  assert.deepEqual(RS('is the first restaurant open?').ops.map((o) => o.stops.map((s) => s.id)), [[448]]);
  // A spa is a spa: never "Nordic Trails".
  assert.ok(!tc.KINDS.spa.words.includes('nordic'));
});
test('Whistler 6: a day named in the message stands over an AI reading of another day', () => {
  const r = RS('something cheaper for dinner on Friday');
  assert.deepEqual(r.ops.map((o) => [o.o, o.stops.map((s) => s.key)]), [['budget', ['1-evening']]]);
  const m = tc.reconcileReads({ ok: true, cant: null, ops: [OP({ o: 'budget', value: 'budget', stops: [SKI[3]].map((s) => ({ ...s, day: 2, key: '2-evening' })) })] }, r, 'something cheaper for dinner on Friday');
  assert.deepEqual(m.fixes, ['rules_day']);
  assert.equal(m.ops[0].stops[0].key, '1-evening');
});

// Planner round 5 wiring (okanaganroam #1018 / whistlerroam #270).
test('planner round 5: "no alcohol" only for the whole group; the planner\'s tourStops ride along; set-time overlap, shifted and gave-way are said', () => {
  const msg = 'Only one person does not drink; the rest want wineries. Can you add a winery on day 2 with a non-alcoholic option?';
  const r = tc.rulesRead(msg, PLAN, { regions: [], regionLabels: {}, days: 2 });
  assert.ok(!r.ops.some((o) => o.o === 'party' && o.value === 'no_alcohol'), 'the rules never make the trip alcohol-free for one person');
  const m = tc.reconcileReads({ ok: true, cant: null, ops: [OP({ o: 'party', value: 'no_alcohol' }), OP({ o: 'add', kind: 'winery', day: 2 })] }, r, msg);
  assert.ok(!m.ops.some((o) => o.o === 'party' && o.value === 'no_alcohol'), 'nor the AI\'s reading');
  for (const one of ['my husband doesn’t drink, is there a non-alcoholic option?', 'une personne ne boit pas']) assert.ok(!tc.rulesRead(one, PLAN, { days: 2 }).ops.some((o) => o.value === 'no_alcohol'), one);
  for (const all of ['we don’t drink', 'no alcohol please', 'on ne boit pas, sans alcool']) assert.ok(tc.rulesRead(all, PLAN, { days: 2 }).ops.some((o) => o.value === 'no_alcohol'), all);
  // set-time: the planner's reasons.
  const dinner = PLAN[4], laser = PLAN[3];
  const st = (extra) => tc.planTurn([OP({ o: 'set_time', stops: [dinner], n: 1020 })], ctxFor(() => ({ ...dayPlan(PLAN.map((s) => (s.id === 15 ? { ...s, start: 1020 } : s)).filter((s) => !(extra.stopStartGaveWay || []).some((g) => g.id === s.id))), ...extra }), { hooks: { stopStarts: true } }));
  assert.equal(tc.buildReply(st({ stopStartRefused: [{ key: '1-evening', id: 15, reason: 'overlap', withId: laser.id, freeFromMinutes: 1050 }] }), { lang: 'en' }), 'Frankie We Salute You! can’t start at 5 PM: Planet Lazer Kelowna is on then. The earliest it can start is 5:30 PM.');
  const gw = tc.buildReply(st({ stopStartGaveWay: [{ key: '1-late', id: laser.id }] }), { lang: 'en' });
  assert.match(gw, /To make room I took out Planet Lazer Kelowna\./);
  assert.doesNotMatch(gw, /Took out Planet Lazer/);
  assert.match(tc.buildReply(st({ stopStartShifted: [{ key: '1-late', id: laser.id, endMinutes: 1010 }] }), { lang: 'en' }), /Planet Lazer Kelowna now ends at 4:50 PM\./);
});
