'use strict';
// Build My Trip: a wheelchair user and a dog as needs of the trip; what each stay button really hands over; a day the
// planner could not fill (2026-11-24). The owner's request, on the live site at 390px:
//   "Plan a relaxed 2-day trip in Vernon for two adults on January 16–17, 2027. We have a dog, need gluten-free food and
//    want easy walks and a dog-friendly hotel. One of us uses a wheelchair."
// The plan showed "Easy walk", "Gluten-free" and "Dog-friendly" and nothing about the wheelchair; after the stay's dates
// were confirmed the card said "Booking links carry these dates." over a hotel's own page with no dates in it; day 2 was
// one lunch. Parts 1-7 are pure (fixtures); parts 8-9 run the planner on the repo's seed database.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

Object.assign(process.env, { TRIP_PLANNER_V3: 'on', TRIP_V4: 'on', TRIP_STAYS: 'on', TRIP_PLAN_API: 'on', STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', DISCOVERCARS_AID: 'okanaganroam' });
const A = require('../trip-access-needs.js');
const H = require('../trip-honest-plan.js');
const sbl = require('../stay-booking-links.js');
const L = require('../trip-workspace-layout.js');
const SITE = require('../trip-site.js');
const WR = SITE.brand === 'Whistler Roam';
const TOWN = WR ? 'Whistler' : 'Vernon';
const ASK = `Plan a relaxed 2-day trip in ${TOWN} for two adults on January 16–17, 2027. We have a dog, need gluten-free food and want easy walks and a dog-friendly hotel. One of us uses a wheelchair.`;
const V3 = fs.readFileSync(require.resolve('../trip-planner-v3-page.js'), 'utf8');
const V4 = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const CHAT_PAGE = fs.readFileSync(require.resolve('../trip-chat-page.js'), 'utf8');

// Fixture listings: a paved accessible trail, an "easy" trail with no access line, a trail with stairs, a restaurant
// whose owner ticked Wheelchair accessible, and one that says nothing.
const ACCESS = {
  1: { accessLine: 'Wide, flat, paved 6.8 km path; wheelchair accessible' },
  2: { accessLine: '' },
  3: { accessLine: 'Several bridge crossings and steep stairs at the falls' },
  4: { ownerAccessible: true },
  5: {},
};
const DOGS = { 1: { dogLine: 'Dogs allowed on leash', badge: true }, 2: { dogLine: 'Dogs are not permitted', badge: true }, 3: { badge: true }, 4: { badge: true }, 5: {} };
const ctx = { accessOf: (id) => A.accessOf(ACCESS[id] || {}), dogOf: (id) => A.dogOf(DOGS[id] || {}), kindsOf: (id) => (id === 2 ? ['easy_walk', 'walk'] : id === 1 || id === 3 ? ['walk'] : []) };
const stop = (daypart, id, name, type, badges = []) => ({ daypart, label: daypart, venue: { id, name, type, region: 'vernon', badges: badges.map((key) => ({ key })) }, reasons: [] });
const needs = [{ key: 'wheelchair', who: 'one', phrase: 'One of us uses a wheelchair' }, { key: 'dog', who: 'all', phrase: 'We have a dog' }];
function plan(days, extra = {}) {
  return { kind: 'multi_day', query: ASK, needs, days, warnings: [], requirementResults: [{ kind: 'venue_kind', value: 'easy_walk', strength: 'must', status: 'satisfied' }, { kind: 'feature', value: 'dog_friendly', strength: 'must', status: 'satisfied' }, { kind: 'unsupported', value: 'accessibility', strength: 'must', status: 'unverified' }], ...extra };
}
const DAY1 = () => [stop('morning', 1, 'Paved Lake Path', 'outdoor'), stop('midday', 4, 'Ramp Bistro', 'restaurant', ['dog_friendly']), stop('afternoon', 2, 'Easy Meadow Trail', 'outdoor'), stop('evening', 5, 'Quiet Diner', 'restaurant', ['dog_friendly'])];
const ev = (p, ask) => (p.evidence || []).find((e) => e.ask === ask);

test('1. the request: a wheelchair is read as a need of the trip (one person’s or everyone’s), in English and French; a stroller is not one', () => {
  const n = A.readNeeds(ASK);
  assert.deepEqual(n.map((x) => [x.key, x.who]), [['wheelchair', 'one'], ['dog', 'all']]);
  assert.equal(n[0].phrase, 'One of us uses a wheelchair');
  assert.equal(A.readNeeds('my mum uses a walker, a day in Kelowna')[0].who, 'one');
  assert.equal(A.readNeeds('wheelchair accessible wineries in Oliver')[0].who, 'all');
  assert.equal(A.readNeeds('step-free paths only please, Penticton weekend')[0].surface, 'paved');
  assert.equal(A.readNeeds('a weekend with a mobility scooter in Penticton')[0].key, 'wheelchair');
  assert.equal(A.readNeeds('Une fin de semaine à Kelowna, ma mère est en fauteuil roulant')[0].who, 'one');
  assert.equal(A.readNeeds('mobilité réduite, Penticton')[0].key, 'wheelchair');
  for (const t of ['stroller-friendly walks in Vernon', 'hot dog lunch and easy walks', 'easily accessible from the highway, no dogs', 'Plan a 3-day Kelowna weekend for 6 friends: two wineries, gluten-free dining, easy walks, a hotel with a pool, and live music. One person does not drink.']) assert.deepEqual(A.readNeeds(t), [], t);
});

test('2. a listing’s own lines: "easy" is never access; stairs and steep are a no; a dog ban is a no whatever the badge', () => {
  for (const [line, want] of [['Wide, flat, paved 6.8 km path; wheelchair accessible', true], ['Deleenheer Rd access suits limited mobility', true], ['Over 3 km of gravel trails designed for accessibility', true], ['Wheelchair-accessible playground; flat park trails', true],
    ['Easy trails, 860 m total', null], ['Easy trail through field and forest', null], ['Gravel-surfaced path, rated easy', null], ['', null], ['Strollers allowed on the mini golf course', null],
    ['Steep stairs up to the summit', false], ['Easy trails with some steep sections; headland trails harder', false], ['Adra south trail has roots and rocks; not accessible for all users', false], ['Stairs only: 158 steps to the top', false]]) assert.equal(A.accessFromText(line), want, line);
  assert.equal(A.accessFromText('Drop-off at gate with no stairs'), true, '"no stairs" is the listing saying step-free');
  for (const [line, want] of [['Dogs allowed on leash', true], ['Dogs must be leashed at all times', true], ['Dogs are not permitted', false], ['No dogs on the trails (ecological reserve)', false], ['On leash Oct 1 to Mar 31; no dogs Apr 1 to Sep 30', null], ['', null]]) assert.equal(A.dogFromText(line), want, line);
  assert.deepEqual([A.accessOf(ACCESS[1]).has, A.accessOf(ACCESS[2]).has, A.accessOf(ACCESS[3]).has, A.accessOf(ACCESS[4]).has, A.accessOf(ACCESS[5]).has], [true, null, false, true, null]);
  assert.equal(A.accessOf({ stayAccessible: true }).has, true);
  assert.equal(A.accessOf({}).has, null, 'no data is never a yes or a no');
  assert.equal(A.dogOf(DOGS[2]).has, false, 'the park’s own notice wins over its badge');
});

test('3. the evidence is built only from listing data: listed, doesn’t say, says no (EN + FR)', () => {
  const p = plan([{ day: 1, stops: DAY1() }, { day: 2, stops: [stop('morning', 3, 'Falls Stairs Trail', 'outdoor'), stop('midday', 4, 'Ramp Bistro Two', 'restaurant', ['dog_friendly'])] }]);
  H.applyEvidence(p, ctx);
  const a = ev(p, 'accessible');
  assert.deepEqual(a.stops.map((s) => [s.id, s.has]), [[1, true], [4, true], [2, null], [5, null], [3, false], [4, true]]);
  assert.equal(a.status, 'partial');
  assert.equal(a.who, 'one');
  assert.match(a.text, /^For your wheelchair user, from each listing’s own notes: Paved Lake Path \(“Wide, flat, paved 6\.8 km path; wheelchair accessible”\), Ramp Bistro and Ramp Bistro Two list it\./);
  assert.match(a.text, /Falls Stairs Trail \(“Several bridge crossings and steep stairs at the falls”\): its listing says that, so it doesn’t suit a wheelchair as listed\./);
  assert.match(a.text, /Easy Meadow Trail and Quiet Diner don’t say: ask before you go\. An “easy” walk isn’t counted as accessible unless its listing says so\.$/);
  assert.match(a.textFr, /^Pour la personne en fauteuil roulant, d’après les notes de chaque fiche :/);
  assert.match(a.textFr, /Easy Meadow Trail et Quiet Diner ne le précisent pas : demandez avant d’y aller\./);
  // "Easy walk" is met by the easy trail and says nothing about access; the easy trail is not counted as accessible.
  assert.equal(ev(p, 'kind:easy_walk').status, 'verified');
  assert.equal(a.stops.find((s) => s.id === 2).has, null);
  // The dog at every stop: the park whose own line bans dogs is a no and is named with its line.
  const d = ev(p, 'dog_friendly');
  assert.equal(d.stops.find((s) => s.id === 2).has, false);
  assert.match(d.text, /Easy Meadow Trail’s listing says “Dogs are not permitted”/);
  // The requirement the planner used to leave as "cannot verify" follows the evidence.
  assert.equal(p.requirementResults.find((r) => r.kind === 'unsupported').reason, a.text);
  // Nothing listed anywhere: unknown, never "not accessible".
  const q = plan([{ day: 1, stops: [stop('morning', 2, 'Easy Meadow Trail', 'outdoor'), stop('midday', 5, 'Quiet Diner', 'restaurant')] }]);
  H.applyEvidence(q, ctx);
  assert.equal(ev(q, 'accessible').status, 'unknown');
  assert.doesNotMatch(ev(q, 'accessible').text, /not accessible|isn’t accessible|list it\./);
  // A plan with no needs has none of these entries.
  const plain = plan([{ day: 1, stops: DAY1() }], { needs: [] });
  H.applyEvidence(plain, ctx);
  assert.equal(ev(plain, 'accessible'), undefined);
  assert.equal(plain.thinDays, undefined);
});

test('4. the place to stay: from stay_info only (accessible true / false / null; pets yes / some / null)', () => {
  const stay = (needFacts) => ({ pick: { id: 9, name: 'Test Inn', needFacts } });
  const run = (needFacts) => { const p = plan([{ day: 1, stops: DAY1() }], { whereToStay: stay(needFacts) }); H.applyEvidence(p, ctx); return p; };
  let p = run({ accessible: true, pets: 'some' });
  assert.equal(ev(p, 'stay:accessible').status, 'verified');
  assert.match(ev(p, 'stay:accessible').text, /^Place to stay: Test Inn’s listing says it has accessible rooms\. It doesn’t say which rooms .*ask for an accessible room when you book\.$/);
  assert.equal(ev(p, 'stay:pets').status, 'partial');
  assert.match(ev(p, 'stay:pets').text, /pets are welcome in some rooms only: ask for a pet-friendly room when you book\.$/);
  p = run({ accessible: null, pets: null });
  assert.equal(ev(p, 'stay:accessible').status, 'unknown');
  assert.match(ev(p, 'stay:accessible').text, /doesn’t say whether it has accessible rooms: ask before you book\.$/);
  assert.equal(ev(p, 'stay:pets').status, 'unknown');
  p = run({ accessible: false, pets: 'yes' });
  assert.equal(ev(p, 'stay:accessible').status, 'unmet');
  assert.equal(ev(p, 'stay:pets').status, 'verified');
  assert.match(ev(p, 'stay:accessible').textFr, /indique qu’il n’y a pas de chambre accessible/);
});

test('5. the handoff: each button’s record is read from its own URL, and the note is worded from it', () => {
  const t = { arrive: '2027-01-16', leave: '2027-01-17', adults: 2, rooms: 1, dog: true, stayStatus: 'confirmed' };
  const p = sbl.tripParams(t), cfg = { id: 'okanaganroam' };
  const bc = sbl.bookingComUrl('https://www.booking.com/hotel/ca/test-inn.html', p).toString();
  const btn = (key, url) => ({ key, short: sbl.LABELS[key].short, shortFr: sbl.LABELS[key].shortFr, url });
  const viaStay22 = btn('booking_com', sbl.stay22Wrap('booking', bc, p, cfg));
  const expedia = btn('expedia', sbl.expediaUrl('https://www.expedia.ca/Vernon-Hotels-Test-Inn.h123.Hotel-Information', p).toString());
  const expediaNoDates = btn('expedia', sbl.expediaUrl('https://www.expedia.ca/Vernon-Hotels-Test-Inn.h123.Hotel-Information', sbl.tripParams({ adults: 2 })).toString());
  const own = btn('own', 'https://www.choicehotels.com/en-ca/british-columbia/vernon/quality-inn-hotels/cn661');
  const h = sbl.stayHandoff([viaStay22, expedia, expediaNoDates, own], t);
  assert.deepEqual(h.map((x) => x.key), ['booking_com', 'expedia', 'expedia', 'own']);
  assert.deepEqual(h[0].carries, { dates: true, adults: true, children: false, ages: false, rooms: true, pets: false });
  assert.equal(h[0].note, 'Booking.com opens with your dates, 2 adults and 1 room.');
  assert.equal(h[0].noteFr, 'Booking.com s’ouvre avec vos dates, 2 adultes et 1 chambre.');
  assert.equal(h[1].note, 'Expedia opens with your dates, 2 adults and 1 room.');
  // Expedia shows the party only once the link has dates: with none, nothing counts as carried.
  assert.deepEqual(h[2].carries, { dates: false, adults: false, children: false, ages: false, rooms: false, pets: false });
  assert.equal(h[2].note, 'Expedia opens the hotel’s page without your dates or guests: enter Sat, Jan 16 → Sun, Jan 17, 2 adults and 1 room there.');
  assert.deepEqual(h[3].carries, { dates: false, adults: false, children: false, ages: false, rooms: false, pets: false });
  assert.equal(h[3].note, 'The hotel’s own site can’t be pre-filled: enter Sat, Jan 16 → Sun, Jan 17, 2 adults, 1 room and your dog there.');
  assert.equal(h[3].noteFr, 'Le site de l’hôtel ne peut pas être prérempli : entrez-y sam. 16 janv. → dim. 17 janv., 2 adultes, 1 chambre et votre chien.');
  // The record follows the URL, not the intent: the same Booking.com button with its dates taken out no longer carries them.
  const stripped = new URL(viaStay22.url); stripped.searchParams.delete('checkin'); stripped.searchParams.delete('checkout');
  const s = sbl.stayHandoff([{ ...viaStay22, url: stripped.toString() }], t)[0];
  assert.equal(s.carries.dates, false);
  assert.equal(s.note, 'Booking.com opens with 2 adults and 1 room. Enter Sat, Jan 16 → Sun, Jan 17 there.');
  // Before the dates are confirmed no date is named as sent.
  assert.equal(sbl.stayHandoff([own], { ...t, stayStatus: 'proposed' })[0].note, 'The hotel’s own site can’t be pre-filled: enter your dates, 2 adults, 1 room and your dog there.');
  // Children: carried with their ages, or the note says to enter them.
  const kids = { ...t, kids: 2, kidAges: [6, 9], dog: false };
  const kb = btn('booking_com', sbl.stay22Wrap('booking', sbl.bookingComUrl('https://www.booking.com/hotel/ca/test-inn.html', sbl.tripParams(kids)).toString(), sbl.tripParams(kids), cfg));
  assert.equal(sbl.stayHandoff([kb], kids)[0].note, 'Booking.com opens with your dates, 2 adults, 2 kids and 1 room.');
  const noAges = { ...kids, kidAges: null };
  const kb2 = btn('booking_com', sbl.stay22Wrap('booking', sbl.bookingComUrl('https://www.booking.com/hotel/ca/test-inn.html', sbl.tripParams(noAges)).toString(), sbl.tripParams(noAges), cfg));
  assert.equal(sbl.stayHandoff([kb2], noAges)[0].note, 'Booking.com opens with your dates, 2 adults, 2 kids and 1 room. Enter the kids’ ages there.');
  // Pets and an accessible room are never passed to any provider.
  assert.ok(h.every((x) => x.carries.pets === false));
  assert.equal(sbl.stayHandoffAsk({ dog: true, wheelchair: true }).text, 'Tell the hotel about your dog and ask for an accessible room when you book.');
  assert.equal(sbl.stayHandoffAsk({ dog: true, wheelchair: true }).textFr, 'Avisez l’hôtel de votre chien et demandez une chambre accessible en réservant.');
  assert.equal(sbl.stayHandoffAsk({}), null);
  // "Carry these dates" is true only when every visible link does.
  assert.equal(sbl.stayAllCarryDates(sbl.stayHandoff([viaStay22, expedia], t)), true);
  assert.equal(sbl.stayAllCarryDates(sbl.stayHandoff([viaStay22, own], t)), false);
  assert.equal(sbl.stayAllCarryDates([]), false);
});

test('6. the page: the false "carry these dates" line is gone; the stay line is worded from the links on screen', () => {
  for (const src of [V3, V4, CHAT_PAGE]) assert.doesNotMatch(src, /Booking links carry these dates|booking links now carry these dates|Les liens de réservation portent ces dates/);
  assert.match(V3, /function t3Handoff\(s, t\)/);
  assert.match(V3, /line = \(s && t3HandoffText\(s, t, fr\)\)/);
  assert.match(V3, /The hotel’s own site can’t be pre-filled: you’ll enter these dates there\./);
  assert.ok(V3.includes("require('./stay-booking-links').HANDOFF_CLIENT_SRC") && sbl.HANDOFF_CLIENT_SRC.includes('function stayLinkCarries(key, url)') && sbl.HANDOFF_CLIENT_SRC.includes('function stayHandoffNote(link, c, t, fr)'), 'the page reads the links with the server’s own functions');
  assert.match(V3, /if \(s\.handoffAsk\) bits\.push/);
  assert.match(CHAT_PAGE, /data-v4-handoff-ask/);
  // The thin-day line and its one-tap steps (through the chat).
  assert.match(V4, /function v4ThinHtml\(p, day, fr\)/);
  assert.match(V4, /\.slice\(0, 2\)\.filter\(function\(n\)\{ return n && n\.message && n\.label; \}\)/);
  assert.match(CHAT_PAGE, /t\.closest\('\[data-v4-say\]'\)/);
  // The shared link carries the needs.
  assert.match(V4, /out \+= '&nw=1'/);
  assert.match(V4, /out \+= '&thin=' \+ thin\.join\(','\)/);
});

test('7. a thin day is said with a true reason and next steps; the summary carries the need (EN + FR)', () => {
  const p = plan([{ day: 1, stops: DAY1() }, { day: 2, stops: [{ daypart: 'morning', label: 'Morning', venue: null, reasons: [], caveats: [] }, stop('midday', 4, 'Ramp Bistro Two', 'restaurant', ['dog_friendly'])] }],
    { warnings: ['No matching activity fits the morning on day 2; that time is left free rather than adding a meal.'] });
  H.applyEvidence(p, { ...ctx, thin: () => ({ kindLabel: 'easy walks', kindLabelFr: 'promenades faciles', kindOne: 'an easy walk', town: 'Vernon', fit: 2, used: 2, accessUnknown: 3, nearby: { name: 'Paved Bay Trail', town: 'Coldstream', km: 9 } }) });
  assert.equal(p.thinDays.length, 1);
  const t = p.thinDays[0];
  assert.deepEqual([t.day, t.stops], [2, 1]);
  assert.deepEqual(t.reason, ['no_match', 'last_day', 'dog', 'used', 'wheelchair']);
  assert.equal(t.text, 'Only lunch is planned on day 2 for now: the other listed easy walks in Vernon don’t say if they’re wheelchair accessible.');
  assert.equal(t.textFr, 'Seul le dîner est prévu le jour 2 pour l’instant : les autres fiches (promenades faciles) à Vernon ne précisent pas l’accès en fauteuil roulant.');
  assert.deepEqual(t.next.map((n) => [n.label, n.message]), [['Look nearby', 'Add an easy walk in Coldstream on day 2'], ['Keep day 2 light', 'Keep day 2 light']]);
  assert.equal(t.next[0].detail, 'Paved Bay Trail, Coldstream (about 9 km away)');
  assert.ok(t.next.length <= 2);
  // Without the listings' help the line says only what the plan shows.
  const q = plan([{ day: 1, stops: DAY1() }, { day: 2, stops: [{ daypart: 'morning', venue: null, reasons: [], caveats: [] }] }], { needs: [] });
  H.applyEvidence(q, ctx);
  assert.equal(q.thinDays[0].text, 'Nothing is planned on day 2 yet: nothing else listed fit your request that day.');
  // A full plan has no thin day; a one-stop day that was not a failed search is left alone.
  const full = plan([{ day: 1, stops: DAY1() }, { day: 2, stops: [stop('morning', 1, 'Paved Lake Path Two', 'outdoor'), stop('midday', 4, 'Ramp Bistro Two', 'restaurant')] }]);
  H.applyEvidence(full, ctx);
  assert.equal(full.thinDays, undefined);
  // No walk left in the plan: "Easy walk" is not shown as met.
  const noWalk = plan([{ day: 1, stops: [stop('midday', 4, 'Ramp Bistro', 'restaurant', ['dog_friendly'])] }]);
  H.applyEvidence(noWalk, ctx);
  assert.equal(ev(noWalk, 'kind:easy_walk').status, 'unmet');
  assert.ok(!L.tripSummaryFacts(noWalk, false, {}).some((f) => /^Easy walk ✓/.test(f.text)));
  // The summary: the need is its own flagged item, counted from the listings.
  const facts = L.tripSummaryFacts(p, false, {}).map((f) => `${f.kind}|${f.text}`);
  assert.ok(facts.includes('flag|Wheelchair access: 3 of 5 stops list it · 2 don’t say'), facts.join('\n'));
  assert.ok(L.tripSummaryFacts(p, true, {}).some((f) => f.kind === 'flag' && f.text === 'Accès en fauteuil roulant : 3 des 5 arrêts l’indiquent · 2 ne le précisent pas'));
  const none = plan([{ day: 1, stops: [stop('morning', 2, 'Easy Meadow Trail', 'outdoor'), stop('midday', 5, 'Quiet Diner', 'restaurant')] }]);
  H.applyEvidence(none, ctx);
  assert.ok(L.tripSummaryFacts(none, false, {}).some((f) => f.kind === 'flag' && f.text === 'Wheelchair access: none of the 2 stops say'));
  const all = plan([{ day: 1, stops: [stop('morning', 1, 'Paved Lake Path', 'outdoor'), stop('midday', 4, 'Ramp Bistro', 'restaurant')] }]);
  H.applyEvidence(all, ctx);
  assert.ok(L.tripSummaryFacts(all, false, {}).some((f) => f.kind === 'ok' && f.text === 'Wheelchair access: listed at all 2 ✓'));
  // The stay's items word themselves.
  const st = plan([{ day: 1, stops: DAY1() }], { whereToStay: { pick: { id: 9, name: 'Test Inn', needFacts: { accessible: true, pets: 'some' } } } });
  H.applyEvidence(st, ctx);
  const sf = L.tripSummaryFacts(st, false, {}).map((f) => `${f.kind}|${f.text}`);
  assert.ok(sf.includes('ok|Stay lists accessible rooms ✓') && sf.includes('flag|Dog at the stay: some rooms only'), sf.join('\n'));
});

test('8. the shared link: the needs, their caveats, the handoff note and the thin-day line travel; an old link reads as before', () => {
  const c = H.parseShareContext({ asks: 'kind:easy_walk,dog_friendly,accessible,stay:accessible,stay:pets', nw: '1', thin: '2', ad: '2' });
  assert.deepEqual(c.asks, ['kind:easy_walk', 'dog_friendly', 'accessible', 'stay:accessible', 'stay:pets']);
  assert.equal(c.wheelOne, true);
  assert.deepEqual(c.thin, [2]);
  assert.deepEqual(H.parseShareContext(Object.fromEntries(new URLSearchParams(H.shareContextQuery(c)))), c);
  assert.equal(H.parseShareContext({ nw: 'x', thin: '<b>' }), null);
  const sp = H.sharedPlan(c, [{ id: 1, name: 'Paved Lake Path', type: 'outdoor', day: 1, start: 600, kinds: ['walk', 'easy_walk'] }, { id: 5, name: 'Quiet Diner', type: 'restaurant', day: 2, start: 690, kinds: [] }], [], { id: 9, name: 'Test Inn', regionLabel: 'Vernon', has: [], needFacts: { accessible: true, pets: 'some' } });
  assert.deepEqual(sp.needs.map((n) => [n.key, n.who]), [['wheelchair', 'one'], ['dog', 'all']]);
  H.applyEvidence(sp, ctx);
  assert.deepEqual(ev(sp, 'accessible').stops.map((s) => s.has), [true, null]);
  assert.equal(ev(sp, 'stay:accessible').status, 'verified');
  assert.equal(ev(sp, 'stay:pets').status, 'partial');
  assert.equal(sp.thinDays[0].day, 2);
  assert.match(sp.thinDays[0].text, /^Only lunch is planned on day 2 for now: /);
  assert.deepEqual(H.shareAsks(sp).filter((a) => /access|pets|dog/.test(a)).sort(), ['accessible', 'dog_friendly', 'stay:accessible', 'stay:pets']);
  // An older link (no needs in its asks) has no needs, no thin days and no new entries.
  const old = H.sharedPlan(H.parseShareContext({ asks: 'gluten_free,stay:pool', ad: '6' }), [{ id: 5, name: 'Quiet Diner', type: 'restaurant', day: 1, start: 690, kinds: [] }], [], { id: 9, name: 'Test Inn', regionLabel: 'Vernon', has: ['pool'] });
  H.applyEvidence(old, ctx);
  assert.equal(old.needs, undefined);
  assert.equal(old.thinDays, undefined);
  assert.deepEqual(old.evidence.map((e) => e.ask), ['gluten_free', 'stay:pool']);
});

test('9. through the planner: the exact request carries its needs and says what the listings say; other requests are as before', () => {
  const app = require('../server.js');
  const run = (text, stay = null) => app.runTripPlanRequest({ ...app.parseTripPlanBody({ text, ...(stay ? { stay } : {}) }, { v4: true, stays: true }).value, v4: true }, true);
  const p = run(ASK);
  assert.deepEqual((p.needs || []).map((n) => [n.key, n.who]), [['wheelchair', 'one'], ['dog', 'all']]);
  assert.equal(p.needs[0].phrase, 'One of us uses a wheelchair');
  const a = ev(p, 'accessible');
  assert.ok(a, 'the plan says what the listings say about wheelchair access');
  // Every yes is the listing's own data; nothing is called accessible without it.
  for (const s of a.stops) assert.equal(s.has, app.tripAccessOf(s.id).has === true ? true : app.tripAccessOf(s.id).has === false ? false : null, s.name);
  assert.ok(!(p.warnings || []).some((w) => /^Wheelchair access isn’t listed on /.test(w)));
  assert.ok(!((p.understood && p.understood.notUsed) || []).some((u) => /wheelchair/i.test(u)), 'the need is no longer "not used"');
  assert.ok(L.tripSummaryFacts(p, false, {}).some((f) => /^Wheelchair access: /.test(f.text)), 'the summary shows the need as its own item');
  assert.ok(ev(p, 'dog_friendly'));
  const w = p.whereToStay;
  if (w && w.pick) {
    assert.ok(ev(p, 'stay:accessible') && ev(p, 'stay:pets'));
    assert.deepEqual(w.pick.needFacts, app.tripStayNeedFacts(w.pick.id));
    assert.equal(ev(p, 'stay:accessible').status, w.pick.needFacts.accessible === true ? 'verified' : w.pick.needFacts.accessible === false ? 'unmet' : 'unknown');
    assert.equal(w.pick.handoff.length, (w.pick.bookingLinks || []).length);
    for (const [i, h] of w.pick.handoff.entries()) assert.deepEqual(h.carries, sbl.stayLinkCarries(w.pick.bookingLinks[i].key, w.pick.bookingLinks[i].url));
    // The dates are only proposed: no link carries one, and no note says it does.
    assert.ok(w.pick.handoff.every((h) => !h.carries.dates && !/opens with your dates/.test(h.note)));
    assert.equal(w.pick.handoffAsk.text, 'Tell the hotel about your dog and ask for an accessible room when you book.');
  }
  // A re-plan of the same request (a confirmed stay) keeps the needs.
  const again = run(ASK, { arrive: '2027-01-16', leave: '2027-01-17' });
  assert.deepEqual((again.needs || []).map((n) => n.key), ['wheelchair', 'dog']);
  if (again.whereToStay && again.whereToStay.pick) for (const h of again.whereToStay.pick.handoff) assert.equal(/opens with your dates/.test(h.note), h.carries.dates, h.note);
  // Requests with no such need: no needs, no access entries, and only the per-link notes are new.
  for (const text of [`Plan a 3-day ${WR ? 'Whistler' : 'Kelowna'} weekend for 6 friends: two ${WR ? 'breweries' : 'wineries'}, gluten-free dining, easy walks, a hotel with a pool, and live music. One person does not drink.`,
    `Plan 2 days in ${WR ? 'Whistler' : 'Penticton'} on December 5–6, 2026 for two adults and kids aged 6 and 9. We want indoor activities, a kid-friendly lunch, a hotel with a pool and a relaxed pace.`]) {
    const q = run(text);
    assert.deepEqual(q.needs, [], text);
    assert.ok(!(q.evidence || []).some((e) => ['accessible', 'stay:accessible', 'stay:pets'].includes(e.ask)), text);
    const pick = q.whereToStay && q.whereToStay.pick;
    if (pick) { assert.equal(pick.handoffAsk, undefined); assert.equal(pick.needFacts, undefined); assert.equal(pick.handoff.length, (pick.bookingLinks || []).length); }
    assert.ok(!L.tripSummaryFacts(q, false, {}).some((f) => /Wheelchair|Dog at the stay|accessible rooms/.test(f.text)));
  }
});
