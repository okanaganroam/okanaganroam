'use strict';
// Build My Trip: trip dates, stay dates and suggested times (2026-11-23, Dayton: "Plan 2 days in Penticton on December
// 5–6, 2026…" dated its days Dec 5 and 6, but the stay card, the booking checklist and the shared copy said "Dates not
// set", the hotel link had no dates, and a cinema showed "7:45 PM–8:45 PM" as if it were a showtime).
//   1. the exact request   2. a trip without dates, and an old shared link   3. lodging dates that differ from the
//   trip's dates   4. a past date never reaches a link   5. planner-assumed dates are labelled and not sent
//   6. a cinema's time is a suggestion with the step to check showtimes; a stop within listed hours says so   7. chat
// No network. "Today" is fixed (NOW) wherever the request names real calendar dates.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

process.env.TRIP_PLANNER_V3 = 'on';
process.env.TRIP_CHAT_TIMING = 'off';
process.env.STAY_AFFILIATE_PROVIDER = 'stay22';
process.env.STAY_AFFILIATE_ID = 'testaid';
delete process.env.ANTHROPIC_API_KEY;
const sbl = require('../stay-booking-links.js');
const ts = require('../trip-stays.js');
const hp = require('../trip-honest-plan.js');
const tt = require('../trip-timing.js');
const tc = require('../trip-chat.js');
const app = require('../server.js');
const db = require('../db.js');

const SITE = require('../trip-site.js');
const TOWN = (SITE.TRIP_SITE || SITE).key === 'whistler' || /whistler/i.test(JSON.stringify((SITE.TRIP_SITE || SITE).brand || '')) ? { region: 'whistler', label: 'Whistler', addr: '4010 Whistler Way, Whistler, BC', lat: 50.1146, lng: -122.9548 } : { region: 'penticton', label: 'Penticton', addr: '273 Power Street, Penticton, BC', lat: 49.5003, lng: -119.5953 };
const NOW = new Date('2026-11-23T18:00:00Z'); // Mon Nov 23, 2026, 11 AM in B.C.
const EXACT = `Plan 2 days in ${TOWN.label} on December 5–6, 2026 for two adults and kids aged 6 and 9. We want indoor activities, a kid-friendly lunch, a hotel with a pool and a relaxed pace.`;
const NO_DATES = `Plan 2 days in ${TOWN.label} for two adults and kids aged 6 and 9. We want indoor activities, a kid-friendly lunch and a hotel with a pool.`;

// One fixture hotel with a pool and its three booking links, removed again at the end.
let FIX = null;
test.before(() => {
  FIX = app.createVenue({ region: TOWN.region, type: 'stay', cuisine: 'hotel', slug: 'trip-dates-test-fixture-hotel', name: 'Dates Fixture Hotel', address: TOWN.addr, latitude: TOWN.lat, longitude: TOWN.lng, description: 'A fixture used only by the trip dates tests.' });
  db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(FIX.id, JSON.stringify({ pool: true, hot_tub: true, kid_friendly: true, max_guests: 6, confidence: 'high', booking: { booking_com: 'https://www.booking.com/hotel/ca/dates-fixture-hotel.html', expedia: 'https://www.expedia.ca/Town-Hotels-Dates-Fixture-Hotel.h123.Hotel-Information', own: 'https://dates-fixture-hotel.example.com/book' } }), new Date().toISOString(), 'test');
});
test.after(() => {
  if (FIX) { db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(FIX.id); db.prepare('DELETE FROM venues WHERE id = ?').run(FIX.id); }
  try { app.server.close(); } catch (e) { /* not listening */ }
});

const V3 = fs.readFileSync(require.resolve('../trip-planner-v3-page.js'), 'utf8');
const V4 = fs.readFileSync(require.resolve('../trip-planner-v4-page.js'), 'utf8');
const CHAT = fs.readFileSync(require.resolve('../trip-chat-page.js'), 'utf8');
const qs = (url) => new URL(url).searchParams;
const inner = (url) => new URL(qs(url).get('link')).searchParams;
// The fixture's own links for a stay block's trip, built exactly as the plan builds them (withBookingLinks).
const STAY = () => ({ id: FIX.id, name: 'Dates Fixture Hotel', info: { booking: { booking_com: 'https://www.booking.com/hotel/ca/dates-fixture-hotel.html', expedia: 'https://www.expedia.ca/Town-Hotels-Dates-Fixture-Hotel.h123.Hotel-Information', own: 'https://dates-fixture-hotel.example.com/book' } } });
function linksOf(trip) {
  const block = sbl.withBookingLinks({ trip, pick: { id: FIX.id, name: 'Dates Fixture Hotel' }, alternatives: [] }, new Map([[FIX.id, STAY()]]), { env: process.env });
  return Object.fromEntries(block.pick.bookingLinks.map((l) => [l.key, l.url]));
}
const plan = (text, stay = null, now = NOW) => app.runTripPlanWithStay({ text, v4: true, stay }, undefined, now);
const noDates = (links) => {
  for (const k of ['booking_com', 'expedia']) {
    const w = qs(links[k]), i = inner(links[k]);
    for (const key of ['checkin', 'checkout']) assert.equal(w.get(key), null, `${k} wrapper ${key}`);
    for (const key of ['checkin', 'checkout', 'chkin', 'chkout']) assert.equal(i.get(key), null, `${k} ${key}`);
  }
  assert.doesNotMatch(JSON.stringify(links), /20\d\d-\d\d-\d\d/);
};
const withDates = (links, a, b) => {
  const bw = qs(links.booking_com), bi = inner(links.booking_com), ew = qs(links.expedia), ei = inner(links.expedia);
  assert.equal(bi.get('checkin'), a); assert.equal(bi.get('checkout'), b);
  assert.equal(bw.get('checkin'), a); assert.equal(bw.get('checkout'), b);
  assert.equal(ei.get('chkin'), a); assert.equal(ei.get('chkout'), b);
  assert.equal(ew.get('checkin'), a); assert.equal(ew.get('checkout'), b);
};
const family = (links) => {
  const bw = qs(links.booking_com), bi = inner(links.booking_com), ew = qs(links.expedia), ei = inner(links.expedia);
  assert.equal(bi.get('group_adults'), '2'); assert.equal(bi.get('group_children'), '2'); assert.deepEqual(bi.getAll('age'), ['6', '9']); assert.equal(bi.get('no_rooms'), '1');
  assert.equal(ei.get('rm1'), 'a2:c6:c9');
  for (const w of [bw, ew]) { assert.equal(w.get('adults'), '2'); assert.equal(w.get('children'), '2'); assert.equal(w.get('childrenAges'), '6,9'); assert.equal(w.get('rooms'), '1'); }
  assert.equal(links.own, 'https://dates-fixture-hotel.example.com/book', 'a hotel’s own site is never pre-filled');
};

test('1. the exact request: Dec 5 and 6 on the days, a proposed one-night stay, dates in the links only after a yes', () => {
  const p = plan(EXACT);
  assert.ok(['multi_day', 'day_plan'].includes(p.kind), p.kind);
  assert.deepEqual((p.days || []).map((d) => d.date), ['2026-12-05', '2026-12-06']);
  assert.deepEqual(p.tripDates, { start: '2026-12-05', end: '2026-12-06', source: 'request' });
  const t = p.whereToStay.trip;
  assert.equal(t.stayStatus, 'proposed');
  assert.equal(t.arrive, '2026-12-05'); assert.equal(t.leave, '2026-12-06'); assert.equal(t.nights, 1);
  assert.equal(t.datesGiven, false, 'a proposed stay is not sent to a provider');
  assert.equal(t.tripStart, '2026-12-05'); assert.equal(t.tripEnd, '2026-12-06'); assert.equal(t.tripSource, 'request');
  assert.equal(t.adults, 2); assert.equal(t.kids, 2); assert.deepEqual(t.kidAges, [6, 9]);
  // Before the yes: the party, the ages and the rooms, and no date anywhere (the plan's own links too).
  const before = linksOf(t);
  noDates(before); family(before);
  for (const card of [p.whereToStay.pick, ...(p.whereToStay.alternatives || [])]) for (const l of card.bookingLinks || []) assert.doesNotMatch(decodeURIComponent(l.url), /checkin|checkout|chkin|chkout/, l.url);
  // After the yes (the proposal entered as the stay's check-in and check-out): the same days and stops, dated links.
  const c = plan(EXACT, { arrive: t.arrive, leave: t.leave });
  assert.deepEqual((c.days || []).map((d) => d.date), ['2026-12-05', '2026-12-06']);
  assert.deepEqual(c.days.map((d) => d.stops.map((s) => s.venue && s.venue.id)), p.days.map((d) => d.stops.map((s) => s.venue && s.venue.id)), 'confirming the stay never changes the stops');
  assert.deepEqual(c.tripDates, { start: '2026-12-05', end: '2026-12-06', source: 'request' });
  const ct = c.whereToStay.trip;
  assert.equal(ct.stayStatus, 'confirmed'); assert.equal(ct.datesGiven, true); assert.equal(ct.nights, 1);
  const after = linksOf(ct);
  withDates(after, '2026-12-05', '2026-12-06'); family(after);
  for (const l of c.whereToStay.pick.bookingLinks || []) if (l.key !== 'own' && l.key !== 'search') assert.match(decodeURIComponent(l.url), /(?:checkin|chkin)=2026-12-05/);
  // The checklist (Book my trip) step for the stay opens the same dated link.
  const step = (c.whereToStay.pick.bookingSteps || c.whereToStay.bookingSteps || []).find((x) => x && x.kind === 'stay');
  if (step) assert.match(decodeURIComponent(step.url), /2026-12-05/);
  // The shared copy: the trip's dates on the facts line and on the days; the stay's dates only when confirmed.
  const stops = c.days.flatMap((d) => d.stops.filter((s) => s.venue).map((s) => ({ ref: `venue:${s.venue.id}`, day: d.day })));
  const base = { stops: stops.map((s) => s.ref).join(','), days: stops.map((s) => s.day).join(','), stay: String(FIX.id), nights: '1', ad: '2', kids: '2', ka: '6,9', rm: '1', ra: '1', td: '2026-12-05_2026-12-06', ts: 'r' };
  let ctx = app.tripShareContext(base, 'en', NOW), html = app.tripShareContextHtml(ctx, 'en');
  assert.match(html, /data-mt-facts>2 adults, 2 kids · Sat, Dec 5 – Sun, Dec 6</);
  assert.match(html, /data-mt-stay-dates>Stay dates not confirmed: no dates in these links\.</);
  assert.doesNotMatch(html.replace(/data-mt-facts>[^<]*</, ''), /checkin|chkin|2026-12-0[56]/);
  ctx = app.tripShareContext({ ...base, sa: '2026-12-05', sl: '2026-12-06', sc: '1' }, 'en', NOW); html = app.tripShareContextHtml(ctx, 'en');
  assert.match(html, /data-mt-facts>2 adults, 2 kids · Sat, Dec 5 – Sun, Dec 6</);
  assert.match(html, /data-mt-stay-dates>Stay: Sat, Dec 5 → Sun, Dec 6 · 1 night</);
  const shared = Object.fromEntries(ctx.stay.links.map((l) => [l.key, l.url]));
  withDates(shared, '2026-12-05', '2026-12-06'); family(shared);
  html = app.tripShareContextHtml(app.tripShareContext({ ...base, sa: '2026-12-05', sl: '2026-12-06', sc: '1' }, 'fr', NOW), 'fr');
  assert.match(html, /data-mt-facts>2 adultes, 2 enfants · sam\. 5 déc\. – dim\. 6 déc\.</);
  assert.match(html, /data-mt-stay-dates>Séjour : sam\. 5 déc\. → dim\. 6 déc\. · 1 nuit</);
  // The shared page dates its days from td=, and the page builds td / ts and sa / sl / sc.
  assert.match(fs.readFileSync(require.resolve('../server.js'), 'utf8'), /if \(sharedTd\) sharedStart = sharedTd\[1\];/);
  assert.match(V4, /out \+= '&td=' \+ td\.start/);
  assert.match(V4, /tt\.stayStatus === 'confirmed' && !tt\.datesPast[^\n]*'&sa=' \+ tt\.arrive \+ '&sl=' \+ tt\.leave \+ '&sc=1'/);
  // The page's words, EN + FR.
  for (const s of ['Stay proposed: ', 'Use these dates', 'Dates go to the booking site after you confirm them.', 'Change dates', 'Séjour proposé : ', 'Utiliser ces dates', 'Les dates vont au site de réservation une fois confirmées.', 'Modifier les dates']) assert.ok(V3.includes(s), s);
  // (2026-11-24, trip-access-needs) The confirmed line is worded from what each button's own URL carries: the blanket
  // "Booking links carry these dates." is gone from the page (a hotel's own site was never pre-filled).
  assert.ok(!V3.includes('Booking links carry these dates.') && !V3.includes('Les liens de réservation portent ces dates.'));
  assert.ok(V3.includes('t3HandoffText(s, t, fr)'));
  assert.match(V4, /html \+= t3StayDatesHtml\(t, fr, s\);/, 'the Book my trip sheet shows the stay dates');
  assert.match(CHAT, /t3StayDatesHtml\(tripIn, fr, s\) : ''\) \+ roomsRow/, 'the stay card shows the stay dates');
});

test('2. a trip without dates is unchanged, and an old shared link reads as it did', () => {
  const p = plan(NO_DATES);
  assert.equal(p.tripDates, undefined);
  assert.equal(p.datesGiven, false);
  assert.ok((p.days || []).every((d) => !d.date), 'no dates on the days');
  const t = p.whereToStay.trip;
  assert.equal(t.datesGiven, false);
  for (const k of ['stayStatus', 'datesPast', 'tripStart', 'tripEnd', 'tripSource']) assert.equal(t[k], undefined, k);
  const links = linksOf(t);
  noDates(links); family(links);
  for (const l of p.whereToStay.pick.bookingLinks || []) assert.doesNotMatch(decodeURIComponent(l.url), /checkin|checkout|chkin|chkout/);
  // "Dates not set" and the no-dates note are still the page's words for it; no proposal is drawn.
  assert.match(V3, /else if \(t\.datesPast \|\| t\.datesGiven === false\) parts\.push\(fr \? 'Dates à choisir' : 'Dates not set'\);/);
  assert.match(V3, /if \(!t \|\| !\(t\.stayStatus \|\| t\.datesPast\)\) return '';/);
  assert.ok(V3.includes('No dates yet: pick them here or on the booking site.'));
  // An old link (stops, days, stay, nights, party; no td / sa / sl / sc): parsed and printed as before.
  const stops = p.days.flatMap((d) => d.stops.filter((s) => s.venue).map((s) => ({ ref: `venue:${s.venue.id}`, day: d.day })));
  const old = { stops: stops.map((s) => s.ref).join(','), days: stops.map((s) => s.day).join(','), stay: String(FIX.id), nights: '1', ad: '2', kids: '2', ka: '6,9', rm: '1', ra: '1' };
  assert.deepEqual(hp.parseShareContext(old), { stayId: FIX.id, nights: 1, adults: 2, kids: 2, kidAges: [6, 9], rooms: 1, roomsAssumed: true });
  assert.equal(hp.shareContextQuery(hp.parseShareContext(old)), `stay=${FIX.id}&nights=1&ad=2&kids=2&ka=6,9&rm=1&ra=1`);
  let ctx = app.tripShareContext(old, 'en', NOW), html = app.tripShareContextHtml(ctx, 'en');
  assert.match(html, /data-mt-facts>2 adults, 2 kids · Dates not set</);
  assert.match(html, /No dates in these links: pick them on the booking site\./);
  assert.doesNotMatch(html, /data-mt-stay-dates/);
  noDates(Object.fromEntries(ctx.stay.links.map((l) => [l.key, l.url])));
  // An old dated link (start= and nights=): "From Sat, Dec 5" and dated links, exactly as before.
  ctx = app.tripShareContext({ ...old, start: '2026-12-05' }, 'en', NOW); html = app.tripShareContextHtml(ctx, 'en');
  assert.match(html, /data-mt-facts>2 adults, 2 kids · From Sat, Dec 5</);
  assert.doesNotMatch(html, /data-mt-stay-dates|No dates in these links/);
  withDates(Object.fromEntries(ctx.stay.links.map((l) => [l.key, l.url])), '2026-12-05', '2026-12-06');
  // The new parameters are validated: a bad value is left out, never an error.
  for (const bad of [{ td: '2026-12-05' }, { td: '2026-12-06_2026-12-05' }, { td: '2026-13-05_2026-13-06' }, { td: 'x' }]) assert.equal((hp.parseShareContext({ ad: '2', ...bad }) || {}).tripDates, undefined, JSON.stringify(bad));
  for (const bad of [{ sa: '2026-12-05', sl: '2026-12-06' }, { sa: '2026-12-06', sl: '2026-12-05', sc: '1' }, { sa: '2026-12-05', sc: '1' }, { sa: 'x', sl: 'y', sc: '1' }]) assert.equal((hp.parseShareContext({ ad: '2', ...bad }) || {}).stayDates, undefined, JSON.stringify(bad));
  const c = hp.parseShareContext({ td: '2026-12-05_2026-12-06', ts: 'p', sa: '2026-12-04', sl: '2026-12-06', sc: '1' });
  assert.deepEqual(c, { tripDates: { start: '2026-12-05', end: '2026-12-06', source: 'picked' }, stayDates: { arrive: '2026-12-04', leave: '2026-12-06' } });
  assert.deepEqual(hp.parseShareContext(Object.fromEntries(new URLSearchParams(hp.shareContextQuery(c)))), c);
});

test('3. lodging dates that differ from the trip’s dates stay distinct everywhere', () => {
  const p = plan(EXACT);
  const c = plan(EXACT, { arrive: '2026-12-04', leave: '2026-12-06' });
  assert.deepEqual((c.days || []).map((d) => d.date), ['2026-12-05', '2026-12-06'], 'the days keep the request’s dates');
  assert.deepEqual(c.days.map((d) => d.stops.map((s) => s.venue && s.venue.id)), p.days.map((d) => d.stops.map((s) => s.venue && s.venue.id)));
  assert.deepEqual(c.tripDates, { start: '2026-12-05', end: '2026-12-06', source: 'request' });
  const t = c.whereToStay.trip;
  assert.equal(t.arrive, '2026-12-04'); assert.equal(t.leave, '2026-12-06'); assert.equal(t.nights, 2);
  assert.equal(t.stayStatus, 'confirmed'); assert.equal(t.tripStart, '2026-12-05'); assert.equal(t.tripEnd, '2026-12-06');
  const links = linksOf(t);
  withDates(links, '2026-12-04', '2026-12-06'); family(links);
  // Leaving a day later (Mon Dec 7) too.
  const later = plan(EXACT, { arrive: '2026-12-05', leave: '2026-12-07' });
  assert.deepEqual((later.days || []).map((d) => d.date), ['2026-12-05', '2026-12-06']);
  assert.equal(later.whereToStay.trip.nights, 2);
  withDates(linksOf(later.whereToStay.trip), '2026-12-05', '2026-12-07');
  // The shared copy says both, and its links carry the stay's dates.
  const stops = c.days.flatMap((d) => d.stops.filter((s) => s.venue).map((s) => ({ ref: `venue:${s.venue.id}`, day: d.day })));
  const q = { stops: stops.map((s) => s.ref).join(','), days: stops.map((s) => s.day).join(','), stay: String(FIX.id), nights: '2', ad: '2', kids: '2', ka: '6,9', rm: '1', ra: '1', td: '2026-12-05_2026-12-06', ts: 'r', sa: '2026-12-04', sl: '2026-12-06', sc: '1' };
  const ctx = app.tripShareContext(q, 'en', NOW), html = app.tripShareContextHtml(ctx, 'en');
  assert.match(html, /data-mt-facts>2 adults, 2 kids · Sat, Dec 5 – Sun, Dec 6</);
  assert.match(html, /data-mt-stay-dates>Stay: Fri, Dec 4 → Sun, Dec 6 · 2 nights</);
  withDates(Object.fromEntries(ctx.stay.links.map((l) => [l.key, l.url])), '2026-12-04', '2026-12-06');
  // The page's line: "Trip: … · Stay: …".
  assert.ok(V3.includes("parts.push((fr ? 'Voyage : ' : 'Trip: ') + tripTxt); parts.push((fr ? 'Séjour : ' : 'Stay: ') + t3NiceDate(t.arrive, fr) + ' → ' + t3NiceDate(t.leave, fr));"));
  // A stay away from the request's dates still moves the trip, as the Dates fields always did.
  const moved = plan(EXACT, { arrive: '2026-12-11', leave: '2026-12-13' });
  assert.equal(moved.days[0].date, '2026-12-11');
  assert.equal(moved.tripDates.source, 'picked');
});

test('4. a past date never reaches a booking link', () => {
  const PAST = EXACT.replace('December 5–6, 2026', 'November 10–11, 2026');
  const p = plan(PAST);
  assert.equal(p.tripDates.start, '2026-11-10'); assert.equal(p.tripDates.past, true);
  const t = p.whereToStay.trip;
  assert.equal(t.datesPast, true); assert.equal(t.stayStatus, undefined, 'no stay is proposed for a day already past'); assert.equal(t.datesGiven, false);
  noDates(linksOf(t));
  for (const l of p.whereToStay.pick.bookingLinks || []) assert.doesNotMatch(decodeURIComponent(l.url), /checkin|checkout|chkin|chkout/);
  // Even entered as the stay's own check-in and check-out.
  const st = ts.stayDateState({ arrive: '2026-11-10', leave: '2026-11-11' }, '2026-11-10', '2026-11-11', { start: '2026-11-10', end: '2026-11-11', source: 'request' }, '2026-11-23');
  assert.deepEqual(st, { tripStart: '2026-11-10', tripEnd: '2026-11-11', tripSource: 'request', stayStatus: 'confirmed', datesPast: true });
  noDates(linksOf({ arrive: '2026-11-10', leave: '2026-11-11', nights: 1, adults: 2, kids: 2, kidAges: [6, 9], rooms: 1, datesGiven: true, stayStatus: 'confirmed', datesPast: true }));
  // The shared copy: a confirmed stay whose check-in has passed (and an old link's start=) carries no dates either.
  const stops = p.days.flatMap((d) => d.stops.filter((s) => s.venue).map((s) => ({ ref: `venue:${s.venue.id}`, day: d.day })));
  const base = { stops: stops.map((s) => s.ref).join(','), days: stops.map((s) => s.day).join(','), stay: String(FIX.id), nights: '1', ad: '2', kids: '2', ka: '6,9', rm: '1', ra: '1' };
  let ctx = app.tripShareContext({ ...base, td: '2026-11-10_2026-11-11', ts: 'r', sa: '2026-11-10', sl: '2026-11-11', sc: '1' }, 'en', NOW);
  assert.match(app.tripShareContextHtml(ctx, 'en'), /Those stay dates have passed: no dates in these links\./);
  noDates(Object.fromEntries(ctx.stay.links.map((l) => [l.key, l.url])));
  ctx = app.tripShareContext({ ...base, start: '2026-11-10' }, 'en', NOW);
  noDates(Object.fromEntries(ctx.stay.links.map((l) => [l.key, l.url])));
  // The page says so and asks for dates (EN + FR); the chat reader refuses a past check-in.
  assert.ok(V3.includes('Those dates have passed, so no dates are sent.') && V3.includes('Ces dates sont passées : aucune date n’est envoyée.'));
  assert.deepEqual(ts.stayDatesChat('we arrive November 1', { given: true, tripStart: '2026-12-05', tripEnd: '2026-12-06', arrive: '2026-12-05', leave: '2026-12-06', today: '2026-11-23' }), { error: 'past' });
});

test('5. dates the planner assumed are labelled, and never sent', () => {
  const p = plan(`2 days in ${TOWN.label} next weekend with kids, indoor activities and a hotel with a pool`);
  assert.deepEqual((p.days || []).map((d) => d.date), ['2026-12-05', '2026-12-06'], '"next weekend" asked on Mon Nov 23 is Dec 5 and 6');
  assert.ok((p.days || []).every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date || '')), 'the planner dated the days itself');
  assert.equal(p.tripDates.assumed, true); assert.equal(p.tripDates.source, 'assumed');
  const t = p.whereToStay.trip;
  assert.equal(t.datesGiven, false); assert.equal(t.stayStatus, undefined, 'no stay is proposed from assumed dates'); assert.equal(t.tripSource, 'assumed');
  noDates(linksOf(t));
  for (const l of p.whereToStay.pick.bookingLinks || []) assert.doesNotMatch(decodeURIComponent(l.url), /checkin|checkout|chkin|chkout/);
  // The day headings say "(assumed)" / « (supposé) », and the shared link carries no assumed date.
  assert.match(V4, /if \(date && tdd && tdd\.assumed\) date \+= vt\('assumed'\);/);
  assert.match(V4, /assumed: ' \(assumed\)'/); assert.match(V4, /assumed: ' \(supposé\)'/);
  assert.match(V4, /if \(td && !td\.assumed && !td\.past && isoOk\(td\.start\)\)/);
  // The sources: a calendar date typed is the visitor's; a weekend, a weekday or a month is the planner's reading.
  const src = (dateSourceText, when) => app.tripDatesOf({ kind: 'multi_day', days: [{ date: '2026-12-05' }, { date: '2026-12-06' }], dateSourceText, intent: { when: when || null } }, null, NOW);
  assert.equal(src('December 5–6, 2026').source, 'request');
  assert.equal(src('2026-12-05').source, 'request');
  assert.equal(src('Date control').source, 'chat');
  assert.equal(app.tripDatesOf({ kind: 'multi_day', days: [{ date: '2026-12-05' }], dateSourceText: 'Date control', intent: {} }, { arrive: '2026-12-05', leave: '2026-12-06' }, NOW).source, 'picked');
  assert.equal(app.tripDatesOf({ kind: 'multi_day', days: [{ date: '2026-12-05' }], dateSourceText: 'Date control', intent: {} }, { arrive: '2026-12-05', leave: '2026-12-06', via: 'chat' }, NOW).source, 'chat');
  for (const s of ['this weekend', 'next weekend', 'the day you named', 'the month you named', 'the coming weekend', 'opening', '']) assert.equal(src(s).assumed, true, s);
  assert.equal(app.tripDatesOf({ kind: 'multi_day', days: [{}, {}] }, null, NOW), null);
});

test('6. a cinema’s time is a suggestion with the step to check showtimes; a stop within listed hours says so', () => {
  const cinema = { name: 'Landmark Cinemas 7 Penticton', type: 'indoor', website: 'https://www.landmarkcinemas.com/penticton' };
  assert.equal(tt.scheduleKind(cinema, []), 'showtimes');
  assert.equal(tt.scheduleKind({ name: 'Any Name', type: 'indoor' }, ['cinema']), 'showtimes');
  assert.equal(tt.scheduleKind({ name: 'Any Name', type: 'indoor' }, ['classes']), 'classes');
  assert.equal(tt.scheduleKind({ name: 'Community Centre (Pool & Lazy River)', type: 'indoor' }, []), 'sessions');
  assert.equal(tt.scheduleKind({ name: 'The Cinema Bistro', type: 'restaurant' }, []), null, 'only indoor and sport listings are read by name');
  assert.equal(tt.scheduleKind({ name: 'Bowling Lanes', type: 'indoor' }, ['bowling']), 'lanes', 'bowling is booked by the lane (tests/trip-session-timing.test.js)');
  const p = { schedule: [
    { day: 1, venueId: 1, status: 'estimated', startMinutes: 1080, endMinutes: 1170 },
    { day: 1, venueId: 2, status: 'provisional', startMinutes: 1185, endMinutes: 1245, confirmationReasons: ['hours', 'visit_duration', 'travel'] },
    { day: 2, venueId: 2, status: 'provisional', startMinutes: 600, endMinutes: 660, confirmationReasons: ['hours'] },
    { day: 2, venueId: 1, status: 'estimated', startMinutes: 690, endMinutes: 780 },
    { day: 2, venueId: 3, status: 'estimated', startMinutes: 840, endMinutes: 900, bookDeparture: true },
  ] };
  tt.applyTiming(p, (id) => (id === 2 ? ['cinema'] : []), (id) => (id === 2 ? cinema : { name: 'Bistro', type: 'restaurant', website: 'http://not-https.example.com' }));
  assert.deepEqual(p.schedule[0].timing, { hours: 'listed' }, 'a stop that fits its listed hours says so');
  assert.deepEqual(p.schedule[1].timing, { schedule: 'showtimes', allowMinutes: 120, checkUrl: 'https://www.landmarkcinemas.com/penticton', hours: 'unknown' }, 'the last stop of the day: about 2 h, never the planner’s 1 h slot');
  assert.equal(p.schedule[2].timing.allowMinutes, undefined, 'no length is said when the next stop leaves less than 2 h');
  assert.equal(p.schedule[4].timing, undefined, 'a tour’s departure is said its own way');
  assert.equal(tt.suggestedLine(1185, p.schedule[1].timing, cinema.name, false), 'Suggested: around 7:45 PM, allow about 2 h. Showtimes vary: check Landmark Cinemas 7 Penticton’s showtimes.');
  assert.equal(tt.suggestedLine(1185, p.schedule[1].timing, cinema.name, true), 'Heure suggérée : vers 19 h 45, prévoyez environ 2 h. Les séances varient : vérifiez l’horaire des séances de Landmark Cinemas 7 Penticton.');
  assert.equal(tt.suggestedLine(600, p.schedule[2].timing, cinema.name, false), 'Suggested: around 10 AM. Showtimes vary: check Landmark Cinemas 7 Penticton’s showtimes.');
  assert.doesNotMatch(tt.suggestedLine(1185, p.schedule[1].timing, cinema.name, false), /8:45|–/, 'no fake end time');
  assert.equal(tt.httpsUrl('http://x.example.com'), null); assert.equal(tt.httpsUrl('javascript:alert(1)'), null);
  // The card: "around 7:45 PM" on the pill; the expanded line and "Check showtimes ↗" to the stored website; no
  // "7:45 PM–8:45 PM". Any other stop: "Suggested: 12 PM–1:30 PM" and whether that fits its listed hours.
  assert.match(V4, /r\.timing && r\.timing\.schedule \? \(lang\(\) === 'fr' \? 'vers ' : 'around '\) : ''/);
  assert.match(V4, /out \+= v4TimingHtml\(s, id\);/);
  assert.doesNotMatch(V4, /if \(t\) out \+= '<p><strong>' \+ esc\(t\) \+ '<\/strong><\/p>';/);
  // The words for showtimes, classes and sessions are trip-timing.js's one table, put into the page's script as it is.
  const V4C = require('../trip-planner-v4-page.js').V4_CLIENT_SRC;
  assert.ok(V4.includes('__TRIP_TIMING_CLIENT__') && !V4C.includes('__TRIP_TIMING_CLIENT__'));
  for (const s of ['Suggested: around ', ', allow about ', 'Showtimes vary', 'Check showtimes', 'Class times vary', 'Session times vary', 'Within its listed hours.', 'Hours not verified: check before you go.', 'Heure suggérée : vers ', ', prévoyez environ ', 'Les séances varient', 'Voir les séances', 'Dans ses heures indiquées.', 'Heures non vérifiées : à confirmer.']) assert.ok(V4C.includes(s), s);
  // The Book my trip sheet lists them under "Times to check", with the same step.
  assert.ok(V4.includes("fr ? 'Horaires à vérifier' : 'Times to check'") && V4.includes("fr ? 'suggéré vers ' : 'suggested around '"));
  // The shared copy marks the same stops (the listing is read again there).
  const SERVER = fs.readFileSync(require.resolve('../server.js'), 'utf8');
  assert.match(SERVER, /if \(sk\) tx = \(fr \? 'vers ' : 'around '\) \+ tx;/);
  assert.match(SERVER, /data-mt-sched=/);
});

test('7. the chat confirms or changes the stay’s dates and answers from that state', async () => {
  // Dates about six weeks from the real today, so the chat (which reads the real clock) never sees them as past.
  const d0 = new Date(Date.now() + 42 * 86400000);
  const iso = (d) => d.toISOString().slice(0, 10), add = (s, n) => iso(new Date(Date.parse(`${s}T12:00:00Z`) + n * 86400000));
  const A = iso(d0), B = add(A, 1);
  const text = `Plan 2 days in ${TOWN.label} from ${A} to ${B} for two adults and kids aged 6 and 9. Indoor activities, a kid-friendly lunch and a hotel with a pool.`;
  const core = app.runTripPlanRequest(app.parseTripPlanBody({ text }, { v4: true, stays: true }).value, true);
  assert.deepEqual(core.tripDates, { start: A, end: B, source: 'request' });
  assert.equal(core.whereToStay.trip.stayStatus, 'proposed');
  const stops = tc.planStops(core).map((s) => ({ key: s.key, id: s.id, ...(s.start !== null ? { start: s.start } : {}) }));
  const stayId = core.whereToStay.pick.id;
  const turn = async (message, stay, lang = 'en', extra = {}) => {
    const v = app.parseTripChatBody({ message, lang, plan: { text, seed: 0, excludeVenueIds: [], ...(stay ? { stay } : {}) }, locks: {}, removed: [], stops, stayId, dayDates: [A, B], tripSource: 'request', ...extra }, { stays: true });
    assert.ok(v.value, JSON.stringify(v.error));
    return (await app.runTripChatTurn(v.value, { staysOn: true, lang })).response;
  };
  let r = await turn('what dates is the hotel for?');
  assert.match(r.reply, /^Your trip is .+, so I’d propose .+ → .+, 1 night\. Nothing is sent to a booking site until you confirm: say “yes, book those nights” or tell me your check-in and check-out\.$/);
  assert.ok(!r.plan && !r.stayBlock && !r.stayDates, 'a question changes nothing');
  r = await turn('yes, book those nights');
  assert.deepEqual(r.stayDates, { arrive: A, leave: B });
  assert.match(r.reply, /^Stay set: .+ → .+, 1 night\. The [A-Z][\w. ]+ links? now carr(?:y|ies) these dates\. The hotel’s own site doesn’t take your dates from here, so enter them on that site\.$/);
  assert.equal(r.stayBlock.whereToStay.trip.stayStatus, 'confirmed');
  assert.ok(!r.plan, 'the stops are not planned again');
  for (const l of r.stayBlock.whereToStay.pick.bookingLinks || []) if (l.key !== 'own' && l.key !== 'search') assert.ok(decodeURIComponent(l.url).includes(A) && decodeURIComponent(l.url).includes(B), l.url);
  // The night before: the stay's dates only; the trip's days are said to stay.
  r = await turn('arrive the night before', { arrive: A, leave: B });
  assert.deepEqual(r.stayDates, { arrive: add(A, -1), leave: B });
  assert.match(r.reply, /^Stay set: .+ → .+, 2 nights\. Your trip days stay .+\. The [A-Z][\w. ]+ links? now carr(?:y|ies) these dates\. The hotel’s own site doesn’t take your dates from here, so enter them on that site\.$/);
  assert.equal(r.stayBlock.whereToStay.trip.tripStart, A);
  r = await turn('what dates is the hotel for?', { arrive: add(A, -1), leave: B });
  assert.match(r.reply, /^The stay is .+ → .+, 2 nights; your trip days are .+\. The [A-Z][\w. ]+ links? carr(?:y|ies) these dates\. The hotel’s own site doesn’t take your dates from here, so enter them on that site\.$/);
  r = await turn('oui, réserve ces nuits', null, 'fr');
  assert.match(r.reply, /^Séjour : .+ → .+, 1 nuit\. (?:Le lien|Les liens) [A-Z][\w. ]+ portent? ces dates\. Le site de l’hôtel ne reçoit pas vos dates d’ici : entrez-les sur ce site\.$/);
  // Away from the trip's days, or no dates given at all: nothing is set.
  r = await turn(`check in ${add(A, 20)}, check out ${add(A, 22)}`);
  assert.match(r.reply, /^Those dates are away from your trip days/); assert.ok(!r.stayDates);
  assert.equal(ts.stayDatesChat('yes, book those nights', { given: false, tripStart: A, tripEnd: B }), null, 'assumed or missing dates are never confirmed this way');
  // The reader, against Dec 5–6.
  const C = { given: true, tripStart: '2026-12-05', tripEnd: '2026-12-06', arrive: '2026-12-05', leave: '2026-12-06', today: '2026-11-23' };
  assert.deepEqual(ts.stayDatesChat('we arrive Friday the 4th', C), { arrive: '2026-12-04', leave: '2026-12-06' });
  assert.deepEqual(ts.stayDatesChat('check out Monday', C), { arrive: '2026-12-05', leave: '2026-12-07' });
  assert.deepEqual(ts.stayDatesChat('on arrive vendredi le 4', C), { arrive: '2026-12-04', leave: '2026-12-06' });
  assert.deepEqual(ts.stayDatesChat('what dates is the hotel for?', C), { ask: true });
  for (const m of ['we arrive at 3 pm', 'we are leaving after lunch on day 2', 'swap the cinema for bowling', 'what time is the movie?']) assert.equal(ts.stayDatesChat(m, C), null, m);
  // "what time is the movie?": no showtimes are held.
  r = await turn('what time is the movie?');
  assert.match(r.reply, /^(?:I don’t have showtimes\b.+|No stop on your plan runs on showtimes or class times that I can see\. Every time on the plan is my suggestion, not a booked slot\.)$/);
  assert.ok(!r.plan && !r.stayBlock);
});
