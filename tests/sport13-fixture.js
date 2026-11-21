// Sport test 13 (2026-11-21): Gord and Linda's Twin Lakes Golf Course & RV Park in Kaleden (18 holes, a driving range,
// the Bistro, an RV park with its own season; their season Apr 1 – Oct 15, 8–6 with summer hours 7–8 May–Sep, a typed
// price list from $47, a Sep 13 2027 maintenance closure; Good to know ends "RV park open late April to mid September") as
// they left it (drafts/fresh-eyes-sport13-2026-11-21/final-state.json, trimmed into tests/fixtures/sport13-twinlakes.json),
// with its live slug so the golf glance data attaches. Its neighbours as research left them (none set up by an owner):
// everything in Kaleden (St. Andrews by the Lake and its Painted Turtle Bistro), the golf in Penticton, Summerland, Oliver
// and Okanagan Falls, and some Penticton, Summerland and Okanagan Falls restaurants for the plans.
// Writes straight to the (throwaway) database.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const H = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sport13-twinlakes.json'), 'utf8'));
function twinLakes(app, db, o = {}) {
  const v = app.createVenue({ ...H.venue, ...(o.venue || {}) });
  db.prepare("UPDATE venues SET hours_source = 'venue_owner', hours_checked_at = date('now') WHERE id = ?").run(v.id);
  const ln = H.links || {};
  db.prepare('INSERT INTO venue_links (venue_id, booking_url, facebook_url, open_months) VALUES (?, ?, ?, ?)').run(v.id, ln.booking_url || null, ln.facebook_url || null, ln.open_months || null);
  db.prepare('INSERT INTO venue_hours_extra (venue_id, seasons, closures) VALUES (?, ?, ?)').run(v.id, (H.hours_extra || {}).seasons || null, (H.hours_extra || {}).closures || null);
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify(o.visitInfo || H.visit_info));
  db.prepare('INSERT INTO venue_sport_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify(H.sport_info));
  db.prepare('INSERT INTO venue_owner_features (venue_id, features) VALUES (?, ?)').run(v.id, JSON.stringify(H.owner_features || {}));
  for (const it of H.not_offered || []) db.prepare('INSERT INTO venue_not_offered (venue_id, item) VALUES (?, ?)').run(v.id, it);
  if (o.menu !== false) db.prepare("INSERT INTO venue_menus (venue_id, status, data, submitted_by, submitted_at, published_at, source) VALUES (?, 'published', ?, 'owner-link', datetime('now'), datetime('now'), 'owner')").run(v.id, JSON.stringify(H.menu.data));
  for (const c of ['clearVenueCaches', 'clearHoursExtraCache', 'clearVenueIndoorInfoCache', 'clearVenueOwnerFeaturesCache']) if (app[c]) app[c]();
  if (app.indoorCardPrice) app.indoorCardPrice(v.id);
  return app.getVenue(v.id);
}
function neighbours(app) {
  return H.neighbours.map((o) => app.createVenue({ description_fr: 'Un lieu de test.', ...o }));
}
module.exports = { twinLakes, neighbours, H };
