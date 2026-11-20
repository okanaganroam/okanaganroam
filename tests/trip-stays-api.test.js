'use strict';
// Build My Trip "Where to stay" (step 2, 2026-11-20) through POST /api/trip/plan and /trip: TRIP_STAYS off (the default)
// ignores the new fields and returns the same plan, byte for byte; TRIP_STAYS on and the ?stays=1 preview add the trip
// inputs and the whereToStay block; the body validator; a stay is never a plan stop; /trip's indexability is unchanged.
// Uses the repo's seed database plus a few fixture stays, removed again at the end.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

delete process.env.TRIP_STAYS;
process.env.TRIP_PLANNER_V3 = 'on';
const app = require('../server.js');
const db = require('../db.js');

const made = [];
let base, srv;
test.before(async () => {
  let n = 0;
  const mk = (o) => { const v = app.createVenue({ region: 'kelowna', type: 'stay', cuisine: 'hotel', address: `${100 + (++n)} Water Street, Kelowna, BC`, latitude: 49.886 + n / 1000, longitude: -119.496, description: 'A fixture used only by the trip stays tests.', ...o }); made.push(v.id); return v; };
  const family = mk({ slug: 'trip-stays-test-family-inn', name: 'Trip Stays Test Family Inn', image_url: '/images/trip-v3/hero.webp' });
  const adults = mk({ slug: 'trip-stays-test-adults-lodge', name: 'Trip Stays Test Adults Lodge' });
  const pets = mk({ slug: 'trip-stays-test-pet-motel', name: 'Trip Stays Test Pet Motel', cuisine: 'motel' });
  const ins = db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)');
  ins.run(family.id, JSON.stringify({ kid_friendly: true, max_guests: 6, price_level: 2, confidence: 'high', booking: { booking_com: 'https://www.booking.com/hotel/ca/trip-stays-test-family-inn.html', expedia: 'https://www.expedia.ca/Kelowna-Hotels-Trip-Stays-Test-Family-Inn.h1234567.Hotel-Information', own: 'https://www.example.com/family-inn/book' } }), '2026-11-20T00:00:00Z', 'test');
  ins.run(adults.id, JSON.stringify({ adults_only: true, max_guests: 2, price_level: 4 }), '2026-11-20T00:00:00Z', 'test');
  ins.run(pets.id, JSON.stringify({ pets: 'yes', min_nights: 1 }), '2026-11-20T00:00:00Z', 'test');
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  for (const id of made) { db.prepare('DELETE FROM stay_info WHERE venue_id = ?').run(id); db.prepare('DELETE FROM venues WHERE id = ?').run(id); }
  delete process.env.TRIP_STAYS;
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const post = async (body, qs = '') => {
  const r = await fetch(`${base}/api/trip/plan${qs}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, text: await r.text() };
};
const TEXT = '3 days in Kelowna with kids';
const STAY = { arrive: '2027-07-09', leave: '2027-07-12', adults: 2, kids: 2 };
const stopIds = (p) => (p.days || []).flatMap((d) => d.stops || []).map((s) => s.venue && s.venue.id).filter(Boolean);

test('flag off (default): the stay field is ignored and the plan is byte-identical; no whereToStay; no inputs on /trip', async () => {
  delete process.env.TRIP_STAYS;
  assert.equal(app.isTripStaysEnabled(), false);
  const plain = await post({ text: TEXT });
  const withStay = await post({ text: TEXT, stay: STAY });
  const withBadStay = await post({ text: TEXT, stay: { arrive: 'not a date', adults: 99 } });
  assert.equal(plain.status, 200);
  assert.equal(withStay.text, plain.text);
  assert.equal(withBadStay.text, plain.text, 'an invalid stay is ignored too, not an error');
  assert.equal(JSON.parse(plain.text).whereToStay, undefined);
  assert.doesNotMatch(plain.text, /whereToStay/);
  // The same plan the planner gives directly (what the route returned before this change).
  const direct = JSON.parse(plain.text);
  assert.equal(direct.kind, 'multi_day');
  const page = await (await fetch(`${base}/trip`)).text();
  assert.doesNotMatch(page, /t3Arrive|t3StayIn|Where to stay|stays=1/);
  assert.doesNotMatch(page.split('</head>')[0], /<meta name="robots"/, '/trip stays indexable');
  // ?stays=0 or any other value is not the preview.
  assert.equal((await post({ text: TEXT, stay: STAY }, '?stays=0')).text, plain.text);
});

test('flag on: whereToStay with the trip dates, party and chosen stay; the dates set the plan; a stay is never a stop', async () => {
  process.env.TRIP_STAYS = 'on';
  try {
    const r = await post({ text: TEXT, stay: STAY });
    assert.equal(r.status, 200);
    const p = JSON.parse(r.text);
    const w = p.whereToStay;
    assert.ok(w, 'a base for a 3-night family trip');
    assert.deepEqual(w.trip, { arrive: '2027-07-09', leave: '2027-07-12', nights: 3, adults: 2, kids: 2, dog: false, datesGiven: true });
    assert.equal(w.stayId, w.pick.id);
    assert.ok(made.includes(w.pick.id));
    const shown = [w.pick, ...w.alternatives].map((s) => s.name);
    assert.ok(!shown.includes('Trip Stays Test Adults Lodge'), 'adults only is dropped with kids');
    assert.equal(w.pick.name, 'Trip Stays Test Family Inn');
    assert.equal(w.pick.sleeps, 6);
    assert.equal(w.pick.priceBand, '$$');
    assert.equal(w.pick.url, '/kelowna/stays/trip-stays-test-family-inn');
    assert.equal(w.pick.urlFr, '/fr/kelowna/stays/trip-stays-test-family-inn');
    assert.ok(w.pick.reasons.some((x) => x.text === 'Family-friendly'));
    // The dates: 3 nights -> a 4-day plan from July 9.
    assert.equal(p.days.length, 4);
    assert.equal(((p.schedule || []).find((x) => x.date) || {}).date, '2027-07-09');
    for (const id of stopIds(p)) assert.ok(!made.includes(id), 'a stay is never a plan stop');
    // Bad input is refused with a reason.
    for (const bad of [{ arrive: '2027-07-12', leave: '2027-07-09' }, { adults: 0 }, { kids: 13 }, { arrive: '2027-01-01', leave: '2027-03-01' }, { guests: 3 }]) {
      const e = await post({ text: TEXT, stay: bad });
      assert.equal(e.status, 400, JSON.stringify(bad));
      assert.match(JSON.parse(e.text).error, /stay|night/);
    }
    // No inputs: the plan's own length and dates; still a base for a 3-day plan.
    const own = JSON.parse((await post({ text: TEXT })).text);
    assert.equal(own.days.length, 3);
    assert.ok(own.whereToStay);
    assert.equal(own.whereToStay.trip.nights, 2);
    // One day, no dates: no card.
    const day = JSON.parse((await post({ text: 'dinner in Kelowna tonight' })).text);
    assert.equal(day.whereToStay, undefined);
    // The page shows the Dates and Guests row (noindex is unchanged: /trip with no query has none).
    const page = await (await fetch(`${base}/trip`)).text();
    assert.match(page, /id="t3Arrive"/);
    assert.doesNotMatch(page, /'\/api\/trip\/plan\?stays=1'/);
    assert.doesNotMatch(page.split('</head>')[0], /<meta name="robots"/);
  } finally { delete process.env.TRIP_STAYS; }
});

test('?stays=1 preview with the flag off: the API and /trip?stays=1 behave as with the flag on, for that request only', async () => {
  delete process.env.TRIP_STAYS;
  const r = await post({ text: '2 days in Kelowna with our dog', stay: { adults: 2 } }, '?stays=1');
  assert.equal(r.status, 200);
  const w = JSON.parse(r.text).whereToStay;
  assert.ok(w);
  assert.equal(w.pick.name, 'Trip Stays Test Pet Motel');
  assert.equal(w.pick.reasons[1].text, 'Pets welcome');
  assert.equal(w.trip.adults, 2);
  assert.equal((await post({ text: TEXT, stay: { adults: 0 } }, '?stays=1')).status, 400);
  // The next request without the parameter is back to normal.
  assert.doesNotMatch((await post({ text: TEXT, stay: STAY })).text, /whereToStay/);
  const page = await (await fetch(`${base}/trip?stays=1`)).text();
  assert.match(page, /id="t3StayIn"/);
  assert.match(page, /'\/api\/trip\/plan\?stays=1'/);
  assert.match(page.split('</head>')[0], /<meta name="robots" content="noindex, follow">/, 'a /trip URL with a query is noindex, as before');
  assert.match(page, /<span class="t3-fr" lang="fr">Dates et voyageurs<\/span>/);
});

test('parseTripPlanBody: the stay field is validated only when stays are on', () => {
  const on = (stay) => app.parseTripPlanBody({ text: 'x', stay }, { stays: true });
  const off = (stay) => app.parseTripPlanBody({ text: 'x', stay });
  assert.deepEqual(on({ arrive: '2027-07-09', leave: '2027-07-10' }).value.stay, { arrive: '2027-07-09', leave: '2027-07-10' });
  assert.equal(on({}).value.stay, undefined);
  assert.match(on({ arrive: '2027-07-09', leave: '2027-08-20' }).error, /30 nights/);
  assert.match(on('x').error, /stay must be an object/);
  assert.equal(off({ adults: 99 }).error, undefined);
  assert.equal(off({ adults: 99 }).value.stay, undefined);
  assert.deepEqual(off({ adults: 2 }).value, app.parseTripPlanBody({ text: 'x' }).value);
  // Other fields are checked exactly as before.
  assert.match(app.parseTripPlanBody({ text: 'x', stays: 1 }, { stays: true }).error, /Unexpected field/);
});

test('"Bringing a dog" ticked: the stay must allow pets and the plan is a dog trip, without the words in the request', async () => {
  delete process.env.TRIP_STAYS;
  const r = await post({ text: '2 days in Kelowna', stay: { adults: 2, dog: true } }, '?stays=1');
  assert.equal(r.status, 200);
  const p = JSON.parse(r.text);
  assert.equal(p.whereToStay.pick.name, 'Trip Stays Test Pet Motel');
  assert.equal(p.whereToStay.trip.dog, true);
  assert.ok((p.intent.features || []).includes('dog_friendly') || (p.intent.party && p.intent.party.dog), 'the plan itself is a dog trip');
  // Same as typing it.
  const typed = JSON.parse((await post({ text: '2 days in Kelowna with our dog', stay: { adults: 2 } }, '?stays=1')).text);
  assert.deepEqual(stopIds(p), stopIds(typed));
  // Unticked (dog: false) changes nothing; a dog already in the request is not added twice.
  const plain = JSON.parse((await post({ text: '2 days in Kelowna', stay: { adults: 2 } }, '?stays=1')).text);
  assert.deepEqual(JSON.parse((await post({ text: '2 days in Kelowna', stay: { adults: 2, dog: false } }, '?stays=1')).text), plain);
  assert.equal(plain.whereToStay.trip.dog, false);
  assert.equal((await post({ text: '2 days in Kelowna', stay: { dog: 'yes' } }, '?stays=1')).status, 400);
  const page = await (await fetch(`${base}/trip?stays=1`)).text();
  assert.match(page, /id="t3Dog"/);
  assert.match(page, /Bringing a dog/);
});

// Step 3 (2026-11-20): booking buttons, the trip checklist and the commission switch.
test('booking links: plain without a partner, Stay22 Allez with one; owner link never affiliate; checklist of booked stops', async () => {
  delete process.env.TRIP_STAYS;
  const saved = { p: process.env.STAY_AFFILIATE_PROVIDER, i: process.env.STAY_AFFILIATE_ID };
  const restore = [];
  try {
    delete process.env.STAY_AFFILIATE_PROVIDER; delete process.env.STAY_AFFILIATE_ID;
    const p = JSON.parse((await post({ text: TEXT, stay: STAY }, '?stays=1')).text);
    const w = p.whereToStay;
    assert.equal(w.pick.name, 'Trip Stays Test Family Inn');
    assert.deepEqual(w.pick.bookingLinks.map((l) => [l.key, l.affiliate]), [['booking_com', false], ['expedia', false], ['own', false]]);
    assert.equal(w.pick.bookingLinks[0].url, 'https://www.booking.com/hotel/ca/trip-stays-test-family-inn.html?checkin=2027-07-09&checkout=2027-07-12&group_adults=2&group_children=2&no_rooms=1');
    assert.equal(w.pick.bookingLinks[1].url, 'https://www.expedia.ca/Kelowna-Hotels-Trip-Stays-Test-Family-Inn.h1234567.Hotel-Information?chkin=2027-07-09&chkout=2027-07-12&rm1=a2');
    for (const a of w.alternatives) assert.ok(Array.isArray(a.bookingLinks));
    assert.ok(Array.isArray(w.checklist));
    assert.doesNotMatch(JSON.stringify(w.pick.bookingLinks), /Kelowna with kids|days in/, 'no request words in any URL');

    // With Stay22 set, the same plan's Booking.com and Expedia buttons become Allez links; the own site does not.
    process.env.STAY_AFFILIATE_PROVIDER = 'stay22'; process.env.STAY_AFFILIATE_ID = 'test123';
    const a = JSON.parse((await post({ text: TEXT, stay: STAY }, '?stays=1')).text).whereToStay.pick.bookingLinks;
    assert.deepEqual(a.map((l) => [l.key, l.affiliate, l.rel]), [['booking_com', true, 'sponsored nofollow noopener'], ['expedia', true, 'sponsored nofollow noopener'], ['own', false, 'nofollow noopener']]);
    assert.match(a[0].url, /^https:\/\/www\.stay22\.com\/allez\/booking\?aid=test123&link=https%3A%2F%2Fwww\.booking\.com%2Fhotel%2Fca%2Ftrip-stays-test-family-inn\.html%3Fcheckin%3D2027-07-09/);

    // An owner's booking link is the own-site button and never an affiliate link.
    const fam = made[0];
    const prev = db.prepare('SELECT booking_url FROM venue_links WHERE venue_id = ?').get(fam);
    restore.push(() => (prev ? db.prepare('UPDATE venue_links SET booking_url = ? WHERE venue_id = ?').run(prev.booking_url, fam) : db.prepare('DELETE FROM venue_links WHERE venue_id = ?').run(fam)));
    db.prepare('INSERT INTO venue_links (venue_id, booking_url) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET booking_url = excluded.booking_url').run(fam, 'https://owner.example.com/book?aid=owner');
    const o = JSON.parse((await post({ text: TEXT, stay: STAY }, '?stays=1')).text).whereToStay.pick.bookingLinks;
    assert.deepEqual(o[2], { key: 'own', label: 'Hotel’s own site', labelFr: 'Site de l’hôtel', short: 'Hotel’s own site', shortFr: 'Site de l’hôtel', url: 'https://owner.example.com/book?aid=owner', affiliate: false, rel: 'nofollow noopener' });

    // Checklist: the plan's stops that have a booking link (the venue page's own Book button), in plan order.
    const stops = stopIds(p).slice(0, 2);
    assert.ok(stops.length >= 1);
    for (const id of stops) {
      const before = db.prepare('SELECT booking_url FROM venue_links WHERE venue_id = ?').get(id);
      restore.push(() => (before ? db.prepare('UPDATE venue_links SET booking_url = ? WHERE venue_id = ?').run(before.booking_url, id) : db.prepare('DELETE FROM venue_links WHERE venue_id = ?').run(id)));
      db.prepare('INSERT INTO venue_links (venue_id, booking_url) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET booking_url = excluded.booking_url').run(id, `https://book.example.com/v${id}`);
    }
    const c = JSON.parse((await post({ text: TEXT, stay: STAY }, '?stays=1')).text).whereToStay.checklist;
    for (const id of stops) {
      const item = c.find((x) => x.venueId === id);
      assert.ok(item, `stop ${id} with a booking link is on the checklist`);
      assert.equal(item.url, `https://book.example.com/v${id}`);
      assert.ok(item.label && item.labelFr && item.name);
    }
    assert.ok(c.length <= 6);
  } finally {
    for (const f of restore.reverse()) f();
    if (saved.p === undefined) delete process.env.STAY_AFFILIATE_PROVIDER; else process.env.STAY_AFFILIATE_PROVIDER = saved.p;
    if (saved.i === undefined) delete process.env.STAY_AFFILIATE_ID; else process.env.STAY_AFFILIATE_ID = saved.i;
  }
});

test('card: trip line, one main button, smaller links, notes, and the disclosure only when a shown link is affiliate', async () => {
  const page = await (await fetch(`${base}/trip?stays=1`)).text();
  const src = page.split('<script>').map((x) => x.split('</script>')[0]).find((x) => x.includes('function t3StayBookHtml'));
  assert.ok(src, 'the card code ships with stays on');
  const start = src.indexOf('var T3_STAY_DISCLOSURE');
  const fns = src.slice(start, src.indexOf('function t3StayCardHtml'));
  const make = new Function(`function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function hrefAttr(u){ return 'href="' + esc(u) + '"'; }
    ${fns.replace(/^\s*var stayChoice = null;/m, '').replace(/\(function\(\)\{[\s\S]*?\}\)\(\);/, '')}
    return { t3StayTripLine: t3StayTripLine, t3StayBookHtml: t3StayBookHtml, t3StayChecklistHtml: t3StayChecklistHtml, t3StayDisclosureHtml: t3StayDisclosureHtml };`);
  const f = make();
  const t = { arrive: '2026-12-18', leave: '2026-12-21', nights: 3, adults: 2, kids: 2, dog: true, datesGiven: true };
  assert.equal(f.t3StayTripLine(t, false), 'Dec 18–21 · 3 nights · 2 adults, 2 kids · dog');
  assert.equal(f.t3StayTripLine(t, true), '18–21 déc. · 3 nuits · 2 adultes, 2 enfants · chien');
  assert.equal(f.t3StayTripLine({ arrive: '2026-12-30', leave: '2027-01-02', nights: 3, adults: 1 }, false), 'Dec 30–Jan 2 · 3 nights · 1 adult');
  const plain = [{ key: 'booking_com', label: 'Book on Booking.com', labelFr: 'Réserver sur Booking.com', short: 'Booking.com', shortFr: 'Booking.com', url: 'https://www.booking.com/hotel/ca/x.html?checkin=2026-12-18', affiliate: false, rel: 'nofollow noopener' },
    { key: 'own', label: 'Hotel’s own site', labelFr: 'Site de l’hôtel', short: 'Hotel’s own site', shortFr: 'Site de l’hôtel', url: 'https://x.example.com/', affiliate: false, rel: 'nofollow noopener' }];
  const s = { id: 5, bookingLinks: plain, petsSome: true };
  const h = f.t3StayBookHtml(s, t, false);
  assert.match(h, /<a class="t3-btn" href="https:\/\/www\.booking\.com\/hotel\/ca\/x\.html\?checkin=2026-12-18" target="_blank" rel="nofollow noopener" data-track="stay_click" data-stay-id="5" data-link="booking_com">Book on Booking\.com/);
  assert.match(h, /class="t3-stay-more"[^>]*data-link="own">Hotel’s own site/);
  assert.match(h, /Pets in some rooms — check when booking\./);
  assert.match(h, /asks for the kids’ ages/);
  assert.equal(f.t3StayDisclosureHtml(s, false), '', 'no affiliate link, no disclosure');
  assert.doesNotMatch(h, /Dates follow your plan/);
  const aff = [{ ...plain[0], affiliate: true, rel: 'sponsored nofollow noopener', url: 'https://www.stay22.com/allez/booking?aid=test123' }, plain[1]];
  const ha = f.t3StayBookHtml({ id: 5, bookingLinks: aff }, { ...t, datesGiven: false, kids: 0 }, true);
  assert.match(ha, /rel="sponsored nofollow noopener"[^>]*data-affiliate="1">Réserver sur Booking\.com/);
  assert.match(f.t3StayDisclosureHtml({ id: 5, bookingLinks: aff }, true), /data-stay-disclosure>Nous pouvons toucher une commission/);
  assert.match(f.t3StayDisclosureHtml({ id: 5, bookingLinks: aff }, false), /We may earn a commission/);
  assert.match(ha, /Les dates suivent votre plan/);
  assert.doesNotMatch(ha, /Animaux/);
  // A non-https URL is never shown.
  assert.equal(f.t3StayBookHtml({ id: 5, bookingLinks: [{ ...plain[0], url: 'javascript:alert(1)' }] }, t, false), '');
  // Checklist: only with a stop that has a booking link.
  assert.equal(f.t3StayChecklistHtml(s, { checklist: [] }, false), '');
  const ck = f.t3StayChecklistHtml(s, { checklist: [{ venueId: 9, name: 'Bistro', url: 'https://book.example.com/9', label: 'Reserve a table', labelFr: 'Réserver une table' }] }, false);
  assert.match(ck, /Your trip checklist/);
  assert.match(ck, /Book your stay<\/span><a href[^>]*data-link="booking_com">Booking\.com/);
  assert.match(ck, /data-track="booking" data-venue-id="9">Reserve a table/);
  // Flag off: none of it on /trip.
  const off = await (await fetch(`${base}/trip`)).text();
  assert.doesNotMatch(off, /t3StayBookHtml|t3-stay-book|T3_STAY_DISCLOSURE/);
});
