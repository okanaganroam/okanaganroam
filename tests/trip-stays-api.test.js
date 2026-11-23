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
    assert.deepEqual(w.trip, { arrive: '2027-07-09', leave: '2027-07-12', nights: 3, adults: 2, kids: 2, rooms: 1, roomsAssumed: true, dog: false, datesGiven: true });
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
    // Book your trip (2026-11-20): the estimate (family inn: level 2, 3 nights, sleeps 6 => one unit) and the steps.
    assert.equal(w.estimate.currency, 'CAD');
    assert.deepEqual(w.estimate.parts[0], { key: 'stay', label: 'Stay', labelFr: 'Hébergement', low: 450, high: 750, count: 3, nights: 3, rooms: 1, roomsUnknown: false });
    assert.equal(w.estimate.people, 4);
    assert.equal(w.bookingSteps[0].kind, 'stay');
    assert.equal(w.bookingSteps[0].url, w.pick.bookingLinks[0].url);
    assert.deepEqual(w.bookingSteps.slice(1).map((x) => x.id), w.checklist.map((c) => c.venueId));
    for (const a of w.alternatives) assert.ok(a.estimate && Array.isArray(a.bookingSteps));
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
    const wc = JSON.parse((await post({ text: TEXT, stay: STAY }, '?stays=1')).text).whereToStay;
    const c = wc.checklist;
    assert.deepEqual(wc.bookingSteps.map((x) => x.kind + x.id), [`stay${fam}`, ...c.map((x) => `venue${x.venueId}`)], 'the stay first, then the booked stops in plan order');
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

test('Book your trip box: trip line, estimate, Book my trip steps, See all, notes and the disclosure (EN and FR)', async () => {
  const page = await (await fetch(`${base}/trip?stays=1`)).text();
  const src = page.split('<script>').map((x) => x.split('</script>')[0]).find((x) => x.includes('function t3BookGoHtml'));
  assert.ok(src, 'the box code ships with stays on');
  const start = src.indexOf('var T3_STAY_DISCLOSURE');
  const fns = src.slice(start, src.indexOf('function t3StayCardHtml'));
  const make = new Function(`function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function hrefAttr(u){ return 'href="' + esc(u) + '"'; }
    var FR = false; function lang(){ return FR ? 'fr' : 'en'; }
    function cad(c){ return new Intl.NumberFormat(FR ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: c % 100 ? 2 : 0 }).format(c / 100); }
    ${fns.replace(/^\s*var stayChoice = null;/m, '').replace(/\(function\(\)\{[\s\S]*?\}\)\(\);/, '')}
    return { setFr: function(v){ FR = v; }, setState: function(s){ bookState = s; }, t3StayTripLine: t3StayTripLine, t3EstimateHtml: t3EstimateHtml, t3BookGoHtml: t3BookGoHtml, t3BookAllHtml: t3BookAllHtml, t3StayNotesHtml: t3StayNotesHtml, t3StayDisclosureHtml: t3StayDisclosureHtml, t3LiveHtml: t3LiveHtml };`);
  const f = make();
  const t = { arrive: '2026-12-18', leave: '2026-12-21', nights: 3, adults: 2, kids: 2, dog: true, datesGiven: true };
  assert.equal(f.t3StayTripLine(t, false), 'Dec 18–21 · 3 nights · 2 adults, 2 kids · dog');
  assert.equal(f.t3StayTripLine(t, true), '18–21 déc. · 3 nuits · 2 adultes, 2 enfants · chien');
  assert.equal(f.t3StayTripLine({ arrive: '2026-12-30', leave: '2027-01-02', nights: 3, adults: 1 }, false), 'Dec 30–Jan 2 · 3 nights · 1 adult');

  // The estimate: the total, closed until tapped; the parts; "price not listed"; the estimate wording.
  const est = { low: 780, high: 1050, currency: 'CAD', people: 2, peopleAssumed: true, kids: 0, showTotal: true, openLow: false, openHigh: false,
    parts: [{ key: 'stay', label: 'Stay', labelFr: 'Hébergement', low: 300, high: 500 }, { key: 'tastings', label: 'Tastings', labelFr: 'Dégustations', low: 60, high: 60 }, { key: 'meals', label: 'Meals', labelFr: 'Repas', low: 220, high: 350 }],
    unknown: ['Knox Mountain'], notes: [{ key: 'band', text: 'Room prices are for a summer weekend night; other dates are often lower.', textFr: 'Les prix…' }] };
  const e = f.t3EstimateHtml(est, false);
  assert.match(e, /<strong>About \$780–\$1,050 for 2 people<\/strong> <span class="t3-book-tag">estimate<\/span>/);
  assert.match(e, /id="t3BookEst" hidden><p class="t3-book-parts">Stay \$300–\$500 · Tastings \$60 · Meals \$220–\$350<\/p>/);
  assert.match(e, /Price not listed, not counted: Knox Mountain/);
  assert.match(e, /taxes, tips and fees extra; prices change/);
  assert.match(e, /Counted for 2 people/);
  f.setFr(true);
  const ef = f.t3EstimateHtml(est, true);
  assert.match(ef, /Environ 780\s\$–1\s050\s\$ pour 2 personnes/);
  assert.match(ef, /estimation<\/span>/);
  assert.match(ef, /Prix non indiqué, non compté : Knox Mountain/);
  assert.match(ef, /Hébergement 300\s\$–500\s\$ · Dégustations 60\s\$ · Repas 220\s\$–350\s\$/);
  f.setFr(false);
  // Open-ended bands: "From" / "Up to"; too little known: the known parts only, shown without tapping.
  assert.match(f.t3EstimateHtml({ ...est, openHigh: true, low: 1200, high: null, parts: [{ key: 'stay', label: 'Stay', labelFr: 'Hébergement', low: 1200, high: null }] }, false), /From \$1,200 for 2 people/);
  assert.match(f.t3EstimateHtml({ ...est, openLow: true, low: null, parts: [{ key: 'stay', label: 'Stay', labelFr: 'Hébergement', low: null, high: 300 }] }, false), /Up to \$1,050 for 2 people.*Stay under \$300/s);
  const partial = f.t3EstimateHtml({ ...est, showTotal: false }, false);
  assert.match(partial, /Known costs so far<\/strong> <span class="t3-book-tag">partial estimate/);
  assert.match(partial, /<\/button><p class="t3-book-parts">Stay \$300/);
  assert.equal((partial.match(/t3-book-parts/g) || []).length, 1, 'the parts once, not again in the breakdown');
  assert.equal(f.t3EstimateHtml({ ...est, parts: [] }, false), '');
  // No price band for the stay (2026-11-20): "Stay: see live prices" inside the estimate opens the live-prices sheet,
  // else the stay's main booking link; nothing when the stay is priced or has no link.
  const noStay = { ...est, showTotal: false, parts: est.parts.slice(1) };
  const liveStay = { id: 5, name: 'Family Inn', bookingLinks: [{ key: 'booking_com', url: 'https://www.booking.com/hotel/ca/x.html', affiliate: false, rel: 'nofollow noopener' }], livePrices: { url: 'https://www.stay22.com/embed/gm?aid=x', urlFr: 'https://www.stay22.com/embed/gm?aid=x&ljs=fr' } };
  const ls = f.t3EstimateHtml(noStay, false, liveStay);
  assert.match(ls, /Known costs so far<\/strong>/);
  assert.match(ls, /<p class="t3-book-parts">Tastings \$60 · Meals \$220–\$350<\/p><p class="t3-book-parts t3-book-est-stay">Stay: <a href="https:\/\/www\.stay22\.com\/embed\/gm\?aid=x" target="_blank" rel="sponsored nofollow noopener" data-track="stay_click" data-stay-id="5" data-link="live_prices" data-affiliate="1" data-t3-live data-t3-live-name="Family Inn">see live prices <span aria-hidden="true">↗<\/span><\/a><\/p><div class="t3-book-more"/);
  f.setFr(true);
  assert.match(f.t3EstimateHtml(noStay, true, liveStay), /t3-book-est-stay">Hébergement : <a href="https:\/\/www\.stay22\.com\/embed\/gm\?aid=x&amp;ljs=fr"[^>]*data-t3-live[^>]*>voir les prix en direct <span aria-hidden="true">↗<\/span><\/a>/);
  f.setFr(false);
  const own = { id: 5, name: 'Family Inn', bookingLinks: [{ key: 'own', url: 'http://bad.example.com/' }, { key: 'own', url: 'https://www.example.com/book', affiliate: false, rel: 'nofollow noopener' }] };
  const os = f.t3EstimateHtml(noStay, false, own);
  assert.match(os, /t3-book-est-stay">Stay: <a href="https:\/\/www\.example\.com\/book" target="_blank" rel="nofollow noopener" data-track="stay_click" data-stay-id="5" data-link="own">see live prices <span aria-hidden="true">↗<\/span><\/a><\/p>/);
  assert.doesNotMatch(os, /data-t3-live|data-t3-step/, 'the booking link does not open the sheet or count as a Book my trip step');
  f.setFr(true);
  assert.match(f.t3EstimateHtml(noStay, true, own), />Hébergement : <a href="https:\/\/www\.example\.com\/book"[^>]*>voir les prix en direct/);
  f.setFr(false);
  assert.doesNotMatch(f.t3EstimateHtml(noStay, false, { id: 5, name: 'X', bookingLinks: [] }), /t3-book-est-stay/, 'no link: no line');
  assert.doesNotMatch(f.t3EstimateHtml({ ...est, showTotal: false }, false, liveStay), /t3-book-est-stay/, 'a priced stay: no line');
  assert.doesNotMatch(f.t3EstimateHtml(est, false, liveStay), /t3-book-est-stay/, 'a full estimate: no line');
  assert.equal(f.t3EstimateHtml({ ...noStay, parts: [] }, false, liveStay), '');

  // Book my trip: one link (a real link, one tab per tap), then Next with Open / Skip / Mark done, then All set.
  const steps = [
    { kind: 'stay', id: 5, name: 'Family Inn', label: 'Book on Booking.com', labelFr: 'Réserver sur Booking.com', url: 'https://www.stay22.com/allez/booking?aid=test123', affiliate: true, rel: 'sponsored nofollow noopener', link: 'booking_com' },
    { kind: 'venue', id: 9, name: 'Wildling', label: 'Reserve a table', labelFr: 'Réserver une table', url: 'https://book.example.com/9', affiliate: false, rel: 'nofollow noopener', link: 'booking' },
  ];
  f.setState({ st: {}, last: null, started: false });
  const g0 = f.t3BookGoHtml(steps, false);
  assert.match(g0, /<a class="t3-btn t3-book-main" href="https:\/\/www\.stay22\.com\/allez\/booking\?aid=test123" target="_blank" rel="sponsored nofollow noopener" data-track="stay_click" data-stay-id="5" data-link="booking_com" data-t3-step="0" data-affiliate="1">Book my trip/);
  assert.equal((g0.match(/<a /g) || []).length, 1, 'one link only: never several tabs at once');
  assert.match(g0, /2 bookings, one at a time, starting with your stay\./);
  assert.match(f.t3BookGoHtml(steps, true), /2 réservations, une à la fois, en commençant par l’hébergement\./);
  assert.match(f.t3BookGoHtml(steps.slice(1), false), /One booking, starting with Wildling\./);
  assert.match(f.t3BookGoHtml(steps, true), />Réserver mon voyage/);
  f.setState({ st: { 0: 'done' }, last: 0, started: true });
  const g1 = f.t3BookGoHtml(steps, false);
  assert.match(g1, /1 of 2 booked/);
  assert.match(g1, /✓<\/span> Stay — done\? <button type="button" class="t3-book-link" data-t3-bk-undo="0">Not yet/);
  assert.match(g1, /Next: <strong>Reserve a table · Wildling<\/strong>/);
  assert.match(g1, /data-track="booking" data-venue-id="9" data-t3-step="1">Open Wildling/);
  assert.match(g1, /data-t3-bk-skip="1">Skip<\/button><button type="button" class="t3-btn t3-btn-ghost" data-t3-bk-mark="1">Mark done/);
  assert.equal((g1.match(/<a /g) || []).length, 1);
  f.setFr(true);
  const g1f = f.t3BookGoHtml(steps, true);
  assert.match(g1f, /1 sur 2 réservé/);
  assert.match(g1f, /Hébergement — c’est fait\? .*Pas encore/);
  assert.match(g1f, /Ensuite : <strong>Réserver une table · Wildling/);
  assert.match(g1f, />Ouvrir Wildling.*>Passer<.*>Marquer fait</s);
  f.setFr(false);
  f.setState({ st: { 0: 'done', 1: 'skipped' }, last: null, started: true });
  const g2 = f.t3BookGoHtml(steps, false);
  assert.match(g2, /All set<\/strong>/);
  assert.match(g2, /1 skipped: see the list/);
  assert.match(g2, /data-t3-bk-restart>Start over/);
  // See all: every booking with its done tick; the stay row keeps the stay's other links.
  const all = f.t3BookAllHtml({ id: 5, bookingLinks: [{ key: 'booking_com', short: 'Booking.com', shortFr: 'Booking.com', url: steps[0].url, affiliate: true }, { key: 'own', short: 'Hotel’s own site', shortFr: 'Site de l’hôtel', url: 'https://x.example.com/', affiliate: false, rel: 'nofollow noopener' }] }, steps, false);
  assert.match(all, /<summary>See all 2 bookings<\/summary>/);
  assert.match(all, /data-t3-bk-toggle="0" aria-pressed="true"/);
  assert.match(all, /data-t3-bk-toggle="1" aria-pressed="false"[^>]*>–</);
  assert.match(all, /Stay · Family Inn/);
  assert.match(all, /class="t3-book-alt"[^>]*data-link="own">Hotel’s own site/);
  assert.match(f.t3BookAllHtml({ id: 5, bookingLinks: [] }, steps, true), /Voir les 2 réservations/);
  assert.match(f.t3BookAllHtml({ id: 5, bookingLinks: [] }, steps.slice(0, 1), false), /<summary>See the booking<\/summary>/);
  assert.match(f.t3BookAllHtml({ id: 5, bookingLinks: [] }, steps.slice(0, 1), true), /<summary>Voir la réservation<\/summary>/);
  // Notes and the commission line (only with an affiliate link).
  const notes = f.t3StayNotesHtml({ bookingLinks: [steps[0]].map((x) => ({ ...x, key: 'booking_com' })), petsSome: true }, { ...t, datesGiven: false }, false);
  assert.match(notes, /No dates yet.*kids’ ages.*Pets in some rooms/);
  assert.match(f.t3StayNotesHtml({ bookingLinks: [{ key: 'booking_com', url: 'https://www.booking.com/hotel/ca/x.html' }] }, { ...t, datesGiven: false, kids: 0 }, true), /Pas encore de dates/);
  assert.equal(f.t3StayDisclosureHtml({ bookingLinks: [] }, [steps[1]], false), '');
  assert.match(f.t3StayDisclosureHtml({ bookingLinks: [] }, steps, false), /data-stay-disclosure>We may earn a commission/);
  assert.match(f.t3StayDisclosureHtml({ bookingLinks: [] }, steps, true), /Nous pouvons toucher une commission/);
  // See live prices: a link (new tab without dialogs) that opens the sheet; counted as a stay click; the commission line.
  const live = { id: 5, name: 'Family Inn', bookingLinks: [], livePrices: { url: 'https://www.stay22.com/embed/gm?aid=x&address=Kelowna%2C+BC', urlFr: 'https://www.stay22.com/embed/gm?aid=x&address=Kelowna%2C+BC&ljs=fr' } };
  assert.match(f.t3LiveHtml(live, false), /^<a class="t3-book-live" href="https:\/\/www\.stay22\.com\/embed\/gm\?aid=x&amp;address=Kelowna%2C\+BC" target="_blank" rel="sponsored nofollow noopener" data-track="stay_click" data-stay-id="5" data-link="live_prices" data-affiliate="1" data-t3-live data-t3-live-name="Family Inn">See live prices<\/a>$/);
  assert.match(f.t3LiveHtml(live, true), /ljs=fr"[^>]*>Voir les prix en direct</);
  assert.equal(f.t3LiveHtml({ id: 5 }, false), '');
  assert.equal(f.t3LiveHtml({ id: 5, livePrices: { url: 'http://www.stay22.com/x' } }, false), '');
  assert.match(f.t3StayDisclosureHtml(live, [steps[1]], false), /We may earn a commission/);
  assert.doesNotMatch(src, /<iframe[^>]*src=/, 'no map loads with the page');
  // A non-https URL is never shown.
  f.setState({ st: {}, last: null, started: false });
  assert.doesNotMatch(f.t3BookGoHtml([{ ...steps[0], url: 'javascript:alert(1)' }], false), /javascript/);
  // Stay22's map may be framed only on /trip with stays on and Stay22 set up; every other page keeps frame-src 'self'.
  const saved = { p: process.env.STAY_AFFILIATE_PROVIDER, i: process.env.STAY_AFFILIATE_ID };
  try {
    process.env.STAY_AFFILIATE_PROVIDER = 'stay22'; process.env.STAY_AFFILIATE_ID = 'test123';
    const csp = (r) => r.headers.get('content-security-policy');
    assert.match(csp(await fetch(`${base}/trip?stays=1`)), /frame-src 'self' https:\/\/www\.stay22\.com;/);
    assert.match(csp(await fetch(`${base}/trip`)), /frame-src 'self';/);
    assert.match(csp(await fetch(`${base}/`)), /frame-src 'self';/);
    delete process.env.STAY_AFFILIATE_PROVIDER;
    assert.match(csp(await fetch(`${base}/trip?stays=1`)), /frame-src 'self';/);
  } finally {
    if (saved.p === undefined) delete process.env.STAY_AFFILIATE_PROVIDER; else process.env.STAY_AFFILIATE_PROVIDER = saved.p;
    if (saved.i === undefined) delete process.env.STAY_AFFILIATE_ID; else process.env.STAY_AFFILIATE_ID = saved.i;
  }
  // Flag off: none of it on /trip.
  const off = await (await fetch(`${base}/trip`)).text();
  assert.doesNotMatch(off, /t3BookGoHtml|t3-book|T3_STAY_DISCLOSURE|book_trip_start|Book my trip/);
});

// Review fixes (2026-11-20, Dayton): one total only, and no campground for a wine-and-food trip.
test('one total: with the box, the plan leaves out the old per-person estimate line; flag off keeps it', async () => {
  const on = await (await fetch(`${base}/trip?stays=1`)).text();
  assert.match(on, /if \(hasStops && !t3StayData\(\)\) html \+= '<p class="t3-estimate" data-t3-estimate/);
  const off = await (await fetch(`${base}/trip`)).text();
  assert.match(off, /if \(hasStops\) html \+= '<p class="t3-estimate" data-t3-estimate/);
  assert.doesNotMatch(off, /t3StayData/);
});

test('stay type fit: the Kelowna wine-and-food example never gets the campground; a camping request does', async () => {
  const camp = app.createVenue({ region: 'kelowna', type: 'stay', cuisine: 'campground', slug: 'trip-stays-test-orchard-rv', name: 'Trip Stays Test Orchard RV Park', address: '1 Orchard Road, Kelowna, BC', latitude: 49.887, longitude: -119.496, image_url: '/images/trip-v3/hero.webp', description: 'A fixture used only by the trip stays tests.' });
  made.push(camp.id);
  db.prepare('INSERT INTO stay_info (venue_id, info_json, updated_at, batch_id) VALUES (?, ?, ?, ?)').run(camp.id, JSON.stringify({ unit_types: ['rv_site', 'tent_site'], confidence: 'high', price_level: 1 }), '2026-11-20T00:00:00Z', 'test');
  const shown = (w) => [w.pick, ...w.alternatives].map((s) => s.id);
  const wine = JSON.parse((await post({ text: '3 days in Kelowna: wineries, easy walks and great food' }, '?stays=1')).text).whereToStay;
  assert.ok(wine && wine.pick, 'a base is picked');
  assert.ok(!shown(wine).includes(camp.id), 'no campground for wineries, walks and food');
  const camping = JSON.parse((await post({ text: '3 days camping in Kelowna' }, '?stays=1')).text).whereToStay;
  assert.equal(camping.pick.id, camp.id, 'a camping request gets the campground first');
  const fr = JSON.parse((await post({ text: '3 jours en VR à Kelowna' }, '?stays=1')).text).whereToStay;
  assert.equal(fr && fr.pick.id, camp.id, 'French: « en VR »');
});
