// SEO r13 (2026-10-20): after Google impressions fell 96% on Oct 11 (most likely the September 2026 spam update, "scaled
// content"), the site Google sees is shrunk further and wrong structured data is removed: thin town beaches / outdoors /
// tours pages and thin place pages are noindex and out of the sitemap (with a parity check between the two), SoldOut
// only for present-tense wording, no hall / arena / park / beach as an event's fallback organizer, the more specific
// "X at Y" listing for an event, no utm_* tags in JSON-LD links and one-line event meta descriptions.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);

const app = require('../server.js');
const db = require('../db.js');

const insertVenue = db.prepare(`
  INSERT INTO venues (name, region, type, description, address, latitude, longitude, slug, website, hours)
  VALUES (@name, @region, @type, @description, @address, @lat, @lng, @slug, @website, @hours)
`);
const WEEK = JSON.stringify({ mon: [['11:00', '21:00']], tue: [['11:00', '21:00']], wed: [['11:00', '21:00']], thu: [['11:00', '21:00']], fri: [['11:00', '22:00']], sat: [['11:00', '22:00']], sun: [['11:00', '20:00']] });
const LONG = 'A fixture place used only by the SEO round 13 tests, with a description long enough to count as a real page: '
  + 'it says what the place is, what to expect when you arrive, the views, the food, the parking, the seasons, the crowds, '
  + 'and when to go so that a visitor gets something useful out of the page.';
const slugOf = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const venueId = (o) => Number(insertVenue.run({
  type: 'restaurant', description: LONG, address: '1 Test St', lat: 49.5, lng: -119.6, website: null, hours: WEEK, slug: slugOf(o.name), ...o,
}).lastInsertRowid);
const meta = { reason: 'seo r13 fixture', batch_id: 'test-seo-r13' };

// Town section pages: 2 beaches (thin) vs 3 beaches; 1 outdoor (thin) vs 3; tours 1 (thin) vs 1 tour + 2 tours_also (3).
for (const n of ['Thin Beach One', 'Thin Beach Two']) venueId({ name: `R13 ${n}`, region: 'kaleden', type: 'beach' });
for (const n of ['Full Beach One', 'Full Beach Two', 'Full Beach Three']) venueId({ name: `R13 ${n}`, region: 'peachland', type: 'beach' });
venueId({ name: 'R13 Thin Park', region: 'armstrong', type: 'outdoor' });
for (const n of ['Park One', 'Park Two', 'Park Three']) venueId({ name: `R13 ${n}`, region: 'summerland', type: 'outdoor' });
venueId({ name: 'R13 Thin Tour', region: 'coldstream', type: 'tour' });
venueId({ name: 'R13 Full Tour', region: 'naramata', type: 'tour' });
for (const n of ['Also Outfitter One', 'Also Outfitter Two']) {
  const id = venueId({ name: `R13 ${n}`, region: 'naramata', type: 'outdoor' });
  assert.equal(app.guardedCollectionMembershipUpdate('tours_also', id, 'add', 'Guided rides', meta).ok, true);
}
for (const n of ['Cafe One', 'Cafe Two']) venueId({ name: `R13 ${n}`, region: 'lumby', type: 'cafe' });

// Thin place pages: no hours + a short description + no owner content.
const thinShort = venueId({ name: 'R13 Thin Short Place', region: 'oliver', type: 'winery', hours: null, description: 'A small winery.' });
const thinEmptyHours = venueId({ name: 'R13 Thin Empty Hours', region: 'oliver', type: 'cafe', hours: '{}', description: 'Coffee and cake.' });
const withHours = venueId({ name: 'R13 Short With Hours', region: 'oliver', type: 'cafe', description: 'Coffee and cake.' });
const longNoHours = venueId({ name: 'R13 Long No Hours', region: 'oliver', type: 'restaurant', hours: null });
const ownerPhoto = venueId({ name: 'R13 Owner Photo Place', region: 'oliver', type: 'pub', hours: null, description: 'A pub.' });
db.prepare(`INSERT INTO owner_photos (venue_id, file, preview_key, credit, rights_confirmed_at, status) VALUES (?, 'r13-owner.jpg', 'r13-preview', 'Owner', '2026-10-19', 'approved')`).run(ownerPhoto);
const ownerPending = venueId({ name: 'R13 Pending Photo Place', region: 'oliver', type: 'pub', hours: null, description: 'A pub.' });
db.prepare(`INSERT INTO owner_photos (venue_id, file, preview_key, credit, rights_confirmed_at, status) VALUES (?, 'r13-pending.jpg', 'r13-pending', 'Owner', '2026-10-19', 'pending')`).run(ownerPending);

// Events.
const hester = venueId({ name: 'Hester Creek Estate Winery', region: 'oliver', type: 'winery', website: 'https://hester.example.com/' });
const terrafina = venueId({ name: 'Terrafina at Hester Creek', region: 'oliver', type: 'restaurant' });
const arena = venueId({ name: 'R13 Rutland Arena', region: 'kelowna', type: 'sport', website: 'https://arena.example.com/' });
const beach = venueId({ name: 'R13 Skaha Beach', region: 'penticton', type: 'beach' });
const sociale = venueId({ name: 'R13 Sociale', region: 'kelowna', type: 'restaurant', website: 'https://sociale.example.com/?UTM_SOURCE=GMB_listing&utm_medium=organic&menu=1' });
const today = app.todayLocal();
const day = (n) => app.addLocalDays(today, n);
function mkEvent(over) {
  const r = app.createEvent({
    region: 'kelowna', description: 'R13 fixture description. Tickets are $20.', source_type: 'tourism_org', source_name: 'Tourism Fixture',
    source_url: `https://example.com/r13/${app.slugify(over.name)}`, categories: ['live-music'],
    occurrences: [{ start_date: day(3), start_time: '19:00', end_time: '21:00' }], ...over,
  }, meta);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.event;
}
const evTerrafina = mkEvent({ name: 'You Be The Judge: Pasta Edition at Terrafina', region: 'oliver', venue_name_text: 'Hester Creek Estate Winery, 877 Road 8, Oliver' });
const evHester = mkEvent({ name: 'R13 Harvest Dinner', region: 'oliver', venue_name_text: 'Hester Creek Estate Winery, 877 Road 8, Oliver' });
const evChiefs = mkEvent({ name: 'Kelowna Chiefs vs Fixture Thunder', venue_name_text: 'R13 Rutland Arena' });
const evTri = mkEvent({ name: 'R13 Ogopogo Triathlon', region: 'penticton', venue_name_text: 'R13 Skaha Beach' });
const evSociale = mkEvent({ name: 'R13 Sociale Wine Dinner', venue_name_text: 'R13 Sociale', description: 'A five-course dinner.\n\nTickets are $119.95.\n  Seats are limited.' });

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
const get = async (p) => { const r = await fetch(base + p, { redirect: 'manual' }); return { status: r.status, text: await r.text(), robots: r.headers.get('x-robots-tag') || '' }; };
const isNoindex = (r) => /<meta name="robots" content="[^"]*noindex/.test(r.text.split('</head>')[0]) || /noindex/.test(r.robots);
const sitemapPaths = async () => new Set([...(await get('/sitemap.xml')).text.matchAll(/<loc>https:\/\/okanaganroam\.com([^<]*)<\/loc>/g)].map((m) => m[1]));
const eventLd = (html) => {
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const j = JSON.parse(m[1]);
    for (const x of [].concat(j['@graph'] || j)) if (/Event$/.test(x['@type'] || '')) return x;
  }
  return null;
};

test('SEO r13: thin town beaches / outdoors / tours pages (1-2 places) are noindex and out of the sitemap', async () => {
  const sm = await sitemapPaths();
  for (const p of ['/kaleden/beaches', '/armstrong/outdoors', '/coldstream/tours', '/lumby/cafes']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.ok(isNoindex(r), `${p} is noindex`);
    assert.ok(!sm.has(p), `${p} is not in the sitemap`);
  }
  for (const p of ['/peachland/beaches', '/summerland/outdoors', '/naramata/tours']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.ok(!isNoindex(r), `${p} is indexable`);
    assert.ok(sm.has(p), `${p} is in the sitemap (tours_also operators count, as on the page)`);
  }
});

test('SEO r13: every sampled page that is indexable is in the sitemap, and every sampled sitemap URL is indexable', async () => {
  const sm = await sitemapPaths();
  const slugs = ['restaurants', 'wineries', 'cafes', 'breweries', 'pubs', 'cocktail-lounges', 'distilleries', 'golf', 'beaches', 'outdoors', 'indoor', 'tours', 'sports'];
  const regions = ['kelowna', 'oliver', 'peachland', 'summerland', 'naramata', 'kaleden', 'armstrong', 'coldstream', 'lumby', 'penticton'];
  // Templates: town pages, town x category pages, badge guides, place pages and event pages (the valley-wide hubs are
  // listed by hand and depend on live inventory a throwaway database does not have).
  const isTemplate = (p) => /^\/[a-z-]+(?:\/[a-z-]+(?:\/[a-z0-9-]+)?)?$/.test(p) && (p.split('/').length > 2 || regions.includes(p.slice(1))) && !/^\/(?:guides|fr|whats-on|outdoors|tours|indoor|sports|golf|beaches|food-drink)(?:\/|$)/.test(p);
  const paths = new Set([...regions.map((r) => `/${r}`), ...regions.flatMap((r) => slugs.map((s) => `/${r}/${s}`)), ...[...sm].filter(isTemplate)]);
  paths.add(`/oliver/events/${evTerrafina.slug}`);
  const problems = [];
  let checked = 0;
  for (const p of paths) {
    const r = await get(p);
    if (r.status !== 200) { if (sm.has(p)) problems.push(`${p}: in the sitemap but ${r.status}`); continue; }
    checked += 1;
    const noindex = isNoindex(r);
    if (!noindex && !sm.has(p)) problems.push(`${p}: indexable but not in the sitemap`);
    if (noindex && sm.has(p)) problems.push(`${p}: noindex but in the sitemap`);
  }
  assert.ok(checked > 40, `checked ${checked} pages`);
  assert.deepEqual(problems, []);
});

test('SEO r13: a place page with no hours, a short description and no owner content is noindex and out of the sitemap', async () => {
  const v = (id) => app.getVenue(id);
  assert.equal(app.MIN_INDEXABLE_VENUE_DESC_WORDS, 45);
  assert.equal(app.venuePageIsThin(v(thinShort)), true);
  assert.equal(app.venuePageIsThin(v(thinEmptyHours)), true, '{} is no hours');
  assert.equal(app.venuePageIsThin(v(withHours)), false, 'stored hours');
  assert.equal(app.venuePageIsThin(v(longNoHours)), false, 'a long description');
  assert.equal(app.venuePageIsThin(v(ownerPhoto)), false, 'an approved owner photo');
  assert.equal(app.venuePageIsThin(v(ownerPending)), true, 'a pending photo is not owner content yet');
  assert.equal(app.venueHasStoredHours(JSON.stringify({ mon: [], tue: [] })), false);
  const sm = await sitemapPaths();
  const thin = await get('/oliver/wineries/r13-thin-short-place');
  assert.equal(thin.status, 200, 'still shown to visitors');
  assert.ok(isNoindex(thin));
  assert.ok(!sm.has('/oliver/wineries/r13-thin-short-place'));
  const rich = await get('/oliver/cafes/r13-short-with-hours');
  assert.ok(!isNoindex(rich));
  assert.ok(sm.has('/oliver/cafes/r13-short-with-hours'));
  // Town pages still link the thin place.
  assert.ok((await get('/oliver/wineries')).text.includes('/oliver/wineries/r13-thin-short-place'));
  // It gains hours: indexable again at once.
  db.prepare('UPDATE venues SET hours = ? WHERE id = ?').run(WEEK, thinShort);
  assert.ok(!isNoindex(await get('/oliver/wineries/r13-thin-short-place')));
  assert.ok((await sitemapPaths()).has('/oliver/wineries/r13-thin-short-place'));
});

test('SEO r13: SoldOut only for present-tense wording about this event', () => {
  const so = (description, extra = {}) => app.eventIsSoldOut({ description, ...extra });
  // Murder in the Vineyard, as on the live site.
  assert.equal(so("Tickets were $30 plus tax with an engraved wine glass, and this year's event is sold out; email River Stone to join the waitlist."), true);
  for (const t of ['This show is sold out.', 'Tickets are now sold out!', '*SOLD OUT*', 'Sold out; join the waitlist.', 'SOLD OUT! Waitlist only.', "It's sold out."]) assert.equal(so(t), true, t);
  assert.equal(so('A dinner.', { price_text: 'Sold out' }), true);
  for (const t of [
    'Expect sharp observational humour and storytelling, fresh from a sold-out Edinburgh Fringe run. Tickets are $67.62.',
    'The show has played sold-out houses across British Columbia. Tickets are $62.50.',
    'Tickets are $30; it has sold out before, so buying early is wise.',
    'These monthly Thursday shows have sold out for five years.',
    "Robert Fine returns after last year's sold-out show with new songs.",
    'He sold out tours across Canada.',
    'Sold out before, so book early.',
    'The event is not sold out yet.',
  ]) assert.equal(so(t), false, t);
});

test('SEO r13: no arena, park, beach or theatre as the fallback organizer; a food or drink host still is', async () => {
  const org = (ev, host) => app.eventOrganizerSchema({ name: 'Show', description: '', source_type: 'tourism_org', source_name: 'Tourism Fixture', ...ev }, host);
  for (const host of [
    { name: 'Rutland Arena', type: 'sport', region: 'kelowna', slug: 'rutland-arena' },
    { name: 'Skaha Beach', type: 'beach', region: 'penticton', slug: 'skaha-beach' },
    { name: 'Kalamalka Lake Provincial Park', type: 'outdoor', region: 'coldstream', slug: 'kal-park' },
    { name: 'Vernon & District Performing Arts Centre', type: 'indoor', region: 'vernon', slug: 'vdpac' },
    { name: 'Powerhouse Theatre', type: 'indoor', region: 'vernon', slug: 'powerhouse-theatre' },
    { name: 'Fixture Golf Club', type: 'golf', region: 'vernon', slug: 'fixture-golf' },
    { name: 'Fixture Community Centre', type: 'sport', region: 'vernon', slug: 'fixture-cc' },
  ]) assert.equal(org({}, host), undefined, host.name);
  assert.equal(org({}, { name: 'Fixture Winery', type: 'winery', region: 'oliver', slug: 'fixture-winery', website: 'https://w.example/' }).name, 'Fixture Winery');
  assert.equal(org({ name: 'Kelvern Celtic Society presents Tulua' }, { name: 'Fixture Theatre', type: 'indoor', region: 'vernon', slug: 'ft' }).name, 'Kelvern Celtic Society', 'a named presenter is kept');
  assert.equal(org({ source_type: 'official_organizer', source_name: 'Penticton Triathlon Club' }, { name: 'Skaha Beach', type: 'beach', region: 'penticton', slug: 'sb' }).name, 'Penticton Triathlon Club');
  const chiefs = eventLd((await get(`/kelowna/events/${evChiefs.slug}`)).text);
  assert.equal(chiefs.location.name, 'R13 Rutland Arena');
  assert.equal(chiefs.organizer, undefined);
  const tri = eventLd((await get(`/penticton/events/${evTri.slug}`)).text);
  assert.equal(tri.organizer, undefined);
});

test('SEO r13: an event links to the more specific "X at Y" listing its name names (Terrafina at Hester Creek)', async () => {
  assert.equal(app.eventLinkedVenueId(app.getEventById(evTerrafina.id)), terrafina);
  assert.equal(app.eventLinkedVenueId(app.getEventById(evHester.id)), hester, 'an event that does not name Terrafina stays at the winery');
  const ld = eventLd((await get(`/oliver/events/${evTerrafina.slug}`)).text);
  assert.equal(ld.location.name, 'Terrafina at Hester Creek');
  // Generic inside names never count on their own.
  const inside = [{ id: 9, len: 30, full: 'restaurant at poplar grove', place: 'restaurant', host: 'poplar grove' }];
  assert.equal(app.eventMoreSpecificListing(1, 'poplar grove winery', inside, 'Dinner with restaurant pairings, Poplar Grove Winery'), 1);
  assert.equal(app.eventMoreSpecificListing(1, 'poplar grove winery', inside, 'Dinner at The Restaurant at Poplar Grove'), 9);
  // A place inside another host does not count.
  assert.equal(app.eventMoreSpecificListing(1, 'hester creek estate winery', [{ id: 5, len: 20, full: 'terrafina at elsewhere', place: 'terrafina', host: 'elsewhere' }], 'Pasta at Terrafina'), 1);
});

test('SEO r13: utm_* tags are dropped from JSON-LD links; event meta descriptions are one line', async () => {
  assert.equal(app.stripUtmParams('https://sociale.example.com/?UTM_SOURCE=GMB_listing'), 'https://sociale.example.com/');
  assert.equal(app.stripUtmParams('https://x.example/e?utm_source=a&id=4&utm_campaign=b#t'), 'https://x.example/e?id=4#t');
  assert.equal(app.stripUtmParams('https://x.example/e?id=4'), 'https://x.example/e?id=4');
  const r = await get(`/kelowna/events/${evSociale.slug}`);
  const ld = eventLd(r.text);
  assert.equal(ld.organizer.name, 'R13 Sociale');
  assert.equal(ld.organizer.url, 'https://sociale.example.com/?menu=1');
  assert.doesNotMatch(JSON.stringify(ld), /utm_/i);
  const metaDesc = /<meta name="description" content="([^"]*)"/.exec(r.text)[1];
  assert.doesNotMatch(metaDesc, /\n|\s{2}/);
  assert.match(metaDesc, /^A five-course dinner\. Tickets are \$119\.95\. Seats are limited\.$/);
  const og = /<meta property="og:description" content="([^"]*)"/.exec(r.text)[1];
  assert.doesNotMatch(og, /\n/);
  assert.equal(sociale > 0 && arena > 0 && beach > 0, true);
});
