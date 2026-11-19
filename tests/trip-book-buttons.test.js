// Build My Trip: Book buttons and the "Book your trip" checklist (2026-11-18).
// 1. venueBookingLink(): the owner's booking link first (unless it is just the website), then the Plan your visit
//    box's booking page with its label, else nothing. The venue page's Book button and the plan's use it, so they agree.
// 2. /api/trip/plan adds `booking` only to stops that have a link, `bookPhone` ("Call to book") only to bookable kinds
//    of place with a phone and no link, and nothing for beaches, parks or free places.
// 3. POST /api/trip/signal logs book_click (venue + kind of plan), skipping bots and our own visits; the admin report
//    counts book_clicks.
// 4. The page: Book button + Call to book link on stop cards, the Book your trip panel, French labels.
// Runs on a throwaway database (like server.test.js); put okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'trip-book-buttons-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.TRIP_DEMAND_LOG;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const v3 = require('../trip-planner-v3-page.js');
app.setVenueSubmissionTransport(async () => {});

const WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['10:00', '22:00']]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Book Test ${type} ${++n}`, slug: `book-test-${type}-${n}`, region: 'vernon', type, latitude: 50.26 + n / 1000, longitude: -119.27,
  rating: 4.5, reviews: 80, address: `${n} Main St, Vernon`, phone: '250-555-0170', website: 'https://example.com', hours: WEEK,
  description: 'A fixture used only by the Book button tests.', ...o });
const setLink = (id, url, affiliate = 0) => db.prepare(`INSERT INTO venue_links (venue_id, booking_url, booking_affiliate) VALUES (?, ?, ?)
  ON CONFLICT(venue_id) DO UPDATE SET booking_url = excluded.booking_url, booking_affiliate = excluded.booking_affiliate`).run(id, url, affiliate);
const setBox = (id, info) => db.prepare('INSERT OR REPLACE INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(id, JSON.stringify(info));
const box = (extra) => ({ rows: [{ label: 'Tastings', text: 'Tastings daily, 11 AM to 5 PM' }], source_url: 'https://example.com/visit', checked_at: '2026-11-01', ...extra });
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
// The Book button as the page finally shows it (the Food & Drink layout restyles the button but keeps link, rel and words).
const pageBook = (html) => { const m = /<a [^>]*href="([^"]+)" rel="([^"]+)" target="_blank" data-track="booking">([^<]*)/.exec(html); return m ? { url: m[1].replace(/&amp;/g, '&'), rel: m[2], label: m[3].trim() } : null; };

let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1';
const signal = (body, headers = {}) => fetch(base + '/api/trip/signal', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'User-Agent': UA, 'X-Real-IP': `10.91.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}`, ...headers }, body: JSON.stringify(body) });
const bookRows = (id) => db.prepare("SELECT plan_type FROM trip_demand_events WHERE kind = 'book_click' AND venue_id = ?").all(id);

test('helper: owner booking link wins over the Plan your visit box, and reads "Book"', () => {
  const w = mk('winery');
  setBox(w.id, box({ booking_url: 'https://tock.example/box', booking_label: 'Book a tasting' }));
  setLink(w.id, 'https://owner.example/book');
  const b = app.venueBookingLink(app.getVenue(w.id));
  assert.equal(b.url, 'https://owner.example/book');
  assert.equal(b.source, 'owner');
  assert.equal(b.label, 'Book');
  assert.equal(b.label_fr, 'Réserver');
  assert.equal(b.affiliate, false);
  assert.equal(b.rel, 'nofollow noopener');
});

test('helper: the box\'s booking page and label when the owner has none; type label when the box has none', () => {
  const w = mk('winery');
  setBox(w.id, box({ booking_url: 'https://tock.example/w2' }));
  const b = app.venueBookingLink(app.getVenue(w.id));
  assert.deepEqual([b.url, b.label, b.source], ['https://tock.example/w2', 'Book a tasting', 'visit_info']);
  assert.notEqual(b.label_fr, 'Book a tasting'); // French label through the site's French text
  assert.ok(b.label_fr.length > 0);
  const r = mk('restaurant');
  setBox(r.id, box({ booking_url: 'https://opentable.example/r', booking_label: 'Reserve a table' }));
  assert.equal(app.venueBookingLink(app.getVenue(r.id)).label, 'Reserve a table');
});

test('helper: nothing when there is no link, or the owner link is just the website', () => {
  const a = mk('restaurant');
  assert.equal(app.venueBookingLink(app.getVenue(a.id)), null);
  const b = mk('restaurant', { website: 'https://same.example/' });
  setLink(b.id, 'https://www.same.example');
  assert.equal(app.venueBookingLink(app.getVenue(b.id)), null);
});

test('helper: an affiliate-marked link adds rel="sponsored"', () => {
  const t = mk('tour');
  setLink(t.id, 'https://partner.example/t', 1);
  const b = app.venueBookingLink(app.getVenue(t.id));
  assert.equal(b.affiliate, true);
  assert.equal(b.rel, 'nofollow noopener sponsored');
});

test('venue page Book button and the plan use the same link and words (English and French)', () => {
  const w = mk('winery');
  setBox(w.id, box({ booking_url: 'https://tock.example/same', booking_label: 'Book a tasting' }));
  const o = mk('restaurant');
  setLink(o.id, 'https://owner.example/same');
  for (const v of [w, o]) {
    const helper = app.venueBookingLink(app.getVenue(v.id));
    const en = pageBook(page(v, 'en'));
    assert.ok(en, 'venue page shows a Book button');
    assert.equal(en.url, helper.url);
    assert.equal(en.label, helper.label);
    assert.equal(en.rel, 'nofollow noopener');
    const plan = app.withTripBooking({ kind: 'outing', outing: { stops: [{ venue: { id: v.id, name: app.getVenue(v.id).name, type: app.getVenue(v.id).type, url: '/x' } }] } });
    const stop = plan.outing.stops[0].venue;
    assert.equal(stop.booking.url, en.url);
    assert.equal(stop.booking.label, en.label);
    assert.equal(stop.booking.labelFr, helper.label_fr);
  }
  const frBtn = pageBook(page(o, 'fr'));
  if (frBtn) assert.equal(frBtn.label, 'Réserver');
});

test('plan: booking only when present, Call to book only for bookable kinds with a phone, nothing for parks or free places', () => {
  const booked = mk('restaurant');
  setLink(booked.id, 'https://owner.example/r1');
  const phoneOnly = mk('restaurant');
  const park = mk('outdoor');
  const freeMuseum = mk('indoor', { free_entry: 1 });
  const cafe = mk('cafe');
  const noPhone = mk('pub', { phone: null });
  const stop = (v) => { const r = app.getVenue(v.id); return { venue: { id: r.id, name: r.name, type: r.type, url: '/v' } }; };
  const plan = app.withTripBooking({ kind: 'day_plan', days: [{ day: 1, stops: [booked, phoneOnly, park, freeMuseum, cafe, noPhone].map(stop) }] });
  const [a, b, c, d, e, f] = plan.days[0].stops.map((s) => s.venue);
  assert.equal(a.booking.url, 'https://owner.example/r1');
  assert.equal(a.bookPhone, undefined);
  assert.equal(b.booking, undefined);
  assert.equal(b.bookPhone, '250-555-0170');
  for (const x of [c, d, e, f]) { assert.equal(x.booking, undefined); assert.equal(x.bookPhone, undefined); }
  assert.ok(!JSON.stringify(plan.days[0].stops.slice(1)).includes('https://'), 'no URL leaks for venues without a booking link');
  // A name that does not match the venue row (not a venue object) is left alone.
  const other = app.withTripBooking({ x: { id: booked.id, name: 'Something else', type: 'restaurant', url: '/e' } });
  assert.equal(other.x.booking, undefined);
});

test('plan API: every stop\'s booking matches the helper, and stops without a link carry none', async () => {
  const r = await fetch(base + '/api/trip/plan', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'User-Agent': UA }, body: JSON.stringify({ text: 'Dinner in Vernon tonight' }) });
  assert.equal(r.status, 200);
  const plan = await r.json();
  const venues = [];
  const walk = (o) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk); if (o.venue && Number.isInteger(o.venue.id)) venues.push(o.venue); Object.values(o).forEach(walk); };
  walk(plan);
  assert.ok(venues.length > 0, 'the plan has venue stops');
  for (const v of venues) {
    const h = app.venueBookingLink(app.getVenue(v.id));
    if (h) assert.deepEqual(v.booking, { url: h.url, label: h.label, labelFr: h.label_fr, affiliate: h.affiliate });
    else assert.equal(v.booking, undefined);
  }
});

test('book_click is logged with the plan type; bots and our own visits are skipped', async () => {
  const v = mk('winery');
  assert.equal((await signal({ kind: 'book_click', ref: `venue:${v.id}`, plan_type: 'day_plan' })).status, 204);
  assert.deepEqual(bookRows(v.id).map((r) => r.plan_type), ['day_plan']);
  await signal({ kind: 'book_click', ref: `venue:${v.id}`, plan_type: 'outing' }, { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' });
  await signal({ kind: 'book_click', ref: `venue:${v.id}`, plan_type: 'outing' }, { Cookie: 'roam_internal=1' });
  await signal({ kind: 'book_click', ref: `venue:${v.id}`, plan_type: 'outing' }, { 'User-Agent': 'okanaganroam-check/1.0' });
  assert.equal(bookRows(v.id).length, 1);
  // An unknown plan type is stored as 'other'; nothing about the visitor is stored.
  await signal({ kind: 'book_click', ref: `venue:${v.id}`, plan_type: '<script>' });
  assert.deepEqual(bookRows(v.id).map((r) => r.plan_type).sort(), ['day_plan', 'other']);
  const cols = db.prepare('PRAGMA table_info(trip_demand_events)').all().map((c) => c.name);
  assert.ok(!cols.some((c) => /ip|name|email/.test(c)));
  // Another site's page (no same-origin header) is ignored.
  await fetch(base + '/api/trip/signal', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', 'User-Agent': UA }, body: JSON.stringify({ kind: 'book_click', ref: `venue:${v.id}` }) });
  assert.equal(bookRows(v.id).length, 2);
});

test('admin trip-demand report counts book_clicks (JSON and CSV)', async () => {
  const v = mk('restaurant');
  await signal({ kind: 'book_click', ref: `venue:${v.id}`, plan_type: 'outing' });
  const auth = { Authorization: 'Bearer trip-book-buttons-admin-token' };
  const j = await (await fetch(base + '/api/admin/trip-demand?days=30&threshold=1', { headers: auth })).json();
  assert.ok(j.book_clicks >= 3);
  assert.ok(j.book_clicks_by_plan_type.outing >= 1);
  assert.equal(j.rows.find((r) => r.id === v.id).book_clicks, 1);
  const csv = await (await fetch(base + '/api/admin/trip-demand?format=csv', { headers: auth })).text();
  assert.match(csv.split('\n')[0], /,book_clicks,/);
});

test('page: Book button, Call to book and the Book your trip panel (compiled, English and French copy)', () => {
  const html = v3.renderTripPlannerV3Page({ esc: (s) => String(s), regions: [], regionImages: {}, preview: false });
  const js = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  new Function(js);
  for (const s of ['Book your trip', 'Réservez votre voyage', 'No booking needed', 'Pas de réservation nécessaire', 'Call to book', 'Appeler pour réserver',
    'Bookings are made on each place’s own site. We don’t take payment.', 'Les réservations se font sur le site de chaque endroit. Nous ne prenons aucun paiement.',
    "' of ' + total + ' booked'", "kind: 'book_click'", 'rel="nofollow noopener', "' sponsored'", 'target="_blank"', 'TripBooked']) assert.ok(js.includes(s), s);
  // The storage reads and writes are wrapped; the tel link and the booking URL go through hrefAttr (no href="..." text).
  assert.match(js, /function bookedAll\(\)\{ try \{/);
  assert.match(js, /function setBooked\(id, on\)\{\n\s+try \{/);
  assert.ok(!/href="[^"]*" target="_blank" rel="nofollow/.test(js));
  // Phone: the Book button takes a full row in the four-column action grid.
  assert.match(html, /\.t3-plan \.t3-actions > \.t3-book \{ grid-column: 1 \/ -1; \}/);
});

test('page script: Book panel lists bookable stops, folds the rest, and counts ticks', () => {
  const html = v3.renderTripPlannerV3Page({ esc: (s) => String(s), regions: [], regionImages: {}, preview: false });
  const js = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const start = js.indexOf('  function bookUrl(u)');
  const end = js.indexOf('  function cardHtml(stop, key, opts)');
  const store = {};
  const env = new Function('esc', 'hrefAttr', 'lang', 'tx', 'whenLabel', 'state', 'localStorage', js.slice(start, end) + '; return { bookPanelHtml, bookLinkHtml, callToBookHtml, setBooked, bookedIds };');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mkEnv = (lng) => env(esc, (u) => 'href="' + esc(u) + '"', () => lng, (k, v) => 'Day ' + v.n, (s) => s.label, { text: 'Wine day in Oliver', removed: {} },
    { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } });
  const plan = { kind: 'day_plan', days: [{ day: 1, stops: [
    { daypart: 'morning', label: 'Morning', venue: { id: 1, name: 'Trail', type: 'outdoor' } },
    { daypart: 'midday', label: 'Midday', venue: { id: 2, name: 'Winery A', type: 'winery', booking: { url: 'https://tock.example/a', label: 'Book a tasting', labelFr: 'Réserver une dégustation' } } },
    { daypart: 'evening', label: 'Evening', venue: { id: 3, name: 'Bistro', type: 'restaurant', bookPhone: '250-555-0101' } },
  ] }] };
  const en = mkEnv('en');
  let out = en.bookPanelHtml(plan);
  assert.match(out, /Book your trip/);
  assert.match(out, /0 of 2 booked/);
  assert.match(out, /href="https:\/\/tock\.example\/a" target="_blank" rel="nofollow noopener"/);
  assert.match(out, /href="tel:2505550101"/);
  assert.match(out, /<details class="t3-bookp-none"><summary>No booking needed \(1\)<\/summary><ul><li><span class="t3-bookp-when">Morning<\/span> Trail/);
  en.setBooked(2, true);
  assert.deepEqual(en.bookedIds(), [2]);
  out = en.bookPanelHtml(plan);
  assert.match(out, /1 of 2 booked/);
  assert.match(out, /data-t3-booked="2" checked/);
  const fr = mkEnv('fr');
  const frOut = fr.bookPanelHtml(plan);
  assert.match(frOut, /Réserver une dégustation/);
  assert.match(frOut, /1 sur 2 réservé/);
  // Nothing bookable: no panel at all (no nagging).
  assert.equal(en.bookPanelHtml({ kind: 'outing', outing: { stops: [{ venue: { id: 9, name: 'Beach', type: 'beach' } }] } }), '');
  // Unsafe URLs never become links.
  assert.equal(en.bookLinkHtml({ id: 5, name: 'X', booking: { url: 'javascript:alert(1)', label: 'Book' } }, 'card'), '');
  // Storage that throws (private window) never breaks the panel.
  const broken = env(esc, (u) => u, () => 'en', () => '', (s) => s.label, { text: 'x', removed: {} }, { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } });
  broken.setBooked(2, true);
  assert.match(broken.bookPanelHtml(plan), /0 of 2 booked/);
});
