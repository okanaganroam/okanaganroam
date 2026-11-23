'use strict';
// Build My Trip: an honest plan (2026-11-22). The owner's request, on the live site at 390px:
//   "Plan a 3-day Kelowna weekend for 6 friends: two wineries, gluten-free dining, easy walks, a hotel with a pool, and
//    live music. One person does not drink."
// The plan had two wineries, a non-alcoholic note and restaurants marked Gluten-Free-Friendly, yet said it could not fit
// gluten free; with no dates chosen, "day 3" carried an event dated Tue Nov 24; the shared link showed no hotel and no
// times; "Done" in the booking sheet read like a confirmation.
// Parts 1-7 are pure (fixtures and source); parts 8-10 use the repo's seed database with one fixture stay, removed at the end.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

Object.assign(process.env, { TRIP_PLANNER_V3: 'on', TRIP_V4: 'on', TRIP_STAYS: 'on', TRIP_PLAN_API: 'on', STAY_AFFILIATE_PROVIDER: 'stay22', STAY_AFFILIATE_ID: 'okanaganroam', DISCOVERCARS_AID: 'okanaganroam' });
const H = require('../trip-honest-plan.js');
const sbl = require('../stay-booking-links.js');
const fx = require('./fixtures/trip-v4-kelowna.js');
const d = require('../discovery-intent.js');
const SITE = require('../trip-site.js');
// The same file runs on Whistler Roam: its own town, and breweries where the Okanagan has wineries.
const WR = SITE.brand === 'Whistler Roam';
const TOWN = WR ? 'whistler' : 'kelowna', TOWN_LABEL = WR ? 'Whistler' : 'Kelowna', DRINK = WR ? 'brewery' : 'winery', DRINKS = WR ? 'breweries' : 'wineries';
const ASK_HERE = `Plan a 3-day ${TOWN_LABEL} weekend for 6 friends: two ${DRINKS}, gluten-free dining, easy walks, a hotel with a pool, and live music. One person does not drink.`;

const ASK = 'Plan a 3-day Kelowna weekend for 6 friends: two wineries, gluten-free dining, easy walks, a hotel with a pool, and live music. One person does not drink.';
const V4 = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const LAYOUT = fs.readFileSync(require.resolve('../trip-workspace-layout.js'), 'utf8');
const B = (...keys) => keys.map((key) => ({ key, label: key }));
const stop = (daypart, id, name, type, badges = [], extra = {}) => ({ daypart, label: daypart, venue: { id, name, type, region: 'kelowna', badges: B(...badges) }, reasons: [], ...extra });
const EVENT = { id: 213, name: 'The Passion of Amy Winehouse: Back to Black', venueName: 'Kelowna Community Theatre', region: 'kelowna', url: '/kelowna/events/the-passion-of-amy-winehouse-back-to-black', categories: ['live-music'], dateLabel: 'Tue Nov 24', dateLabelFr: 'mar. 24 nov.', time: '7:30 pm', startDate: '2026-11-24', endDate: '2026-11-24' };
// The plan as the live site made it (the stops, badges and notes of the owner's report), before this change's pass.
function livePlan(opts = {}) {
  const plan = {
    kind: 'multi_day', query: ASK,
    days: [
      { day: 1, region: 'kelowna', regionLabel: 'Kelowna', stops: [
        stop('morning', 1915, 'Tree of Wisdom Trail', 'outdoor'),
        stop('midday', 222, 'Frankie We Salute You!', 'restaurant', ['gluten_free', 'nonalcoholic'], { reasons: [{ code: 'meal' }] }),
        stop('afternoon', 401, 'Meadow Vista Honey Wines', 'winery'),
        stop('evening', 170, 'Dawett Fine Indian Cuisine', 'restaurant', ['gluten_free']),
        stop('night', 83, 'Blue Gator Bar', 'pub', ['live_music'], { reasons: [{ code: 'night', text: 'A night out after dinner' }] }),
      ] },
      { day: 2, region: 'kelowna', regionLabel: 'Kelowna', stops: [
        stop('morning', 1222, 'Mill Creek Regional Park', 'outdoor'),
        stop('midday', 645, 'Table Nineteen Kelowna', 'restaurant', ['gluten_free', 'nonalcoholic']),
        stop('late', 812, 'Azhadi Vineyards', 'winery', ['gluten_free', 'nonalcoholic', 'live_music']),
        stop('evening', 255, 'Gulfstream', 'restaurant', ['gluten_free', 'nonalcoholic']),
      ] },
      { day: 3, region: 'kelowna', regionLabel: 'Kelowna', stops: [
        stop('morning', 1849, 'Eagle View and Quail Flume Trails', 'outdoor'),
        stop('midday', 528, 'Pur & Simple', 'restaurant', ['gluten_free', 'nonalcoholic']),
        { kind: 'event', daypart: 'night', label: 'Night', event: { ...EVENT }, timeKnown: true },
      ] },
    ],
    schedule: [{ day: 1, venueId: 222, startMinutes: 690 }, { day: 1, venueId: 83, startMinutes: 1200 }, { day: 3, venueId: 528, startMinutes: 690 }, { day: 3, eventId: 213, startMinutes: 1170 }],
    warnings: ['Requested 2 winery stops; scheduled 3.', 'Not every stop is listed as gluten-free friendly.'],
    requirementResults: [
      { id: 'r1', kind: 'type', value: 'winery', strength: 'must', status: 'satisfied' },
      { id: 'r2', kind: 'type_count', value: 'winery', strength: 'must', count: 2, status: 'unverified', reason: 'Requested 2 winery stops; scheduled 3.' },
      { id: 'r4', kind: 'feature', value: 'gluten_free', strength: 'must', status: 'unmet', reason: 'No complete set of verified matching stops was found.' },
      { id: 'r5', kind: 'venue_kind', value: 'easy_walk', strength: 'must', status: 'satisfied' },
      { id: 'r7', kind: 'event', value: 'live-music', eventKind: 'live-music', strength: 'must', status: 'satisfied', reason: 'Matched a dated event occurrence.' },
    ],
    partySome: [{ concept: 'alcohol' }],
    partyNote: { concept: 'alcohol', venueIds: [812], text: 'For your non-drinker: Azhadi Vineyards lists non-alcoholic options.', textFr: 'x' },
    intent: { features: [], when: null },
    whereToStay: {
      trip: { arrive: '2026-11-27', leave: '2026-11-29', nights: 2, adults: 6, kids: null, datesGiven: false },
      amenity: { keys: ['pool'], confirmed: true, winterCheck: true },
      pick: { id: 1970, name: 'Comfort Suites Kelowna', regionLabel: 'Kelowna', has: ['pool'], bookingLinks: [
        { key: 'booking_com', url: 'https://www.stay22.com/allez/booking?aid=okanaganroam&link=https%3A%2F%2Fwww.booking.com%2Fhotel%2Fca%2Fcomfort-suites-kelowna.html%3Fgroup_adults%3D6%26no_rooms%3D1&adults=6', affiliate: true },
        { key: 'own', url: 'https://www.comfortsuiteskelowna.com/booking.html', affiliate: false }] },
      alternatives: [],
    },
    ...opts,
  };
  return plan;
}
const STORED = (kind, id) => (kind === 'stay' && id === 1970 ? { urls: ['https://www.booking.com/hotel/ca/comfort-suites-kelowna.html', 'https://www.comfortsuiteskelowna.com/booking.html', 'https://www.comfortsuiteskelowna.com/'] }
  : kind === 'venue' && id === 401 ? { urls: ['https://meadowvista.ca/book'] } : kind === 'venue' && id === 812 ? { urls: ['https://azhadivineyards.com/visit'] } : null);
const ev = (plan, ask) => plan.evidence.find((e) => e.ask === ask);
const everyLine = (p) => [].concat((p.notIncluded || []).map((x) => `${x.text} ${x.textFr || ''}`), p.partyNote ? [p.partyNote.text, p.partyNote.textFr] : [], (p.evidence || []).map((e) => `${e.text} ${e.textFr}`), p.warnings || [], (p.requirementResults || []).map((r) => r.reason || ''));

test('1. the six-person request: what the listings show for each thing asked', () => {
  const p = H.applyEvidence(H.takeUndatedEvents(livePlan()));
  assert.equal(p.datesGiven, false);
  assert.deepEqual(p.evidence.map((e) => `${e.ask}=${e.status}`), ['count:winery=verified', 'kind:easy_walk=verified', 'gluten_free=verified', 'stay:pool=verified', 'live_music=unknown', 'nonalcoholic=partial']);
  for (const e of p.evidence) { assert.ok(e.label && e.labelFr && e.text && e.textFr && Array.isArray(e.stops), e.ask); assert.ok(['verified', 'partial', 'unknown', 'unmet'].includes(e.status)); }
  // Gluten-free: every meal stop has the listing's badge; the pub after dinner is a night out, not a meal.
  const gf = ev(p, 'gluten_free');
  assert.deepEqual(gf.stops.map((s) => [s.id, s.has]), [[222, true], [170, true], [645, true], [255, true], [528, true]]);
  assert.ok(!gf.stops.some((s) => s.id === 83), 'Blue Gator Bar (after dinner) is not a meal stop');
  assert.match(gf.text, /^Gluten-free: all 5 meal stops list gluten-free options\./);
  assert.match(gf.text, /not a guarantee against cross-contamination/, 'a badge is never a promise about a kitchen');
  assert.match(gf.textFr, /contamination croisée/);
  assert.equal(p.requirementResults.find((r) => r.value === 'gluten_free').status, 'satisfied');
  // Two wineries asked, two planned (the stale "scheduled 3" is gone).
  assert.equal(ev(p, 'count:winery').count, 2);
  assert.equal(p.requirementResults.find((r) => r.kind === 'type_count').status, 'satisfied');
  assert.ok(!p.warnings.some((w) => /scheduled 3|gluten-free friendly/.test(w)), JSON.stringify(p.warnings));
  // The stay's pool, from the stay's own facts, with the winter caveat.
  assert.match(ev(p, 'stay:pool').text, /Comfort Suites Kelowna’s listing says it has a pool\..*open in winter/);
  // One non-drinker: which drink stops list non-alcoholic options, which do not say; the note under the title is the same line.
  const na = ev(p, 'nonalcoholic');
  assert.deepEqual(na.stops.map((s) => [s.id, s.has]), [[401, null], [83, null], [812, true]]);
  assert.match(na.text, /Azhadi Vineyards lists non-alcoholic options; Meadow Vista Honey Wines and Blue Gator Bar don’t say/);
  assert.equal(p.partyNote.text, na.text);
  assert.equal(p.partyNote.textFr, na.textFr);
  assert.ok(!na.line, 'said once (the party note), not twice');
  // The page's lines: one per ask that is not fully shown, never more than three.
  assert.deepEqual(p.evidence.filter((e) => e.line).map((e) => e.ask), ['live_music']);
});

test('2. no "couldn’t fit gluten free", and no "on these dates" with no dates', () => {
  const p = H.applyEvidence(H.takeUndatedEvents(livePlan()));
  for (const line of everyLine(p)) {
    assert.doesNotMatch(line, /couldn.t fit[^.]*gluten/i, line);
    assert.doesNotMatch(line, /on these dates|on your dates|à ces dates|à vos dates/i, line);
  }
  assert.ok(!(p.notIncluded || []).some((x) => /gluten/i.test(x.text)));
  // With dates, "on your dates" is allowed; without them it never is.
  const dated = livePlan(); dated.days.forEach((day, i) => { day.date = `2026-11-2${7 + i}`; }); dated.days[2].stops.pop();
  H.applyEvidence(dated);
  assert.match(ev(dated, 'live_music').text, /no live music event is listed on your dates/i);
});

test('3. dietary evidence is only what the badges say: partial names the stop, unmet gives the reason it knows', () => {
  const one = livePlan(); one.days[1].stops[3].venue.badges = B('nonalcoholic');
  H.applyEvidence(H.takeUndatedEvents(one), { town: 'Kelowna' });
  const e = ev(one, 'gluten_free');
  assert.equal(e.status, 'partial');
  assert.match(e.text, /^Gluten-free: 4 of 5 meal stops list gluten-free options; Gulfstream doesn’t\./);
  assert.equal(e.line, true);
  assert.equal(one.requirementResults.find((r) => r.value === 'gluten_free').status, 'unmet');
  const none = livePlan(); for (const day of none.days) for (const s of day.stops) if (s.venue) s.venue.badges = [];
  H.applyEvidence(H.takeUndatedEvents(none), { town: 'Kelowna', countDining: () => 0 });
  assert.equal(ev(none, 'gluten_free').status, 'unmet');
  assert.match(ev(none, 'gluten_free').text, /No place to eat listed in Kelowna has that badge\./);
  const unknownWhy = livePlan(); for (const day of unknownWhy.days) for (const s of day.stops) if (s.venue) s.venue.badges = [];
  H.applyEvidence(H.takeUndatedEvents(unknownWhy), { town: 'Kelowna', countDining: () => 12 });
  assert.match(ev(unknownWhy, 'gluten_free').text, /The reason isn’t known from the listings\./);
  // A pub at lunch is a meal; a pub after dinner is not.
  assert.equal(H.isMealStop(stop('midday', 9, 'Pub', 'pub')), true);
  assert.equal(H.isMealStop(stop('night', 9, 'Pub', 'pub', [], { reasons: [{ code: 'night' }] })), false);
  assert.equal(H.isMealStop(stop('night', 9, 'Bistro', 'restaurant')), true);
  assert.equal(H.isMealStop(stop('afternoon', 9, 'Winery', 'winery')), false);
});

test('4. with no dates an event is a dated suggestion, never a stop of "day 3"; with dates it is a stop', () => {
  const p = H.takeUndatedEvents(livePlan());
  assert.ok(!p.days.some((day) => day.stops.some((s) => s.kind === 'event')), 'no event among the days’ stops');
  assert.ok(!p.schedule.some((r) => r.eventId === 213), 'and no time row for it');
  assert.equal(p.dateSuggestions.length, 1);
  assert.equal(p.dateSuggestions[0].label, 'Suggestion · Tue Nov 24 only');
  assert.equal(p.dateSuggestions[0].labelFr, 'Suggestion · mar. 24 nov. seulement');
  assert.equal(p.dateSuggestions[0].startDate, '2026-11-24');
  H.applyEvidence(p);
  const lm = ev(p, 'live_music');
  assert.equal(lm.status, 'unknown', 'live music is not counted as met by an event on a date nobody chose');
  assert.equal(lm.needsDates, true);
  assert.match(lm.text, /^Live music depends on the night: pick your dates and I’ll add what’s on\. Blue Gator Bar and Azhadi Vineyards list live music; the listings don’t say which nights\.$/);
  assert.equal(p.requirementResults.find((r) => r.kind === 'event').status, 'unverified');
  assert.ok(!H.planBookingLinks(p).some((l) => l.kind === 'event'), 'never a booking step');
  // Dates chosen and the event is on that day: a normal stop, and live music is verified by it.
  const dated = livePlan({ datesGiven: true }); dated.days.forEach((day, i) => { day.date = `2026-11-2${2 + i}`; });
  H.applyEvidence(H.takeUndatedEvents(dated));
  assert.ok(dated.days[2].stops.some((s) => s.kind === 'event'));
  assert.ok(!dated.dateSuggestions);
  assert.equal(ev(dated, 'live_music').status, 'verified');
  assert.match(ev(dated, 'live_music').text, /Back to Black is on Tue Nov 24 at 7:30 pm \(day 3\)/);
  // The server: no dates -> the itinerary's events are not placed, the request's own dates decide (source check).
  const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');
  assert.match(server, /if \(v4 && !requirements\.startDate && !intent\.when && !selectedNamedEvent\) \{[\s\S]{0,700}itineraryEvents = \[\];/);
  assert.match(server, /tripHonestPlan\.takeUndatedEvents\(plan\)/);
});

test('5. no date reaches a booking link unless the visitor chose dates', () => {
  const p = H.applyEvidence(H.takeUndatedEvents(livePlan()));
  for (const l of H.planBookingLinks(p)) assert.equal(H.linkHasDate(l.url), false, l.url);
  assert.deepEqual(H.checkBookingLinks(p, STORED).filter((x) => !x.warning), []);
  // The stay links themselves: assumed dates are dropped, chosen dates are sent.
  const stay = { id: 1970, name: 'Comfort Suites Kelowna', info: { booking: { booking_com: 'https://www.booking.com/hotel/ca/comfort-suites-kelowna.html' } } };
  const block = (datesGiven) => sbl.withBookingLinks({ trip: { arrive: '2026-11-27', leave: '2026-11-29', nights: 2, adults: 6, kids: null, datesGiven }, pick: { id: 1970, name: stay.name }, alternatives: [] }, new Map([[1970, stay]]));
  assert.ok(block(false).pick.bookingLinks.length > 0);
  for (const l of block(false).pick.bookingLinks) assert.equal(H.linkHasDate(l.url), false, l.url);
  assert.ok(block(true).pick.bookingLinks.some((l) => H.linkHasDate(l.url)), 'chosen dates do go to the booking site');
  // A link that carries a date on an undated plan is caught, also inside an affiliate wrapper.
  const bad = livePlan(); bad.whereToStay.pick.bookingLinks[0].url = 'https://www.stay22.com/allez/booking?aid=x&link=https%3A%2F%2Fwww.booking.com%2Fhotel%2Fca%2Fcomfort-suites-kelowna.html%3Fcheckin%3D2026-11-27%26checkout%3D2026-11-29';
  assert.ok(H.checkBookingLinks(H.takeUndatedEvents(bad), STORED).some((x) => x.code === 'date_without_dates'));
  assert.equal(H.linkHasDate('https://www.discovercars.com/canada/kelowna/ylw?a_aid=okanaganroam&chan=okanagan&data1=trip'), false);
  assert.equal(H.linkHasDate('https://example.com/book?date=2026-11-24'), true);
});

test('6. every booking link belongs to the listing it is shown for', () => {
  const p = H.takeUndatedEvents(livePlan());
  p.whereToStay.checklist = [{ venueId: 401, name: 'Meadow Vista Honey Wines', url: 'https://meadowvista.ca/book' }];
  assert.deepEqual(H.checkBookingLinks(p, STORED), [], 'the stay’s own pages (one inside the affiliate wrapper) and the winery’s own link');
  // Another listing's link on this stop.
  p.whereToStay.checklist = [{ venueId: 401, name: 'Meadow Vista Honey Wines', url: 'https://azhadivineyards.com/visit' }];
  assert.deepEqual(H.checkBookingLinks(p, STORED).map((x) => [x.code, x.link.id]), [['not_this_listing', 401]]);
  // The same link shown for two listings.
  p.whereToStay.checklist = [{ venueId: 401, name: 'Meadow Vista Honey Wines', url: 'https://meadowvista.ca/book' }, { venueId: 812, name: 'Azhadi Vineyards', url: 'https://meadowvista.ca/book' }];
  assert.ok(H.checkBookingLinks(p, STORED).some((x) => x.code === 'reused' && x.link.id === 812));
  // An affiliate wrapper around another property.
  p.whereToStay.checklist = [];
  p.whereToStay.pick.bookingLinks[0].url = 'https://www.stay22.com/allez/booking?aid=okanaganroam&link=https%3A%2F%2Fwww.booking.com%2Fhotel%2Fca%2Fsome-other-hotel.html';
  assert.deepEqual(H.checkBookingLinks(p, STORED).map((x) => x.code), ['not_this_listing']);
  // A listing with no stored record never gets a link; a provider page whose address shares no word with the name is flagged for a person to look at.
  assert.ok(H.checkBookingLinks({ kind: 'multi_day', datesGiven: true, whereToStay: { checklist: [{ venueId: 5, name: 'X', url: 'https://x.example/book' }] } }, STORED).some((x) => x.code === 'not_this_listing'));
  const renamed = { kind: 'multi_day', datesGiven: true, whereToStay: { pick: { id: 7, name: 'Park Inn by Radisson Kelowna', bookingLinks: [{ url: 'https://www.booking.com/hotel/ca/microtel-inn-suites-by-wyndham-kelowna.html' }] } } };
  assert.deepEqual(H.checkBookingLinks(renamed, () => ({ urls: ['https://www.booking.com/hotel/ca/microtel-inn-suites-by-wyndham-kelowna.html'] })).map((x) => [x.code, !!x.warning]), [['name_differs', true]]);
  // The server checks when the links are built.
  const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');
  assert.match(server, /return out\.filter\(\(c\) => tripBookingLinkBelongs\('venue', c\.venueId, c\.url\)\);/);
  assert.match(server, /card\.bookingLinks = card\.bookingLinks\.filter\(\(l\) => l && tripBookingLinkBelongs\('stay', card\.id, l\.url\)\)/);
});

test('7. the booking sheet: "I booked this" is the traveller’s own note; nothing is called confirmed', () => {
  assert.match(V4, /iBooked: 'I booked this'/);
  assert.match(V4, /iBooked: 'J’ai réservé'/);
  assert.match(V4, /markedByYou: 'Marked by you as booked'.*undoBooked: 'Undo'/);
  assert.match(V4, /markedNote: 'Marked by you\. __ROAM_BRAND__ can’t see or confirm bookings\.'/);
  assert.match(V4, /bookNote: 'You book and pay on the business’s or provider’s own site\./);
  assert.match(V4, /commission: 'We may earn a commission'/);
  assert.match(V4, /data-v4-unbook/);
  assert.doesNotMatch(V4, /'Done: '|'Fait : '|All booked ✓|Tout est réservé ✓|booking confirmed|réservation confirmée/i);
  const client = require('../trip-planner-v4-page.js').V4_CLIENT_SRC;
  assert.ok(client.includes(`${SITE.brand} can’t see or confirm bookings.`), 'the site’s own name');
  assert.ok(!client.includes('__ROAM_BRAND__'));
  // The estimate says who it is for and what it leaves out, by name.
  assert.match(V4, /notCounted: 'Not counted: \{names\}'/);
  assert.match(V4, /assumed: ' \(assumed\)'/);
  assert.match(V4, /data-v4-not-counted/);
  // The page prints one short line per ask that is not fully shown, and the dated suggestions outside the days.
  assert.match(V4, /\(p\.evidence \|\| \[\]\)\.filter\(function\(x\)\{ return x && x\.line && x\.text; \}\)\.slice\(0, 3\)/);
  assert.match(V4, /function v4SuggestionsHtml/);
  // The share dialog promises a copy to view, not shared editing or bookings.
  assert.match(LAYOUT, /It opens a copy of this plan to view/);
  assert.doesNotMatch(`${V4} ${LAYOUT}`, /organi[sz]er|co-?traveller|assign(?:ed)? (?:a )?booking|everyone can edit|synced/i);
});

test('8. the shared link: a round trip keeps the stay, the times, the links and the evidence; an old link still renders', () => {
  const app = require('../server.js');
  const db = require('../db.js');
  const made = [];
  try {
    const stay = app.createVenue({ region: TOWN, type: 'stay', cuisine: 'hotel', slug: 'honest-plan-test-inn', name: 'Honest Plan Test Inn', address: `101 Main Street, ${TOWN_LABEL}, BC`, latitude: WR ? 50.1163 : 49.887, longitude: WR ? -122.9574 : -119.496, description: 'A fixture used only by the honest plan tests.', image_url: '/images/trip-v3/hero.webp' });
    made.push(stay.id);
    db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(stay.id, JSON.stringify({ pool: true, amenities: { pool: true }, booking: { booking_com: 'https://www.booking.com/hotel/ca/honest-plan-test-inn.html' } }), '2026-11-22T00:00:00Z', 'test');
    const gf = db.prepare("SELECT id, name FROM venues WHERE region = ? AND type = 'restaurant' AND gluten_free = 1 AND redirect_to IS NULL AND slug IS NOT NULL ORDER BY id LIMIT 2").all(TOWN);
    const winery = db.prepare("SELECT id, name FROM venues WHERE region = ? AND type = ? AND redirect_to IS NULL AND slug IS NOT NULL ORDER BY id LIMIT 1").get(TOWN, DRINK);
    assert.ok(gf.length === 2 && winery, 'the seed database has these listings');
    const q = { stops: `venue:${gf[0].id},venue:${winery.id},venue:${gf[1].id}`, days: '1,1,2', t: '690,795,1080', stay: String(stay.id), nights: '1', ad: '6', asks: `count:${DRINK}:1,gluten_free,stay:pool,live_music,nonalcoholic` };
    // The link's own grammar: parse -> query -> parse is the same; junk is dropped.
    const c = H.parseShareContext(q);
    assert.deepEqual(H.parseShareContext(Object.fromEntries(new URLSearchParams(H.shareContextQuery(c)))), c);
    assert.deepEqual(c.times, [690, 795, 1080]);
    assert.equal(H.parseShareContext({ t: '9999,<b>', stay: 'x', asks: '<script>,drop table', ad: '99' }), null, 'nothing unvalidated is kept');
    assert.equal(H.parseShareContext({ stops: 'venue:1', days: '1' }), null, 'an older link has no context');
    const ctx = app.tripShareContext(q, 'en');
    assert.equal(ctx.stay.name, 'Honest Plan Test Inn');
    assert.equal(ctx.datesSet, false);
    assert.ok(ctx.stay.links.length >= 1 && ctx.stay.links.every((l) => /honest-plan-test-inn/.test(decodeURIComponent(l.url)) && !H.linkHasDate(l.url)), JSON.stringify(ctx.stay.links));
    assert.equal(ctx.evidence.find((e) => e.ask === 'gluten_free').status, 'verified');
    assert.equal(ctx.evidence.find((e) => e.ask === `count:${DRINK}`).status, 'verified');
    assert.equal(ctx.evidence.find((e) => e.ask === 'live_music').status, 'unknown');
    assert.ok(ctx.lines.some((l) => l.ask === 'nonalcoholic'), 'the non-drinker line is shown');
    for (const l of ctx.lines) assert.doesNotMatch(l.text, /on these dates|I’ll add/);
    const html = app.renderMyTripPage({ lang: 'en', share: app.tripShareSummary(q, 'en'), context: ctx });
    assert.match(html, /id="mtContext"/);
    assert.match(html, /A copy of this plan\./);
    assert.match(html, /6 adults · Dates not set/);
    assert.match(html, /Honest Plan Test Inn/);
    assert.match(html, /We may earn a commission/);
    assert.match(html, new RegExp(`${SITE.brand} can’t see or confirm bookings\\.`));
    assert.match(html, /var sharedTimes = /, 'each stop’s time is read from the link');
    assert.doesNotMatch(html.slice(html.indexOf('id="mtContext"'), html.indexOf('id="mtSave"')), /confirmed|organi[sz]er|synced/i);
    // Chosen dates travel with the link and reach the stay's booking link; French has its own words.
    const dated = app.tripShareContext({ ...q, start: '2026-12-04' }, 'fr');
    assert.ok(dated.stay.links.some((l) => H.linkHasDate(l.url)));
    assert.match(app.tripShareContextHtml(dated, 'fr'), /Une copie de ce plan\./);
    // The EN / FR switch keeps the context.
    assert.match(app.tripShareSearch(q), new RegExp(`&t=690,795,1080&stay=\\d+&nights=1&ad=6&asks=count:${DRINK}:1,gluten_free,stay:pool,live_music,nonalcoholic$`));
    // An OLD link (stops and days only) renders exactly as before: no context block, the same stops script.
    const old = { stops: `venue:${gf[0].id},venue:${winery.id}`, days: '1,2' };
    assert.equal(app.tripShareContext(old, 'en'), null);
    assert.equal(app.tripShareSearch(old), `?stops=venue:${gf[0].id},venue:${winery.id}&days=1,2`);
    const oldHtml = app.renderMyTripPage({ lang: 'en', share: app.tripShareSummary(old, 'en'), context: app.tripShareContext(old, 'en') });
    assert.doesNotMatch(oldHtml, /id="mtContext"/);
    assert.match(oldHtml, /Someone shared this trip with you\./);
    assert.match(oldHtml, /var shared = \(params\.get\('stops'\)/);
    assert.equal(app.tripStopsFor(old.stops.split(',')).filter((s) => !s.missing).length, 2);
  } finally {
    for (const id of made) { db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(id); db.prepare('DELETE FROM venues WHERE id = ?').run(id); }
  }
});

test('9. the six-person request through the planner: the plan, its lines and its evidence agree', () => {
  const app = require('../server.js');
  const parsed = app.parseTripPlanBody({ text: ASK_HERE }, { stays: true, v4: true });
  const p = app.runTripPlanRequest({ ...parsed.value, v4: true }, true);
  assert.ok(['multi_day', 'day_plan'].includes(p.kind));
  assert.equal(p.datesGiven, false);
  assert.ok(Array.isArray(p.evidence) && p.evidence.length > 0);
  assert.ok(!p.days.some((day) => day.date), 'no dates were chosen, so the days have none');
  assert.ok(!p.days.some((day) => day.stops.some((s) => s.kind === 'event')), 'and no event is a stop');
  const drinkStops = H.venueStops(p).filter((x) => x.v.type === DRINK);
  assert.ok(drinkStops.length <= 2, `two ${DRINKS} asked: at most two planned`);
  const count = ev(p, `count:${DRINK}`);
  assert.equal(count.count, drinkStops.length, 'the count in the evidence is the count in the plan');
  assert.equal(count.status === 'verified', drinkStops.length === 2);
  const gf = ev(p, 'gluten_free');
  assert.ok(gf, 'gluten-free is judged');
  const meals = H.venueStops(p).filter((x) => H.isMealStop(x.s));
  const allBadged = meals.length > 0 && meals.every((x) => H.badgeOf(x.v, 'gluten_free') === true);
  assert.equal(gf.status === 'verified', allBadged, 'verified exactly when every meal stop has the badge');
  assert.equal(p.requirementResults.find((r) => r.kind === 'feature' && r.value === 'gluten_free').status === 'satisfied', allBadged);
  if (!allBadged) for (const s of gf.stops.filter((x) => !x.has)) assert.ok(gf.text.includes(s.name), 'a meal stop without the badge is named');
  for (const line of everyLine(p)) { assert.doesNotMatch(line, /on these dates|à ces dates/i, line); if (allBadged) assert.doesNotMatch(line, /couldn.t fit[^.]*gluten|gluten-free friendly/i, line); }
  const lm = ev(p, 'live_music');
  assert.ok(lm && lm.status === 'unknown' && lm.needsDates, 'live music waits for dates');
  if (p.partyNote) assert.equal(p.partyNote.text, ev(p, 'nonalcoholic').text);
  // Every booking link in the plan: its listing's own stored link, no date nobody chose, never shared by two listings.
  const links = H.planBookingLinks(p);
  for (const l of links) assert.equal(H.linkHasDate(l.url), false, l.url);
  assert.deepEqual(app.tripPlanLinkProblems(p).filter((x) => !x.warning).map((x) => [x.code, x.link.kind, x.link.id, x.link.url]), []);
  assert.ok(!links.some((l) => l.kind === 'event'));
});

test('10. "we don’t drink" for the whole group: no winery, brewery or bar is planned, and the evidence says so', () => {
  const app = require('../server.js');
  const parsed = app.parseTripPlanBody({ text: `3 days in ${TOWN_LABEL} for 4 friends: ${DRINKS}, good food and easy walks. We don’t drink.` }, { stays: true, v4: true });
  const p = app.runTripPlanRequest({ ...parsed.value, v4: true }, true);
  assert.equal(p.noAlcohol, true);
  const drink = H.venueStops(p).filter((x) => H.DRINK_TYPES.includes(x.v.type));
  assert.deepEqual(drink.map((x) => x.v.name), [], 'no winery, brewery, cidery, distillery, pub or cocktail bar');
  const e = ev(p, 'no_alcohol');
  assert.equal(e.status, 'verified');
  assert.match(e.text, /^No alcohol: no wineries, breweries, distilleries, pubs or bars are in this plan\.$/);
  assert.ok(!p.partyNote && !ev(p, 'nonalcoholic'), 'that is the whole group, not one person');
  // The same on the planner's own fixtures (pure): the intent rules alcohol out and no drink stop is planned.
  const q = '3 days in Kelowna, wineries and good food, we do not drink';
  const dry = fx.plan(q, { extra: { v4: true } });
  dry.intent = { ...(dry.intent || {}), excluded: d.interpretDiscoveryQuery(q, fx.TAXONOMY, { tripPlanner: true }).excluded };
  H.applyEvidence(dry);
  assert.equal(ev(dry, 'no_alcohol').status, 'verified');
  // And a drink stop left in such a plan is said, never hidden.
  dry.days[0].stops.push(stop('night', 83, 'Blue Gator Bar', 'pub'));
  H.applyEvidence(dry);
  assert.equal(ev(dry, 'no_alcohol').status, 'unmet');
  assert.match(ev(dry, 'no_alcohol').text, /Blue Gator Bar is still in this plan/);
});
