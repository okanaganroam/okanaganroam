// Several photos per event (2026-11-20): an event keeps image_url as its main photo plus an ordered list of more
// (events.images_json). The API takes image_urls (local /images/ paths, up to 8), GET /api/events/:id returns
// images, the event page shows a swipeable row for 2+ photos (one photo = the old hero), and the Event schema's
// image lists every photo. Runs on a throwaway database; run `git checkout -q okanagan.db` afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
const TOKEN = 'event-gallery-test-token';
process.env.ENRICHMENT_ADMIN_TOKEN = TOKEN;

const app = require('../server.js');
const db = require('../db.js');

// Real photos that ship with the site (each -800 has a -800-w480 copy beside it).
const PHOTOS = fs.readdirSync(path.join(__dirname, '..', 'public', 'images', 'events'))
  .filter((f) => /-800\.jpg$/.test(f) && fs.existsSync(path.join(__dirname, '..', 'public', 'images', 'events', f.replace(/\.jpg$/, '-w480.jpg'))))
  .slice(0, 3).map((f) => `/images/events/${f}`);
assert.equal(PHOTOS.length, 3, 'three event photos with small copies exist');

const today = app.todayLocal();
const day = (n) => app.addLocalDays(today, n);
const meta = { reason: 'event gallery fixture', batch_id: 'test-event-gallery' };
let nth = 0;
const mkEvent = (o) => {
  nth += 3;
  const res = app.createEvent({ region: 'kelowna', description: 'A fixture event used only by the event photo gallery tests.', source_type: 'official_venue',
    source_name: 'Fixture', source_url: `https://example.com/gallery/${app.slugify(o.name)}`, venue_name_text: `${o.name} Hall`, categories: ['arts-culture'],
    occurrences: [{ start_date: day(nth), start_time: '19:00', end_time: '21:00' }], ...o }, meta);
  assert.equal(res.ok, true, JSON.stringify(res));
  return res.event;
};

let base, srv;
test.before(async () => {
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const api = (p, opts = {}) => fetch(base + p, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
const put = (id, body) => api(`/api/events/${id}`, { method: 'PUT', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ ...meta, ...body }) });
const eventLd = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((m) => { try { return JSON.parse(m[1]); } catch (e) { return null; } }).filter(Boolean)
  .find((o) => /Event$/.test(String(o['@type'])));

test('event gallery: image_urls round-trips through PUT and GET /api/events/:id, main photo first', async () => {
  const ev = mkEvent({ name: 'Gallery Round Trip Show', image_url: PHOTOS[0] });
  let res = await api(`/api/events/${ev.id}`);
  assert.deepEqual((await res.json()).images, [PHOTOS[0]], 'one photo: images is just the main one');

  res = await put(ev.id, { image_urls: [PHOTOS[1], PHOTOS[0], PHOTOS[2]] });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.event.image_url, PHOTOS[1], 'the first becomes image_url');
  assert.deepEqual(body.event.images, [PHOTOS[1], PHOTOS[0], PHOTOS[2]]);
  assert.deepEqual(body.changed.sort(), ['image_url', 'images_json']);
  res = await api(`/api/events/${ev.id}`);
  assert.deepEqual((await res.json()).images, [PHOTOS[1], PHOTOS[0], PHOTOS[2]]);

  // Each change is in the event log, like an image_url change.
  const logged = db.prepare("SELECT field_name, new_value FROM event_enrichment_log WHERE event_id = ? AND field_name IN ('image_url', 'images_json') ORDER BY id").all(ev.id);
  assert.deepEqual(logged.map((r) => r.field_name), ['image_url', 'images_json']);
  assert.equal(logged[1].new_value, JSON.stringify([PHOTOS[0], PHOTOS[2]]));

  // Same list again: nothing changes. image_url alone keeps the extra photos (no duplicates in images).
  assert.deepEqual((await (await put(ev.id, { image_urls: [PHOTOS[1], PHOTOS[0], PHOTOS[2]] })).json()).changed, []);
  const swapped = await (await put(ev.id, { image_url: PHOTOS[0] })).json();
  assert.deepEqual(swapped.event.images, [PHOTOS[0], PHOTOS[2]]);
  // One photo again: the extra list is cleared.
  const single = await (await put(ev.id, { image_urls: [PHOTOS[2]] })).json();
  assert.equal(single.event.image_url, PHOTOS[2]);
  assert.equal(single.event.images_json, null);
  assert.deepEqual(single.event.images, [PHOTOS[2]]);
});

test('event gallery: create accepts image_urls too', () => {
  const ev = mkEvent({ name: 'Gallery Created Show', image_urls: [PHOTOS[0], PHOTOS[1]] });
  assert.equal(ev.image_url, PHOTOS[0]);
  assert.deepEqual(ev.images, [PHOTOS[0], PHOTOS[1]]);
  assert.equal(app.whatsOnPublicEventDetail(ev).images.length, 2);
});

test('event gallery: image_urls must be local /images/ paths, unique, at most 8', async () => {
  const ev = mkEvent({ name: 'Gallery Validation Show', image_url: PHOTOS[0] });
  for (const [bad, reason] of [
    [['https://example.com/photo.jpg'], 'image_urls_invalid'],
    [['//example.com/images/a.jpg'], 'image_urls_invalid'],
    [['/images/../server.js'], 'image_urls_invalid'],
    [['/uploads/a.jpg'], 'image_urls_invalid'],
    [[PHOTOS[0], 42], 'image_urls_invalid'],
    ['/images/events/a.jpg', 'image_urls_invalid'],
    [[PHOTOS[0], PHOTOS[0]], 'image_urls_duplicate'],
    [Array.from({ length: 9 }, (_, i) => `/images/events/p${i}-800.jpg`), 'image_urls_too_many'],
  ]) {
    const res = await put(ev.id, { image_urls: bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.equal((await res.json()).error, reason, JSON.stringify(bad));
  }
  const conflict = await put(ev.id, { image_urls: [PHOTOS[1]], image_url: PHOTOS[2] });
  assert.equal((await conflict.json()).error, 'image_urls_conflict');
  assert.equal(app.getEventById(ev.id).image_url, PHOTOS[0], 'nothing was written');
  const unauth = await api(`/api/events/${ev.id}`, { method: 'PUT', body: JSON.stringify({ ...meta, image_urls: [PHOTOS[1]] }) });
  assert.equal(unauth.status, 401);
});

test('event gallery: one photo keeps the old hero; N photos render N slides, later ones lazy, with small copies', () => {
  const one = mkEvent({ name: 'Gallery One Photo Show', image_url: PHOTOS[0] });
  const onePage = app.renderEventPage(app.getEventById(one.id), null);
  assert.doesNotMatch(onePage, /<div class="event-gallery-slide"|data-event-gallery>|event-gallery-count" aria-hidden/);
  assert.match(onePage, new RegExp(`<div class="event-hero"><img src="[^"]*${path.basename(PHOTOS[0], '-800.jpg')}[^"]*"[^>]*fetchpriority="high"></div>`));

  const three = mkEvent({ name: 'Gallery Three Photo Show', image_urls: PHOTOS });
  const html = app.renderEventPage(app.getEventById(three.id), null);
  const slides = html.match(/<div class="event-gallery-slide"[^>]*>/g) || [];
  assert.equal(slides.length, 3);
  assert.match(slides[0], /aria-label="Photo 1 of 3"/);
  assert.match(html, /<div class="event-gallery-track" role="region" aria-label="Event photos" tabindex="0">/);
  assert.match(html, /<span class="event-gallery-count" aria-hidden="true">1 \/ 3<\/span>/);
  const imgs = [...html.matchAll(/<div class="event-gallery-slide"[^>]*><img ([^>]*)>/g)].map((m) => m[1]);
  assert.match(imgs[0], /fetchpriority="high"/);
  assert.doesNotMatch(imgs[0], /loading="lazy"/);
  for (const [i, attrs] of imgs.slice(1).entries()) {
    assert.match(attrs, /loading="lazy"/);
    assert.ok(attrs.includes(`${PHOTOS[i + 1].replace(/\.jpg$/, '-w480.jpg')} 480w`), attrs);
    assert.ok(attrs.includes(`${PHOTOS[i + 1]} 800w`), attrs);
  }
  assert.match(html, /scroll-snap-type: x mandatory/);
  // Cards keep just the main photo.
  const card = app.getWhatsOnEvents(app.resolveWhatsOnWindow({})).find((e) => e.id === three.id);
  assert.equal(card.image, PHOTOS[0]);
});

test('event gallery: the Event schema lists every photo as an absolute URL', () => {
  const ev = mkEvent({ name: 'Gallery Schema Show', image_urls: [PHOTOS[1], PHOTOS[2]] });
  const ld = eventLd(app.renderEventPage(app.getEventById(ev.id), null));
  assert.equal(ld.image.length, 2);
  assert.ok(ld.image[1].endsWith(PHOTOS[2]), ld.image[1]);
  for (const u of ld.image) assert.match(u, /^https:\/\//);
  const one = mkEvent({ name: 'Gallery Schema Single', image_url: PHOTOS[1] });
  assert.equal(eventLd(app.renderEventPage(app.getEventById(one.id), null)).image.length, 1);
});

test('event gallery: the French page has French labels', async () => {
  const ev = mkEvent({ name: 'Gallery French Show', image_urls: [PHOTOS[0], PHOTOS[1]] });
  const res = await fetch(`${base}/fr/kelowna/events/${ev.slug}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /aria-label="Photos de l’événement"/);
  assert.match(html, /aria-label="Photo 2 sur 2"/);
  assert.doesNotMatch(html, /aria-label="Event photos"/);
});
