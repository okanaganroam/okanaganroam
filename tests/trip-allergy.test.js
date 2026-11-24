'use strict';
// Build My Trip: a food allergy is a need of the trip, said honestly everywhere (2026-11-23). The owner's request, on the
// live site at 390px:
//   "Plan a 2-day trip in Kelowna for 3 adults on August 14–15, 2027. We want live music, a lakeside dinner and a hotel.
//    One person has a severe peanut allergy, so all meals must be peanut-free. We have a car."
// The plan suggested restaurants and said nothing of the allergy (its words were matched against descriptions); only
// the chat, asked later, said it could not confirm allergens; the shared copy carried neither.
// The site holds no allergen or cross-contact data. So: the allergy is read, taken out of what the planner searches
// for, and said as NOT CONFIRMED on the summary, Details, every card that serves food, the chat, the Book my trip sheet
// and the shared copy. Nothing is ever worked out from a badge, a cuisine or a description, and nothing says a place
// fits. A shared link or copied itinerary names the allergen only when the traveller ticks the box.
// Parts 1-9 are pure; parts 10-14 run the planner and the chat on the repo's seed database (word rules, no AI).
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

Object.assign(process.env, { TRIP_PLANNER_V3: 'on', TRIP_V4: 'on', TRIP_STAYS: 'on', TRIP_CHAT: 'on', TRIP_PLAN_API: 'on', STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', DISCOVERCARS_AID: 'okanaganroam', TRIP_CHAT_TIMING: 'off', ANTHROPIC_API_KEY: '' });
const AL = require('../trip-allergy-need.js');
const A = require('../trip-access-needs.js');
const H = require('../trip-honest-plan.js');
const L = require('../trip-workspace-layout.js');
const tc = require('../trip-chat.js');
const SITE = require('../trip-site.js');
const WR = SITE.brand === 'Whistler Roam';
const REGION = WR ? 'whistler' : 'vernon';
const TOWN = WR ? 'Whistler' : 'Vernon';
const AT = WR ? [50.1163, -122.9574] : [50.267, -119.272];
const V4 = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const WS = fs.readFileSync(require.resolve('../trip-workspace-layout.js'), 'utf8');

const OWNER = 'Plan a 2-day trip in Kelowna for 3 adults on August 14–15, 2027. We want live music, a lakeside dinner and a hotel. One person has a severe peanut allergy, so all meals must be peanut-free. We have a car.';
// A wording that would claim a place is fine for the allergy. No generated string may match it.
const CLAIM_RE = /✓|\bsafe\b|\bsuitable\b|\bsuits\b|[a-z]-free\b|\bfree of\b|\bfriendly\b|\bguarantee|\bsans danger\b|s[ée]curitaire|\bconvient\b|\badapt[ée]/i;
const read = (t) => AL.readAllergy(t);
const keys = (t) => { const n = read(t); return n ? `${n.kind}:${n.allergens.join('+')}` : null; };

test('1. the allergy is read from the request: the allergens, severity words, English and French', () => {
  const n = read(OWNER);
  assert.deepEqual(n, { key: 'allergy', kind: 'allergy', allergens: ['peanut'], severe: true, phrase: '' });
  const cases = {
    'my son is allergic to tree nuts and shellfish': 'allergy:tree_nut+shellfish',
    'a nut allergy in the group': 'allergy:nut',
    'allergies: eggs, dairy and soy': 'allergy:egg+dairy+soy',
    'one of us has a fish allergy': 'allergy:fish',
    'she has a sesame allergy and a wheat allergy': 'allergy:sesame+wheat',
    'a milk allergy': 'allergy:dairy',
    'gluten allergy': 'allergy:gluten',
    'seafood allergy': 'allergy:seafood',
    'My daughter is anaphylactic to eggs and carries an EpiPen': 'allergy:egg',
    'he carries an EpiPen': 'allergy:',
    'severe food allergies in the group': 'allergy:',
    'allergy-friendly restaurants please': 'allergy:',
    'Une personne a une allergie grave aux arachides': 'allergy:peanut',
    'elle est allergique aux fruits de mer et aux noix': 'allergy:nut+shellfish',
    'allergie aux œufs': 'allergy:egg',
    'allergique au lait': 'allergy:dairy',
    // No allergy word: a food to keep out, handled the same cautious way but never called an allergy.
    'no peanuts please': 'avoid:peanut',
    'all meals must be peanut-free': 'avoid:peanut',
    'nut-free and dairy-free restaurants': 'avoid:nut+dairy',
    'we can’t eat shellfish': 'avoid:shellfish',
    'one of us is lactose intolerant': 'avoid:dairy',
    'des repas sans arachides ni noix': 'avoid:peanut+nut',
    'repas sans produits laitiers': 'avoid:dairy',
  };
  for (const [t, want] of Object.entries(cases)) assert.equal(keys(`A weekend in ${TOWN}. ${t}.`), want, t);
  for (const t of ['a severe peanut allergy', 'a life-threatening nut allergy', 'anaphylactic to shellfish', 'an EpiPen for peanuts', 'une allergie grave aux arachides']) assert.equal(read(t).severe, true, t);
  assert.equal(read('a mild peanut allergy').severe, false);
  // Not a food allergy, or not an allergy at all.
  for (const t of ['a weekend with wineries and seafood', 'fish and chips by the lake', 'no allergies', 'we don’t have any food allergies', 'nobody has a nut allergy', 'I am allergic to cats', 'hay fever and pollen allergies', 'peanut butter cookies and a donut shop',
    'no seafood restaurants', 'no fishing', 'a coconut dessert', 'aucune allergie', 'gluten-free dining', 'sans gluten', 'one of us is celiac', 'vegan and vegetarian food', 'an egg breakfast', 'wine and cheese']) assert.equal(read(`A weekend in ${TOWN}, ${t}`), null, t);
});

test('2. its words are taken out of what the planner searches for; everything else in the request is left as typed', () => {
  assert.equal(AL.stripAllergy(OWNER), 'Plan a 2-day trip in Kelowna for 3 adults on August 14–15, 2027. We want live music, a lakeside dinner and a hotel. We have a car.');
  assert.equal(AL.stripAllergy('We want live music and a lakeside dinner for someone with a peanut allergy'), 'We want live music and a lakeside dinner');
  assert.equal(AL.stripAllergy('we want a lakeside dinner that’s peanut-free and live music'), 'we want a lakeside dinner and live music');
  assert.equal(AL.stripAllergy('3 days in Penticton, no peanuts please, wineries and beaches'), '3 days in Penticton, wineries and beaches');
  assert.equal(AL.stripAllergy('Une fin de semaine à Kelowna, allergie aux arachides, souper au bord du lac'), 'Une fin de semaine à Kelowna, souper au bord du lac');
  assert.equal(AL.stripAllergy('I love jazz but am allergic to shellfish'), 'I love jazz');
  for (const t of [OWNER, 'A weekend in Vernon, my son is allergic to tree nuts and shellfish', 'Kelowna weekend. My daughter is anaphylactic to eggs and carries an EpiPen.', 'weekend in Kelowna, dairy-free and nut-free restaurants', 'Deux jours à Vernon, repas sans arachides ni noix, une personne est allergique aux fruits de mer']) {
    const s = AL.stripAllergy(t);
    assert.ok(!/allerg|peanut|arachide|\bnuts?\b|noix|shellfish|fruits de mer|anaphyl|epipen|\bfree\b|severe|dairy|eggs?\b/i.test(s), `${t} -> ${s}`);
    assert.equal(read(s), null, s);
  }
  // A request with no allergy is not touched at all (the same string).
  for (const t of ['Plan a 3-day Kelowna weekend for 6 friends: two wineries, gluten-free dining, easy walks, a hotel with a pool, and live music. One person does not drink.', 'weekend in Penticton, vegan food, wineries, one of us is celiac',
    'a day in Kelowna with kids, no seafood restaurants', 'Une fin de semaine à Kelowna, souper au bord du lac, sans gluten', 'We have a car.', 'no allergies, we love seafood', '']) assert.equal(AL.stripAllergy(t), t);
});

const NEEDS = [
  { key: 'allergy', kind: 'allergy', allergens: ['peanut'], severe: true, phrase: '' },
  { key: 'allergy', kind: 'allergy', allergens: ['peanut', 'shellfish'], severe: false, phrase: '' },
  { key: 'allergy', kind: 'allergy', allergens: ['tree_nut', 'egg', 'dairy', 'soy', 'sesame'], severe: false, phrase: '' },
  { key: 'allergy', kind: 'allergy', allergens: [], severe: true, phrase: '' },
  { key: 'allergy', kind: 'avoid', allergens: ['peanut'], severe: false, phrase: '' },
  { key: 'allergy', kind: 'avoid', allergens: ['nut', 'dairy'], severe: false, phrase: '' },
  { key: 'allergy', kind: 'allergy', allergens: [], severe: false, phrase: '', anon: true },
  ...Object.keys(AL.ALLERGENS).flatMap((k) => [{ key: 'allergy', kind: 'allergy', allergens: [k], severe: false, phrase: '' }, { key: 'allergy', kind: 'avoid', allergens: [k], severe: false, phrase: '' }]),
];
const STOPS = [
  { id: 1, name: 'Corner Bistro', type: 'restaurant' }, { id: 2, name: 'Lake Café', type: 'cafe' }, { id: 3, name: 'Hill Winery', type: 'winery' },
  { id: 4, name: 'Tap House', type: 'pub' }, { id: 5, name: 'City Beach', type: 'beach' }, { id: 6, name: 'Vine Lunch', type: 'winery', meal: true }, { id: 7, name: 'Brew Hall', type: 'brewery' },
];
// Every string an entry (and the chat) can say for a need.
function allStrings(need) {
  const e = AL.entry(STOPS, need), out = [];
  const walk = (x) => { if (typeof x === 'string') out.push(x); else if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') Object.entries(x).forEach(([k, v]) => { if (!['ask', 'status', 'kind', 'share', 'allergens', 'foodTypes', 'name'].includes(k)) walk(v); }); };
  walk(e);
  for (const lang of ['en', 'fr']) {
    out.push(AL.chatReply('q', need, lang), AL.chatReply('swap', need, lang, { name: 'Corner Bistro', offer: true }), AL.chatReply('swap', need, lang, { offer: true }), AL.chatReply('swap', need, lang, {}),
      AL.chatReply('noted', need, lang, { recorded: true }), AL.chatReply('noted', need, lang, {}), AL.chatReply('fresh', need, lang, { names: 'Corner Bistro' }), AL.chatReply('keep', need, lang));
    const w = AL.words(need, lang === 'fr', !!need.anon); out.push(...Object.values(w));
  }
  return out;
}

test('3. the wording: unconfirmed, ask the restaurant; no string ever says a place is fine for the allergy', () => {
  const e = AL.entry(STOPS, NEEDS[0]);
  assert.equal(e.label, 'Peanut allergy');
  assert.equal(e.labelFr, 'Allergie aux arachides');
  assert.equal(e.short, 'Peanut allergy: not confirmed for any meal stop');
  assert.equal(e.shortFr, 'Allergie aux arachides : aucun repas confirmé');
  assert.equal(e.text, 'Peanut allergy: we don’t have allergen or cross-contact information for restaurants, so nothing is confirmed for any meal stop. Talk to each restaurant about the allergy and how food is prepared before you go.');
  assert.match(e.textFr, /^Allergie aux arachides : nous n’avons aucune information sur les allergènes ni sur la contamination croisée dans les restaurants; rien n’est donc confirmé pour aucun repas\. Parlez de l’allergie/);
  assert.equal(e.sheet, 'Peanut allergy: tell each restaurant when you book. Booking links don’t pass it on.');
  assert.equal(e.copy, 'Peanut allergy: not confirmed for any meal stop. Ask each restaurant before you go.');
  assert.equal(e.noteRest, 'Peanut allergy: ask the restaurant');
  assert.equal(e.noteRestFr, 'Allergie aux arachides : demandez au restaurant');
  assert.equal(e.noteOther, 'Peanut allergy: ask before you order');
  // The same lines without the allergen (a copy shared without the details).
  assert.equal(e.anon.short, 'Allergies: not confirmed for any meal stop');
  assert.equal(e.anon.noteRest, 'Allergies: ask the restaurant');
  assert.match(e.anon.text, /^Allergies: we don’t have allergen or cross-contact information/);
  // Other needs.
  assert.equal(AL.label(NEEDS[1]), 'Allergies (peanut, shellfish)');
  assert.equal(AL.label(NEEDS[1], true), 'Allergies (arachides, fruits de mer)');
  assert.equal(AL.label(NEEDS[2]), 'Allergies (tree nut, egg, dairy, +2)');
  assert.equal(AL.label(NEEDS[3]), 'Food allergy');
  assert.equal(AL.label(NEEDS[4]), 'No peanuts');
  assert.equal(AL.label(NEEDS[4], true), 'Sans arachides');
  assert.equal(AL.label(NEEDS[5]), 'No nuts or dairy');
  assert.equal(AL.label(NEEDS[5], true), 'Sans noix ni produits laitiers');
  for (const need of NEEDS) {
    const en = AL.entry(STOPS, need);
    // Never anything but unknown; never a yes on a stop; a card note short enough for one line.
    assert.equal(en.status, 'unknown');
    for (const r of en.stops) { assert.equal(r.has, null); assert.equal(r.check, true); assert.ok(r.note.length <= 52 && r.noteFr.length <= 62, `${r.note} / ${r.noteFr}`); }
    for (const s of allStrings(need)) assert.ok(!CLAIM_RE.test(s), `${JSON.stringify(need.allergens)} ${need.kind}: ${s}`);
    // A copy without the details names no allergen.
    const anon = JSON.stringify(en.anon) + en.stops.map((r) => r.noteAnon + r.noteAnonFr).join(' ');
    for (const k of need.allergens) for (const w of [AL.ALLERGENS[k].en[0], AL.ALLERGENS[k].en[1], AL.ALLERGENS[k].fr[1]]) assert.ok(!new RegExp(`\\b${w}\\b`, 'i').test(anon), `${w} in ${anon}`);
  }
});

test('4. the evidence row: every stop that serves food, and only those; a place with no food stop says so', () => {
  const e = AL.entry(STOPS, NEEDS[0]);
  assert.deepEqual(e.stops.map((r) => r.id), [1, 2, 4, 6, 7]); // restaurant, café, pub, winery lunch, brewery; not a tasting room or a beach
  assert.equal(e.stops.find((r) => r.id === 1).note, 'Peanut allergy: ask the restaurant');
  assert.equal(e.stops.find((r) => r.id === 4).note, 'Peanut allergy: ask before you order');
  const none = AL.entry([{ id: 5, name: 'City Beach', type: 'beach' }], NEEDS[0]);
  assert.deepEqual(none.stops, []);
  assert.equal(none.short, 'Peanut allergy: restaurants aren’t checked');
});

const stop = (daypart, id, name, type, badges = []) => ({ daypart, label: daypart, venue: { id, name, type, region: 'kelowna', badges: badges.map((key) => ({ key })) }, reasons: [] });
function planOf(needs, extra = {}) {
  return { kind: 'multi_day', query: OWNER, requirementResults: [], warnings: [], needs, intent: { features: [] },
    days: [{ day: 1, stops: [stop('morning', 11, 'Plant Kitchen', 'restaurant', ['vegan', 'vegetarian', 'gluten_free']), stop('afternoon', 12, 'City Beach', 'beach'), stop('evening', 13, 'Lake Grill', 'restaurant', ['lake_view']), stop('night', 14, 'Tap House', 'pub', ['live_music'])] },
      { day: 2, stops: [stop('morning', 15, 'Bean Café', 'cafe', ['vegan'])] }], ...extra };
}
const ev = (p, ask) => (p.evidence || []).find((e) => e.ask === ask);

test('5. the plan: the allergy entry comes first, is never met by a badge, and leads the summary; Details has the sentence', () => {
  const p = H.applyEvidence(planOf([NEEDS[0]]), { flags: () => null });
  assert.equal(p.evidence[0].ask, 'allergy');
  const e = ev(p, 'allergy');
  assert.equal(e.status, 'unknown');
  // Its sentence is printed by the page on its own, first (under Details on a phone), and takes none of the three
  // lines the other asks share: three other flagged asks are all still printed.
  assert.equal(e.line, undefined);
  assert.match(V4, /var a = v4AllergyEntry\(\); return a && a\.text \? '<p class="v4-tip v4-picked v4-evidence v4-allergy-line" data-ev-status="unknown">' \+ esc\(\(fr && a\.textFr\) \|\| a\.text\) \+ '<\/p>' : '';/);
  const busy = H.applyEvidence(planOf([NEEDS[0]], { requirementResults: [{ kind: 'feature', value: 'patio', strength: 'must' }, { kind: 'feature', value: 'sports_tv', strength: 'must' }, { kind: 'feature', value: 'happy_hour', strength: 'must' }] }), { flags: () => null });
  assert.deepEqual(busy.evidence.filter((x) => x.line).map((x) => x.ask), ['patio', 'sports_tv', 'happy_hour']);
  // A vegan, vegetarian and gluten-free-friendly restaurant is exactly as unconfirmed as any other.
  assert.deepEqual(e.stops.map((r) => [r.id, r.has]), [[11, null], [13, null], [14, null], [15, null]]);
  assert.ok(!p.evidence.some((x) => ['vegan', 'vegetarian', 'gluten_free'].includes(x.ask)), 'no dietary badge ask was made from the allergy');
  for (const fr of [false, true]) {
    const facts = L.tripSummaryFacts(p, fr, {});
    assert.deepEqual([facts[0].kind, facts[0].status, facts[0].ask], ['flag', 'unknown', 'allergy']);
    assert.equal(facts[0].text, fr ? 'Allergie aux arachides : aucun repas confirmé' : 'Peanut allergy: not confirmed for any meal stop');
    assert.ok(!facts.some((f) => f.kind === 'ok' && /allerg/i.test(f.text)));
    assert.ok(!facts.some((f) => /✓/.test(f.text) && /allerg|peanut|arachide/i.test(f.text)));
  }
  // It still leads when a budget and other flags are there, and when its stops were removed on the page.
  const facts = L.tripSummaryFacts(p, false, { budget: { status: 'over', text: { summary: 'Budget $600: over' } }, removed: { 11: 1, 13: 1, 14: 1, 15: 1 } });
  assert.equal(facts[0].ask, 'allergy');
  assert.equal(facts[1].ask, 'budget');
});

test('6. each card: one short line, the allergy first; the same words in the shared copy’s notes', () => {
  const p = H.applyEvidence(planOf([{ key: 'dog', who: 'all', phrase: '' }, NEEDS[0]]), { flags: () => null });
  const n = A.stopNeedNotes(p, 13, false);
  assert.equal(n.notes[0], 'Peanut allergy: ask the restaurant');
  assert.equal(n.open[0], 'Peanut allergy: ask the restaurant'); // still to confirm, for the Book my trip list
  assert.equal(A.stopNeedNotes(p, 14, true).notes[0], 'Allergie aux arachides : demandez avant de commander');
  assert.ok(!A.stopNeedNotes(p, 12, false).notes.some((x) => /allerg/i.test(x)), 'a beach has no allergy note');
  assert.deepEqual(AL.stopNote(p, 13, false).note, 'Peanut allergy: ask the restaurant');
  // The page: the note by the stop's type (a place swapped in on the page says it too), the sheet's one line.
  assert.match(V4, /function v4AllergyEntry\(\)/);
  assert.match(V4, /alE\.foodTypes \|\| \[\]\)\.indexOf\(s\.venue\.type\) !== -1/);
  assert.match(V4, /out\.notes\.unshift\(alNote\); out\.compact\.unshift\(alNote\); out\.open\.unshift\(alNote\)/);
  assert.match(V4, /data-v4-book-allergy/);
});

test('7. sharing: the link names the allergen only when the traveller ticks the box; without it, a general line', () => {
  const base = { stops: 'venue:11,venue:13', days: '1,1' };
  // Off (the default): asks=allergy alone. No allergen is in the link or in the copy.
  const off = H.parseShareContext({ ...base, asks: 'allergy,live_music' });
  assert.equal(off.allergy, undefined);
  assert.ok(!/peanut|al=/.test(H.shareContextQuery(off)));
  const pOff = H.applyEvidence(H.sharedPlan(off, [{ id: 11, name: 'Plant Kitchen', type: 'restaurant', day: 1, start: 720 }, { id: 13, name: 'Lake Grill', type: 'restaurant', day: 1, start: 1080 }], [], null), {});
  assert.deepEqual(pOff.needs.map((n) => [n.key, n.anon, n.allergens]), [['allergy', true, []]]);
  assert.equal(ev(pOff, 'allergy').text, 'Allergies: we don’t have allergen or cross-contact information for restaurants, so nothing is confirmed for any meal stop. Talk to each restaurant about any allergy and how food is prepared before you go.');
  assert.equal(A.stopNeedNotes(pOff, 11, false).text, 'Allergies: ask the restaurant');
  assert.ok(!/peanut|arachide/i.test(JSON.stringify(pOff.evidence)));
  // On: al=peanut. The copy names it.
  const on = H.parseShareContext({ ...base, asks: 'allergy,live_music', al: 'peanut' });
  assert.deepEqual(on.allergy, { kind: 'allergy', allergens: ['peanut'] });
  assert.match(H.shareContextQuery(on), /(?:^|&)asks=allergy,live_music&al=peanut$/);
  const pOn = H.applyEvidence(H.sharedPlan(on, [{ id: 11, name: 'Plant Kitchen', type: 'restaurant', day: 1, start: 720 }], [], null), {});
  assert.equal(ev(pOn, 'allergy').label, 'Peanut allergy');
  assert.equal(A.stopNeedNotes(pOn, 11, true).text, 'Allergie aux arachides : demandez au restaurant');
  // A food to keep out that was never called an allergy, and several allergens.
  assert.deepEqual(H.parseShareContext({ ...base, asks: 'allergy', al: 'x.peanut' }).allergy, { kind: 'avoid', allergens: ['peanut'] });
  assert.deepEqual(H.parseShareContext({ ...base, asks: 'allergy', al: 'shellfish,peanut' }).allergy.allergens, ['peanut', 'shellfish']);
  assert.equal(AL.toShare(NEEDS[1]), 'peanut,shellfish');
  assert.equal(AL.toShare(NEEDS[4]), 'x.peanut');
  assert.equal(AL.toShare(NEEDS[3]), '');
  // Only known keys, only with the allergy ask; anything else is ignored (never free text in the link).
  for (const al of ['Peanut', 'peanut butter', 'kiwi', '<script>', 'peanut;drop', '']) assert.equal(H.parseShareContext({ ...base, asks: 'allergy', al }).allergy, undefined, al);
  assert.equal(H.parseShareContext({ ...base, asks: 'live_music', al: 'peanut' }).allergy, undefined);
  // Older links open as they did: no allergy ask, no allergy line.
  const old = H.parseShareContext({ ...base, asks: 'live_music,gluten_free', ad: '3' });
  const pOld = H.applyEvidence(H.sharedPlan(old, [{ id: 11, name: 'Plant Kitchen', type: 'restaurant', day: 1, start: 720 }], [], null), {});
  assert.equal(ev(pOld, 'allergy'), undefined);
  assert.equal(pOld.needs, undefined);
  assert.equal(H.parseShareContext(base), null);
  // The page: al= only through the tick; the tick is off until the traveller sets it; the copied text follows it.
  assert.match(V4, /function v4ShareAllergyOn\(\)\{ var e = v4AllergyEntry\(\); return e && e\.share && v4\.shareAllergy === e\.share \? e : null; \}/);
  assert.match(V4, /var alOn = v4ShareAllergyOn\(\);\n\s+if \(alOn && [^\n]+ out \+= '&al=' \+ alOn\.share;/);
  assert.ok(!/shareAllergy\s*[:=]\s*true/.test(V4 + WS), 'the tick is never on by default');
  assert.match(V4, /if \(alE\) lines\.push\(alOn \? \(\(fr && alE\.copyFr\) \|\| alE\.copy\) : \(\(fr && alAnon\.copyFr\) \|\| alAnon\.copy \|\| ''\)\);/);
  assert.match(WS, /id="twShareAl"/);
  assert.match(WS, /Include “'\+alName\+'”/);
  assert.match(WS, /Inclure « '\+alName\+' »/);
  assert.match(WS, /Off: the link and itinerary only say allergies aren’t checked\./);
  assert.match(WS, /v4\.shareAllergy=e\.target\.checked\?alE\.share:null;url=v4ShareLink\(list\);text=v4ShareText\(\)/);
});

test('8. a plan without an allergy is untouched: no entry, no summary item, no note, no new link value', () => {
  const p = H.applyEvidence(planOf([{ key: 'dog', who: 'all', phrase: '' }], { query: 'A weekend in Kelowna with our dog' }), { flags: () => null });
  assert.equal(ev(p, 'allergy'), undefined);
  assert.ok(!L.tripSummaryFacts(p, false, {}).some((f) => f.ask === 'allergy'));
  assert.ok(!A.stopNeedNotes(p, 13, false).notes.some((x) => /allerg/i.test(x)));
  assert.equal(A.stopNeedNotes(p, 13, false).allergy, undefined);
  const q = H.parseShareContext({ stops: 'venue:11', days: '1', asks: 'dog_friendly', ad: '2' });
  assert.equal(H.shareContextQuery(q), 'ad=2&asks=dog_friendly');
});

// The chat's word rules, on a fixture page.
const PAGE = [
  { key: '1-morning', id: 11, name: 'Plant Kitchen', type: 'restaurant', day: 1, start: 540, badges: ['vegan', 'gluten_free'] },
  { key: '1-midday', id: 16, name: 'Noodle Bar', type: 'restaurant', day: 1, start: 720, badges: [] },
  { key: '1-afternoon', id: 12, name: 'City Beach', type: 'beach', day: 1, start: 840, badges: [] },
  { key: '1-evening', id: 13, name: 'Marlow Grill', type: 'restaurant', day: 1, start: 1080, badges: ['lake_view'] },
  { key: '2-morning', id: 15, name: 'Bean Café', type: 'cafe', day: 2, start: 540, badges: ['vegan'] },
];
const rules = (message, request = OWNER) => tc.rulesRead(message, PAGE, { regions: ['kelowna'], regionLabels: { kelowna: 'Kelowna' }, days: 2, request });
const shape = (r) => (r.ops || []).map((o) => [o.o, o.value || '', (o.stops || []).map((s) => s.id).join(','), o.al ? `${o.al.kind}:${o.al.allergens.join('+')}` : '', o.say || ''].join('|'));

test('9. the chat’s word rules (no AI): a question is answered, the need is recorded, a swap for a place free of it is never made', () => {
  // Questions: nothing changes.
  for (const m of ['Are these restaurants safe for a peanut allergy?', 'is the day 1 dinner ok for a peanut allergy?', 'are these safe?', 'Est-ce que ces restaurants sont sécuritaires pour une allergie aux arachides?']) {
    const r = rules(m);
    assert.deepEqual(shape(r), ['ask|q_allergy||allergy:peanut|'], m);
    assert.equal(r.explain, true, m);
    assert.equal(r.access, true, m); // fixed rules: the AI's reading never stands in for them
  }
  // A swap, an add or a search that asks for a place free of the allergen: an answer (ask), never a replace or an add.
  for (const [m, want] of [
    ['Swap the day 1 dinner for somewhere peanut-free', 'ask|q_allergy_swap|13|allergy:peanut|Swap the day 1 dinner'],
    ['replace the day 1 lunch with a peanut-safe restaurant', 'ask|q_allergy_swap|16|allergy:peanut|replace the day 1 lunch'],
    ['swap Marlow Grill for a restaurant that is safe for a peanut allergy', 'ask|q_allergy_swap|13|allergy:peanut|swap Marlow Grill for a restaurant'],
    ['Remplace le souper du jour 1 par un endroit sans arachides', 'ask|q_allergy_swap|13|allergy:peanut|Remplace le souper du jour 1 par un endroit'],
    ['swap dinner on day 1 for somewhere safer', 'ask|q_allergy_swap|13|allergy:peanut|swap dinner on day 1'],
  ]) {
    const r = rules(m);
    assert.deepEqual(shape(r), [want], m);
    assert.ok(!r.ops.some((o) => ['replace', 'add', 'refine', 'swap_to'].includes(o.o)), m);
  }
  // The need said in the chat: recorded (an op of its own), then explained when the same message asks for a change.
  assert.deepEqual(shape(rules('one of us is allergic to shellfish', 'A weekend in Kelowna')), ['allergy|||allergy:shellfish|']);
  assert.deepEqual(shape(rules('no peanuts please', 'A weekend in Kelowna')), ['allergy|||avoid:peanut|']);
  assert.deepEqual(shape(rules('ma fille est allergique aux fruits de mer', 'Une fin de semaine à Kelowna')), ['allergy|||allergy:shellfish|']);
  assert.deepEqual(shape(rules('add a nut-free bakery on day 2', 'A weekend in Kelowna')), ['allergy|||avoid:nut|', 'ask|q_allergy_swap||avoid:nut|add bakery on day 2']);
  // "Remove the allergy": the note stays (it cannot be taken off here), and the reply says so. Nothing changes.
  assert.deepEqual(rules('remove the peanut allergy').ops.map((o) => [o.o, o.value, o.keep]), [['ask', 'q_allergy', true]]);
  assert.equal(AL.chatReply('keep', NEEDS[0], 'en'), 'I’ve kept the note (peanut allergy): I can’t take it off this plan. To plan without it, start a new request.');
  // A "safe" question about something else is read as it was before (never as a question about the plan's allergy).
  for (const m of ['is the trail safe for kids?', 'is it safe to walk back at night?', 'is the lake safe for swimming?']) assert.deepEqual(rules(m), rulesBase(m, OWNER), m);
  // Already on the plan: said again, it is answered, not recorded twice.
  assert.deepEqual(shape(rules('remember the peanut allergy')), ['ask|q_allergy||allergy:peanut|']);
  // The rest of a message is still read (done first), and the allergy part never becomes a swap.
  const mixed = rules('Swap the day 1 dinner for somewhere peanut-free and add a winery on day 2');
  assert.deepEqual(mixed.ops.map((o) => o.o), ['add', 'ask']);
  assert.equal(mixed.ops[1].value, 'q_allergy_swap');
  // Nothing about an allergy: read exactly as before.
  for (const m of ['swap the day 1 dinner', 'add a winery on day 2', 'is everything gluten-free?', 'a cheaper dinner', 'remove City Beach', 'we don’t have any allergies', 'is the day 1 dinner good for celiac?']) {
    assert.deepEqual(rules(m, 'A weekend in Kelowna'), rulesBase(m), m);
  }
  // The replies.
  assert.equal(AL.chatReply('q', NEEDS[0], 'en'), 'Peanut allergy: I can’t confirm that for any meal stop. Listings don’t list allergens or how food is prepared, so talk to each restaurant about the allergy before you go.');
  assert.equal(AL.chatReply('swap', NEEDS[0], 'en', { name: 'Lake Grill', offer: true }), 'Peanut allergy: I can’t check any restaurant for it (listings don’t list allergens or how food is prepared), so I’ve kept Lake Grill. I can make the change anyway; the new place would be just as unconfirmed. Want that?');
  assert.equal(AL.chatReply('fresh', NEEDS[0], 'en', { names: 'Noodle Bar' }), 'Peanut allergy: not confirmed for Noodle Bar either. Ask before you go.');
  assert.match(AL.chatReply('noted', NEEDS[0], 'fr', { recorded: true }), /^C’est noté : allergie aux arachides\. Je ne peux le confirmer pour aucun repas/);
});
// What the rules read before this change, for a message with no allergy in it.
function rulesBase(m, request = 'A weekend in Kelowna') {
  const access = require('../trip-chat-access.js');
  const base = { stops: [], kind: null, time: null, day: null, value: null, n: null, ages: [], region: null, date: null };
  const opts = { regions: ['kelowna'], regionLabels: { kelowna: 'Kelowna' }, days: 2, request };
  return access.read(m, PAGE, { op: (o, extra = {}) => ({ ...base, o, ...extra }), stopsNamed: tc.stopsNamed, kindsNamed: tc.kindsNamed }) || tc.groupRead(m, PAGE, opts) || tc.agent.readAll(m, (x) => tc.rulesReadOne(x, PAGE, opts));
}

// ---------- End to end: the planner and the chat handler on test listings made for this file ----------
const app = require('../server.js');
const db = require('../db.js');
const made = [];
const F = {};
const HOURS = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['07:00', '22:00']]])));
const mk = (key, dKm, o) => {
  const n = made.length + 1;
  const v = app.createVenue({ region: REGION, address: `${700 + n} Allergy Test Road, ${TOWN}, BC`, latitude: AT[0] + dKm / 111, longitude: AT[1], description: 'A place used only by the allergy tests. Open all year.', slug: `allergy-test-${key.toLowerCase().replace(/_/g, '-')}`, hours: HOURS, ...o });
  made.push(v.id); F[key] = v; return v;
};
test.before(() => {
  // A place whose own words say everything the old reader matched ("peanut", "allergy", "free"), with every dietary badge.
  mk('R_WORDS', 0.2, { type: 'restaurant', name: 'Sprig Kitchen AL', description: 'A peanut-free, allergy friendly vegan kitchen. Severe allergies welcome; free of nuts. Meals for everyone.', vegan: 1, vegetarian: 1, gluten_free: 1, price: 2 });
  mk('R_PLAIN', 0.4, { type: 'restaurant', name: 'Harrow Grill AL', price: 2 });
  mk('R_THAI', 0.5, { type: 'restaurant', name: 'Satay House AL', cuisine: 'Thai', description: 'Thai curries and peanut satay. Open all year.', price: 2 });
});
test.after(() => {
  app.setTripChatReader(null);
  for (const id of made) db.prepare('DELETE FROM venues WHERE id = ?').run(id);
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const run = (text) => app.runTripPlanRequest({ ...app.parseTripPlanBody({ text }, { v4: true, stays: true }).value, v4: true }, true);
const REQ_BASE = `Plan a 2-day trip in ${TOWN} for 3 adults on August 14–15, 2027. We want live music, a nice dinner and a hotel.`;
const REQ = `${REQ_BASE} One person has a severe peanut allergy, so all meals must be peanut-free. We have a car.`;
const stopIds = (p) => (p.days || []).flatMap((d) => (d.stops || []).filter((s) => s.venue).map((s) => `${d.day}-${s.daypart}:${s.venue.id}`));
const pageOf = (p, text) => ({ text, stops: (p.days || []).flatMap((d) => (d.stops || []).filter((s) => s.venue).map((s) => { const r = (p.schedule || []).find((x) => x.day === d.day && x.venueId === s.venue.id); return { key: `${d.day}-${s.daypart}`, id: s.venue.id, ...(r && Number.isInteger(r.startMinutes) ? { start: r.startMinutes } : {}) }; })) });
const say = async (page, message, lang = 'en', offer = null) => {
  const parsed = app.parseTripChatBody({ message, lang, plan: { text: page.text, seed: 0, excludeVenueIds: [] }, locks: {}, removed: [], stops: page.stops, dayDates: ['2027-08-14', '2027-08-15'], ...(offer ? { offer } : {}) }, { stays: true });
  assert.ok(!parsed.error, parsed.error);
  return (await app.runTripChatTurn(parsed.value, { staysOn: true, lang })).response;
};
const foodIds = (p) => (p.days || []).flatMap((d) => (d.stops || []).filter((s) => s.venue && AL.FOOD_TYPES.includes(s.venue.type)).map((s) => s.venue.id));

test('10. the planner: the allergy is on the plan and changes no pick; no listing is matched, ranked or kept out by its words', () => {
  const p = run(REQ), plain = run(`${REQ_BASE} We have a car.`);
  assert.ok(['multi_day', 'day_plan'].includes(p.kind), p.kind);
  // The need and its entry, first.
  assert.deepEqual(p.needs.filter((n) => n.key === 'allergy'), [{ key: 'allergy', kind: 'allergy', allergens: ['peanut'], severe: true, phrase: '' }]);
  assert.equal(p.evidence[0].ask, 'allergy');
  assert.equal(p.evidence[0].status, 'unknown');
  assert.deepEqual(p.evidence[0].stops.map((r) => r.id).sort(), [...new Set(foodIds(p))].sort());
  assert.ok(p.evidence[0].stops.length > 0);
  assert.ok(p.evidence[0].stops.every((r) => r.has === null));
  // Exactly the stops of the same request without the allergy sentence: nothing was picked, ranked or left out for it
  // (not the kitchen whose description says "peanut-free, allergy friendly", not the Thai place).
  assert.deepEqual(stopIds(p), stopIds(plain));
  assert.deepEqual((p.whereToStay && p.whereToStay.pick && p.whereToStay.pick.id) || null, (plain.whereToStay && plain.whereToStay.pick && plain.whereToStay.pick.id) || null);
  // The reader: no badge, cuisine or search word came from the allergy.
  const i = p.intent || {};
  assert.deepEqual((i.features || []).filter((f) => ['vegan', 'vegetarian', 'gluten_free', 'nonalcoholic'].includes(f)), []);
  assert.deepEqual(i.textTerms || [], (plain.intent || {}).textTerms || []);
  assert.deepEqual((i.foodTerms || []).map((t) => t.term), ((plain.intent || {}).foodTerms || []).map((t) => t.term));
  assert.deepEqual((i.excluded && i.excluded.cuisines) || [], []);
  assert.ok(!(p.requirementResults || []).some((r) => r && r.kind === 'feature' && ['vegan', 'vegetarian', 'gluten_free'].includes(r.value)));
  const said = JSON.stringify([p.warnings, p.notes, p.notIncluded || [], (p.days || []).flatMap((d) => d.stops.map((s) => [s.why, s.reasons]))]);
  assert.ok(!/peanut|allerg|“free”|“severe”|“meals”/i.test(said), said.slice(0, 400));
  // Everything else the request asked for reads as it did: the same lines, in the same words.
  const rest = (x) => (x.evidence || []).filter((e) => e.ask !== 'allergy').map((e) => [e.ask, e.status, e.text]);
  assert.deepEqual(rest(p), rest(plain));
  assert.deepEqual(p.tripDates, plain.tripDates);
  // The summary and the cards.
  const facts = L.tripSummaryFacts(p, false, {});
  assert.equal(facts[0].text, 'Peanut allergy: not confirmed for any meal stop');
  for (const id of foodIds(p)) assert.match(A.stopNeedNotes(p, id, false).notes[0], /^Peanut allergy: ask (?:the restaurant|before you order)$/);
  // And the plain plan has nothing of it.
  assert.ok(!(plain.needs || []).some((n) => n.key === 'allergy'));
  assert.ok(!(plain.evidence || []).some((e) => e.ask === 'allergy'));
  assert.ok(!/allerg/i.test(JSON.stringify([plain.evidence, plain.needs, L.tripSummaryFacts(plain, false, {})])));
});

test('11. French: the request is read the same way, and a plan in French says it in French', () => {
  const fr = `Deux jours à ${TOWN} pour 3 adultes, un bon souper et un hôtel. Une personne a une allergie grave aux arachides, tous les repas doivent être sans arachides.`;
  const p = run(fr), plain = run(`Deux jours à ${TOWN} pour 3 adultes, un bon souper et un hôtel.`);
  assert.deepEqual(p.needs.filter((n) => n.key === 'allergy').map((n) => [n.kind, n.allergens, n.severe]), [['allergy', ['peanut'], true]]);
  assert.deepEqual(stopIds(p), stopIds(plain));
  assert.equal(L.tripSummaryFacts(p, true, {})[0].text, 'Allergie aux arachides : aucun repas confirmé');
  assert.ok(!/arachide|allerg/i.test(JSON.stringify([p.warnings, p.notIncluded || []])));
});

test('12. the chat: the honest answer, a swap that is not made, the offer taken on other grounds and still unconfirmed', async () => {
  const p = run(REQ), page = pageOf(p, REQ);
  const dinner = page.stops.find((s) => /^1-evening$/.test(s.key));
  assert.ok(dinner, 'day 1 has a dinner');
  const q = await say(page, 'Are these restaurants safe for a peanut allergy?');
  assert.equal(q.reply, 'Peanut allergy: I can’t confirm that for any meal stop. Listings don’t list allergens or how food is prepared, so talk to each restaurant about the allergy before you go.');
  assert.deepEqual([q.plan, q.changed, q.text], [null, [], undefined]);
  const sw = await say(page, 'Swap the day 1 dinner for somewhere peanut-free');
  assert.equal(sw.plan, null); // nothing swapped
  assert.deepEqual(sw.changed, []);
  assert.match(sw.reply, /^Peanut allergy: I can’t check any restaurant for it \(listings don’t list allergens or how food is prepared\), so I’ve kept .+\. I can make the change anyway; the new place would be just as unconfirmed\. Want that\?$/);
  assert.ok(!CLAIM_RE.test(sw.reply), sw.reply);
  assert.deepEqual(sw.offer, ['Swap the day 1 dinner']);
  // "yes": the swap, on other grounds; the reply and the new card say it is just as unconfirmed.
  const yes = await say(page, 'yes', 'en', sw.offer);
  assert.ok(yes.plan, yes.reply);
  assert.deepEqual(yes.changed, ['1-evening']);
  const fresh = yes.plan.days[0].stops.find((s) => s.daypart === 'evening').venue;
  assert.notEqual(fresh.id, dinner.id);
  assert.ok(yes.reply.endsWith(`Peanut allergy: not confirmed for ${fresh.name} either. Ask before you go.`), yes.reply);
  assert.ok(!CLAIM_RE.test(yes.reply), yes.reply);
  // The need is still there after the change: the request, the plan, its first line, the new card.
  assert.equal(AL.readAllergy(yes.req.text).allergens[0], 'peanut');
  assert.ok(yes.plan.needs.some((n) => n.key === 'allergy'));
  assert.equal(yes.plan.evidence[0].ask, 'allergy');
  assert.equal(A.stopNeedNotes(yes.plan, fresh.id, false).notes[0], 'Peanut allergy: ask the restaurant');
  // A plain swap on a plan with the allergy says the same of the new place.
  const plainSwap = await say(page, 'swap the day 1 dinner');
  assert.ok(plainSwap.plan, plainSwap.reply);
  assert.match(plainSwap.reply, /Peanut allergy: not confirmed for .+ either\. Ask before you go\.$/);
  // An Undo brings back a place that already had its note: no extra line.
  if (plainSwap.swapBack) { const page2 = pageOf(plainSwap.plan, plainSwap.req.text); const back = await say(page2, plainSwap.swapBack.say, 'en', [plainSwap.swapBack.say]); assert.ok(!/either/.test(back.reply), back.reply); assert.ok(!back.plan || back.plan.needs.some((n) => n.key === 'allergy')); }
  // In French.
  const fq = await say(page, 'Remplace le souper du jour 1 par un endroit sans arachides', 'fr');
  assert.equal(fq.plan, null);
  assert.match(fq.reply, /^Allergie aux arachides : je ne peux le vérifier pour aucun restaurant .+ Voulez-vous\?$/);
});

test('13. the chat: an allergy said later is recorded on the plan (request, summary line, cards) and swaps nothing', async () => {
  const text = `${REQ_BASE} We have a car.`;
  const p = run(text), page = pageOf(p, text);
  const r = await say(page, 'one of us is allergic to shellfish');
  assert.equal(r.plan, null);
  assert.deepEqual(r.changed, []);
  assert.match(r.reply, /^Noted: shellfish allergy\. I can’t confirm it for any meal stop: listings don’t list allergens or how food is prepared\. Talk to each restaurant about the allergy before you go\. It’s now on your plan and each meal card\.$/);
  assert.deepEqual(AL.readAllergy(r.text), { key: 'allergy', kind: 'allergy', allergens: ['shellfish'], severe: false, phrase: '' });
  assert.ok(r.text.startsWith(text.replace(/\.$/, '')), 'the request keeps its own words');
  assert.equal(r.needPatch.need.key, 'allergy');
  assert.equal(r.needPatch.evidence.short, 'Shellfish allergy: not confirmed for any meal stop');
  assert.deepEqual(r.needPatch.evidence.stops.map((x) => x.id).sort(), [...new Set(foodIds(p))].sort());
  // The next turn, a re-plan and a date change all read it from the request.
  const again = run(r.text);
  assert.deepEqual(stopIds(again), stopIds(p)); // and the picks did not move
  assert.equal(again.evidence[0].short, 'Shellfish allergy: not confirmed for any meal stop');
  const page2 = pageOf(again, r.text);
  const q = await say(page2, 'are these safe?');
  assert.match(q.reply, /^Shellfish allergy: I can’t confirm that for any meal stop\./);
  const sw = await say(page2, 'swap the day 1 dinner');
  assert.ok(sw.plan && sw.plan.needs.some((n) => n.key === 'allergy' && n.allergens[0] === 'shellfish'));
  assert.equal(AL.readAllergy(sw.req.text).allergens[0], 'shellfish');
  // A second allergen joins the first.
  const more = await say(page2, 'and my son has a peanut allergy');
  assert.deepEqual(AL.readAllergy(more.text).allergens, ['peanut', 'shellfish']);
  assert.equal(more.needPatch.evidence.label, 'Allergies (peanut, shellfish)');
  // A question about an allergy on a plan that has none records nothing.
  const only = await say(page, 'is the dinner place ok for a nut allergy?');
  assert.deepEqual([only.plan, only.text, only.needPatch], [null, undefined, undefined]);
  assert.match(only.reply, /^Nut allergy: I can’t confirm that for any meal stop\./);
  // Celiac keeps the gluten-free badge answer and its caution.
  const cel = await say(page, 'is everything ok for celiac?');
  assert.match(cel.reply, /^I can’t confirm that\. Listings only carry badges such as Gluten-Free-Friendly/);
});

test('14. the shared copy: the general line without the tick, the named line with it; nothing in a link to another site', () => {
  const p = run(REQ);
  const refs = stopIds(p).map((s) => `venue:${s.split(':')[1]}`), days = stopIds(p).map((s) => s.split('-')[0]);
  const base = { stops: refs.join(','), days: days.join(','), asks: (p.evidence || []).map((e) => e.ask).filter((a) => /^[a-z_]+$/.test(a)).join(','), ad: '3' };
  assert.match(base.asks, /^allergy/);
  const off = app.tripShareContext(base, 'en'), on = app.tripShareContext({ ...base, al: 'peanut' }, 'en'), onFr = app.tripShareContext({ ...base, al: 'peanut' }, 'fr');
  assert.equal(off.lines[0].text, 'Allergies: we don’t have allergen or cross-contact information for restaurants, so nothing is confirmed for any meal stop. Talk to each restaurant about any allergy and how food is prepared before you go.');
  assert.equal(on.lines[0].text, 'Peanut allergy: we don’t have allergen or cross-contact information for restaurants, so nothing is confirmed for any meal stop. Talk to each restaurant about the allergy and how food is prepared before you go.');
  assert.match(onFr.lines[0].text, /^Allergie aux arachides : /);
  const food = [...new Set(foodIds(p))];
  for (const id of food) {
    assert.match(off.stopNotes[`venue:${id}`].text, /^Allergies: ask (?:the restaurant|before you order)/);
    assert.match(on.stopNotes[`venue:${id}`].text, /^Peanut allergy: ask (?:the restaurant|before you order)/);
  }
  const htmlOff = app.tripShareContextHtml(off, 'en'), htmlOn = app.tripShareContextHtml(on, 'en');
  assert.ok(!/peanut|arachide/i.test(JSON.stringify(off) + htmlOff), 'without the tick the copy names no allergen');
  assert.match(htmlOff, /<p class="mt-ctx-note mt-ctx-allergy" data-mt-allergy><strong>Allergies: we don’t have allergen/);
  assert.match(htmlOn, /data-mt-allergy><strong>Peanut allergy: we don’t have allergen/);
  // Said once, before the place to stay and the other lines.
  assert.equal(htmlOn.split('Peanut allergy: we don’t have').length, 2);
  assert.ok(htmlOn.indexOf('data-mt-allergy') < (htmlOn.indexOf('mt-ctx-lines') === -1 ? Infinity : htmlOn.indexOf('mt-ctx-lines')));
  // No link out of the site carries the allergy; the page's own language links keep the traveller's choice.
  for (const html of [htmlOff, htmlOn]) for (const m of html.matchAll(/href="(https?:[^"]+)"/g)) assert.ok(!/peanut|allerg|[?&]al=/i.test(decodeURIComponent(m[1])), m[1]);
  for (const l of H.planBookingLinks(p)) assert.ok(!/peanut|allerg|arachide/i.test(decodeURIComponent(l.url)), l.url);
  // An older link (no allergy ask) is as it was.
  const old = app.tripShareContext({ ...base, asks: base.asks.replace(/^allergy,?/, '') || 'live_music' }, 'en');
  assert.ok(!/allerg/i.test(JSON.stringify(old)));
});

// ---------- One message, one answer (2026-11-23) ----------
// The owner's report, at 390px: after the plan above, the chat was sent
//   "One person has a severe peanut allergy. Are the suggested restaurants safe, and can you replace lunch with a
//    peanut-free option?"
// and said the same warning twice, with no word on the replacement (the second sentence was read as the question only).
// Now: ONE reply. The warning once (safety and cross-contact practices are not confirmed), the replacement answered by
// name (no verified replacement, the stop stays), nothing swapped, nothing called fine for the allergy, and the offer
// to change it anyway (just as unconfirmed) as the one closing question. Kept short: it fits the phone's chat box.
const MULTI = 'One person has a severe peanut allergy. Are the suggested restaurants safe, and can you replace lunch with a peanut-free option?';
const MULTI_FR = 'Une personne a une allergie grave aux arachides. Les restaurants suggérés sont-ils sécuritaires, et pouvez-vous remplacer le dîner par une option sans arachides?';
const WARN = 'safety and cross-contact practices aren’t confirmed for any meal stop';
const count = (s, sub) => String(s).split(sub).length - 1;
// Every sentence that speaks of a place being checked / confirmed says it is NOT.
const noClaim = (reply) => { assert.ok(!/✓/.test(reply), reply); for (const sen of String(reply).split(/(?<=[.?!])\s+/)) if (/\bsafe\b|peanut-free|nut-free|\bverified\b|\bconfirmed\b|s[ée]curitaire|v[ée]rifi[ée]|confirm[ée]/i.test(sen)) assert.match(sen, /aren’t confirmed|No verified|just as unconfirmed|not confirmed|ne sont confirmées|Aucun (?:remplacement|endroit) vérifié|non confirmé|sans plus de confirmation/, sen); };

test('15. one message with several allergy asks is read as ONE answer (word rules, no AI); a single ask is read as before', () => {
  // The owner's message on the plan with the allergy: one op, the lunch named, nothing that would swap.
  const r = rules(MULTI);
  assert.deepEqual(shape(r), ['ask|q_allergy_swap|16|allergy:peanut|Replace lunch']);
  assert.equal(r.ops[0].both, true);
  assert.equal(r.ops[0].noted, undefined); // already on the plan: not announced again
  assert.equal(r.access, true); // fixed rules: the AI's reading never stands in for them
  assert.equal(r.explain, true);
  assert.ok(!r.ops.some((o) => ['replace', 'add', 'refine', 'swap_to', 'allergy'].includes(o.o)));
  // A lunch on each day: the first is the one meant (what a plain "replace lunch" changes) and it is named with its day.
  const TWO = [...PAGE, { key: '2-midday', id: 17, name: 'Corner Deli', type: 'cafe', day: 2, start: 720, badges: ['vegan', 'gluten_free'] }];
  const r2 = tc.rulesRead(MULTI, TWO, { regions: ['kelowna'], regionLabels: { kelowna: 'Kelowna' }, days: 2, request: OWNER });
  assert.deepEqual(shape(r2), ['ask|q_allergy_swap|16|allergy:peanut|Replace lunch on day 1']);
  assert.deepEqual(r2.ops[0].where, [{ day: 1, dp: 'midday' }]);
  // The same message on a plan without the allergy: recorded (quietly: the one answer says "Noted"), still one answer.
  const r3 = rules(MULTI, 'A weekend in Kelowna');
  assert.deepEqual(shape(r3), ['allergy|||allergy:peanut|', 'allergy|||avoid:peanut|', 'ask|q_allergy_swap|16|allergy:peanut|Replace lunch']);
  assert.deepEqual(r3.ops.map((o) => [o.quiet, o.both, o.noted]), [[true, undefined, undefined], [true, undefined, undefined], [undefined, true, true]]);
  // Other mixes.
  assert.deepEqual(shape(rules('Are these safe for a peanut allergy and can you swap dinner on day 1 for a peanut-free place?')), ['ask|q_allergy_swap|13|allergy:peanut|Swap dinner on day 1']);
  assert.deepEqual(shape(rules('Are these safe? Also, can you replace Marlow Grill with a peanut-free option?')), ['ask|q_allergy_swap|13|allergy:peanut|Replace Marlow Grill']);
  assert.deepEqual(shape(rules(MULTI_FR)), ['ask|q_allergy_swap|16|allergy:peanut|Remplacer le dîner']);
  // The need said again and a question: the answer once. Two questions: once.
  assert.deepEqual(shape(rules('One person has a severe peanut allergy. Are the suggested restaurants safe?')), ['ask|q_allergy||allergy:peanut|']);
  assert.deepEqual(shape(rules('Is the day 1 dinner ok for a peanut allergy? Is lunch safe too?')), ['ask|q_allergy||allergy:peanut|']);
  // Not on the plan yet: the "Noted" line carries the warning, so the question adds no second one.
  assert.deepEqual(rules('One person has a severe peanut allergy. Are the suggested restaurants safe?', 'A weekend in Kelowna').ops.map((o) => [o.o, o.quiet]), [['allergy', undefined]]);
  // Two swaps: one answer naming both, no offer (a plain "yes" could not say which).
  const two = rules('swap lunch on day 1 for a peanut-free place and swap dinner on day 1 for a peanut-free place');
  assert.deepEqual(shape(two), ['ask|q_allergy_swap|16,13|allergy:peanut|']);
  // An unrelated part of the same message is still read and done (first), beside the one answer.
  const mixed = rules(`${MULTI.replace(/\?$/, '')} and add a winery on day 2?`);
  assert.deepEqual(mixed.ops.map((o) => [o.o, o.value || '']), [['add', ''], ['ask', 'q_allergy_swap']]);
  assert.equal(mixed.ops[1].both, true);
  const qAdd = rules('Are these safe for a peanut allergy and can you add a winery on day 2?');
  assert.deepEqual(qAdd.ops.map((o) => [o.o, o.value || '']), [['add', ''], ['ask', 'q_allergy']]);
  // A single ask is exactly what it was (no both, the same op).
  for (const m of ['Are these restaurants safe for a peanut allergy?', 'Swap the day 1 dinner for somewhere peanut-free', 'replace lunch with a peanut-free option', 'remember the peanut allergy']) assert.ok(!rules(m).ops.some((o) => o.both), m);
  assert.deepEqual(shape(rules('replace lunch with a peanut-free option')), ['ask|q_allergy_swap|16|allergy:peanut|replace lunch']);
  assert.deepEqual(shape(rules('add a nut-free bakery on day 2', 'A weekend in Kelowna')), ['allergy|||avoid:nut|', 'ask|q_allergy_swap||avoid:nut|add bakery on day 2']);
  // The words.
  const en = AL.chatReply('both', NEEDS[0], 'en', { kept: [{ name: 'Noodle Bar', day: 1, dp: 'midday' }], offer: true });
  assert.equal(en, 'Peanut allergy: safety and cross-contact practices aren’t confirmed for any meal stop; listings have no allergen data. Ask each restaurant. No verified replacement is available, so I’ve kept Noodle Bar (day 1 lunch) unchanged. I can change it anyway, just as unconfirmed. Want that?');
  assert.ok(en.length <= 300, 'short enough for the phone’s chat box');
  assert.equal(AL.chatReply('both', NEEDS[0], 'en', { kept: [{ name: 'Noodle Bar' }, { name: 'Marlow Grill' }] }), 'Peanut allergy: safety and cross-contact practices aren’t confirmed for any meal stop; listings have no allergen data. Ask each restaurant. No verified replacement is available, so I’ve kept Noodle Bar and Marlow Grill unchanged.');
  assert.match(AL.chatReply('both', NEEDS[0], 'en', { kept: [], add: true, offer: true }), /No verified place is available to add, so nothing has changed\. I can add one anyway, just as unconfirmed\. Want that\?$/);
  assert.match(AL.chatReply('both', NEEDS[0], 'en', { kept: [{ name: 'Noodle Bar' }], noted: true, recorded: true }), /^Noted: peanut allergy, now on your plan and meal cards\. Safety and cross-contact practices aren’t confirmed for any meal stop; listings have no allergen data\. Ask each restaurant\./);
  const fr = AL.chatReply('both', NEEDS[0], 'fr', { kept: [{ name: 'Noodle Bar', day: 1, dp: 'midday' }], offer: true });
  assert.equal(fr, 'Allergie aux arachides : ni la sécurité ni les pratiques contre la contamination croisée ne sont confirmées pour aucun repas; les fiches n’indiquent pas les allergènes. Demandez à chaque restaurant. Aucun remplacement vérifié n’est disponible : j’ai gardé Noodle Bar (dîner du jour 1), sans rien changer. Je peux le changer quand même, sans plus de confirmation. Voulez-vous?');
  for (const need of NEEDS) for (const lang of ['en', 'fr']) for (const x of [{ kept: [{ name: 'X', day: 2, dp: 'evening' }], offer: true }, { kept: [], add: true }, { kept: [], noted: true, recorded: true, offer: true }]) noClaim(AL.chatReply('both', need, lang, x));
});

test('16. the chat, the owner’s message: one reply, the warning once, the lunch named and kept; yes swaps it, still unconfirmed', async () => {
  const p = run(REQ), page = pageOf(p, REQ);
  const lunches = page.stops.filter((s) => /-midday$/.test(s.key) && AL.FOOD_TYPES.includes(db.prepare('SELECT type FROM venues WHERE id = ?').get(s.id).type));
  assert.ok(lunches.length >= 1, 'the plan has a lunch');
  const lunch = lunches[0], lunchName = db.prepare('SELECT name FROM venues WHERE id = ?').get(lunch.id).name;
  const where = lunches.length > 1 ? ` (day ${lunch.key[0]} lunch)` : '';
  const r = await say(page, MULTI);
  assert.equal(r.reply, `Peanut allergy: ${WARN}; listings have no allergen data. Ask each restaurant. No verified replacement is available, so I’ve kept ${lunchName}${where} unchanged. I can change it anyway, just as unconfirmed. Want that?`);
  assert.equal(count(r.reply, 'Peanut allergy'), 1); // said once
  assert.equal(count(r.reply.toLowerCase(), 'confirmed for any meal stop'), 1);
  assert.equal(count(r.reply.toLowerCase(), 'listings'), 1);
  assert.ok(!/I can’t confirm that|Noted/.test(r.reply), r.reply);
  assert.deepEqual([r.plan, r.changed, r.text, r.needPatch], [null, [], undefined, undefined]); // nothing swapped, nothing re-recorded
  noClaim(r.reply);
  assert.equal(r.offer.length, 1);
  // "yes" to the one question: the lunch is swapped on other grounds, and the new place is said to be unconfirmed too.
  const yes = await say(page, 'yes', 'en', r.offer);
  assert.ok(yes.plan, yes.reply);
  assert.deepEqual(yes.changed, [lunch.key]);
  const fresh = yes.plan.days[Number(lunch.key[0]) - 1].stops.find((s) => s.daypart === 'midday').venue;
  assert.notEqual(fresh.id, lunch.id);
  assert.ok(yes.reply.endsWith(`Peanut allergy: not confirmed for ${fresh.name} either. Ask before you go.`), yes.reply);
  assert.equal(A.stopNeedNotes(yes.plan, fresh.id, false).notes[0], 'Peanut allergy: ask the restaurant');
  noClaim(yes.reply);
  // Something else said instead of yes is not the offer taken.
  const no = await say(page, 'no thanks', 'en', r.offer);
  assert.equal(no.plan || null, null);
  // The single asks reply exactly as before.
  const q = await say(page, 'Are these restaurants safe for a peanut allergy?');
  assert.equal(q.reply, 'Peanut allergy: I can’t confirm that for any meal stop. Listings don’t list allergens or how food is prepared, so talk to each restaurant about the allergy before you go.');
  const sw = await say(page, 'Swap the day 1 dinner for somewhere peanut-free');
  assert.match(sw.reply, /^Peanut allergy: I can’t check any restaurant for it \(listings don’t list allergens or how food is prepared\), so I’ve kept .+\. I can make the change anyway; the new place would be just as unconfirmed\. Want that\?$/);
  assert.deepEqual([sw.plan, sw.offer], [null, ['Swap the day 1 dinner']]);
  // The need said again beside a question: one answer.
  const sq = await say(page, 'One person has a severe peanut allergy. Are the suggested restaurants safe?');
  assert.equal(sq.reply, q.reply);
  // French.
  const f = await say(page, MULTI_FR, 'fr');
  assert.equal(f.plan, null);
  assert.equal(count(f.reply, 'Allergie aux arachides'), 1);
  assert.match(f.reply, /^Allergie aux arachides : ni la sécurité ni les pratiques contre la contamination croisée ne sont confirmées pour aucun repas; les fiches n’indiquent pas les allergènes\. Demandez à chaque restaurant\. Aucun remplacement vérifié n’est disponible : j’ai gardé .+, sans rien changer\. Je peux le changer quand même, sans plus de confirmation\. Voulez-vous\?$/);
  assert.ok(f.reply.includes(lunchName), f.reply);
  noClaim(f.reply);
  const oui = await say(page, 'oui', 'fr', f.offer);
  assert.deepEqual(oui.changed, [lunch.key]);
  assert.match(oui.reply, /Allergie aux arachides : non confirmé pour .+ non plus\. Demandez avant d’y aller\.$/);
  // With an unrelated ask in the same message, that part is still done, and the allergy answer is still said once.
  const mix = await say(page, `${MULTI.replace(/\?$/, '')} and add a ${WR ? 'cafe' : 'winery'} on day 2?`);
  assert.equal(count(mix.reply, 'Peanut allergy'), mix.plan && /either/.test(mix.reply) ? 2 : 1);
  assert.equal(count(mix.reply, WARN), 1);
  assert.ok(mix.reply.includes(`I’ve kept ${lunchName}`), mix.reply);
  if (mix.plan) assert.equal(mix.plan.days[Number(lunch.key[0]) - 1].stops.find((s) => s.daypart === 'midday').venue.id, lunch.id); // the lunch did not move
});

test('17. the same message on a plan without the allergy: recorded, one reply, then the sharing choice is as before', async () => {
  const text = `${REQ_BASE} We have a car.`;
  const p = run(text), page = pageOf(p, text);
  const r = await say(page, MULTI);
  assert.equal(r.plan, null);
  assert.deepEqual(r.changed, []);
  assert.match(r.reply, /^Noted: peanut allergy, now on your plan and meal cards\. Safety and cross-contact practices aren’t confirmed for any meal stop; listings have no allergen data\. Ask each restaurant\. No verified replacement is available, so I’ve kept .+ unchanged\. I can change it anyway, just as unconfirmed\. Want that\?$/);
  assert.equal(count(r.reply.toLowerCase(), 'confirmed for any meal stop'), 1);
  assert.equal(count(r.reply.toLowerCase(), 'listings'), 1);
  noClaim(r.reply);
  assert.equal(AL.readAllergy(r.text).allergens[0], 'peanut');
  assert.equal(AL.readAllergy(r.text).kind, 'allergy');
  assert.equal(r.needPatch.evidence.short, 'Peanut allergy: not confirmed for any meal stop');
  assert.deepEqual(r.needPatch.evidence.stops.map((x) => x.id).sort(), [...new Set(foodIds(p))].sort());
  // yes, on the request the page now holds.
  const yes = await say({ ...page, text: r.text }, 'yes', 'en', r.offer);
  assert.ok(yes.plan && yes.changed.length === 1, yes.reply);
  assert.match(yes.reply, /Peanut allergy: not confirmed for .+ either\. Ask before you go\.$/);
  // Sharing after the chat message and after the yes: the link's values and the shared copy are what they were.
  for (const plan of [run(r.text), yes.plan]) {
    const refs = stopIds(plan).map((s) => `venue:${s.split(':')[1]}`), days = stopIds(plan).map((s) => s.split('-')[0]);
    const e = plan.evidence[0];
    assert.equal(e.ask, 'allergy');
    assert.equal(e.share, 'peanut'); // the link's al= value, used only with the tick
    const base = { stops: refs.join(','), days: days.join(','), asks: plan.evidence.map((x) => x.ask).filter((a) => /^[a-z_]+$/.test(a)).join(','), ad: '3' };
    const off = app.tripShareContext(base, 'en'), on = app.tripShareContext({ ...base, al: 'peanut' }, 'en');
    assert.ok(!/peanut|arachide/i.test(JSON.stringify(off) + app.tripShareContextHtml(off, 'en')), 'without the tick the copy names no allergen');
    assert.match(off.lines[0].text, /^Allergies: we don’t have allergen or cross-contact information for restaurants/);
    assert.match(on.lines[0].text, /^Peanut allergy: we don’t have allergen or cross-contact information for restaurants/);
    assert.equal(e.anon.copy, 'Allergies: not confirmed for any meal stop. Ask each restaurant before you go.');
    assert.equal(e.copy, 'Peanut allergy: not confirmed for any meal stop. Ask each restaurant before you go.');
  }
});
