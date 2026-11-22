// Sport test 12 (2026-11-21): Rob's Tower Ranch Golf & Country Club in Kelowna (18 holes, no driving range, tee times by
// phone, season Apr 1 – Oct 31, summer hours May – Sep, Carrington's happy hour, a private tournament closure) as he left it
// (drafts/fresh-eyes-sport12-2026-11-21/final-state.json, trimmed into tests/fixtures/sport12-towerranch.json), without the
// age the re-save bug saved for him. The Kelowna golf listings around it as research left them (none set up by an owner),
// plus a few Kelowna wineries and restaurants for the plans (sport 10's set, without research's own Tower Ranch).
// Writes straight to the (throwaway) database.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const H = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sport12-towerranch.json'), 'utf8'));
function towerRanch(app, db) {
  const v = app.createVenue({ ...H.venue });
  db.prepare("UPDATE venues SET hours_source = 'venue_owner', hours_checked_at = date('now'), happy_hour_times = ?, happy_hour_source = 'venue_owner', happy_hour_deals = ?, happy_hour_deals_source = 'venue_owner' WHERE id = ?")
    .run(H.venue.happy_hour_times || null, H.venue.happy_hour_deals || null, v.id);
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
// Their own slugs, so the golf glance data (the published rate windows that give a course "in season" points) attaches
// as on the live site: that is how Kelowna Springs won Rob's time-slot plans.
function neighbours(app) {
  return H.neighbours.map((o) => app.createVenue({ description_fr: 'Un lieu de test.', ...o }));
}
module.exports = { towerRanch, neighbours, H };
