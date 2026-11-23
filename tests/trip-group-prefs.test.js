// Build My Trip, group preferences (2026-11-22). Reproduced live: "Plan a 3-day Kelowna weekend for 6 friends: two
// wineries, gluten-free dining, easy walks, a hotel with a pool, and live music. One person does not drink." planned no
// wineries for all six, warned "no pool listed" beside a hotel marked Pool, and sent assumed dates to the booking site.
// PURE tests on fixtures and source (no server, no network).
'use strict';
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const d = require('../discovery-intent.js');
const tp = require('../trip-planner.js');
const tr = require('../trip-requirements.js');
const sbl = require('../stay-booking-links.js');
const fx = require('./fixtures/trip-v4-kelowna.js');

const V3 = fs.readFileSync(require.resolve('../trip-planner-v3-page.js'), 'utf8');
const V4 = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const read = (q) => d.interpretDiscoveryQuery(q, fx.TAXONOMY, { tripPlanner: true });
const wineriesOf = (p) => p.days.flatMap((day) => day.stops.filter((s) => s.venue && s.venue.type === 'winery').map((s) => ({ day: day.day, id: s.venue.id, name: s.venue.name })));

test('1. a refusal said of some of the party is that person’s need, not the whole trip’s', () => {
  const some = ['Kelowna weekend for 6 friends, wineries. One person does not drink.', 'kelowna weekend, two of the guys do not drink', 'kelowna weekend for 4, one of us is sober',
    'kelowna weekend with our friend Sam who does not drink', 'wineries in kelowna, the driver does not drink', 'one non-drinker in our group, wineries please',
    // the trip planner rewrites "my wife" to "my partner and I" before reading
    'Wine weekend in Kelowna for two, my partner and I does not drink'];
  for (const q of some) {
    const i = read(q);
    assert.deepEqual((i.partySome || []).map((x) => x.concept), ['alcohol'], q);
    assert.ok(!((i.excluded.concepts || []).includes('alcohol')), `nothing is ruled out: ${q}`);
  }
  const all = ['family weekend in kelowna, we do not drink', 'kelowna weekend, nobody drinks', 'kelowna weekend, none of us drink', 'sober weekend in kelowna',
    'kelowna weekend, I do not drink', 'we are 4 and we do not drink alcohol', 'Weekend in Kelowna, my partner and I do not drink'];
  for (const q of all) {
    const i = read(q);
    assert.ok((i.excluded.concepts || []).includes('alcohol'), `the whole trip: ${q}`);
    assert.ok(!(i.partySome || []).length, q);
  }
});

test('2. one non-drinker keeps the wineries; the note names only what a listing’s own badge supports', () => {
  const badge = fx.FACTS.filter((v) => v.type === 'winery')[5];
  badge.features = { ...badge.features, nonalcoholic: true };
  try {
    const dry = fx.plan('3 days in Kelowna, wineries and good food, we do not drink', { extra: { v4: true } });
    assert.equal(wineriesOf(dry).length, 0, 'a party that does not drink gets no winery');
    const p = fx.plan('3 days in Kelowna for 6 friends, two wineries and good food. One person does not drink.', { extra: { v4: true } });
    const w = wineriesOf(p);
    assert.equal(w.length, 2, `two wineries asked, two planned: ${JSON.stringify(w)}`);
    assert.ok(new Set(w.map((x) => x.day)).size === 2, 'on different days');
    assert.ok(w.some((x) => x.id === badge.id), 'the winery with the Non-Alcoholic Options badge is kept');
    assert.deepEqual(p.partySome, [{ concept: 'alcohol' }]);
    assert.deepEqual(p.partyNote.venueIds, [badge.id]);
    assert.match(p.partyNote.text, new RegExp(`^For your non-drinker: ${badge.name} lists non-alcoholic options\\.$`));
    assert.match(p.partyNote.textFr, /sans alcool/);
    for (const r of p.schedule || []) assert.ok(p.days.some((day) => day.stops.some((s) => (s.venue || s.event || {}).id === (r.venueId || r.eventId))), 'no time row for a stop that is gone');
  } finally { delete badge.features.nonalcoholic; }
  // No listing says so: the note says that, and claims nothing.
  const q = fx.plan('3 days in Kelowna for 6 friends, two wineries and good food. One person does not drink.', { extra: { v4: true } });
  assert.deepEqual(q.partyNote.venueIds, []);
  assert.match(q.partyNote.text, /none of these tasting stops lists non-alcoholic options.*ask when you book/);
  assert.match(V4, /p\.partyNote && \(\(fr && p\.partyNote\.textFr\) \|\| p\.partyNote\.text\)/, 'the page prints the note under the title');
  // A plain wine trip is not capped and has no note.
  const plain = fx.plan('3 days in Kelowna, wineries and good food', { extra: { v4: true } });
  assert.ok(wineriesOf(plain).length > 2);
  assert.equal(plain.partyNote, undefined);
});

test('3. a pool said of the place to stay is the stay’s amenity, not a swimming outing', () => {
  const pool = tr.REQUEST_KINDS.pool;
  for (const q of ['a hotel with a pool', 'hotel with an indoor pool', 'a resort that has a heated pool', 'somewhere to stay with a pool', 'a place to stay with a pool and live music', 'un hotel avec une pool'])
    assert.ok(!pool.test(q), q);
  for (const q of ['a pool day with the kids', 'swim at the pool then dinner', 'kelowna pool and lunch']) assert.ok(pool.test(q), q);
});

test('4. dates the visitor did not give never reach a booking site', () => {
  const stay = { id: 9, name: 'Test Inn', info: { booking: { booking_com: 'https://www.booking.com/hotel/ca/test-inn.html' } } };
  const card = { id: 9, name: 'Test Inn', regionLabel: 'Kelowna' };
  const env = { STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam' };
  const trip = { arrive: '2026-11-27', leave: '2026-11-29', nights: 2, adults: 6, kids: null };
  const assumed = sbl.withBookingLinks({ pick: card, alternatives: [], trip: { ...trip, datesGiven: false } }, new Map([[9, stay]]), { env });
  const url = decodeURIComponent(assumed.pick.bookingLinks[0].url);
  assert.ok(!/checkin|checkout|2026-11-2/.test(url), `no assumed dates: ${url}`);
  assert.match(url, /group_adults=6/, 'the party the visitor gave is still sent');
  assert.match(url, /booking\.com\/hotel\/ca\/test-inn\.html/, 'the exact property page');
  const given = sbl.withBookingLinks({ pick: card, alternatives: [], trip: { ...trip, datesGiven: true } }, new Map([[9, stay]]), { env });
  assert.match(decodeURIComponent(given.pick.bookingLinks[0].url), /checkin=2026-11-27.*checkout=2026-11-29/);
  // The card says so instead of showing the assumed dates.
  assert.match(V3, /t\.datesGiven === false\) parts\.push\(fr \? 'Dates à choisir' : 'Dates not set'\)/);
  assert.match(V3, /No dates yet: pick them here or on the booking site\./);
  assert.match(V3, /\(assumed\)/);
});
