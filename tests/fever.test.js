// Fever "Tickets" (2026-11-21, fever.js): an event Fever sells gets one "Tickets" button (sponsored, commission line) on
// its What's On card, its page and in Build My Trip V4's "Book my trip" -- only with FEVER_AFFILIATE_TEMPLATE set. Without
// it nothing about Fever is anywhere and the event keeps its own "Tickets & info" link. Runs on a throwaway database;
// run `git checkout -q okanagan.db` after.
require('../test-network-guard').install();
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');

delete process.env.FEVER_AFFILIATE_TEMPLATE;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fever-'));
process.env.FEVER_DATA_DIR = dataDir;
process.env.TRIP_PLANNER_V3 = 'on';
const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

const fever = require('../fever');
const funnel = require('../trip-funnel');
const clickLabels = require('../click-labels');

const TEMPLATE = 'https://feverup.pxf.io/c/1234567/7654321/12345?u={url}';
const FEVER_URL = 'https://feverup.com/m/776198';
const ON = fever.config({ FEVER_AFFILIATE_TEMPLATE: TEMPLATE });
const OFF = fever.config({});
const on = () => { process.env.FEVER_AFFILIATE_TEMPLATE = TEMPLATE; };
const off = () => { delete process.env.FEVER_AFFILIATE_TEMPLATE; };

test('template: needs one https link with exactly one {url}; the Fever page goes in URL-encoded', () => {
  assert.equal(ON.enabled, true);
  assert.equal(OFF.enabled, false);
  for (const bad of ['', '   ', 'http://feverup.pxf.io/c/1/2/3?u={url}', 'https://feverup.pxf.io/c/1/2/3', 'https://x.example/?u={url}&v={url}', 'https://x.example/ ?u={url}', 'javascript:alert(1)//{url}', '"https://x.example/?u={url}"']) {
    assert.equal(fever.config({ FEVER_AFFILIATE_TEMPLATE: bad }).enabled, false, bad);
  }
  assert.equal(fever.affiliateUrl(FEVER_URL, ON), 'https://feverup.pxf.io/c/1234567/7654321/12345?u=https%3A%2F%2Ffeverup.com%2Fm%2F776198');
  assert.equal(fever.affiliateUrl(FEVER_URL, OFF), null);
  assert.equal(fever.affiliateUrl('https://example.com/m/1', ON), null, 'only Fever pages');
  assert.equal(fever.affiliateUrl('http://feverup.com/m/1', ON), null);
});

test('matches: only events in the file; off without the template', () => {
  const matches = { 7: { url: FEVER_URL }, 8: { url: 'https://evil.example/x' } };
  assert.equal(fever.eventTickets(7, { cfg: ON, matches }).feverUrl, FEVER_URL);
  assert.equal(fever.eventTickets(7, { cfg: OFF, matches }), null);
  assert.equal(fever.eventTickets(8, { cfg: ON, matches }), null);
  assert.equal(fever.eventTickets(9, { cfg: ON, matches }), null);
  // The committed file loads (no matches yet, 2026-11-21).
  const committed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fever-events.json'), 'utf8'));
  assert.equal(typeof committed.events, 'object');
  for (const [id, m] of Object.entries(committed.events)) { assert.match(id, /^\d+$/); assert.ok(fever.isFeverUrl(m.url), id); }
});

test('Build My Trip steps: one per Fever event in the plan, after the others; stops untouched; none when off', () => {
  const matches = { 7: { url: FEVER_URL } };
  const plan = { kind: 'multi_day', days: [{ day: 1, stops: [{ kind: 'event', event: { id: 7, name: 'Candlelight: Vivaldi' } }, { venue: { id: 7, name: 'A place' } }, { kind: 'event', event: { id: 7, name: 'Candlelight: Vivaldi' } }] }], v4Booking: { steps: [{ kind: 'venue', id: 7, url: 'https://place.example/book' }], estimate: null } };
  const before = JSON.stringify(plan.days);
  fever.withTripSteps(plan, { cfg: ON, matches });
  assert.equal(JSON.stringify(plan.days), before);
  assert.deepEqual(plan.v4Booking.steps.map((s) => s.id), [7, 'event-7']);
  const s = plan.v4Booking.steps[1];
  assert.deepEqual({ kind: s.kind, eventId: s.eventId, label: s.label, labelFr: s.labelFr, rel: s.rel, link: s.link, affiliate: s.affiliate }, { kind: 'event', eventId: 7, label: 'Tickets', labelFr: 'Billets', rel: 'sponsored noopener', link: 'fever', affiliate: true });
  const stayPlan = { kind: 'multi_day', days: plan.days, whereToStay: { pick: { id: 1, bookingSteps: [] }, alternatives: [{ id: 2 }], bookingSteps: [] } };
  fever.withTripSteps(stayPlan, { cfg: ON, matches });
  assert.deepEqual(stayPlan.whereToStay.pick.bookingSteps.map((x) => x.id), ['event-7']);
  assert.deepEqual(stayPlan.whereToStay.alternatives[0].bookingSteps.map((x) => x.id), ['event-7']);
  const offPlan = { kind: 'multi_day', days: plan.days };
  fever.withTripSteps(offPlan, { cfg: OFF, matches });
  assert.equal(offPlan.v4Booking, undefined);
});

test('funnel: a Fever tap is its own commission kind; click sheet key only on pages that have the button', () => {
  assert.equal(funnel.resolveName('bmt:v4:book:venue', 0, () => 'restaurant', 'fever'), 'bmt:v4:book:fever');
  assert.equal(funnel.resolveName('bmt:v3:book:venue', 0, null, 'fever'), 'bmt:v3:book:fever');
  assert.ok(funnel.NAMES.includes('bmt:v4:book:fever'));
  assert.deepEqual(funnel.BOOK_TYPES.filter(([, , c]) => c).map(([k]) => k), ['stay', 'viator', 'fever']);
  assert.ok(require('../site-events').EVENTS.has('bmt:v4:book:fever'));
  // V4's "Book my trip" sheet is a dialog outside the plan: its taps count too.
  assert.match(funnel.clientScript(), /getElementById\('v4Sheet'\)/);
  assert.doesNotMatch(clickLabels.clientClassifierJs(), /"fever"/);
  assert.match(clickLabels.clientClassifierJs({ fever: true }), /\["fever","a\[data-link=\\"fever\\"\]"/);
});

// ---- Through the server ----
const app = require('../server.js');
const db = require('../db.js');
const meta = { reason: 'fever fixture', batch_id: 'test-fever' };
const today = app.todayLocal();
let ev, other, base, srv;
test.before(async () => {
  const mk = (o) => {
    const r = app.createEvent({ region: 'kelowna', description: 'A fixture event used only by the Fever tests.', source_type: 'official_venue', source_name: 'Fixture', categories: ['live-music'], ...o }, meta);
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.event;
  };
  ev = mk({ name: 'Fixture Candlelight Concert', source_url: 'https://example.com/fever-fixture-1', venue_name_text: 'Fixture Packinghouse', website: 'https://fixture-venue.example/tickets', occurrences: [{ start_date: app.addLocalDays(today, 5), start_time: '18:30', end_time: '19:30' }] });
  other = mk({ name: 'Fixture Other Concert', source_url: 'https://example.com/fever-fixture-2', venue_name_text: 'Fixture Other Hall', website: 'https://other.example/', occurrences: [{ start_date: app.addLocalDays(today, 8), start_time: '19:00', end_time: '21:00' }] });
  fs.writeFileSync(path.join(dataDir, 'fever-events.json'), JSON.stringify({ events: { [ev.id]: { url: FEVER_URL } } }));
  fever.clearCache();
  srv = http.createServer((req, res) => app.server.emit('request', req, res));
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(async () => {
  off();
  delete process.env.FEVER_DATA_DIR;
  fs.rmSync(dataDir, { recursive: true, force: true });
  await new Promise((resolve) => srv.close(resolve));
  try { app.server.close(); } catch (e) { /* not listening */ }
});
const UA = { 'User-Agent': 'okanaganroam-check/1.0' };
const get = async (p) => { const r = await fetch(`${base}${p}`, { headers: UA }); return { status: r.status, text: await r.text() }; };
const evPath = () => `/kelowna/events/${ev.slug}`;
const order = (html) => [...html.matchAll(/data-venue-id="event-(\d+)"/g)].map((m) => m[1]);

test('server, template unset: no Fever anywhere; the event keeps "Tickets & info" to its own site', async () => {
  off();
  for (const p of [evPath(), '/whats-on', `/fr${evPath()}`, '/fr/whats-on']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.doesNotMatch(r.text, /feverup|data-link="fever"|data-fever-disclosure|pxf\.io/i, p);
  }
  const page = (await get(evPath())).text;
  assert.match(page, /<a class="cta event-cta-primary" href="https:\/\/fixture-venue\.example\/tickets" rel="nofollow noopener" target="_blank">Tickets &amp; info/);
});

test('server, template set: one "Tickets" button (sponsored) with the commission line on the card and the page, EN + FR; order and SEO tags unchanged', async () => {
  off();
  const wOff = (await get('/whats-on')).text, pOff = (await get(evPath())).text;
  on();
  const w = (await get('/whats-on')).text, p = (await get(evPath())).text;
  // Card.
  const card = w.slice(w.indexOf(`data-venue-id="event-${ev.id}"`), w.indexOf('</li>', w.indexOf(`data-venue-id="event-${ev.id}"`)));
  assert.match(card, /<a class="cta secondary whatson-fever-btn" href="https:\/\/feverup\.pxf\.io\/c\/1234567\/7654321\/12345\?u=https%3A%2F%2Ffeverup\.com%2Fm%2F776198" rel="sponsored noopener" target="_blank" data-track="booking" data-link="fever" data-event-id="\d+">Tickets <span aria-hidden="true">↗<\/span><\/a>/);
  assert.match(card, /data-fever-disclosure[^>]*>We may earn a commission if you buy tickets through this link\./);
  const otherCard = w.slice(w.indexOf(`data-venue-id="event-${other.id}"`), w.indexOf('</li>', w.indexOf(`data-venue-id="event-${other.id}"`)));
  assert.doesNotMatch(otherCard, /data-link="fever"|feverup|data-fever-disclosure/, 'an event Fever does not sell is unchanged');
  assert.deepEqual(order(w), order(wOff), 'the same events in the same order');
  assert.match(w, /link_type: 'fever', surface: "whatson_card"/);
  // Page: one main ticket button, Fever's; the own site stays in the details.
  assert.equal((p.match(/class="cta event-cta-primary"/g) || []).length, 1);
  assert.match(p, /<a class="cta event-cta-primary" href="https:\/\/feverup\.pxf\.io\/[^"]+" rel="sponsored noopener" target="_blank" data-track="booking" data-link="fever" data-event-id="\d+">Tickets/);
  assert.doesNotMatch(p, /Tickets &amp; info/);
  assert.match(p, /event-fever-note" data-fever-disclosure/);
  assert.match(p, /link_type: 'fever', surface: "event_page"/);
  assert.match(p, /\["fever","a\[data-link=\\"fever\\"\]"/, 'the click sheet knows the button');
  for (const re of [/<title>[^<]*<\/title>/, /<meta name="description"[^>]*>/, /<link rel="canonical"[^>]*>/, /<meta name="robots"[^>]*>/]) assert.equal((p.match(re) || [''])[0], (pOff.match(re) || [''])[0], String(re));
  // French twins.
  const fr = (await get(`/fr${evPath()}`)).text, wfr = (await get('/fr/whats-on')).text;
  assert.match(fr, /data-link="fever"[^>]*>Billets <span aria-hidden="true">↗/);
  assert.match(fr, /Nous pouvons toucher une commission si vous achetez des billets par ce lien\./);
  assert.match(wfr, /data-link="fever"[^>]*>Billets /);
  off();
});

test('server, Build My Trip V4: an event in the plan that Fever sells gets its Tickets step only with the template', async () => {
  const post = async (qs) => (await fetch(`${base}/api/trip/plan${qs}`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '2 days in Kelowna with a concert', stay: { arrive: app.addLocalDays(today, 5), leave: app.addLocalDays(today, 6) } }) })).json();
  const steps = (p) => [...((p.whereToStay && p.whereToStay.bookingSteps) || []), ...((p.v4Booking && p.v4Booking.steps) || [])];
  const inPlan = (p) => JSON.stringify(p.days || p.itinerary || p.outing || []).includes(`"id":${ev.id}`);
  off();
  const a = await post('?stays=1&v=4');
  assert.ok(!steps(a).some((s) => s.link === 'fever'));
  on();
  const b = await post('?stays=1&v=4');
  assert.ok(inPlan(b), 'the fixture concert is in the plan');
  assert.equal(steps(b).filter((s) => s.link === 'fever' && s.eventId === ev.id && s.rel === 'sponsored noopener' && s.label === 'Tickets').length >= 1, true, 'the Fever step');
  assert.deepEqual(JSON.stringify(b.days), JSON.stringify(a.days), 'the same stops with and without the template');
  const v3 = await post('?stays=1');
  assert.ok(!steps(v3).some((s) => s.link === 'fever'), 'not on the old page');
  off();
});
