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
  // (2026-11-23) Both needs, accessible rooms and pet-friendly rooms: one flagged entry that asks the hotel to confirm
  // one room with both; never "accessible rooms ✓" beside a separate pets item.
  let p = run({ accessible: true, pets: 'some' });
  assert.equal(ev(p, 'stay:accessible').status, 'partial');
  assert.equal(ev(p, 'stay:accessible').both, true);
  assert.equal(ev(p, 'stay:accessible').text, 'Place to stay: Test Inn’s listing has accessible rooms and pet-friendly rooms, but doesn’t say one room is both: ask the hotel to confirm an accessible, dog-friendly room.');
  assert.match(ev(p, 'stay:accessible').textFr, /^Hébergement : la fiche de Test Inn indique des chambres accessibles et des chambres où les animaux sont acceptés, mais ne dit pas qu’une même chambre offre les deux : demandez à l’hôtel de confirmer une chambre accessible qui accepte les chiens\.$/);
  assert.equal(ev(p, 'stay:pets'), undefined, 'one entry, not two');
  assert.ok(H.shareAsks(p).includes('stay:accessible') && H.shareAsks(p).includes('stay:pets'), 'the shared link still carries both asks');
  p = run({ accessible: true, pets: 'yes' });
  assert.equal(ev(p, 'stay:accessible').both, true, 'pets welcome is not "this accessible room takes a dog" either');
  // One need only: the wording of that need, as before.
  const one = (needFacts, nd) => { const q = plan([{ day: 1, stops: DAY1() }], { whereToStay: stay(needFacts), needs: nd }); H.applyEvidence(q, ctx); return q; };
  p = one({ accessible: true, pets: 'some' }, [needs[0]]);
  assert.equal(ev(p, 'stay:accessible').status, 'verified');
  assert.match(ev(p, 'stay:accessible').text, /^Place to stay: Test Inn’s listing says it has accessible rooms\. It doesn’t say which rooms .*ask for an accessible room when you book\.$/);
  assert.equal(ev(p, 'stay:pets'), undefined);
  p = one({ accessible: true, pets: 'some' }, [needs[1]]);
  assert.equal(ev(p, 'stay:pets').status, 'partial');
  assert.match(ev(p, 'stay:pets').text, /pets are welcome in some rooms only: ask for a pet-friendly room when you book\.$/);
  assert.equal(ev(p, 'stay:accessible'), undefined);
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
  assert.ok(facts.includes('flag|Wheelchair access: 3 of 5 confirmed · 2 don’t say'), facts.join('\n'));
  assert.ok(L.tripSummaryFacts(p, true, {}).some((f) => f.kind === 'flag' && f.text === 'Accès en fauteuil roulant : 3 sur 5 confirmés · 2 non précisés'));
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
  assert.ok(sf.includes('flag|Stay: accessible + dog room to confirm') && !sf.some((x) => /Stay lists accessible rooms ✓|Dog at the stay/.test(x)), sf.join('\n'));
  const stW = plan([{ day: 1, stops: DAY1() }], { needs: [needs[0]], whereToStay: { pick: { id: 9, name: 'Test Inn', needFacts: { accessible: true, pets: 'some' } } } });
  H.applyEvidence(stW, ctx);
  assert.ok(L.tripSummaryFacts(stW, false, {}).some((f) => f.kind === 'ok' && f.text === 'Stay lists accessible rooms ✓'), 'a wheelchair need alone keeps its own item');
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
  assert.equal(ev(sp, 'stay:accessible').status, 'partial');
  assert.match(ev(sp, 'stay:accessible').text, /doesn’t say one room is both: ask the hotel to confirm an accessible, dog-friendly room\.$/);
  assert.equal(ev(sp, 'stay:pets'), undefined);
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
    assert.deepEqual(w.pick.needFacts, app.tripStayNeedFacts(w.pick.id));
    const both = A.stayBoth(p.needs, w.pick.needFacts);
    assert.ok(ev(p, 'stay:accessible') && (both || ev(p, 'stay:pets')));
    assert.equal(ev(p, 'stay:accessible').status, both ? 'partial' : w.pick.needFacts.accessible === true ? 'verified' : w.pick.needFacts.accessible === false ? 'unmet' : 'unknown');
    assert.equal(w.pick.handoff.length, (w.pick.bookingLinks || []).length);
    for (const [i, h] of w.pick.handoff.entries()) assert.deepEqual(h.carries, sbl.stayLinkCarries(w.pick.bookingLinks[i].key, w.pick.bookingLinks[i].url));
    // The dates are only proposed: no link carries one, and no note says it does.
    assert.ok(w.pick.handoff.every((h) => !h.carries.dates && !/opens with your dates/.test(h.note)));
    assert.equal(w.pick.handoffAsk.text, both ? 'Its listing has accessible rooms and pet-friendly rooms, but doesn’t say one room is both: ask the hotel to confirm an accessible, dog-friendly room.' : 'Tell the hotel about your dog and ask for an accessible room when you book.');
    // The manual-entry note for the hotel's own site stays, per link.
    for (const h of w.pick.handoff.filter((x) => x.key === 'own')) assert.match(h.note, /^The hotel’s own site can’t be pre-filled: enter .* and your dog there\.$/);
    // No stop is called confirmed unless its own words say wheelchair access for the place itself.
    for (const s of a.stops) { const lv = app.tripAccessOf(s.id).level; assert.equal(s.level, lv, s.name); assert.equal(s.has === true, lv === 'wheelchair', s.name); }
    if (a.stops.some((s) => s.level !== 'wheelchair')) { assert.notEqual(a.status, 'verified'); assert.ok(!L.tripSummaryFacts(p, false, {}).some((f) => /^Wheelchair access: .*✓/.test(f.text))); }
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

// ---- 2026-11-23: graded evidence (the owner's second report on the same Vernon trip) ----
// "The chat said 'all 3 activities list wheelchair access,' even though the explanation for BX Creek Wetland Boardwalk
// only said its Deleenheer Road access 'suits limited mobility.'"
const VERNON = {
  polson: 'Wheelchair-accessible playground; flat park trails',
  grey: 'Turtle Mtn Blvd to Davison Rd section is flat gravel, stroller and wheelchair OK',
  bx: 'Deleenheer Rd access suits limited mobility',
};
test('10. an Access line is graded from its own words: wheelchair, one section or feature, a mobility note, no, unknown', () => {
  const g = (line) => { const x = A.accessGrade(line); return [x.level, x.part || null]; };
  // The three Vernon notes.
  assert.deepEqual(g(VERNON.polson), ['wheelchair_part', 'playground']);
  assert.deepEqual(g(VERNON.grey), ['wheelchair_part', 'Turtle Mtn Blvd to Davison Rd section']);
  assert.equal(A.accessGrade(VERNON.grey).surface, 'gravel');
  assert.deepEqual(g(VERNON.bx), ['mobility', 'Deleenheer Rd access']);
  // Wheelchair for the place itself: no subject, or the place's own unnamed trail or path.
  for (const line of ['Wide, flat, paved 6.8 km path; wheelchair accessible', 'Flat, paved trail; wheelchair and scooter accessible', 'Flat; wheelchair, pram and bike friendly', '850 m paved pathway, wheelchair accessible; accessible playground', '1.8 km pathway is Rick Hansen accessibility certified', 'Easy, flat trail and washrooms are accessible']) assert.deepEqual(g(line), ['wheelchair', null], line);
  // A named section, entrance, building or feature: the part is kept.
  for (const [line, part] of [['Main trail is wheelchair accessible from the south lot', 'main trail from the south lot'], ['4th Street Beach Park to Lake Country Museum section is wheelchair and stroller friendly', '4th Street Beach Park to Lake Country Museum section'],
    ['Viewing platform is wheelchair accessible', 'viewing platform'], ['Trail has an accessible viewpoint over Okanagan Lake', 'viewpoint over Okanagan Lake'], ['600 m accessible path; with the Ditch Trail about 1.8 km', '600 m path'], ['Portions are wheelchair and stroller friendly', 'some portions'],
    ['Building fully wheelchair accessible; steeper upper trail rough for scooters', 'building'], ['Accessible parking stalls and wheelchair access to the dugouts', 'dugouts'], ['Rainbow Park has accessible paths to the lake and dock, with a swim lift', 'paths to the lake and dock']]) assert.deepEqual(g(line), ['wheelchair_part', part], line);
  // Broader or incomplete words: a mobility note, never wheelchair-confirmed.
  for (const line of ['Flat, easy trail', 'Paved shared-use path', 'Snowberry Loop is paved', 'Flat and popular with strollers', 'Wide, easy 400 m trail; stroller accessible', 'Packed gravel, mostly gentle grades', 'Mostly gravel, easy grade; paved at the north end', 'Continuous, minimal-grade corridor; gravel surface',
    'Over 3 km of gravel trails designed for accessibility', 'Finished surface is compacted aggregate, planned for universal mobility access', 'Forest trail then a boardwalk around the lake; 40 m gain']) { assert.equal(A.accessGrade(line).level, 'mobility', line); assert.equal(A.accessOf({ accessLine: line }).has, null, line); }
  assert.equal(A.accessGrade('Snowberry Loop is paved').part, 'Snowberry Loop');
  // Accessible said only of parking, a washroom or a picnic table is about the facilities, not the place.
  for (const line of ['2 accessible parking stalls and a universal washroom', 'Wheelchair accessible toilet on site', 'Wheelchair accessible facilities', 'Level paved roads; one flush toilet is wheelchair accessible', 'Handicapped parking spots at the lodge']) { const x = A.accessGrade(line); assert.deepEqual([x.level, !!x.amenity], ['mobility', true], line); assert.equal(A.accessRank(A.accessOf({ accessLine: line })), 0, line); }
  // Its own words say no.
  for (const line of ['Not wheelchair accessible', 'Boardwalk is not wheelchair accessible; alternate route to the lounge', 'Steep stairs up to the summit', 'Gravel, dirt and grass paths; not all mobility scooters manage', 'Gentle old road, then steeper single-track; not stroller friendly', 'Flat and wide from the lake; stairs and gains through Scenic Canyon']) assert.equal(A.accessGrade(line).level, 'no', line);
  // Nothing said: "easy" alone is not access; an adaptive bike trail and a paved road are not a path for a wheelchair.
  for (const line of ['', 'Easy trails, 860 m total', 'Gravel-surfaced path, rated easy', 'Includes an adaptive mountain bike trail', 'Road paved to the upper lot, then 500 m unpaved to the summit', 'Restricted-access road to Divide Lake, listed as easy', 'Wide gravel path, unpaved, slight elevation change']) assert.equal(A.accessGrade(line).level, 'unknown', line);
  // accessOf: has is true only for 'wheelchair'; the owner's own answer is a yes unless the line says no.
  assert.deepEqual([A.accessOf({ accessLine: VERNON.polson }).has, A.accessOf({ accessLine: VERNON.bx }).has, A.accessOf({ ownerAccessible: true, accessLine: VERNON.bx }).level, A.accessOf({ ownerAccessible: true, accessLine: 'Stairs only' }).level], [null, null, 'wheelchair', 'no']);
  // Picking: confirmed, then a part, then a mobility note, then nothing said; a "no" is below all.
  assert.deepEqual([ACCESS[1], { accessLine: VERNON.grey }, { accessLine: VERNON.bx }, {}, ACCESS[3]].map((d) => A.accessRank(A.accessOf(d))), [3, 2, 1, 0, -1]);
  // Every distinct Access line in this site's data gets one of the five levels, and a part only with a partial level.
  const facts = JSON.parse(fs.readFileSync(require.resolve('../data/outdoor-facts.json'), 'utf8'));
  for (const f of Object.values(facts)) { if (!f || typeof f.accessibility !== 'string') continue; const x = A.accessGrade(f.accessibility); assert.ok(['wheelchair', 'wheelchair_part', 'mobility', 'no', 'unknown'].includes(x.level), f.accessibility); if (x.part) assert.ok(['wheelchair_part', 'mobility'].includes(x.level), f.accessibility); if (/limited mobility|stroller/i.test(f.accessibility) && !/wheel ?chair/i.test(f.accessibility)) assert.notEqual(x.level, 'wheelchair', f.accessibility); }
});

test('11. the Vernon plan: nothing is "confirmed" from a section, a feature or a mobility note (summary, Details, cards; EN + FR)', () => {
  const AC = { 11: { accessLine: VERNON.polson }, 12: { accessLine: VERNON.grey }, 13: { accessLine: VERNON.bx }, 14: {}, 15: {}, 16: {} };
  const DG = { 11: { badge: true, type: 'outdoor' }, 12: { dogLine: 'Dogs allowed on all sections, on leash', badge: true, type: 'outdoor' }, 13: { dogLine: 'Dogs allowed on leash only (Deleenheer Rd section)', badge: true, type: 'outdoor' }, 14: { badge: true, type: 'restaurant' }, 15: { badge: true, type: 'restaurant' }, 16: { badge: true, type: 'restaurant' } };
  const c2 = { accessOf: (id) => A.accessOf(AC[id] || {}), dogOf: (id) => A.dogOf(DG[id] || {}), kindsOf: (id) => (id <= 13 ? ['walk', 'easy_walk'] : []) };
  const days = () => [{ day: 1, date: '2027-01-16', stops: [stop('morning', 11, 'Polson Park', 'outdoor', ['dog_friendly']), stop('midday', 14, 'Roster Sports Club', 'restaurant', ['dog_friendly']), stop('afternoon', 12, 'Grey Canal Trail', 'outdoor', ['dog_friendly']), stop('evening', 15, 'Kelly O’Bryan’s', 'restaurant', ['dog_friendly'])] },
    { day: 2, date: '2027-01-17', stops: [stop('morning', 13, 'BX Creek Wetland Boardwalk', 'outdoor', ['dog_friendly']), stop('midday', 16, 'MR MIKES', 'restaurant', ['dog_friendly'])] }];
  const p = plan(days(), { whereToStay: { pick: { id: 9, name: 'Quality Inn', needFacts: { accessible: true, pets: 'some' } } } });
  H.applyEvidence(p, c2);
  const a = ev(p, 'accessible');
  assert.deepEqual(a.stops.map((s) => [s.id, s.level, s.has, s.part || null]), [[11, 'wheelchair_part', null, 'playground'], [14, 'unknown', null, null], [12, 'wheelchair_part', null, 'Turtle Mtn Blvd to Davison Rd section'], [15, 'unknown', null, null], [13, 'mobility', null, 'Deleenheer Rd access'], [16, 'unknown', null, null]]);
  assert.equal(a.status, 'partial');
  assert.doesNotMatch(a.text, /list it\.|lists it\./, 'no stop "lists it"');
  assert.equal(a.text, 'For your wheelchair user, from each listing’s own notes: None is fully confirmed. Polson Park: “Wheelchair-accessible playground; flat park trails”. Only the playground is covered: check the rest. Grey Canal Trail: “Turtle Mtn Blvd to Davison Rd section is flat gravel, stroller and wheelchair OK”. Only the Turtle Mtn Blvd to Davison Rd section is covered: check the rest. BX Creek Wetland Boardwalk: “Deleenheer Rd access suits limited mobility”. No mention of wheelchairs: check the surface and width. Roster Sports Club, Kelly O’Bryan’s and MR MIKES don’t say: ask before you go. An “easy” walk isn’t counted as accessible unless its listing says so.');
  assert.match(a.textFr, /Aucun n’est entièrement confirmé\. Polson Park : « Wheelchair-accessible playground; flat park trails »\. Seul ceci est couvert : playground; vérifiez le reste\./);
  assert.match(a.textFr, /BX Creek Wetland Boardwalk : « Deleenheer Rd access suits limited mobility »\. Aucune mention des fauteuils roulants : vérifiez la surface et la largeur\./);
  // The cards: a short note for the collapsed card (only the affected stops), and the opened card's line for every stop.
  // (2026-11-23, card caveats: every stop has its note now; a stop whose listing says nothing is "check ahead".)
  assert.deepEqual(a.stops.map((s) => s.note || null), ['Wheelchair: playground only', 'Wheelchair access: check ahead', 'Wheelchair: Turtle Mtn Blvd to Davison Rd section only', 'Wheelchair access: check ahead', 'Access: Deleenheer Rd access · check ahead', 'Wheelchair access: check ahead']);
  assert.equal(a.stops[4].noteFr, 'Accès : Deleenheer Rd access · à vérifier');
  assert.equal(a.stops[4].more, 'Wheelchair access: “Deleenheer Rd access suits limited mobility”. No mention of wheelchairs: check the surface and width.');
  assert.equal(a.stops[1].more, 'Wheelchair access: its listing doesn’t say: ask before you go.');
  // The dog: a trail's own line with its condition; a restaurant's badge says neither inside nor patio; a January trip
  // says a patio may be closed.
  const d = ev(p, 'dog_friendly');
  assert.deepEqual(d.stops.map((s) => s.where || null), [null, 'unsaid', 'outdoors', 'unsaid', 'outdoors', 'unsaid']);
  assert.equal(d.status, 'partial');
  assert.equal(d.text, 'Dog: Polson Park, Grey Canal Trail (“Dogs allowed on all sections, on leash”) and BX Creek Wetland Boardwalk (“Dogs allowed on leash only (Deleenheer Rd section)”) are listed as allowing dogs. Roster Sports Club, Kelly O’Bryan’s and MR MIKES have the Dog-Friendly badge; their listings don’t say if dogs can come inside or only on a patio (a patio may be closed in January): ask before you go.');
  assert.match(d.textFr, /ont le badge Chiens admis; leurs fiches ne disent pas si les chiens peuvent entrer ou seulement aller sur une terrasse \(une terrasse peut être fermée en janvier\) : demandez avant d’y aller\.$/);
  assert.doesNotMatch(d.text, /dogs welcome/i);
  assert.equal(d.stops[1].more, 'Dog: has the Dog-Friendly badge; its listing doesn’t say if dogs can come inside or only on a patio (a patio may be closed in January): ask before you go.');
  // The summary: short flagged items, never a ✓ for the access or the dog.
  const facts = L.tripSummaryFacts(p, false, {}).map((f) => `${f.kind}|${f.text}`);
  assert.deepEqual(facts.filter((f) => /Wheelchair|Dog|Stay/.test(f)), ['flag|Dog-friendly: 3 walks yes · 3 badges to confirm', 'flag|Wheelchair access: none fully confirmed · 3 partial notes · 3 don’t say', 'flag|Stay: accessible + dog room to confirm']);
  const factsFr = L.tripSummaryFacts(p, true, {}).map((f) => f.text);
  assert.ok(factsFr.includes('Chiens admis : 3 sorties oui · 3 badges à confirmer') && factsFr.includes('Accès en fauteuil roulant : aucun confirmé · 3 notes partielles · 3 non précisés') && factsFr.includes('Hébergement : chambre accessible + chien à confirmer'), factsFr.join('\n'));
  for (const f of facts) assert.ok(f.length <= 80, f);
  // A removed stop no longer counts.
  assert.ok(L.tripSummaryFacts(p, false, { removed: { 13: 1 } }).some((f) => f.text === 'Wheelchair access: none fully confirmed · 2 partial notes · 3 don’t say'));
  // A summer trip says nothing about patios; an undated one whose request says winter says "in winter".
  const july = plan(days().map((x) => ({ ...x, date: x.date.replace('2027-01', '2027-07') })));
  H.applyEvidence(july, c2);
  assert.doesNotMatch(ev(july, 'dog_friendly').text, /patio may be closed/);
  const undated = plan(days().map((x) => ({ day: x.day, stops: x.stops })), { query: 'a winter weekend in Vernon with our dog' });
  H.applyEvidence(undated, c2);
  assert.match(ev(undated, 'dog_friendly').text, /\(a patio may be closed in winter\)/);
  assert.deepEqual([A.coldSeason('2027-01-16'), A.coldSeason('2026-11-30').en, A.coldSeason('2027-04-01'), A.coldSeason(null, 'two days in July')], [{ en: 'January', fr: 'janvier' }, 'November', null, null]);
  // The shared copy works the same things out again from the listings.
  const c = H.parseShareContext({ asks: H.shareAsks(p).join(','), nw: '1', ad: '2', td: '2027-01-16_2027-01-17', ts: 'r' });
  const sp = H.sharedPlan(c, [[11, 'Polson Park', 'outdoor', 1], [14, 'Roster Sports Club', 'restaurant', 1], [12, 'Grey Canal Trail', 'outdoor', 1], [15, 'Kelly O’Bryan’s', 'restaurant', 1], [13, 'BX Creek Wetland Boardwalk', 'outdoor', 2], [16, 'MR MIKES', 'restaurant', 2]].map(([id, name, type, day]) => ({ id, name, type, day, start: 600, kinds: id <= 13 ? ['walk', 'easy_walk'] : [], badges: [{ key: 'dog_friendly' }] })), [], { id: 9, name: 'Quality Inn', regionLabel: 'Vernon', has: [], needFacts: { accessible: true, pets: 'some' } });
  H.applyEvidence(sp, c2);
  assert.equal(ev(sp, 'accessible').text, a.text);
  assert.equal(ev(sp, 'dog_friendly').text, d.text);
  assert.equal(ev(sp, 'stay:accessible').text, ev(p, 'stay:accessible').text);
});

test('12. a dog: the badge at a place with an indoors is not "dogs welcome"; the listing’s own words are', () => {
  assert.deepEqual(A.dogOf({ badge: true, type: 'restaurant' }), { has: true, says: null, source: 'badge', where: 'unsaid' });
  assert.equal(A.dogOf({ badge: true, type: 'winery' }).where, 'unsaid');
  assert.equal(A.dogOf({ badge: true, type: 'outdoor' }).where, null, 'a park’s badge needs no "inside or patio"');
  assert.deepEqual(A.dogOf({ badge: true, type: 'pub', ownLine: 'Dogs welcome on the patio only. Water bowls at the door.' }), { has: true, says: 'Dogs welcome on the patio only. Water bowls at the door.', source: 'owner', where: 'patio' });
  assert.equal(A.dogOf({ badge: true, type: 'brewery', ownLine: 'Dogs welcome inside and on the patio' }).where, 'inside');
  assert.equal(A.dogOf({ badge: true, type: 'cafe', ownLine: 'Dogs outside only' }).where, 'outside');
  assert.equal(A.dogOf({ badge: true, type: 'cafe', patioOnly: true, ownLine: 'Terrasse seulement' }).where, 'patio');
  assert.equal(A.dogOf({ badge: true, type: 'restaurant', ownLine: 'Leashed dogs welcome' }).where, 'stated');
  assert.deepEqual(A.dogOf({ dogLine: 'Dogs allowed on leash', badge: true, type: 'outdoor' }), { has: true, says: 'Dogs allowed on leash', source: 'line', where: 'outdoors' });
  assert.equal(A.dogOf({ dogLine: 'Dogs are not permitted', badge: true, type: 'outdoor' }).has, false);
  assert.equal(A.dogOf({ type: 'restaurant' }).has, null);
  // The plan's sentences for each.
  const DG = { 21: { badge: true, type: 'pub', ownLine: 'Dogs welcome on the patio only' }, 22: { badge: true, type: 'brewery', ownLine: 'Dogs welcome inside and on the patio' }, 23: { badge: true, type: 'restaurant' } };
  const c3 = { accessOf: () => A.accessOf({}), dogOf: (id) => A.dogOf(DG[id] || {}), kindsOf: () => [] };
  const p = plan([{ day: 1, date: '2027-01-16', stops: [stop('midday', 21, 'Patio Pub', 'pub', ['dog_friendly']), stop('afternoon', 22, 'Taproom', 'brewery', ['dog_friendly']), stop('evening', 23, 'Badge Bistro', 'restaurant', ['dog_friendly'])] }], { needs: [needs[1]] });
  H.applyEvidence(p, c3);
  const d = ev(p, 'dog_friendly');
  assert.equal(d.text, 'Dog: Taproom (“Dogs welcome inside and on the patio”) is listed as allowing dogs. Patio Pub: its listing says “Dogs welcome on the patio only” (a patio may be closed in January). Badge Bistro has the Dog-Friendly badge; its listing doesn’t say if dogs can come inside or only on a patio (a patio may be closed in January): ask before you go.');
  assert.ok(L.tripSummaryFacts(p, false, {}).some((f) => f.kind === 'flag' && f.text === 'Dog-friendly: 1 stop yes · 1 with limits · 1 badge to confirm'));
  // Every stop's own line says dogs can come: verified, and the summary's ✓.
  const allYes = plan([{ day: 1, stops: [stop('morning', 1, 'Paved Lake Path', 'outdoor', ['dog_friendly'])] }], { needs: [needs[1]] });
  H.applyEvidence(allYes, ctx);
  assert.equal(ev(allYes, 'dog_friendly').status, 'verified');
});

// ---- 2026-11-23: short caveats on every card (the owner's third report on the same Vernon trip) ----
// "The individual BX Ranch Trail card says 'A good walk with your dog' without indicating that wheelchair access is
// unknown. Restaurant cards show 'Dog-Friendly' without saying that indoor versus patio access is unconfirmed."
// The page's own functions, run here with small stand-ins for the page around them.
const WS_SRC = L.WORKSPACE_CLIENT_SRC;
const between = (src, from, to) => { const i = src.indexOf(from), j = src.indexOf(to, i + from.length); assert.ok(i >= 0 && j > i, `${from} … ${to}`); return src.slice(i, j); };
const escH = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// -> the card functions of the plan page, bound to one plan and language. timed: venue id -> a suggested-time note.
function cardKit(p, fr = false, timed = {}) {
  const src = [between(V4, '  function v4NeedLines(s){', '  // The expanded card\'s time:'), between(V4, '  function v4Badges(v, chipOff){', '  function v4Thumb(v){'), between(WS_SRC, '  function tripWorkspaceStopHtml(s,key,counts){', '  // An event on the plan is a card like any stop')].join('\n');
  const stubs = {
    state: { last: p, removed: {} }, lang: () => (fr ? 'fr' : 'en'), esc: escH, hrefAttr: (u) => `href="${escH(u)}"`,
    frLabel: (k, label) => (fr && label === 'Dog-Friendly' ? 'Chiens admis' : label), BADGE_KEYS: {}, vt: (k) => (k === 'dogsOk' ? 'Dogs OK' : k), v4Kind: (s) => (s.venue.type === 'restaurant' ? 'Lunch' : 'Outdoor Destination'), v4Price: () => '',
    v4Note: (s) => (timed[s.venue.id] ? { url: 'https://example.com/', html: `<p class="v4-note">${timed[s.venue.id]}</p>` } : null),
    t3WhyLines: (s) => s.why || [], placeUrl: () => '/x', t3BookSteps: () => [], v4Fallback: () => null, tripWorkspaceBooking: () => null, twText: (en, f) => (fr ? f : en), t3StepLinkHtml: () => '', t3StayExt: () => '',
    v4Thumb: () => '', v4Start: () => '10:15 AM', v4: { open: {} }, v4Details: () => '', v4TripBtn: () => '',
  };
  const names = Object.keys(stubs);
  return new Function(...names, `${src}\nreturn { v4NeedLines, v4NeedHtml, v4DirHtml, v4Badges, v4Line, tripWorkspaceStopHtml };`)(...names.map((n) => stubs[n]));
}
// The words of a card's own column (time, name, type line, notes, links), " | " between its parts.
const text = (html) => { const i = html.indexOf('<div class="tw-card-info">'), j = html.indexOf('<div class="v4-acts">'); return html.slice(i, j).replace(/<\/(?:p|span|button)>/g, ' | ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/(?:\| )+/g, '| ').replace(/\s*\|\s*$/, '').trim(); };

test('13. the short note: one function for every access level and every dog case (EN + FR), short enough for a phone', () => {
  const acc = (r, fr, c) => A.accessShort(r, fr, c);
  // Wheelchair, by level: never upgraded; unknown is "check ahead".
  const ACC = [
    [{ level: 'wheelchair' }, 'Wheelchair accessible per its listing', 'Accessible en fauteuil selon sa fiche'],
    [{ level: 'wheelchair_part', part: 'playground' }, 'Wheelchair: playground only', 'Fauteuil roulant : playground seulement'],
    [{ level: 'wheelchair_part', part: 'Turtle Mtn Blvd to Davison Rd section' }, 'Wheelchair: Turtle Mtn Blvd to Davison Rd section only', 'Fauteuil roulant : Turtle Mtn Blvd to Davison Rd section seulement'],
    [{ level: 'wheelchair_part' }, 'Wheelchair: in part only', 'Fauteuil roulant : en partie seulement'],
    [{ level: 'mobility', part: 'Deleenheer Rd access' }, 'Access: Deleenheer Rd access · check ahead', 'Accès : Deleenheer Rd access · à vérifier'],
    [{ level: 'mobility' }, 'Mobility note only · check ahead', 'Note de mobilité seulement · à vérifier'],
    [{ level: 'mobility', amenity: true }, 'Access: facilities only · check ahead', 'Accès : installations seulement · à vérifier'],
    [{ level: 'no' }, 'Not wheelchair accessible per its listing', 'Non accessible en fauteuil selon sa fiche'],
    [{ level: 'unknown' }, 'Wheelchair access: check ahead', 'Accès en fauteuil : à vérifier'],
    [{ has: null }, 'Wheelchair access: check ahead', 'Accès en fauteuil : à vérifier'],
  ];
  for (const [r, en, fr] of ACC) { assert.equal(acc(r, false), en); assert.equal(acc(r, true), fr); }
  assert.deepEqual([acc({ level: 'unknown' }, false, true), acc({ level: 'unknown' }, true, true), acc({ level: 'wheelchair' }, false, true), acc({ level: 'no' }, false, true)], ['Wheelchair: check ahead', 'Fauteuil : à vérifier', 'Wheelchair: yes per listing', 'Wheelchair: no per listing']);
  // Only a listing's own wheelchair words are a yes; everything else is still to check.
  assert.deepEqual(ACC.map(([r]) => A.accessOpen(r)), [false, true, true, true, true, true, true, true, true, true]);
  // The old name still answers for the two partial levels only.
  assert.deepEqual([A.accessStopNote({ level: 'mobility', part: 'Deleenheer Rd access' }, false), A.accessStopNote({ level: 'unknown' }, false)], ['Access: Deleenheer Rd access · check ahead', '']);
  // A dog: the listing's own condition, short; the badge alone at a place with an indoors; nothing; a no.
  const dog = (d, fr, c) => A.dogShort(A.dogOf(d), fr, c);
  const DOG = [
    [{ dogLine: 'Dogs allowed, on leash only', type: 'outdoor' }, 'Dogs: on leash only', 'Chiens : en laisse seulement'],
    [{ dogLine: 'Dogs allowed on leash', type: 'outdoor' }, 'Dogs: on leash', 'Chiens : en laisse'],
    [{ dogLine: 'Dogs allowed on leash only (Deleenheer Rd section)', type: 'outdoor' }, 'Dogs: on leash only, Deleenheer Rd section', 'Chiens : on leash only, Deleenheer Rd section'],
    [{ dogLine: 'Dogs allowed on all sections, on leash', type: 'outdoor' }, 'Dogs: on all sections, on leash', 'Chiens : on all sections, on leash'],
    [{ dogLine: 'No dogs on the boardwalk', type: 'outdoor' }, 'No dogs on the boardwalk', 'No dogs on the boardwalk'],
    [{ dogLine: 'On leash Oct 1 to Mar 31; no dogs Apr 1 to Sep 30', badge: true, type: 'beach' }, 'Dogs: on leash Oct 1 to Mar 31 · limits apply', 'Chiens : on leash Oct 1 to Mar 31 · avec limites'],
    [{ dogLine: 'Leashed dogs OK, but not on bike trails or in jump, skills, drop or pump zones', type: 'outdoor' }, 'Dogs: on leash · limits apply', 'Chiens : en laisse · avec limites'],
    [{ badge: true, type: 'pub', ownLine: 'Dogs welcome on the patio only. Water bowls at the door.' }, 'Dogs: patio only', 'Chiens : terrasse seulement'],
    [{ badge: true, type: 'cafe', ownLine: 'Dogs outside only' }, 'Dogs: outside only', 'Chiens : dehors seulement'],
    [{ badge: true, type: 'brewery', ownLine: 'Dogs welcome inside and on the patio' }, 'Dogs: inside and on the patio', 'Chiens : inside and on the patio'],
    [{ badge: true, type: 'brewery', ownLine: 'Well-behaved dogs are welcome inside the taproom and out on the big covered patio all year' }, 'Dogs: welcome inside', 'Chiens : admis à l’intérieur'],
    [{ badge: true, type: 'tour', ownLine: 'Dogs on some trips', someTrips: true }, 'Dogs: some trips only', 'Chiens : certaines sorties seulement'],
    [{ badge: true, type: 'restaurant' }, 'Dogs: check indoor or patio access', 'Chiens : vérifier intérieur ou terrasse'],
    [{ badge: true, type: 'winery' }, 'Dogs: check indoor or patio access', 'Chiens : vérifier intérieur ou terrasse'],
    [{ badge: true, type: 'outdoor' }, 'Dogs: listed as dog-friendly', 'Chiens : indiqué comme admis'],
    [{ type: 'restaurant' }, 'Dogs: check ahead', 'Chiens : à vérifier'],
    [{ dogLine: 'Dogs are not permitted', badge: true, type: 'outdoor' }, 'No dogs per its listing', 'Chiens non admis selon sa fiche'],
  ];
  for (const [d, en, fr] of DOG) { assert.equal(dog(d, false), en, JSON.stringify(d)); assert.equal(dog(d, true), fr, JSON.stringify(d)); }
  assert.deepEqual([dog({ badge: true, type: 'restaurant' }, false, true), dog({ badge: true, type: 'restaurant' }, true, true)], ['Dogs: check inside or patio', 'Chiens : intérieur ou terrasse à vérifier']);
  // The badge alone is never said as a yes, and never as "dogs welcome".
  for (const [d, en] of DOG) { const r = A.dogOf(d); if (r.has !== true || r.where === 'unsaid') assert.doesNotMatch(en, /welcome|allowed|friendly/i, en); }
  assert.deepEqual(DOG.map(([d]) => A.dogOpen(A.dogOf(d))), [false, false, false, false, true, true, false, true, true, false, false, true, true, true, false, true, true]);
  // Short: the fixed notes fit about 40 characters; a note that carries a listing's own section name may be longer.
  for (const [r, en, fr] of ACC) if (!r.part) { assert.ok(en.length <= 41, en); assert.ok(fr.length <= 46, fr); }
  for (const [d, en, fr] of DOG) { assert.ok(en.length <= 46, en); assert.ok(fr.length <= 50, fr); }
  for (const c of [true]) for (const fr of [false, true]) assert.ok(`${acc({ level: 'unknown' }, fr, c)} · ${dog({ type: 'restaurant' }, fr, c)}`.length <= 44);
  // Every Dogs line and Access line in this site's data makes a note; a long line is cut at a clause, never mid-word.
  const facts = JSON.parse(fs.readFileSync(require.resolve('../data/outdoor-facts.json'), 'utf8'));
  for (const f of Object.values(facts)) {
    if (!f) continue;
    if (typeof f.dogs === 'string' && f.dogs.trim()) { const r = A.dogOf({ dogLine: f.dogs, type: 'outdoor' }), n = A.dogShort(r, false); assert.ok(n && n.length <= 66, `${f.dogs} -> ${n}`); if (r.has === false) assert.equal(n, 'No dogs per its listing'); if (r.has === null) assert.doesNotMatch(n, /^Dogs: (?:allowed|welcome|listed)/, n); }
    if (typeof f.accessibility === 'string') { const g = A.accessOf({ accessLine: f.accessibility }), n = A.accessShort(g, false); assert.equal(/^Wheelchair accessible per its listing$/.test(n), g.level === 'wheelchair', f.accessibility); }
  }
});

test('14. the cards: a note for each need the trip carries, on every stop; none without the need; the Dog-Friendly chip gives way to "check indoor or patio access"', () => {
  // The owner's plan, with BX Ranch Trail (no Access line; "Dogs allowed, on leash only") on day 2.
  const AC = { 11: { accessLine: VERNON.polson }, 13: { accessLine: VERNON.bx }, 17: {}, 14: {}, 16: {}, 18: { accessLine: 'Wide, flat, paved 6.8 km path; wheelchair accessible' } };
  const DG = { 11: { badge: true, type: 'outdoor' }, 13: { dogLine: 'Dogs allowed on leash only (Deleenheer Rd section)', badge: true, type: 'outdoor' }, 17: { dogLine: 'Dogs allowed, on leash only', type: 'outdoor' }, 14: { badge: true, type: 'restaurant' }, 16: { badge: true, type: 'restaurant' }, 18: { dogLine: 'Dogs are not permitted', type: 'outdoor' } };
  const c2 = { accessOf: (id) => A.accessOf(AC[id] || {}), dogOf: (id) => A.dogOf(DG[id] || {}), kindsOf: (id) => (id <= 13 || id === 17 ? ['walk', 'easy_walk'] : []) };
  const mk = (extra = {}) => {
    const walk = { ...stop('morning', 17, 'BX Ranch Trail', 'outdoor'), why: ['A good walk with your dog'] };
    const p = plan([{ day: 1, date: '2027-01-16', stops: [stop('morning', 13, 'BX Creek Wetland Boardwalk', 'outdoor'), { ...stop('midday', 14, 'Roster Sports Club', 'restaurant', ['dog_friendly', 'gluten_free']), why: ['Matches your request for restaurants'] }, stop('afternoon', 11, 'Polson Park', 'outdoor'), stop('evening', 18, 'Paved Lake Path', 'outdoor')] },
      { day: 2, date: '2027-01-17', stops: [walk, stop('midday', 16, 'MR MIKES', 'restaurant', ['dog_friendly'])] }], extra);
    for (const d of p.days) for (const s of d.stops) for (const b of s.venue.badges) b.label = b.key === 'dog_friendly' ? 'Dog-Friendly' : 'Gluten-Free-Friendly';
    p.intent = { features: ['dog_friendly', 'gluten_free'] };
    H.applyEvidence(p, c2);
    return p;
  };
  const p = mk(), all = (q) => q.days.flatMap((d) => d.stops);
  const K = cardKit(p), byId = (q, id) => all(q).find((s) => s.venue.id === id);
  // Every stop: the wheelchair note first, then the dog note; the same words as the evidence rows.
  assert.deepEqual(all(p).map((s) => K.v4NeedLines(s).notes), [
    ['Access: Deleenheer Rd access · check ahead', 'Dogs: on leash only, Deleenheer Rd section'],
    ['Wheelchair access: check ahead', 'Dogs: check indoor or patio access'],
    ['Wheelchair: playground only', 'Dogs: listed as dog-friendly'],
    ['Wheelchair accessible per its listing', 'No dogs per its listing'],
    ['Wheelchair access: check ahead', 'Dogs: on leash only'],
    ['Wheelchair access: check ahead', 'Dogs: check indoor or patio access'],
  ]);
  for (const s of all(p)) assert.deepEqual(K.v4NeedLines(s).notes, A.stopNeedNotes(p, s.venue.id, false).notes, s.venue.name);
  // "A good walk with your dog" never stands alone on a walk whose wheelchair access is unknown: the notes take its place.
  const ranch = K.tripWorkspaceStopHtml(byId(p, 17), '2-morning');
  assert.equal(text(ranch), '10:15 AM | BX Ranch Trail | Outdoor Destination | Wheelchair access: check ahead | Dogs: on leash only | View details');
  assert.doesNotMatch(ranch, /A good walk with your dog/);
  assert.match(ranch, /<li class="v4-stop tw-needs" /);
  assert.match(ranch, /<p class="tw-fit tw-need v4-need-note" data-tw-need="Wheelchair access: check ahead · Dogs: on leash only"><span>Wheelchair access: check ahead<\/span><span>Dogs: on leash only<\/span><\/p>/);
  // The badge-only restaurant: the plain chip is gone from the line (its other chips stay); the note says what to check.
  const roster = K.tripWorkspaceStopHtml(byId(p, 14), '1-midday');
  assert.equal(text(roster), '10:15 AM | Roster Sports Club | Lunch · Gluten-Free-Friendly | Wheelchair access: check ahead | Dogs: check indoor or patio access | View details');
  assert.doesNotMatch(roster, /Dog-Friendly|Matches your request/);
  assert.equal(K.v4NeedLines(byId(p, 14)).chipOff, true);
  // A listing that says where dogs go keeps its own chip ("Dogs on patio"); a confirmed stop is a plain yes.
  assert.deepEqual(K.v4Badges({ badges: [{ key: 'dog_friendly', label: 'Dog-Friendly' }], dogsPatioOnly: true }, true), ['Dogs on patio']);
  assert.deepEqual(K.v4NeedLines(byId(p, 18)).open, ['No dogs per its listing']);
  assert.deepEqual(K.v4NeedLines(byId(p, 13)).open, ['Access: Deleenheer Rd access · check ahead']);
  // French.
  const KF = cardKit(p, true);
  assert.deepEqual(KF.v4NeedLines(byId(p, 14)).notes, ['Accès en fauteuil : à vérifier', 'Chiens : vérifier intérieur ou terrasse']);
  assert.doesNotMatch(KF.tripWorkspaceStopHtml(byId(p, 14), '1-midday'), /Chiens admis</);
  // With a suggested time on the same card: the time note first, then both needs in their shorter forms on ONE more line.
  const KT = cardKit(p, false, { 14: 'Suggested time · Check sessions ↗' });
  const timed = KT.tripWorkspaceStopHtml(byId(p, 14), '1-midday');
  assert.equal(text(timed), '10:15 AM | Roster Sports Club | Lunch · Gluten-Free-Friendly | Suggested time · Check sessions ↗ | Wheelchair: check ahead · Dogs: check inside or patio | View details');
  assert.match(timed, /<li class="v4-stop tw-timed tw-needs" /);
  assert.equal((timed.match(/<p class="/g) || []).length, 2, 'two small lines, not three');
  // Only the needs the trip carries: a dog trip says nothing of wheelchairs, a wheelchair trip nothing of dogs (and
  // keeps the Dog-Friendly chip); a plan with neither is as it was: the generic line, the chip, no note.
  const dogOnly = mk({ needs: [needs[1]] }), KD = cardKit(dogOnly);
  assert.deepEqual(KD.v4NeedLines(byId(dogOnly, 17)).notes, ['Dogs: on leash only']);
  assert.doesNotMatch(all(dogOnly).map((s) => KD.tripWorkspaceStopHtml(s, '1-x')).join(''), /Wheelchair|Access:/);
  const wheelOnly = mk({ needs: [needs[0]] }), KW = cardKit(wheelOnly);
  assert.deepEqual(KW.v4NeedLines(byId(wheelOnly, 14)).notes, ['Wheelchair access: check ahead']);
  assert.match(KW.tripWorkspaceStopHtml(byId(wheelOnly, 14), '1-midday'), /Lunch · Dog-Friendly · Gluten-Free-Friendly/);
  assert.doesNotMatch(all(wheelOnly).map((s) => KW.tripWorkspaceStopHtml(s, '1-x')).join(''), /Dogs:|No dogs/);
  const none = mk({ needs: [] }), KN = cardKit(none);
  for (const s of all(none)) assert.deepEqual(KN.v4NeedLines(s).notes, [], s.venue.name);
  assert.equal(text(KN.tripWorkspaceStopHtml(byId(none, 17), '2-morning')), '10:15 AM | BX Ranch Trail | Outdoor Destination | A good walk with your dog | View details');
  assert.equal(text(KN.tripWorkspaceStopHtml(byId(none, 14), '1-midday')), '10:15 AM | Roster Sports Club | Lunch · Dog-Friendly · Gluten-Free-Friendly | Matches your request for restaurants | View details');
  assert.doesNotMatch(all(none).map((s) => KN.tripWorkspaceStopHtml(s, '1-x')).join(''), /tw-needs|data-tw-need/);
  for (const s of all(none)) assert.equal(A.stopNeedNotes(none, s.venue.id, false).text, '');
  // The Book my trip sheet lists each stop's notes that are still to confirm, from the same function; the copied
  // itinerary prints the card's own note under the stop.
  assert.ok(V4.includes("var nl = v4NeedLines(st); if (nl.open.length) needRows.push("));
  assert.ok(V4.includes("if (nn && nn.getAttribute('data-tw-need')) rows.push('  ' + nn.getAttribute('data-tw-need'));"));
  // One small line per need on a phone, wrapping inside the card.
  assert.ok(L.WORKSPACE_STYLES.includes('.t3-v4.tw-workspace .tw-need span {display:block;}'));
  assert.ok(L.WORKSPACE_STYLES.includes('.t3-v4.tw-workspace .tw-needs .tw-need {width:max-content;max-width:calc(100vw - 58px);max-width:calc(100cqw - 24px);font-size:12.5px;}'));
});

test('15. directions for a stop listed for one entrance or section: the entrance’s own pin when on file, else "check the entrance"; never "accessible"', () => {
  // No pin on file: the line says the map link is the listing's location, not necessarily the entrance.
  const bx = A.accessDirections({ level: 'mobility', part: 'Deleenheer Rd access' }, null);
  assert.deepEqual(bx, { pin: null, text: 'Directions go to the listing’s map location, not necessarily the Deleenheer Rd access: check the entrance.', textFr: 'L’itinéraire mène à l’emplacement de la fiche, pas forcément à : Deleenheer Rd access. Vérifiez l’entrée.' });
  assert.equal(A.accessDirections({ level: 'wheelchair_part', part: 'Turtle Mtn Blvd to Davison Rd section' }, null).text, 'Directions go to the listing’s map location, not necessarily the Turtle Mtn Blvd to Davison Rd section: check the entrance.');
  // A pin from the site's own entrance data: the link goes there, named.
  const pin = A.accessDirections({ level: 'mobility', part: 'Juniper Trail' }, { name: 'Twin Bays / Yellow Gate parking', lat: 50.20386581, lng: -119.2805426 });
  assert.equal(pin.label, 'Directions to Twin Bays / Yellow Gate parking');
  assert.equal(pin.labelFr, 'Itinéraire vers Twin Bays / Yellow Gate parking');
  assert.equal(pin.url, 'https://www.google.com/maps/search/?api=1&query=50.20386581,-119.2805426');
  assert.equal(pin.text, 'Directions go to Twin Bays / Yellow Gate parking, the entrance on file for the Juniper Trail.');
  // Not a route matter: a feature (a playground, a building), an amenity, "some portions", a whole-place yes, nothing said.
  for (const r of [{ level: 'wheelchair_part', part: 'playground' }, { level: 'wheelchair_part', part: 'building' }, { level: 'mobility', amenity: true, part: 'parking' }, { level: 'wheelchair_part', part: 'some portions' }, { level: 'wheelchair_part' }, { level: 'wheelchair' }, { level: 'unknown' }, { level: 'no' }]) assert.equal(A.accessDirections(r, null), null, JSON.stringify(r));
  // A broken pin is no pin.
  assert.equal(A.accessDirections({ level: 'mobility', part: 'Juniper Trail' }, { name: 'X', lat: 'a', lng: 2 }).pin, null);
  // Nothing here calls a route or a whole trail accessible.
  for (const d of [bx, pin]) for (const t of [d.text, d.textFr, d.label || '']) assert.doesNotMatch(t, /accessible/i, t);
  // The evidence row carries it (ctx.entranceOf), and the card prints it once opened: a link for a pin, a line without.
  const AC = { 13: { accessLine: VERNON.bx }, 19: { accessLine: 'Juniper Trail is paved to the twin bays, then gravel to Rattlesnake Point' }, 11: { accessLine: VERNON.polson } };
  const c2 = { accessOf: (id) => A.accessOf(AC[id] || {}), dogOf: () => A.dogOf({}), kindsOf: () => ['walk'], entranceOf: (id, part) => (id === 19 && part === 'Juniper Trail' ? { name: 'Twin Bays / Yellow Gate parking', lat: 50.20386581, lng: -119.2805426 } : null) };
  const p = plan([{ day: 1, date: '2027-01-16', stops: [stop('morning', 13, 'BX Creek Wetland Boardwalk', 'outdoor'), stop('midday', 19, 'Kalamalka Lake Park Trails', 'outdoor'), stop('afternoon', 11, 'Polson Park', 'outdoor')] }], { needs: [needs[0]] });
  H.applyEvidence(p, c2);
  const rows = ev(p, 'accessible').stops;
  assert.deepEqual(rows.map((r) => (r.dir ? (r.dir.pin ? 'pin' : 'listing') : null)), ['listing', 'pin', null]);
  const K = cardKit(p), st = p.days[0].stops;
  assert.equal(K.v4DirHtml(st[0]), '<p class="v4-need v4-dir" data-v4-dir="listing">Directions go to the listing’s map location, not necessarily the Deleenheer Rd access: check the entrance.</p>');
  assert.equal(K.v4DirHtml(st[1]), '<p class="v4-need v4-dir" data-v4-dir="pin"><a href="https://www.google.com/maps/search/?api=1&amp;query=50.20386581,-119.2805426" target="_blank" rel="noopener">Directions to Twin Bays / Yellow Gate parking <span aria-hidden="true">↗</span></a></p>');
  assert.equal(K.v4DirHtml(st[2]), '');
  assert.equal(A.stopNeedNotes(p, 13, false).dir.text, bx.text);
  // The day's route link on the shared copy is worded as before: it names no access.
  const app = require('../server.js');
  const page = app.renderMyTripPage({ lang: 'en' });
  assert.match(page, /Directions for Day \{d\} in Google Maps/);
  assert.doesNotMatch(page, /accessible route|accessible directions/i);
  // The site's own entrance data: a pin only where an entrance's own words name the part; nothing is guessed.
  if (!WR) {
    const kal = app.tripAccessEntrance(1825, 'Juniper Trail');
    if (kal) { assert.equal(kal.name, 'Twin Bays / Yellow Gate parking'); assert.ok(Math.abs(kal.lat - 50.2039) < 0.001 && Math.abs(kal.lng + 119.2805) < 0.001); }
  }
  assert.equal(app.tripAccessEntrance(1, 'Deleenheer Rd access'), null);
  assert.equal(app.tripAccessEntrance(999999, 'Juniper Trail'), null);
});

test('16. through the planner and the shared copy: the plan’s rows, the sheet’s list and the copy’s stop lines are the same strings; no need, no notes', () => {
  const app = require('../server.js');
  const run = (t) => app.runTripPlanRequest({ ...app.parseTripPlanBody({ text: t }, { v4: true, stays: true }).value, v4: true }, true);
  // (The repo's seed database has stops for this request; the owner's dated Vernon request needs the live listings.)
  const p = run(`A relaxed 2-day trip in ${WR ? 'Whistler' : 'Kelowna'} with our dog. One of us uses a wheelchair.`);
  const stops = (p.days || []).flatMap((d) => d.stops.filter((s) => s.venue).map((s) => ({ ...s, day: d.day })));
  assert.ok(stops.length, 'the request plans');
  const a = ev(p, 'accessible'), d = ev(p, 'dog_friendly');
  // Every stop of the plan has both notes, made by the one function from its own row.
  for (const s of stops) {
    const ra = a.stops.find((x) => x.id === s.venue.id), rd = d.stops.find((x) => x.id === s.venue.id);
    assert.ok(ra && rd, s.venue.name);
    assert.deepEqual([ra.note, ra.noteFr, ra.noteShort], [A.accessShort(ra, false), A.accessShort(ra, true), A.accessShort(ra, false, true)], s.venue.name);
    assert.deepEqual([rd.note, rd.noteFr, rd.noteShort], [A.dogShort(rd, false), A.dogShort(rd, true), A.dogShort(rd, false, true)], s.venue.name);
    // Never upgraded: "accessible" only from the listing's own wheelchair words; a badge alone is never "allowed".
    assert.equal(ra.note === 'Wheelchair accessible per its listing', app.tripAccessOf(s.venue.id).level === 'wheelchair', s.venue.name);
    if (app.tripAccessOf(s.venue.id).level === 'unknown') assert.equal(ra.note, 'Wheelchair access: check ahead', s.venue.name);
    if (rd.where === 'unsaid') assert.equal(rd.note, 'Dogs: check indoor or patio access', s.venue.name);
    assert.equal(!!ra.check, ra.level !== 'wheelchair');
  }
  // The shared copy: the same text under each stop, worked out again from the listings.
  const K = cardKit(p);
  const q = { stops: stops.map((s) => `venue:${s.venue.id}`).join(','), days: stops.map((s) => s.day).join(','), asks: H.shareAsks(p).join(','), nw: '1', ad: '2' };
  for (const lang of ['en', 'fr']) {
    const ctxS = app.tripShareContext(q, lang);
    assert.ok(ctxS && ctxS.stopNotes, 'the copy carries the notes');
    for (const s of stops) {
      const n = A.stopNeedNotes(p, s.venue.id, lang === 'fr');
      assert.equal(ctxS.stopNotes[`venue:${s.venue.id}`].text, n.text, s.venue.name);
      if (lang === 'en') assert.equal(n.text, K.v4NeedLines(s).note, s.venue.name);
      assert.equal(ctxS.stopNotes[`venue:${s.venue.id}`].dir || null, n.dir ? (lang === 'fr' ? n.dir.textFr : n.dir.text) : null, s.venue.name);
    }
    const html = app.renderMyTripPage({ lang, context: ctxS });
    assert.match(html, /var NEED_NOTES = \{"venue:\d+":\{"text":"/);
    assert.ok(html.includes("needHtml = nn && nn.text ? '<p class=\"mt-meta mt-need\" data-mt-need>' + esc(nn.text) + '</p>'"));
  }
  // An older link (no need in its asks) and your own saved trip: no notes, the page as before.
  const old = app.tripShareContext({ stops: q.stops, days: q.days, asks: 'gluten_free', ad: '2' }, 'en');
  assert.equal(old.stopNotes, undefined);
  assert.match(app.renderMyTripPage({ lang: 'en', context: old }), /var NEED_NOTES = \{\};/);
  assert.match(app.renderMyTripPage({ lang: 'en' }), /var NEED_NOTES = \{\};/);
  // Plans without these needs: no note on any row's card, the chip and the generic line as before.
  for (const t of [`Plan a 3-day ${WR ? 'Whistler' : 'Kelowna'} weekend for 6 friends: two ${WR ? 'breweries' : 'wineries'}, gluten-free dining, easy walks, a hotel with a pool, and live music. One person does not drink.`,
    `Plan 2 days in ${WR ? 'Whistler' : 'Penticton'} on December 5–6, 2026 for two adults and kids aged 6 and 9. We want indoor activities, a kid-friendly lunch, a hotel with a pool and a relaxed pace.`]) {
    const o = run(t), KO = cardKit(o);
    for (const dd of o.days || []) for (const s of dd.stops) if (s.venue) { const nl = KO.v4NeedLines(s); assert.deepEqual([nl.notes, nl.compact, nl.open, nl.chipOff, nl.dir, nl.more], [[], [], [], false, null, []], `${t.slice(0, 30)} ${s.venue.name}`); assert.equal(A.stopNeedNotes(o, s.venue.id, false).text, ''); assert.doesNotMatch(KO.tripWorkspaceStopHtml(s, `${dd.day}-${s.daypart}`), /tw-needs|data-tw-need/); }
  }
});
