// Sport test 10 (2026-11-21): Lorraine's The Harvest Golf Club in Kelowna (18 holes, a driving range, tee times booked
// ahead, season Mar 19 – Oct 31, high-season hours Apr 30 – Oct 3, a charity tournament closure) as she left it
// (drafts/fresh-eyes-sport10-2026-11-21/final-state.json, trimmed into tests/fixtures/sport10-harvest.json), and the
// Kelowna golf listings around it as research left them on the live site (none set up by an owner), plus a few Kelowna
// wineries and restaurants for the plans. Writes straight to the (throwaway) database.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const H = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sport10-harvest.json'), 'utf8'));
function harvest(app, db) {
  const v = app.createVenue({ ...H.venue });
  db.prepare("UPDATE venues SET hours_source = 'venue_owner', hours_checked_at = date('now') WHERE id = ?").run(v.id);
  const ln = H.links || {};
  db.prepare('INSERT INTO venue_links (venue_id, booking_url, menu_url, instagram_url, facebook_url, open_months) VALUES (?, ?, ?, ?, ?, ?)').run(v.id, ln.booking_url || null, ln.menu_url || null, ln.instagram_url || null, ln.facebook_url || null, ln.open_months || null);
  db.prepare('INSERT INTO venue_hours_extra (venue_id, seasons, closures) VALUES (?, ?, ?)').run(v.id, (H.hours_extra || {}).seasons || null, (H.hours_extra || {}).closures || null);
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify(H.visit_info));
  db.prepare('INSERT INTO venue_sport_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify(H.sport_info));
  db.prepare('INSERT INTO venue_owner_features (venue_id, features) VALUES (?, ?)').run(v.id, JSON.stringify(H.owner_features || {}));
  for (const it of H.not_offered || []) db.prepare('INSERT INTO venue_not_offered (venue_id, item) VALUES (?, ?)').run(v.id, it);
  for (const c of ['clearVenueCaches', 'clearHoursExtraCache', 'clearVenueIndoorInfoCache', 'clearVenueOwnerFeaturesCache']) if (app[c]) app[c]();
  if (app.indoorCardPrice) app.indoorCardPrice(v.id);
  return app.getVenue(v.id);
}
let k = 0;
function neighbours(app) {
  return H.neighbours.map((o) => app.createVenue({ description_fr: 'Un lieu de test.', ...o, slug: `${o.slug}-t10-${++k}` }));
}
module.exports = { harvest, neighbours, H };
