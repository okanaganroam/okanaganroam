// Public venue pages: the "Plan your visit" box is open on the page (2026-11-08), not hidden inside the collapsed
// "More about <venue> & all venue features" section where most visitors never saw it. A layout move only: same box,
// same rows (its own "More: ..." line still folds extra rows in place, all in the HTML), same head and JSON-LD.
// Runs on a throwaway database; run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'plan-visit-visible-token';
const app = require('../server.js');
const layout = require('../food-drink-venue-layout.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (a, b) => JSON.stringify(Object.fromEntries(WEEK.map((d) => [d, [[a, b]]])));
const NOW = new Date('2026-11-07T20:00:00Z');
const meta = { reason: 'test', batch_id: 'plan-visit-visible' };
let n = 0;
const mk = (o) => app.createVenue({ region: 'kelowna', slug: `pv-visible-${++n}`, latitude: 49.88 + n / 1000, longitude: -119.49, rating: 4.5, hours: open('11:00', '21:00'),
  address: '1 Main St, Kelowna, BC', phone: '250-555-0100', website: 'https://example.com', ...o });
const visit = (v, rows) => assert.equal(app.guardedVisitInfoUpdate(v.id, null, { rows, booking_url: null, source_url: 'https://example.com/', checked_at: '2026-11-01' }, meta).ok, true);
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { now: NOW, lang });
// Every <details>...</details> range in the page; the box must not sit inside any of them.
// Real <details> elements only (style and script text blanked out, same length), nesting respected.
const insideDetails = (html, at) => {
  const h = html.replace(/<(style|script)\b[\s\S]*?<\/\1>/g, (s) => ' '.repeat(s.length));
  const re = /<details\b|<\/details>/g;
  const stack = [];
  let m;
  while ((m = re.exec(h)) && m.index < at) { if (m[0] === '</details>') stack.pop(); else stack.push(m.index); }
  return stack.length > 0;
};

const bistro = mk({ name: 'Visible Box Bistro', type: 'restaurant', description: 'A sample bistro. It has a patio and serves dinner nightly.' });
visit(bistro, [
  { label: 'Known for', text: 'Duck confit and the patio' }, { label: 'Reservations', text: 'Book online or call' },
  { label: 'Takeout', text: 'Takeout by phone' }, { label: 'Good to know', text: 'Free parking out back' }]);
const pub = mk({ name: 'Visible Box Pub', type: 'pub', description: 'A sample pub with pints and wings.' });
visit(pub, [{ label: 'Known for', text: 'Wings and trivia' }, { label: 'Ages', text: '19+ after 9 PM' }]);
const winery = mk({ name: 'Visible Box Winery', type: 'winery', description: 'A sample winery. Tastings daily.' });
visit(winery, [{ label: 'Tastings', text: 'Walk-in tastings, $15' }, { label: 'Dogs', text: 'Leashed dogs on the patio' }]);
const plain = mk({ name: 'No Box Kitchen', type: 'restaurant', description: 'A sample restaurant with no Plan your visit box.' });

test('restaurant, pub and winery pages: the box is open on the page, after the menu and deals, before "More about"', () => {
  for (const v of [bistro, pub, winery]) {
    const html = page(v);
    const at = html.indexOf('id="venueVisit"');
    assert.ok(at > 0, `${v.name}: box present`);
    assert.equal(insideDetails(html, at), false, `${v.name}: not inside any collapsed section`);
    assert.ok(at < html.indexOf('<summary>More about'), `${v.name}: above "More about"`);
    assert.match(html, /<div class="fd-card fd-visit"><section class="venue-section venue-visit" id="venueVisit" aria-labelledby="venueVisitHead">\s*<h2 id="venueVisitHead">Plan your visit<\/h2>/);
    const more = html.slice(html.indexOf('<summary>More about'), html.indexOf('</details>', html.indexOf('<summary>More about')));
    assert.doesNotMatch(more, /venueVisit/, `${v.name}: not repeated in "More about"`);
    assert.equal((html.match(/id="venueVisit"/g) || []).length, 1, 'the id stays unique, so links to #venueVisit still work');
  }
});

test('every row stays in the HTML: extra rows fold in place under the box\'s own "More: ..." line', () => {
  const html = page(bistro);
  const box = html.slice(html.indexOf('id="venueVisit"'), html.indexOf('</section>', html.indexOf('id="venueVisit"')));
  for (const t of ['Duck confit and the patio', 'Book online or call', 'Takeout by phone', 'Free parking out back']) assert.ok(box.includes(t), t);
  assert.match(box, /<details class="visit-more"><summary>More: takeout, good to know<\/summary>/);
});

test('a venue with no box gets no empty card', () => {
  const html = page(plain);
  assert.doesNotMatch(html, /fd-visit|venueVisit/);
});

test('head and JSON-LD do not depend on where the box sits (the layout builds only the page body)', () => {
  const html = page(bistro);
  const head = html.slice(0, html.indexOf('</head>'));
  assert.doesNotMatch(head, /Duck confit|Plan your visit/, 'the box text is not in the head');
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('');
  assert.ok(ld.length > 0);
  assert.doesNotMatch(ld, /Duck confit|Free parking out back/, 'structured data unchanged: the box was never part of it');
  // The pure layout: with and without a box, everything else is the same string.
  const parts = { venue: { id: 1, region: 'kelowna', type: 'restaurant', name: 'X' }, name: 'X', atAGlance: '', openStatusHtml: '', happyHourHtml: '', menuPicks: [], highlights: [],
    nearbyCards: [], contactActions: [], ctaRowAttrs: '', verifiedHtml: '', descriptionHtml: '<p>D</p>', badgesHtml: '', dogNoteHtml: '', guideLinks: '', ownerCtaHtml: '',
    hoursHtml: '', detailRows: '', locationHtml: '', visitorHtml: '', eventsHtml: '', regionLabel: 'Kelowna', intro: '' };
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const without = layout.renderFoodDrinkVenueLayout({ ...parts, escapeHtml: esc, visitHtml: '' });
  const withBox = layout.renderFoodDrinkVenueLayout({ ...parts, escapeHtml: esc, visitHtml: '<section id="venueVisit">V</section>' });
  assert.equal(withBox.replace('\n<div class="fd-card fd-visit"><section id="venueVisit">V</section></div>', ''), without);
});

test('French pages keep their existing layout and rule (only translated rows show)', () => {
  const fr = page(bistro, 'fr');
  assert.doesNotMatch(fr, /fd-visit/, 'French pages do not use the food & drink layout');
});
