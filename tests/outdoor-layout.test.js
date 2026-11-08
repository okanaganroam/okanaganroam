// Outdoors and Sports & Recreation pages (2026-11-08): every English page of those two categories uses the layout first built
// for the Kalamalka Lake park page. Each section is built from what the place's own listing records and appears only when
// it has something to show; the Kalamalka page keeps its own mapped route and parking entrances.
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
const meta = { reason: 'outdoor layout fixture', batch_id: 'test-outdoor-layout' };
db.exec("UPDATE sqlite_sequence SET seq = 90300 WHERE name = 'venues'");
let n = 0;
const mk = (o) => app.createVenue({ region: 'kelowna', type: 'outdoor', slug: `outdoor-layout-fixture-${++n}`, latitude: 49.9 + n / 1000, longitude: -119.4, ...o });
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { now: NOW, lang });
const visit = (v, info) => {
  const r = app.guardedVisitInfoUpdate(v.id, null, { source_url: 'https://www.example.com/visit', checked_at: '2026-11-01', ...info }, meta);
  assert.equal(r.ok, true, JSON.stringify(r));
};
const layoutOf = (html) => { const i = html.indexOf('<div id="klLayout"'); return i < 0 ? '' : html.slice(i, html.indexOf('<footer', i) < 0 ? undefined : html.indexOf('<footer', i)); };
const anchors = (html) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ attrs: m[1], href: (/href="([^"]*)"/.exec(m[1]) || [])[1], text: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() }))
  .filter((a) => a.href !== undefined);
const tabs = (html) => [...((/<nav class="kl-nav"[^>]*>([\s\S]*?)<\/nav>/.exec(html) || [])[1] || '').matchAll(/<a href="#([^"]+)">([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);

const trail = mk({ name: 'Ridge Lookout Trail', slug: 'ridge-lookout-trail', hours: open('06:00', '21:00'), phone: '+12505550123', website: 'https://www.example-parks.example/ridge',
  address: 'Ridge Road, Kelowna, BC', image_url: '/images/outdoors/outdoors.jpg', free_entry: 1, dog_friendly: 1,
  description: 'A steady climb through pine forest to a lookout over the lake. It is popular at sunrise. Wear sturdy shoes for the loose rock near the top.' });
app.OUTDOOR_FACTS[String(trail.id)] = { checked_at: 'Nov 2, 2026', source_url: 'https://bcparks.ca/ridge/', alerts: 'Trail closed past the second bridge until further notice',
  cost: 'Free', time_needed: '1.5 to 2 hours', season: 'Open year-round', dogs: 'Dogs must be on a leash', parking: 'Gravel lot at the end of Ridge Road, about 40 spots',
  washrooms: 'Pit toilets at the trailhead', accessibility: 'Steep, uneven trail; not wheelchair accessible', extras: [{ label: 'Wildlife', text: 'Rattlesnakes and bears live here' }] };
visit(trail, { rows: [{ label: 'The hike', text: '5.2 km return, 340 m climb, moderate, about 2 hours' }] });
const bare = mk({ name: 'Quiet Cove Viewpoint', slug: 'quiet-cove', description: 'A small roadside viewpoint.' });
const skate = mk({ type: 'sport', region: 'vernon', name: 'Downtown Skate Park', slug: 'downtown-skate-park', hours: open('07:00', '22:00'), website: 'https://www.example-city.example/skate',
  address: '12 Main Street, Vernon, BC', image_url: '/images/sports/sports.jpg', free_entry: 1, phone: '+12505550177',
  description: 'A concrete skate park with a bowl, rails and a street section. Lit until 10 pm. Helmets recommended.' });
const courts = mk({ type: 'sport', name: 'Courts At Dilworth', slug: 'dilworth-courts', description: 'Outdoor tennis and pickleball courts.' });
const kalamalka = mk({ region: 'coldstream', slug: 'kalamalka-lake-provincial-park-trails-rattlesnake-point', name: 'Kalamalka Lake Provincial Park Trails & Rattlesnake Point',
  website: 'https://bcparks.ca/kalamalka-lake-park/', address: 'Kidston Road, Coldstream, BC', image_url: '/images/outdoors/outdoors.jpg', free_entry: 1, description: 'Grassland and forest trails above the lake.' });

test('an Outdoors page uses the shared layout, built from its own facts', () => {
  const html = page(trail);
  assert.match(html, /<body[^>]*outdoor-venue-page/);
  assert.match(html, /href="\/outdoor-venue\.css\?v=[0-9a-f]{12}"/);
  const body = layoutOf(html);
  assert.deepEqual(tabs(body).map((t) => t[1]), ['Overview', 'About', 'Before you go', 'Getting there', 'Hours']);
  for (const [id] of tabs(body)) assert.ok(html.includes(`id="${id}"`), `tab target #${id} exists`);
  assert.match(body, /Trail closed past the second bridge/); // the "Heads up" fact is the notice
  assert.match(body, /<strong>Free<\/strong><small>To visit<\/small>/);
  assert.match(body, /<strong>1\.5 to 2 hours<\/strong><small>Time to allow<\/small>/);
  assert.match(body, /Gravel lot at the end of Ridge Road/); // parking sits in Getting there, not Before you go
  const before = /id="klBefore"[\s\S]*?<\/section>/.exec(body)[0];
  assert.match(before, /Washrooms/); assert.match(before, /Wildlife/); assert.doesNotMatch(before, /Gravel lot/);
  assert.doesNotMatch(before, /1\.5 to 2 hours/, 'a fact shown as a tile is not repeated');
  assert.match(body, /Ridge Road, Kelowna, BC/); // the address and phone still show
  assert.match(body, /href="tel:\+12505550123"/);
});

test('the first button is Directions; Favorite and Add to trip say what they do', () => {
  const body = layoutOf(page(trail));
  const primary = /<div class="kl-primary">([\s\S]*?)<\/div>/.exec(body)[1];
  const first = anchors(primary)[0];
  assert.match(first.text, /Get Directions|Open in Google Maps/);
  assert.match(body, /Favorite saves this place for later\. Add to trip puts it on your trip list\./);
  assert.match(body, /class="kl-save"[^>]*data-venue-id="\d+"/);
});

test('a Sports & Recreation page uses the same layout', () => {
  const body = layoutOf(page(skate));
  assert.match(body, /🏅 Sports &amp; Recreation · <a href="\/vernon">Vernon<\/a>/);
  assert.deepEqual(tabs(body).map((t) => t[1]), ['Overview', 'About', 'Getting there', 'Hours']);
  assert.match(body, /A concrete skate park with a bowl/);
  assert.match(body, /href="\/vernon\/sports"/); // the nearby heading's link goes to the category page
});

test('a place with almost nothing recorded shows only what it has, and invents nothing', () => {
  for (const v of [bare, courts]) {
    const html = page(v);
    const body = layoutOf(html);
    assert.deepEqual(tabs(body).map((t) => t[1]), ['Overview', 'About', 'Getting there']);
    assert.doesNotMatch(body, /id="klBefore"/);
    assert.doesNotMatch(body, /kl-quick|kl-notice|Hours/);
    assert.match(html, /<body[^>]*outdoor-no-photo/);
    assert.doesNotMatch(html, /<h1 class="venue-mobile-title"/, 'the banner that takes the photo\'s place already carries the name');
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, 'the banner that takes the photo\'s place carries the only h1');
  }
});

test('only the Kalamalka page has the mapped route and the two parking entrances', () => {
  const k = page(kalamalka);
  assert.match(k, /id="klParking"/);
  assert.match(k, /About 2\.5 km return/);
  assert.match(k, /Directions to Twin Bays parking/);
  assert.match(k, /Directions to Cosens Bay parking/);
  assert.match(k, /<body[^>]*kalamalka-page/);
  for (const v of [trail, bare, skate, courts]) {
    const html = layoutOf(page(v));
    assert.doesNotMatch(html, /Twin Bays|Cosens Bay|Rattlesnake Point|2\.5 km/);
    assert.doesNotMatch(page(v), /kalamalka-page/);
  }
});

test('French pages, and a redirected listing, keep their own layout', () => {
  assert.doesNotMatch(page(trail, 'fr'), /id="klLayout"/);
  const redirected = { ...app.getVenue(trail.id), redirect_to: bare.id };
  assert.doesNotMatch(app.renderVenuePage(redirected, [], [], [], { now: NOW }), /id="klLayout"/);
});

test('every clickable link goes where its words say', () => {
  for (const v of [trail, skate, bare]) {
    const html = page(v);
    const body = layoutOf(html);
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const a of anchors(body)) {
      if (a.href.startsWith('#')) assert.ok(ids.has(a.href.slice(1)), `${a.text} -> ${a.href}: nothing on the page has that id`);
      else if (/^https?:\/\//.test(a.href)) assert.match(a.attrs, /rel="[^"]*noopener/, `${a.text} -> ${a.href} opens elsewhere without noopener`);
    }
    // Website is the place's own website; Call is its own phone.
    const web = anchors(body).find((a) => /^Website/.test(a.text));
    if (v.website) assert.equal(web && web.href, v.website); else assert.equal(web, undefined);
    const call = anchors(body).find((a) => a.text === 'Call');
    if (v.phone) assert.equal(call && call.href, `tel:${v.phone}`); else assert.equal(call, undefined);
  }
});
