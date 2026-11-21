// Sport tests 8 and 9 (2026-11-21): Marg's Lumby Golf Club (a 9-hole walk-on course with disc golf as her second kind)
// and Gord's Summerland Golf & Country Club (18 holes, semi-private, prices on his website) as they left them
// (drafts/fresh-eyes-sport8-2026-11-21 and -sport9-2026-11-21/final-state.json, trimmed into tests/fixtures/), plus the
// neighbours their searches and plans met: unverified courses in the same towns, a Lumby skate park and trail, Vernon and
// Penticton courses, a Penticton happy hour. Writes straight to the (throwaway) database.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const L = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sport8-lumby.json'), 'utf8'));
const S = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sport9-summerland.json'), 'utf8'));
const WK = (o, c) => JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[o, c]]])));
let k = 0;
function place(app, db, F, o = {}) {
  const v = app.createVenue({ ...F.venue, slug: o.slug || F.venue.slug, ...(o.venue || {}) });
  db.prepare("UPDATE venues SET hours_source = 'venue_owner' WHERE id = ?").run(v.id);
  const ln = F.links || {};
  db.prepare('INSERT INTO venue_links (venue_id, booking_url, menu_url, instagram_url, facebook_url, open_months) VALUES (?, ?, ?, ?, ?, ?)').run(v.id, ln.booking_url || null, ln.menu_url || null, ln.instagram_url || null, ln.facebook_url || null, ln.open_months || null);
  db.prepare('INSERT INTO venue_hours_extra (venue_id, seasons, closures) VALUES (?, ?, ?)').run(v.id, (F.hours_extra || {}).seasons || null, (F.hours_extra || {}).closures || null);
  const info = JSON.parse(JSON.stringify(F.visit_info));
  if (o.lines) for (const [label, text] of Object.entries(o.lines)) { const r = info.rows.find((x) => x.label === label); if (r) r.text = text; else info.rows.push({ label, text }); if (!info.owner_labels.includes(label)) info.owner_labels.push(label); }
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify(info));
  db.prepare('INSERT INTO venue_sport_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify(F.sport_info));
  db.prepare('INSERT INTO venue_owner_features (venue_id, features) VALUES (?, ?)').run(v.id, JSON.stringify(F.owner_features || {}));
  for (const it of F.not_offered || []) db.prepare('INSERT INTO venue_not_offered (venue_id, item) VALUES (?, ?)').run(v.id, it);
  if (F.menu) db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')").run(v.id, JSON.stringify(F.menu));
  for (const c of ['clearVenueCaches', 'clearHoursExtraCache', 'clearVenueIndoorInfoCache', 'clearVenueOwnerFeaturesCache']) if (app[c]) app[c]();
  if (app.indoorCardPrice) app.indoorCardPrice(v.id);
  return app.getVenue(v.id);
}
function lumby(app, db, o) { return place(app, db, L, o); }
function summerland(app, db, o) { return place(app, db, S, o); }
function neighbours(app, db) {
  const mk = (o) => app.createVenue({ rating: 4.5, reviews: 200, description_fr: 'Un lieu de test.', website: `https://nb${++k}.example.com/`, address: `${k} Main St`, ...o, slug: `${o.slug}-${k}` });
  return {
    coldstream: mk({ name: 'Coldstream Golf Course Fixture', slug: 'coldstream-gc-fixture', region: 'lumby', type: 'golf', hours: null, rating: 4.7, reviews: 400, latitude: 50.2328, longitude: -119.0091,
      description: 'A family-run 9-hole, par-36 course near Lumby, with a driving range and rental buckets.' }),
    skate: mk({ name: 'Lumby Skate Park Fixture', slug: 'lumby-skate-fixture', region: 'lumby', type: 'sport', hours: null, latitude: 50.2507, longitude: -118.9643,
      description: 'A concrete skate park in Oval Park with a bowl, rails and ledges.' }),
    trail: mk({ name: 'Lumby Valley Trail Fixture', slug: 'lumby-trail-fixture', region: 'lumby', type: 'outdoor', hours: null, latitude: 50.255, longitude: -118.97,
      description: 'An easy walking trail along the creek, good for hiking and dogs on a leash.' }),
    hillview: mk({ name: 'Hillview Golf Course Fixture', slug: 'hillview-gc-fixture', region: 'vernon', type: 'golf', hours: WK('07:00', '19:00'), latitude: 50.2506, longitude: -119.2425,
      description: 'A public 18-hole executive golf course in Vernon with ponds.' }),
    vtrail: mk({ name: 'Vernon Hiking Trail Fixture', slug: 'vernon-hike-fixture', region: 'vernon', type: 'outdoor', hours: null, latitude: 50.26, longitude: -119.27,
      description: 'A walk on the hill above Vernon: hiking trails with views.' }),
    vcafe: mk({ name: 'Vernon Cafe Fixture', slug: 'vernon-cafe-fixture', region: 'vernon', type: 'cafe', cuisine: 'Coffee', hours: WK('07:00', '17:00'), latitude: 50.267, longitude: -119.272,
      description: 'A coffee shop downtown.' }),
    sumac: mk({ name: 'Sumac Ridge Golf Fixture', slug: 'sumac-ridge-fixture', region: 'summerland', type: 'golf', hours: null, rating: 4.6, reviews: 300, latitude: 49.6383, longitude: -119.6503,
      description: 'A 9-hole par 28 golf course in Summerland with lessons and a restaurant.' }),
    pgolf: mk({ name: 'Penticton Golf Fixture', slug: 'penticton-golf-fixture', region: 'penticton', type: 'golf', hours: WK('07:00', '19:00'), latitude: 49.49, longitude: -119.59,
      description: 'An 18-hole golf course in Penticton.' }),
    phh: mk({ name: 'Penticton Taproom Fixture', slug: 'penticton-tap-fixture', region: 'penticton', type: 'brewery', hours: WK('12:00', '22:00'), latitude: 49.495, longitude: -119.59, happy_hour: 1,
      happy_hour_times: JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['15:00', '18:00']]]))), description: 'A taproom with happy hour every day.' }),
  };
}
// The rest of Lumby that test 8's "weekend in Lumby" plan used (trails, a museum, places to eat).
function lumbyTown(app) {
  const mk = (o) => app.createVenue({ region: 'lumby', rating: 4.5, reviews: 150, description_fr: 'Un lieu de test.', address: `${++k} Vernon St, Lumby`, ...o, slug: `${o.slug}-${k}` });
  return [
    mk({ name: 'Echo Lake Park Fixture', slug: 'echo-lake-fixture', type: 'outdoor', hours: null, latitude: 50.2, longitude: -118.7, description: 'A provincial park on a lake with a beach, picnic tables and an easy walk.' }),
    mk({ name: 'Pagoda Inn Fixture', slug: 'pagoda-fixture', type: 'restaurant', cuisine: 'Chinese', hours: null, latitude: 50.2495, longitude: -118.966, description: 'A family Chinese restaurant.' }),
    mk({ name: 'Lumby Museum Fixture', slug: 'lumby-museum-fixture', type: 'indoor', hours: null, latitude: 50.2499, longitude: -118.965, description: 'The district museum: local history.' }),
    mk({ name: 'Lumby Salmon Trail Fixture', slug: 'salmon-trail-fixture', type: 'outdoor', hours: null, latitude: 50.2502, longitude: -118.968, description: 'An easy walking trail along Duteau Creek.' }),
    mk({ name: 'Yuki Sushi Fixture', slug: 'yuki-fixture', type: 'restaurant', cuisine: 'Japanese', hours: null, rating: 4.8, latitude: 50.2497, longitude: -118.9655, description: 'Sushi in the village.' }),
    mk({ name: 'Twin Lakes Trail Fixture', slug: 'twin-lakes-fixture', type: 'outdoor', hours: null, latitude: 50.3, longitude: -118.8, description: 'A mountain trail to two lakes in the Monashees.' }),
    mk({ name: 'Idas Bakery Fixture', slug: 'idas-fixture', type: 'cafe', cuisine: 'Bakery', hours: null, rating: 4.7, latitude: 50.2496, longitude: -118.9658, description: 'A bakery and deli.' }),
    mk({ name: 'Sisters Restaurant Fixture', slug: 'sisters-fixture', type: 'restaurant', cuisine: 'Canadian', hours: null, latitude: 50.2494, longitude: -118.9662, patio: 1, description: 'A family restaurant with a patio.' }),
  ];
}
module.exports = { lumby, summerland, neighbours, lumbyTown, L, S };
