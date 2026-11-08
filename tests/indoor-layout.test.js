// Indoor & Rainy Day pages (2026-11-08): every English page the hub lists (indoor venues and indoor golf simulators) uses the
// layout first built for GOLFBOX. Each part is built from what the place's own listing records and appears only when it has
// something to show; GOLFBOX keeps its own hand-written page.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
const app = require('../server.js');
const db = require('../db.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => JSON.stringify(Object.fromEntries(WEEK.map((d) => [d, [[from, to]]])));
const NOW = new Date('2026-11-07T20:00:00Z');
const meta = { reason: 'indoor layout fixture', batch_id: 'test-indoor-layout' };
db.exec("UPDATE sqlite_sequence SET seq = 90500 WHERE name = 'venues'");
let n = 0;
const mk = (o) => app.createVenue({ region: 'kelowna', type: 'indoor', slug: `indoor-layout-fixture-${++n}`, latitude: 49.9 + n / 1000, longitude: -119.4, ...o });
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { now: NOW, lang });
const links = (v, l) => db.prepare('INSERT OR REPLACE INTO venue_links (venue_id, menu_url, booking_url, instagram_url, facebook_url) VALUES (?, ?, ?, ?, ?)')
  .run(v.id, null, l.booking || null, null, null);
const visit = (v, info) => {
  const r = app.guardedVisitInfoUpdate(v.id, null, { source_url: 'https://www.example.com/visit', checked_at: '2026-11-01', ...info }, meta);
  assert.equal(r.ok, true, JSON.stringify(r));
};
const layoutOf = (html) => { const i = html.indexOf('<div id="gbLayout"'); return i < 0 ? '' : html.slice(i, html.indexOf('<footer', i) < 0 ? undefined : html.indexOf('<footer', i)); };
const anchors = (html) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ attrs: m[1], href: (/href="([^"]*)"/.exec(m[1]) || [])[1], text: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() }))
  .filter((a) => a.href !== undefined);
const tabs = (html) => [...((/<nav class="gb-nav"[^>]*>([\s\S]*?)<\/nav>/.exec(html) || [])[1] || '').matchAll(/<a href="#([^"]+)">([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);

const rich = mk({ name: 'Jump Zone Trampoline Park', slug: 'jump-zone', hours: open('10:00', '20:00'), phone: '+12505550144', website: 'https://www.jumpzone.example/',
  address: '1 Bounce Way, Kelowna, BC', image_url: '/images/indoor/indoor.jpg', price: 2, kid_friendly: 1,
  description: 'A big indoor trampoline park with dodgeball courts and a toddler area. Great for birthday parties and rainy afternoons. Grip socks are required.' });
links(rich, { booking: 'https://book.jumpzone.example/tickets' });
visit(rich, { rows: [{ label: 'Pricing', text: 'One-hour jump $18; toddler hour $12.' }, { label: 'Parties', text: 'Birthday packages for 8 to 20 kids.' },
  { label: 'What to bring', text: 'Grip socks are required; sold at the front desk.' }] });
const bare = mk({ name: 'Quiet Gallery Space', slug: 'quiet-gallery', description: 'A small gallery.' });
const sim = mk({ type: 'golf', name: 'Fairway Sim Lounge', slug: 'fairway-sim-lounge', hours: open('09:00', '23:00'), phone: '+12505550166', website: 'https://www.fairwaysim.example/',
  address: '5 Putter Lane, Kelowna, BC', image_url: '/images/golf/golf-courses.jpg', price: 3,
  description: 'An indoor golf simulator lounge with four bays. Play famous courses with friends all winter. Lessons are available.' });
links(sim, { booking: 'https://book.fairwaysim.example/' });
app.GOLF_AT_A_GLANCE_FACTS['kelowna/fairway-sim-lounge'] = [['Bays', 'Four private bays'], ['Technology', 'Foresight launch monitors'], ['Courses', 'More than 100'], ['Lessons', 'PGA of Canada pro']];
const outdoorGolf = mk({ type: 'golf', name: 'Hillside Golf Club', slug: 'hillside-golf-club', description: 'An 18-hole championship course.', image_url: '/images/golf/golf-courses.jpg' });
const golfbox = mk({ type: 'golf', region: 'west-kelowna', slug: 'golfbox', name: 'GOLFBOX', website: 'https://www.golfbox.ca/', phone: '+12508635864',
  address: '3310 Carrington Road, West Kelowna, BC', image_url: '/images/golf/golf-courses.jpg', description: 'An indoor golf simulator space on Westbank First Nation land.' });
links(golfbox, { booking: 'https://www.golfbox.ca/book' });

test('an indoor venue uses the shared layout, built from its own record', () => {
  const html = page(rich);
  assert.match(html, /<body[^>]*indoor-venue-page/);
  assert.match(html, /href="\/indoor-venue\.css\?v=[0-9a-f]{12}"/);
  const body = layoutOf(html);
  assert.deepEqual(tabs(body).map((t) => t[1]), ['Overview', 'Book', 'Your visit', 'Getting here', 'Hours']);
  for (const [id] of tabs(body)) assert.ok(html.includes(`id="${id}"`), `tab target #${id} exists`);
  assert.match(body, /A big indoor trampoline park with dodgeball courts and a toddler area\./);
  assert.match(body, /One-hour jump \$18/); // the Pricing row sits in the booking card
  assert.match(/id="gbBooking"[\s\S]*?<\/aside>/.exec(body)[0], /Pricing/);
  assert.match(/id="gbVisit"[\s\S]*?<\/section>/.exec(body)[0], /Grip socks are required/);
  assert.doesNotMatch(/id="gbVisit"[\s\S]*?<\/section>/.exec(body)[0], /One-hour jump/);
  assert.match(body, /1 Bounce Way, Kelowna, BC/);
  assert.match(body, /href="tel:\+12505550144"/);
  assert.equal((body.match(/class="label">Price</g) || []).length + (body.match(/price level/g) || []).length, 1, 'the price level shows once');
});

test('the booking button is the place\'s own booking link, and Favorite / Add to trip say what they do', () => {
  const body = layoutOf(page(rich));
  const first = anchors(/class="gb-mobile-book">([\s\S]*?)<\/div>/.exec(body)[1])[0];
  assert.equal(first.href, 'https://book.jumpzone.example/tickets');
  assert.match(first.attrs, /rel="[^"]*noopener/);
  assert.match(body, /Favorite saves this place for later\. Add to trip puts it on your trip list\./);
});

test('an indoor golf simulator uses it too, with its own at-a-glance facts', () => {
  const html = page(sim);
  const body = layoutOf(html);
  assert.match(body, /⛳ Indoor golf · <a href="\/kelowna">Kelowna<\/a>/);
  assert.match(body, /<strong>Four private bays<\/strong><small>Bays<\/small>/);
  assert.match(/id="gbVisit"[\s\S]*?<\/section>/.exec(body)[0], /Foresight launch monitors/);
  assert.equal(anchors(/class="gb-mobile-book">([\s\S]*?)<\/div>/.exec(body)[1])[0].href, 'https://book.fairwaysim.example/');
});

test('a place with almost nothing recorded shows only what it has, and invents nothing', () => {
  const html = page(bare);
  const body = layoutOf(html);
  assert.deepEqual(tabs(body).map((t) => t[1]), ['Overview', 'Getting here']);
  assert.doesNotMatch(body, /id="gbBooking"|id="gbVisit"|id="gbHours"|gb-quick|gb-mobile-book/);
  assert.doesNotMatch(html, /<h1 class="venue-mobile-title"/);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, 'the banner that takes the photo\'s place carries the only h1');
});

test('GOLFBOX keeps its own page; an outdoor golf course and French pages keep theirs', () => {
  const g = page(golfbox);
  assert.match(g, /<body[^>]*golfbox-page/);
  assert.match(g, /Book a bay/); assert.match(g, /\$35–\$60 per bay/);
  assert.doesNotMatch(layoutOf(page(rich)), /Book a bay|TrackMan/);
  assert.doesNotMatch(page(outdoorGolf), /id="gbLayout"/);
  assert.doesNotMatch(page(rich, 'fr'), /id="gbLayout"/);
  assert.doesNotMatch(page(sim, 'fr'), /id="gbLayout"/);
  const redirected = { ...app.getVenue(rich.id), redirect_to: bare.id };
  assert.doesNotMatch(app.renderVenuePage(redirected, [], [], [], { now: NOW }), /id="gbLayout"/);
});

test('every clickable link goes where its words say', () => {
  for (const v of [rich, sim, bare]) {
    const html = page(v);
    const body = layoutOf(html);
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const a of anchors(body)) {
      if (a.href.startsWith('#')) assert.ok(ids.has(a.href.slice(1)), `${a.text} -> ${a.href}: nothing on the page has that id`);
      else if (/^https?:\/\//.test(a.href)) assert.match(a.attrs, /rel="[^"]*noopener/, `${a.text} -> ${a.href} opens elsewhere without noopener`);
    }
    const web = anchors(body).find((a) => /^Website/.test(a.text));
    if (v.website) assert.equal(web && web.href, v.website); else assert.equal(web, undefined);
    const call = anchors(body).find((a) => a.text === 'Call');
    if (v.phone) assert.equal(call && call.href, `tel:${v.phone}`); else assert.equal(call, undefined);
  }
});
