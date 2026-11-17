// Event prices (2026-10-29): every event can say Free, By donation or what it costs (events.price_kind / price_text).
// Submissions and owner changes fill it from the "Price" box, cards and event pages show it, What's On has a Free chip
// (by donation counts), and "free events" uses it. Runs on a throwaway database; run `git checkout -q okanagan.db` after.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

const app = require('../server.js');
const db = require('../db.js');

const today = app.todayLocal();
const day = (n) => app.addLocalDays(today, n);
const meta = { reason: 'event price fixture', batch_id: 'test-event-prices' };
let nth = 0;
const mkEvent = (o) => {
  nth += 3; // a date and a hall of its own, so no two fixtures look like duplicates
  const res = app.createEvent({ region: 'kelowna', description: 'A fixture event used only by the event price tests.', source_type: 'official_venue', source_name: 'Fixture',
    source_url: `https://example.com/prices/${app.slugify(o.name)}`, venue_name_text: `${o.name} Hall`, categories: ['arts-culture'],
    occurrences: [{ start_date: day(nth), start_time: '19:00', end_time: '21:00' }], ...o }, meta);
  assert.equal(res.ok, true, JSON.stringify(res));
  return res.event;
};

test('event prices: reading a price as given', () => {
  const f = (t) => app.eventPriceFromText(t, { priceField: true });
  assert.deepEqual(f('Free'), { price_kind: 'free', price_text: null });
  assert.deepEqual(f('Free, all ages'), { price_kind: 'free', price_text: null });
  assert.deepEqual(f('By donation'), { price_kind: 'donation', price_text: null });
  assert.deepEqual(f('Donations welcome'), { price_kind: 'donation', price_text: null });
  assert.deepEqual(f('Pay what you can'), { price_kind: 'donation', price_text: null });
  assert.deepEqual(f('$25'), { price_kind: 'paid', price_text: '$25' });
  assert.deepEqual(f('25'), { price_kind: 'paid', price_text: '$25' });
  assert.deepEqual(f('$25 in advance, $30 at the door'), { price_kind: 'paid', price_text: '$25–$30' });
  assert.deepEqual(f('Tickets on Eventbrite'), { price_kind: 'paid', price_text: null });
  assert.equal(f(''), null);
  assert.equal(f('See website'), null);
  // A description only counts donation in so many words, and a price needs a sentence about tickets or admission.
  const d = (t) => app.eventPriceFromText(t);
  assert.deepEqual(d('A night of jazz. Admission is by donation.'), { price_kind: 'donation', price_text: null });
  assert.equal(d('Donations go to the food bank.'), null);
  assert.deepEqual(d('Tickets are $68–79.'), { price_kind: 'paid', price_text: '$68–$79' });
  assert.deepEqual(d('Free admission. Bring a chair.'), { price_kind: 'free', price_text: null });
  assert.equal(d('Try the $2 oysters.'), null);
  // Free with a ticket is not free (it costs the ticket); free with an RSVP is.
  assert.equal(d('A family hike. Free with a lift ticket or membership.'), null);
  assert.equal(d('Drop-in art. Free with admission, no registration.'), null);
  assert.deepEqual(d('A gallery launch. Free with RSVP.'), { price_kind: 'free', price_text: null });
});

test('event prices: stored, validated, labelled, and in the offers schema', () => {
  const free = mkEvent({ name: 'Prices Free Concert', price_kind: 'free' });
  assert.equal(free.price_kind, 'free');
  assert.equal(app.eventPriceLabel(free), 'Free');
  assert.equal(app.eventOffersSchema(free).price, '0');
  const don = mkEvent({ name: 'Prices Donation Jam', price_kind: 'donation' });
  assert.equal(app.eventPriceLabel(don), 'By donation');
  assert.equal(app.eventOffersSchema(don), undefined, 'by donation states no price');
  const paid = mkEvent({ name: 'Prices Paid Gala', price_kind: 'paid', price_text: '$15–$40' });
  assert.equal(app.eventPriceLabel(paid), '$15–$40');
  const offer = app.eventOffersSchema(paid);
  assert.equal(offer.lowPrice, '15');
  assert.equal(offer.highPrice, '40');
  assert.equal(app.eventPriceLabel(mkEvent({ name: 'Prices Paid No Amount', price_kind: 'paid' })), 'Ticketed');
  assert.equal(app.eventPriceLabel(mkEvent({ name: 'Prices Not Stated' })), null);
  // Paid with a "free" description is still paid.
  assert.equal(app.eventOffersSchema(mkEvent({ name: 'Prices Paid Free Words', price_kind: 'paid', description: 'Free admission for members.' })), undefined);

  assert.equal(app.createEvent({ name: 'Prices Bad Kind', region: 'kelowna', description: 'x', source_type: 'official_venue', source_name: 'F', source_url: 'https://example.com/bad',
    venue_name_text: 'Hall', categories: ['arts-culture'], occurrences: [{ start_date: day(6) }], price_kind: 'cheap' }, meta).reason, 'price_kind_invalid');
  const upd = app.updateEvent(paid.id, { price_kind: 'free', price_text: null }, meta);
  assert.equal(upd.ok, true);
  assert.deepEqual(upd.changed.sort(), ['price_kind', 'price_text']);
  assert.equal(app.eventPriceLabel(upd.event), 'Free');
  app.updateEvent(paid.id, { price_kind: 'paid', price_text: '$15–$40' }, meta);
});

test('event prices: an approved submission keeps the price it was sent with', () => {
  const ins = db.prepare(`INSERT INTO event_submissions (name, region, categories, description, venue_name, start_date, end_date, event_url, organizer_name,
      contact_name, contact_email, consent, consent_version, price_text) VALUES (?, 'kelowna', '["arts-culture"]', 'A submitted fixture event for the price tests.', 'Fixture Hall', ?, ?,
      'https://example.com/sub', 'Fixture Org', 'Pat', 'pat@example.com', 1, 'v1', ?)`);
  const id = Number(ins.run('Prices Submitted Show', day(40), day(40), '$20 in advance').lastInsertRowid);
  const r = app.approveEventSubmission(id, { reviewer: 'r' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.event.price_kind, 'paid');
  assert.equal(r.body.event.price_text, '$20');
  const id2 = Number(ins.run('Prices Submitted Freebie', day(44), day(44), 'Free').lastInsertRowid);
  assert.equal(app.approveEventSubmission(id2, { reviewer: 'r' }).body.event.price_kind, 'free');
});

test('event prices: What\'s On cards and the event page show the price; the Free chip counts free and by donation', () => {
  const html = app.renderWhatsOnPage(null);
  const card = (name) => {
    const i = html.indexOf(`data-venue-name="${name}"`);
    assert.ok(i > 0, name);
    return html.slice(html.lastIndexOf('<li', i), html.indexOf('</li>', i));
  };
  assert.match(card('Prices Free Concert'), /data-event-free="1"/);
  assert.match(card('Prices Free Concert'), /<span class="whatson-price">Free<\/span>/);
  assert.match(card('Prices Donation Jam'), /data-event-free="1"/);
  assert.match(card('Prices Donation Jam'), /By donation/);
  assert.doesNotMatch(card('Prices Paid Gala'), /data-event-free/);
  assert.match(card('Prices Paid Gala'), /\$15–\$40/);
  assert.doesNotMatch(card('Prices Not Stated'), /whatson-price/);
  const chip = /<button[^>]*data-price="free"[^>]*>Free(?: <span class="outdoor-activity-count">(\d+)<\/span>)?<\/button>/.exec(html);
  assert.ok(chip, 'the Free chip is on the page');
  const freeNow = app.getWhatsOnEvents(app.resolveWhatsOnWindow({})).filter(app.eventFreeToGo).length;
  if (chip[1] !== undefined) assert.equal(Number(chip[1]), freeNow);
  assert.match(html, /free=1/, 'the chip is kept in the address');

  const ev = db.prepare("SELECT * FROM events WHERE name = 'Prices Paid Gala'").get();
  const page = app.renderEventPage(app.getEventById(ev.id), null);
  assert.match(page, /<span class="label">Price<\/span><span>\$15–\$40<\/span>/);
  const none = db.prepare("SELECT * FROM events WHERE name = 'Prices Not Stated'").get();
  assert.doesNotMatch(app.renderEventPage(app.getEventById(none.id), null), /<span class="label">Price<\/span>/);
});
