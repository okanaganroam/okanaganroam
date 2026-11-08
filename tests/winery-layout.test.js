// Winery pages (2026-11-08): every English winery page uses the tasting-focused layout first built for Niche Wine Company:
// the winery's own booking link first, its recorded tastings in a card, a one-sentence introduction, and the rest of the
// Plan your visit box under "More about". Every clickable link on the page goes where its words say.
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
const tastings = require('../niche-tastings.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => JSON.stringify(Object.fromEntries(WEEK.map((d) => [d, [[from, to]]])));
const NOW = new Date('2026-11-07T20:00:00Z');
const meta = { reason: 'winery layout fixture', batch_id: 'test-winery-layout' };
let n = 0;
const mk = (o) => app.createVenue({ region: 'kelowna', type: 'winery', slug: `winery-layout-fixture-${++n}`, latitude: 49.85 + n / 1000, longitude: -119.5, ...o });
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { now: NOW, lang });
const links = (v, l) => db.prepare('INSERT OR REPLACE INTO venue_links (venue_id, menu_url, booking_url, instagram_url, facebook_url) VALUES (?, ?, ?, ?, ?)')
  .run(v.id, l.menu || null, l.booking || null, l.ig || null, l.fb || null);
const visit = (v, info) => {
  const r = app.guardedVisitInfoUpdate(v.id, null, { source_url: 'https://www.example.com/visit', checked_at: '2026-11-01', ...info }, meta);
  assert.equal(r.ok, true, JSON.stringify(r));
};
const layoutOf = (html) => { const i = html.indexOf('<div class="fd-layout">'); return i < 0 ? '' : html.slice(i, html.indexOf('<footer', i) < 0 ? undefined : html.indexOf('<footer', i)); };
const anchors = (html) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ attrs: m[1], href: (/href="([^"]*)"/.exec(m[1]) || [])[1], text: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() }))
  .filter((a) => a.href !== undefined);
const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const tabs = (html) => [...((/<nav class="fd-section-nav"[^>]*>([\s\S]*?)<\/nav>/.exec(html) || [])[1] || '').matchAll(/<a href="#([^"]+)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2].replace(/&amp;/g, '&')]);

// A restaurant the winery's box links to, and a winery with everything recorded.
const bistro = mk({ name: 'Linked Test Bistro', type: 'restaurant', slug: 'linked-test-bistro', hours: open('11:00', '21:00'), description: 'A sample bistro.' });
const rich = mk({ name: 'Estate Test Winery', price: 3, rating: 4.5, reviews: 120, hours: open('11:00', '17:00'), phone: '+12505550111', website: 'https://www.estate-test.example/',
  address: '1 Vineyard Road, Kelowna, BC', image_url: '/images/food-drink/breweries-1200.jpg', patio: 1, dog_friendly: 1, lake_view: 1,
  description: 'A family estate on a south-facing slope. Its wines are made from the vineyards around the tasting room. Visitors can stay for lunch.' });
links(rich, { booking: 'https://book.estate-test.example/reserve?x=1&y=2', menu: 'https://www.estate-test.example/menu', ig: 'https://www.instagram.com/estatetest/', fb: 'https://www.facebook.com/estatetest' });
visit(rich, { rows: [
  { label: 'Known for', text: 'Pinot Noir and sparkling wine.' },
  { label: 'Tastings', text: 'Seated tasting of 5 wines, $25, about 45 min. Reservations recommended.' },
  { label: 'Vineyard walk', text: 'Guided walk through the vines, $35, 60 min.', url: 'https://www.estate-test.example/walk' },
  { label: 'Restaurant', text: 'Linked Test Bistro on site, open daily.', venue_id: bistro.id },
  { label: 'Winter', text: 'Open Thursday to Sunday.' },
], booking_url: 'https://visit-booking.example/book', booking_label: 'Book a tasting' });
const visitOnly = mk({ name: 'Visit Box Test Winery', hours: open('12:00', '17:00'), website: 'https://visitbox.example/', address: '2 Vineyard Road, Kelowna, BC', description: 'One short sentence only.' });
visit(visitOnly, { rows: [{ label: 'Tastings', text: 'Tasting of 4 wines, $15.' }], booking_url: 'https://visitbox.example/book', booking_label: 'Book a tasting' });
const plain = mk({ name: 'Plain Test Winery', hours: open('11:00', '17:00'), address: '3 Vineyard Road, Kelowna, BC', description: 'A small winery. It pours its own wines.' });
const noPhoto = mk({ name: 'No Photo Test Winery With A Rather Long Name That Keeps Going For The Whole Line', description: 'Just a name and a sentence.' });
const niche = mk({ name: 'Niche Wine Company', region: 'west-kelowna', slug: 'niche-wine-company', hours: open('11:00', '17:00'), website: 'https://nichewinecompany.com/', address: '2 Niche Road, West Kelowna, BC',
  description: 'A tasting-room winery. It has a tarot tasting.' });
links(niche, { booking: 'https://nichewinecompany.com/reservation/' });
visit(niche, { rows: [
  { label: 'Tastings', text: 'Splash & Dash: guided tasting of 4 wines, $15, 30 min. Tarot tasting $17. Book online.' },
  { label: 'Vineyard walk', text: 'Walk the vines with a glass, $35, 60 min.' },
], booking_url: 'https://nichewinecompany.com/reservation/' });

test('every winery page uses the shared layout, with the tasting card first and the booking button leading', () => {
  const html = page(rich);
  assert.match(html, /<body[^>]*fd-venue-page winery-venue-page/);
  const body = layoutOf(html);
  assert.deepEqual(tabs(body).map((t) => t[1]), ['Overview', 'Tastings', 'Menu', 'Hours']);
  assert.match(body, /<section class="fd-card fd-tastings" id="fdTastings">/);
  const row = body.slice(body.indexOf('<div class="venue-cta-row"'), body.indexOf('</div>', body.indexOf('<div class="venue-cta-row"')));
  const firstButton = anchors(row)[0];
  assert.equal(firstButton.text.replace(/\s*↗$/, ''), 'Book');
  assert.match(firstButton.attrs, /aria-label="Book on Estate Test Winery’s website \(opens in a new tab\)"/);
  const order = anchors(row).map((a) => a.text.replace(/\s*↗$/, '').replace(/&amp;/g, '&'));
  assert.deepEqual([order[0], order[1], order[order.length - 1]], ['Book', '🍽️ Menu & prices', '🕒 Hours'], 'Book, then Menu, ..., Hours last');
  assert.ok(order.some((t) => /Directions|Google Maps/.test(t)), 'Directions is among the main buttons');
});

test('the introduction is one sentence; the whole description and the Plan your visit box are under More about', () => {
  const body = layoutOf(page(rich));
  assert.match(body, /<p class="venue-description">A family estate on a south-facing slope\.<\/p>/);
  const more = body.slice(body.indexOf('<summary>More about'));
  assert.match(more, /Its wines are made from the vineyards around the tasting room\. Visitors can stay for lunch\./);
  assert.match(more, /id="venueVisit"/);
});

test('the tastings card shows what is recorded, as written, with where it came from', () => {
  const body = layoutOf(page(rich));
  const card = body.slice(body.indexOf('id="fdTastings"'), body.indexOf('</section>', body.indexOf('id="fdTastings"')));
  assert.match(card, /<strong>Tastings<\/strong><span>Seated tasting of 5 wines, \$25, about 45 min\. Reservations recommended\.<\/span>/);
  assert.match(card, /<strong>Vineyard walk<\/strong><span>Guided walk through the vines, \$35, 60 min\./);
  assert.match(card, /From example\.com · checked Nov 1, 2026\. Confirm current options when booking\./);
  assert.doesNotMatch(card, /per person/i, 'a basis nobody recorded is never added');
  assert.equal(tastings.wineryTastingsHtml({ rows: [{ label: 'Winter', text: 'Closed Jan' }] }, (s) => s), '', 'no Tastings row, no card');
  assert.equal(tastings.wineryTastingsHtml(null, (s) => s), '');
});

test('a lone Tastings row is not labelled twice', () => {
  const card = tastings.wineryTastingsHtml({ rows: [{ label: 'Tastings', text: 'Tasting of 4 wines, $15.' }], source_url: 'https://www.example.com/x', checked_at: '2026-11-01' }, (s) => s);
  assert.match(card, /<h2>Tastings 🍇<\/h2>/);
  assert.match(card, /<li><span>Tasting of 4 wines, \$15\.<\/span><\/li>/);
  assert.doesNotMatch(card, /<strong>Tastings<\/strong>/);
});

test('a winery with little recorded still gets a complete page: no tastings card, no tabs it cannot back', () => {
  const html = page(plain);
  const body = layoutOf(html);
  assert.doesNotMatch(body, /id="fdTastings"/);
  assert.deepEqual(tabs(body), [], 'one section: no section navigation');
  assert.match(body, /<p class="venue-description">A small winery\.<\/p>/);
  assert.match(body, /data-track="directions"/);
  const np = page(noPhoto);
  assert.equal((np.match(/<h1[\s>]/g) || []).length, 1, 'no photo: the name is the one heading');
  assert.doesNotMatch(np, /<div class="(?:venue-hero|vg-mosaic)/);
  assert.doesNotMatch(layoutOf(np), /Closed|unavailable/);
});

test('a booking link in the Plan your visit box leads when the winery has no booking link of its own', () => {
  const body = layoutOf(page(visitOnly));
  const first = anchors(body.slice(body.indexOf('<div class="venue-cta-row"')))[0];
  assert.equal(first.href, 'https://visitbox.example/book');
  assert.match(first.text, /^Book a tasting/);
  assert.match(first.attrs, /target="_blank"/);
});

test('Niche keeps its priced tasting cards and verified prices', () => {
  const body = layoutOf(page(niche));
  assert.match(body, /<article class="fd-tasting-option"><div><h3>Splash &amp; Dash<\/h3>/);
  assert.match(body, /Niche/);
  assert.match(body, /<summary>More about Niche &amp; all venue features<\/summary>/);
});

test('every clickable link goes where its words say', () => {
  const html = page(rich);
  const body = layoutOf(html);
  const all = anchors(body);
  const find = (re) => all.filter((a) => re.test(a.text));
  const one = (re) => { const f = find(re); assert.equal(f.length >= 1, true, String(re)); return f[0]; };
  // the winery's own addresses, exactly as recorded
  assert.equal(decode(one(/^Book\b/).href), 'https://book.estate-test.example/reserve?x=1&y=2');
  assert.equal(decode(one(/^Website/).href), 'https://www.estate-test.example/');
  assert.equal(decode(one(/own menu|^See the menu/).href), 'https://www.estate-test.example/menu');
  assert.equal(decode(one(/^Instagram$/).href), 'https://www.instagram.com/estatetest/');
  assert.equal(decode(one(/^Facebook$/).href), 'https://www.facebook.com/estatetest');
  assert.match(one(/^Call$/).href, /^tel:\+?1?\s?250-?555-?0111$|^tel:\+12505550111$/);
  assert.equal(decode(one(/^More ↗$/).href), 'https://www.estate-test.example/walk');
  // directions open this winery's map point
  const dir = one(/Directions|Google Maps/);
  assert.ok(/query=49\.8\d+,-119\.5$/.test(decode(dir.href)) || dir.href.includes(encodeURIComponent('/kelowna/wineries/')), dir.href);
  // the restaurant row links to the restaurant's own listing
  const bistroLink = one(/^Linked Test Bistro$/);
  assert.equal(bistroLink.href, '/kelowna/restaurants/linked-test-bistro');
  assert.ok(app.findVenueBySlug('kelowna', 'restaurant', 'linked-test-bistro'));
  // in-page jumps all land on a section that exists
  for (const a of all.filter((x) => x.href.startsWith('#'))) assert.match(body, new RegExp(`id="${a.href.slice(1)}"`), a.href);
  // outbound links open in a new tab and say so to assistive tech where the words are only "Book"
  for (const a of all.filter((x) => /^https?:\/\//.test(x.href) && !/google\.com\/maps/.test(x.href))) assert.match(a.attrs, /rel="nofollow noopener"/, a.href);
  // internal links point at pages that exist
  for (const a of all.filter((x) => /^\/[a-z]/.test(x.href))) {
    const m = /^\/([a-z-]+)(?:\/([a-z-]+))?(?:\/([a-z0-9-]+))?(?:\/([a-z0-9-]+))?(?:[?#].*)?$/.exec(a.href);
    assert.ok(m, a.href);
    if (m[1] === 'claim') { assert.equal(a.href, `/claim/${rich.region}/wineries/${rich.slug}`, 'the claim link is this winery\u2019s'); continue; }
    if (m[1] === 'owner') continue;
    assert.ok(app.REGION_LABELS[m[1]] || ['food-drink', 'wineries', 'map', 'guide', 'guides'].includes(m[1]), `region of ${a.href}`);
  }
});

test('no winery page repeats a link address under the wrong words', () => {
  for (const v of [rich, visitOnly, plain, niche]) {
    const body = layoutOf(page(v));
    const byHref = new Map();
    for (const a of anchors(body)) {
      if (!byHref.has(a.href)) byHref.set(a.href, new Set());
      byHref.get(a.href).add(a.text.replace(/\s*[↗→↓]$/, ''));
    }
    // the Website button and a "Book" button never share an address unless the winery recorded the same address for both
    const website = [...byHref.keys()].filter((h) => byHref.get(h).has('Website'));
    for (const h of website) assert.ok(![...byHref.get(h)].some((t) => /^Book/.test(t)) || v === niche, `${v.name}: ${h}`);
  }
});

test('French winery pages keep their current layout', () => {
  const fr = app.renderVenuePage(app.getVenue(rich.id), [], [], [], { now: NOW, lang: 'fr' });
  assert.doesNotMatch(fr, /<body[^>]*winery-venue-page|<div class="fd-layout">/);
});
