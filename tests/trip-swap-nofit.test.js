'use strict';
// Build My Trip chat (2026-11-24, Dayton's report at 390px): in the Oliver trip the traveller asks to replace Kinsmen
// Spray Park with cycling for a 15-year-old. The reply was "I couldn't find a cycling stop that fits there, so Kinsmen
// Spray Park stays. The nearest one I list is Okanagan River Path … in Okanagan Falls." and nothing more: no reason,
// no way to look at the place named, no way to choose it.
// On the live site the town's one cycling listing (International Hike and Bike Trail) was already on the plan, so the
// swap had nothing left in Oliver. Now the reply says that, names the nearest one elsewhere with its town and the
// straight-line distance, gives a View button and a "Swap it in" button, and asks before anything changes.
// Also here: a message with "replace" in it, sent while the cheaper-stay offer was pending, changed the stay.
// No network; the word rules only (no AI reader).
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

Object.assign(process.env, { TRIP_PLANNER_V3: 'on', TRIP_V4: 'on', TRIP_STAYS: 'on', TRIP_CHAT: 'on', TRIP_PLAN_API: 'on', STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', DISCOVERCARS_AID: 'okanaganroam', TRIP_CHAT_TIMING: 'off', ANTHROPIC_API_KEY: '' });
const B = require('../trip-budget.js');
const tc = require('../trip-chat.js');
const SITE = require('../trip-site.js');
const WR = SITE.brand === 'Whistler Roam';
// A town with no cycling listing of its own in the test data, and a second town a few kilometres away.
const REGION = WR ? 'britannia-beach' : 'oliver', TOWN = WR ? 'Britannia Beach' : 'Oliver';
const REGION2 = WR ? 'furry-creek' : 'okanagan-falls', TOWN2 = WR ? 'Furry Creek' : 'Okanagan Falls';
const AT = WR ? [49.624, -123.205] : [49.183, -119.548];
const PAGE = fs.readFileSync(require.resolve('../trip-chat-page.js'), 'utf8');
const app = require('../server.js');
const db = require('../db.js');

const made = [];
const F = {};
const HOURS = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '22:00']]])));
const mk = (key, o) => {
  const n = made.length + 1;
  const v = app.createVenue({ region: REGION, address: `${800 + n} No Fit Test Road, ${TOWN}, BC`, latitude: AT[0] + n / 5000, longitude: AT[1], description: 'A place used only by the swap tests. Open all year.', slug: `nft-test-${key.toLowerCase()}`, ...o });
  made.push(v.id); F[key] = v; return v;
};
const stayInfo = (v, level) => db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(v.id, JSON.stringify({ price_level: level, sleeps: 4, confidence: 'high', booking: { own: `https://${v.slug}.example.com/book` } }), '2026-11-24T00:00:00Z', 'test-nft');
test.before(() => {
  mk('HOTEL', { type: 'stay', cuisine: 'hotel', name: 'Fixture Lakeside Hotel NFT' }); stayInfo(F.HOTEL, 2);
  mk('CHEAP', { type: 'stay', cuisine: 'motel', name: 'Fixture Thrifty Motel NFT' }); stayInfo(F.CHEAP, 1);
  mk('SPRAY', { type: 'outdoor', name: 'Fixture Spray Park NFT', kid_friendly: 1, hours: HOURS, description: 'A free splash pad with a playground for kids aged 2 to 12. Open all year.' });
  mk('LUNCH', { type: 'restaurant', name: 'Fixture Taco Counter NFT', price: 1, hours: HOURS });
  mk('DINNER', { type: 'restaurant', name: 'Fixture Pizza Table NFT', price: 2, hours: HOURS });
  mk('TRAIL', { type: 'outdoor', name: 'Fixture Hike and Bike Trail NFT', kid_friendly: 1, hours: HOURS, description: 'A wide, flat dyke path, great for all ages on foot or by bicycle. Open all year.' });
  // The next town: a winery bike tour (2 km away, nearer) and a bike path (3 km away).
  mk('WINEBIKE', { region: REGION2, type: 'tour', name: 'Fixture Vineyard Bike Tours NFT', hours: HOURS, latitude: AT[0] + 0.018, description: 'Guided e-bike rides to wineries, with tastings and a vineyard lunch included. Open all year.' });
  mk('PATH', { region: REGION2, type: 'outdoor', name: 'Fixture Creekside Bike Path NFT', hours: HOURS, latitude: AT[0] + 0.027, description: 'A flat walking and biking path beside the creek. An easy walk or ride any time of year.' });
  mk('SPRAY2', { region: REGION2, type: 'outdoor', name: 'Fixture Second Spray Park NFT', hours: HOURS, latitude: AT[0] + 0.03, description: 'A free splash pad. Open all year.' });
});
test.after(() => {
  app.setTripChatReader(null);
  for (const k of ['HOTEL', 'CHEAP']) if (F[k]) db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(F[k].id);
  for (const id of made) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  try { app.server.close(); } catch (e) { /* not listening */ }
});

const REQ = `Plan a 2-day trip in ${TOWN} from July 10 to July 11, 2027 for one adult and a 15-year-old. We want cycling, swimming and casual food. No alcohol or wineries please. We need a hotel for one night and our total budget is $300 for both of us.`;
const SWAP = 'replace the spray park with cycling for a 15-year-old';
const BOTH = 'Does this stay within our total $300 budget including the hotel night, meals and activities? Please replace the splash park with a cycling activity suitable for a 15-year-old.';
const stopsOn = () => [{ key: '1-morning', id: F.TRAIL.id, start: 540 }, { key: '1-midday', id: F.LUNCH.id, start: 720 }, { key: '1-afternoon', id: F.SPRAY.id, start: 840 }, { key: '1-evening', id: F.DINNER.id, start: 1080 }];
const turn = async (message, o = {}) => {
  const v = app.parseTripChatBody({ message, lang: o.lang || 'en', plan: { text: o.text || REQ, seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops: o.stops || stopsOn(), stayId: o.stayId || F.HOTEL.id, stayTown: REGION, ...(o.offer ? { offer: o.offer } : {}) }, { stays: true });
  assert.ok(v.value, JSON.stringify(v.error));
  return (await app.runTripChatTurn(v.value, { staysOn: true, lang: o.lang || 'en' })).response;
};
const at = (p) => Object.fromEntries(tc.planStops(p).map((s) => [s.key, [s.id, s.start]]));
const offerOf = () => `Fixture Creekside Bike Path NFT [swap ${F.SPRAY.id}>${F.PATH.id} cycling 15]`;
// Nothing in a reply claims a drive time, that a place suits an age, or that anything is available.
const HONEST = (reply) => assert.doesNotMatch(reply, /\b\d+\s*(?:min|minutes|hours?)\b|\bdrive\b|\bdriving\b|\bavailable\b|\bavailability\b|suitable for|(?<!check it )suits a|good for a 15|(?<!vérifiez que cela )convient à 15|en voiture|disponible/i, reply);

test('1. the reason is said only when it is known, in a few words; else the plain line stands (EN / FR)', () => {
  const old = { id: 1, key: '1-afternoon', name: 'Kinsmen Spray Park', day: 1, type: 'outdoor' };
  const line = (nofit, L = 'en') => tc.buildReply({ plan: null, req: null, actions: { remove: [], keep: [] }, changed: [], results: [{ op: 'replace', ok: false, local: true, old, kind: 'cycling', why: 'no_fit', ...(nofit ? { nofit } : {}) }] }, { lang: L });
  const base = { town: 'Oliver', noun: 'cycling stop' };
  assert.match(line({ ...base, reasons: ['only'], name: 'International Hike and Bike Trail', day: 2 }), /^Oliver’s only cycling stop I list, International Hike and Bike Trail, is already on day 2\. Kinsmen Spray Park stays\./);
  assert.match(line({ ...base, reasons: ['on_plan', 'alcohol'], name: 'Hike and Bike Trail', day: 2 }), /^Hike and Bike Trail is already on day 2\. What else Oliver has is ruled out by your no-alcohol request\. Kinsmen Spray Park stays\./);
  assert.match(line({ ...base, reasons: ['on_plan', 'age'], name: 'Hike and Bike Trail', day: 2, age: 15 }), /What else Oliver has gives ages that leave out a 15-year-old\. Kinsmen Spray Park stays\./);
  assert.match(line({ ...base, reasons: ['on_plan_many'] }), /^Every cycling stop I list in Oliver is already on your plan\. Kinsmen Spray Park stays\./);
  assert.match(line({ ...base, reasons: ['none_listed'] }), /^I list no cycling stop in Oliver\. Kinsmen Spray Park stays\./);
  // Others exist and did not fit: said as that, with no cause made up.
  assert.match(line({ ...base, reasons: ['slot'] }), /^Nothing I list in Oliver for that fits that slot\. Kinsmen Spray Park stays\./);
  assert.match(line({ ...base, reasons: ['on_plan', 'slot_else'], name: 'Hike and Bike Trail', day: 2 }), /^Hike and Bike Trail is already on day 2\. What else Oliver has doesn’t fit that slot\. Kinsmen Spray Park stays\./);
  // No reason worked out (a kind judged another way): the line as before.
  assert.match(line(null), /^I couldn’t find a cycling stop that fits there, so Kinsmen Spray Park stays\./);
  assert.match(line({ ...base, reasons: [] }), /^I couldn’t find a cycling stop that fits there, so Kinsmen Spray Park stays\./);
  assert.match(line({ town: 'Oliver', noun: 'arrêt vélo', reasons: ['only'], name: 'International Hike and Bike Trail', day: 2 }, 'fr'), /^Le seul choix « arrêt vélo » que je répertorie à Oliver, International Hike and Bike Trail, est déjà au jour 2\. Kinsmen Spray Park reste\./);
  assert.match(line({ town: 'Oliver', noun: 'arrêt vélo', reasons: ['none_listed'] }, 'fr'), /^Je ne répertorie aucun choix « arrêt vélo » à Oliver\. Kinsmen Spray Park reste\./);
  assert.match(line({ town: 'Oliver', noun: 'arrêt vélo', reasons: ['on_plan', 'alcohol'], name: 'X', day: 1 }, 'fr'), /Le reste à Oliver est exclu par votre demande sans alcool\. Kinsmen Spray Park reste\./);
  for (const r of ['only', 'on_plan', 'on_plan_many', 'none_listed', 'alcohol', 'age', 'slot', 'slot_else']) for (const L of ['en', 'fr']) HONEST(line({ ...base, reasons: [r], name: 'X', day: 1, age: 15 }, L));
});

test('2. a tagged offer is taken by its button, its name, or a yes to the one question asked; never by another message', () => {
  const swap = 'Okanagan River Path: Okanagan Falls to Vaseux Lake [swap 1677>1892 cycling 15]', stay = 'Vintage Merlot Bed & Breakfast [stay cheaper]';
  const pick = (m, offers) => app.tripChatPickTagged(m, offers);
  // The button sends the offer itself.
  assert.equal(pick(swap, [swap, stay]), swap);
  // A plain yes is for the question asked (the swap), never the stay named beside it.
  for (const m of ['yes', 'Yes please', 'ok', 'sure, go ahead', 'swap it in', 'oui', "d'accord"]) assert.equal(pick(m, [swap, stay]), swap, m);
  // Each stays answerable by its own name.
  for (const m of ['the river path', 'Okanagan River Path', 'the Vaseux one', 'okanagan river path please']) assert.equal(pick(m, [swap, stay]), swap, m);
  for (const m of ['Vintage Merlot', 'the Merlot B&B', 'vintage merlot please']) assert.equal(pick(m, [swap, stay]), stay, m);
  // The stay offered alone: yes takes it, and so does "switch".
  assert.equal(pick('yes', [stay]), stay); assert.equal(pick('switch', [stay]), stay);
  assert.equal(pick('switch', [swap, stay]), null, 'with a swap question asked, "switch" alone is not clear');
  // Another request or a question is never an answer (it is read as itself).
  for (const m of ['replace Kinsmen Spray Park with cycling for a 15-year-old', 'cheaper dinner on day 1', 'is that within our budget?', 'remove it', 'what about the river?', 'something by the river', 'it looks fine', 'add a beach', 'yes but make it a beach instead', 'how far is it?', 'no', 'no thanks']) {
    assert.equal(pick(m, [swap, stay]), null, m); assert.equal(pick(m, [stay]), null, m); assert.equal(pick(m, [swap]), null, m);
  }
  assert.equal(pick('yes', ['swap the park, or day 3 at 1:15 PM']), null, 'an offer with no tag is left to the general rule');
});

test('3. no fit: the reason, the place elsewhere with its town and straight-line distance, two buttons, and a question; nothing changes', async () => {
  const r = await turn(SWAP);
  assert.equal(r.plan, null); assert.deepEqual(r.changed, []); assert.equal(r.stayBlock, undefined);
  assert.ok(r.reply.startsWith(`${TOWN}’s only cycling stop I list, Fixture Hike and Bike Trail NFT, is already on day 1. Fixture Spray Park NFT stays. Nearest elsewhere: Fixture Creekside Bike Path NFT. It’s in ${TOWN2}, outside ${TOWN} (about `), r.reply);
  assert.match(r.reply, /\(about \d+(?:\.\d)? km in a straight line\)\. Its listing gives no ages: check it suits a 15-year-old\. Swap it in\?$/);
  assert.doesNotMatch(r.reply, /Your plan is unchanged/);
  HONEST(r.reply);
  // The winery bike tour is nearer and is never the place offered on a no-alcohol trip.
  assert.doesNotMatch(r.reply, /Vineyard Bike Tours/);
  assert.deepEqual(r.offer, [offerOf()]);
  assert.deepEqual(r.choices, [{ kind: 'view', url: `/${REGION2}/outdoors/nft-test-path`, label: 'View Fixture Creekside Bike Path NFT' }, { kind: 'say', say: offerOf(), label: 'Swap it in' }]);
  // French.
  const fr = await turn('Remplace les jeux d’eau par une activité de vélo pour un ado de 15 ans.', { lang: 'fr' });
  assert.ok(fr.reply.startsWith(`Le seul choix « arrêt vélo » que je répertorie à ${TOWN}, Fixture Hike and Bike Trail NFT, est déjà au jour 1. Fixture Spray Park NFT reste. Le plus proche ailleurs : Fixture Creekside Bike Path NFT. C’est à ${TOWN2}, hors d`), fr.reply);
  assert.match(fr.reply, /\(environ \d+(?:,\d)? km à vol d’oiseau\)\. Sa fiche ne donne pas d’âges : vérifiez que cela convient à 15 ans\. Voulez-vous que je le mette à la place\?$/);
  assert.equal(fr.choices[1].label, 'Faire l’échange'); assert.match(fr.choices[0].label, /^Voir /);
  assert.equal(fr.plan, null); HONEST(fr.reply);
  // What the trip's rules rule out is said as that: the next town has its bike path on the plan and a winery bike tour.
  const stops2 = app.tripChatStops([{ key: '1-morning', id: F.PATH.id, start: 540 }, { key: '1-afternoon', id: F.SPRAY2.id, start: 840 }]);
  const res = (age) => ({ op: 'replace', ok: false, kind: 'cycling', old: stops2.find((s) => s.id === F.SPRAY2.id), ...(age ? { age } : {}) });
  const ctx = (text) => ({ v: { args: { text }, removed: [], stayId: null }, stops: stops2, lang: 'en', run: () => null, canOffer: false });
  assert.deepEqual(app.tripChatSwapNoFit(res(null), ctx(REQ)).nofit.reasons, ['on_plan', 'alcohol']);
  assert.deepEqual(app.tripChatSwapNoFit(res(15), ctx(`2 days in ${TOWN2}`)).nofit.reasons, ['on_plan', 'age']);
  // With no rule against it and no age asked, the tour is a cycling stop that simply did not fit: no cause is made up.
  assert.deepEqual(app.tripChatSwapNoFit(res(null), ctx(`2 days in ${TOWN2}`)).nofit.reasons, ['on_plan', 'slot_else']);
  // A kind judged another way (a view, "for kids") gets no reason: the plain line stands.
  assert.equal(app.tripChatSwapNoFit({ ...res(null), kind: 'lake_view' }, ctx(REQ)), null);
});

test('4. yes swaps that one stop, in its slot, and nothing else; a tap on the button is the same; the request keeps its words', async () => {
  for (const say of ['yes', offerOf(), 'the creekside bike path']) {
    const r = await turn(say, { offer: [offerOf()] });
    assert.ok(r.plan && r.req, `${say}: ${r.reply}`);
    assert.deepEqual(r.changed, ['1-afternoon']);
    const now = at(r.plan);
    assert.deepEqual(now['1-afternoon'], [F.PATH.id, 840], 'the place is in the same slot at the same time');
    assert.deepEqual([now['1-morning'], now['1-midday'], now['1-evening']], [[F.TRAIL.id, 540], [F.LUNCH.id, 720], [F.DINNER.id, 1080]], 'every other stop and time is as it was');
    assert.equal(Object.keys(now).length, 4);
    assert.ok(r.reply.startsWith(`Done. Swapped Fixture Spray Park NFT for Fixture Creekside Bike Path NFT at 2 PM. It’s in ${TOWN2}, outside ${TOWN} (about `), r.reply);
    assert.match(r.reply, /km in a straight line\)\. Nothing else changed\.$/);
    HONEST(r.reply);
    // The stay, the budget, the party and no alcohol are as they were.
    assert.equal(r.plan.whereToStay.pick.id, F.HOTEL.id); assert.equal(r.stayBlock, undefined); assert.equal(r.stayPref, undefined);
    assert.equal(r.req.text, REQ);
    assert.deepEqual([r.plan.budget.amount, r.plan.budget.scope], [300, 'total']);
    assert.equal(r.plan.whereToStay.pick.budget.limit, 300);
    assert.deepEqual(r.plan.whereToStay.trip.kidAges, [15]);
    assert.ok((r.plan.evidence || []).some((e) => e.ask === 'no_alcohol'));
    // What the page needs to keep it through later changes (and for Undo to have something to undo).
    assert.equal(r.req.pinned['1-afternoon'], F.PATH.id); assert.equal(r.req.soft['1-afternoon'], F.PATH.id);
    assert.ok(r.req.excludeVenueIds.includes(F.SPRAY.id));
    // The stop is listed under its own town.
    const stop = r.plan.days[0].stops.find((s) => s.venue && s.venue.id === F.PATH.id);
    assert.equal(stop.venue.region, REGION2);
  }
  // French.
  const fr = await turn('oui', { offer: [offerOf()], lang: 'fr' });
  assert.ok(fr.plan && fr.reply.startsWith(`C’est fait. J’ai remplacé Fixture Spray Park NFT par Fixture Creekside Bike Path NFT à 14 h. C’est à ${TOWN2}, hors d`), fr.reply);
  // The stop is gone by the time of the yes: said, and nothing changes.
  const gone = await turn('yes', { offer: [offerOf()], stops: stopsOn().filter((s) => s.id !== F.SPRAY.id) });
  assert.equal(gone.plan, null); assert.match(gone.reply, /^That stop isn’t on your plan any more/);
  // A winery bike tour is refused even if asked for by an old offer on a no-alcohol trip.
  const bad = await turn(`Fixture Vineyard Bike Tours NFT [swap ${F.SPRAY.id}>${F.WINEBIKE.id} cycling 15]`, { offer: [`Fixture Vineyard Bike Tours NFT [swap ${F.SPRAY.id}>${F.WINEBIKE.id} cycling 15]`] });
  assert.equal(bad.plan, null); assert.match(bad.reply, /so Fixture Spray Park NFT stays\.$/);
});

test('5. no, another request or a budget message leaves the plan as it is, and is read as itself', async () => {
  const offer = [offerOf()];
  const no = await turn('no thanks', { offer });
  assert.equal(no.reply, 'OK, I left your plan as it is.'); assert.equal(no.plan, null);
  // The same request again is the same answer (not a yes).
  const again = await turn(SWAP, { offer });
  assert.equal(again.plan, null); assert.match(again.reply, /Swap it in\?$/);
  // A budget question and a budget statement are answered as that.
  const q = await turn('is that within our budget?', { offer });
  assert.match(q.reply, /^Estimate: /); assert.equal(q.plan, null);
  const b = await turn('keep it under $280', { offer });
  assert.match(b.reply, /^Budget noted: \$280 total\. /); assert.equal(b.plan, null);
  // An unrelated change is that change only.
  const other = await turn('remove the taco counter', { offer });
  assert.ok(!other.plan || at(other.plan)['1-afternoon'][0] === F.SPRAY.id); assert.doesNotMatch(other.reply, /Creekside/);
  // The bug this fixes too: a swap request sent while the cheaper-stay offer is pending never changes the stay.
  const stayOffer = ['Fixture Thrifty Motel NFT [stay cheaper]'];
  for (const m of [SWAP, 'replace the taco counter with pizza', 'remove it', 'that looks good']) {
    const r = await turn(m, { offer: stayOffer });
    assert.equal(r.stayBlock, undefined, m); assert.doesNotMatch(r.reply, /Now staying/, m);
  }
  assert.equal((await turn('yes', { offer: stayOffer })).stayBlock.whereToStay.pick.id, F.CHEAP.id);
});

test('6. one question at a time: with a swap asked, the cheaper stay is only named; yes is the swap, the stay answers to its name', async () => {
  const r = await turn(BOTH);
  assert.equal(r.plan, null); assert.equal(r.stayBlock, undefined);
  // The budget answer is as it was; the cheaper stay follows it as a named option, with no question of its own.
  assert.match(r.reply, /^Estimate: [^.]+ for 2 vs your \$300 total: /);
  assert.match(r.reply, /Not counted: taxes, tips, fees, getting around\. Cheaper stay I list: Fixture Thrifty Motel NFT \(then [^)]+\); say its name to switch\. /);
  assert.doesNotMatch(r.reply, /Want to switch\?/);
  assert.match(r.reply, /Fixture Spray Park NFT stays\. Nearest elsewhere: Fixture Creekside Bike Path NFT\. .*Swap it in\?$/);
  assert.equal((r.reply.match(/\?/g) || []).length, 1, 'one question');
  assert.deepEqual(r.offer, [offerOf(), 'Fixture Thrifty Motel NFT [stay cheaper]']);
  assert.equal(r.choices.length, 2);
  // yes -> the swap (the stay stays); the stay's name -> the stay (the stops stay).
  const yes = await turn('yes', { offer: r.offer });
  assert.ok(yes.plan && at(yes.plan)['1-afternoon'][0] === F.PATH.id); assert.equal(yes.plan.whereToStay.pick.id, F.HOTEL.id); assert.equal(yes.stayBlock, undefined);
  const stay = await turn('the Thrifty Motel', { offer: r.offer });
  assert.equal(stay.plan, null); assert.equal(stay.stayBlock.whereToStay.pick.id, F.CHEAP.id);
  // Alone, the cheaper stay is asked as before.
  const alone = await turn('Does this stay within our total $300 budget?');
  assert.match(alone.reply, /Want to switch\?$/); assert.equal(alone.choices, undefined);
  assert.equal(B.readBudget(REQ).amount, 300);
});

test('7. the page: the two buttons, the listing in a new tab, the offer sent as it was worded', () => {
  assert.ok(PAGE.includes('<div class="v4-chat-acts" id="v4ChatActs" hidden></div>'));
  assert.ok(PAGE.includes('target="_blank" rel="noopener" data-v4-chat-view'));
  assert.ok(PAGE.includes('data-v4-offer="'));
  assert.ok(PAGE.includes("chatSend(String(b.getAttribute('data-v4-offer') || '').slice(0, 400), null, b.textContent, false, true)"));
  assert.ok(PAGE.includes('choices: Array.isArray(j.choices) ? j.choices : null'));
  // Only a path on this site is ever linked.
  assert.ok(PAGE.includes("c.kind === 'view' && typeof c.url === 'string' && /^\\/(?!\\/)/.test(c.url)"));
});
