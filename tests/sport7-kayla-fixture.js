// Sport test 7 (2026-11-20): Kayla's Predator Course as she left it (drafts/fresh-eyes-sport7-2026-11-20/final-state.json,
// trimmed into tests/fixtures/sport7-kayla.json), plus a few Vernon neighbours: two simulators, a public course, a
// winter-only sim lounge and a restaurant 13 km away. Writes straight to the (throwaway) database.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const K = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sport7-kayla.json'), 'utf8'));
const WK = (o, c) => JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[o, c]]])));
function kayla(app, db, o = {}) {
  const v = app.createVenue({ ...K.venue, ...o });
  db.prepare('UPDATE venues SET happy_hour_times = ?, happy_hour_deals = ?, happy_hour_deals_checked_at = ?, happy_hour_source = ?, happy_hour_deals_source = ?, hours_source = ? WHERE id = ?')
    .run(K.venue.happy_hour_times, K.venue.happy_hour_deals, o.hhChecked || '2026-11-20', 'venue_owner', 'venue_owner', 'venue_owner', v.id);
  db.prepare('INSERT INTO venue_links (venue_id, booking_url, instagram_url, facebook_url, open_months) VALUES (?, ?, ?, ?, ?)').run(v.id, K.links.booking_url, K.links.instagram_url, K.links.facebook_url, K.links.open_months);
  db.prepare('INSERT INTO venue_hours_extra (venue_id, seasons, closures) VALUES (?, ?, ?)').run(v.id, K.hours_extra.seasons, K.hours_extra.closures);
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify(o.visitInfo || K.visit_info));
  db.prepare('INSERT INTO venue_sport_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify({ ...K.sport_info, ...(o.sportInfo || {}) }));
  if (!o.noMenu) db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')").run(v.id, JSON.stringify(o.menu || K.menu));
  db.prepare('INSERT INTO venue_owner_features (venue_id, features) VALUES (?, ?)').run(v.id, JSON.stringify(K.owner_features));
  if (app.clearVenueCaches) app.clearVenueCaches();
  if (app.clearHoursExtraCache) app.clearHoursExtraCache();
  if (app.indoorCardPrice) app.indoorCardPrice(v.id);
  return app.getVenue(v.id);
}
let nb = 0;
function neighbours(app, db) {
  const mk = (o) => app.createVenue({ region: 'vernon', rating: 4.5, reviews: 200, hours: WK('09:00', '21:00'), description: 'A Vernon fixture.', description_fr: 'Un lieu de test à Vernon.', website: `https://n${++nb}.example.com/`, address: `${nb} 30th Ave, Vernon, BC`, ...o, slug: `${o.slug}-${nb}` });
  return {
    sim1: mk({ name: 'Back Nine Indoor Golf Fixture', slug: 'back-nine-fixture', type: 'golf', cuisine: 'Golf simulator', description: 'Indoor golf simulators with TrackMan bays, open all year. Golf lessons, junior golf camps and clinics with a PGA pro.', latitude: 50.267, longitude: -119.272 }),
    sim2: mk({ name: 'Dantes Golf Lounge Fixture', slug: 'dantes-fixture', type: 'golf', cuisine: 'Golf simulator', description: 'A golf lounge with simulators and a bar.', latitude: 50.268, longitude: -119.271 }),
    hill: mk({ name: 'Hillview Golf Course Fixture', slug: 'hillview-fixture', type: 'golf', cuisine: 'Golf course', description: 'A public 18-hole golf course in the hills above Vernon.', latitude: 50.25, longitude: -119.23, hours: WK('07:00', '19:00') }),
    browns: mk({ name: 'Browns Socialhouse Fixture', slug: 'browns-fixture', type: 'restaurant', cuisine: 'Canadian', patio: 1, description: 'A casual restaurant with a patio.', latitude: 50.27, longitude: -119.27, hours: WK('11:00', '23:00') }),
  };
}
module.exports = { kayla, neighbours, K };
