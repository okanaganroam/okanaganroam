// Sport test 14 (2026-11-21): Marisol's Fairview Mountain Golf Club in Oliver (18 holes, a driving range, a club fitting bay,
// the club's restaurant with its own listing; season Mar 15 – Oct 31 at 7 AM – 8 PM, 8 AM – 6 PM Mar 15 – Apr 30 and in
// October, green fees from $131, rates page linked, Oct 12–13 2027 aeration closure) as she left it
// (drafts/fresh-eyes-sport14-2026-11-21/final-state.json, trimmed into tests/fixtures/sport14-fairview.json), with its live
// slug so the golf glance data attaches. Its neighbours as research left them (none set up by an owner): the golf in
// Oliver, Osoyoos, Penticton, Kaleden and Summerland, Oliver's wineries and restaurants (the club's own restaurant listing
// among them), and some Osoyoos and Okanagan Falls restaurants for the plans. Writes straight to the (throwaway) database.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const H = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sport14-fairview.json'), 'utf8'));
function fairview(app, db, o = {}) {
  const v = app.createVenue({ ...H.venue, ...(o.venue || {}) });
  db.prepare("UPDATE venues SET hours_source = 'venue_owner', hours_checked_at = date('now') WHERE id = ?").run(v.id);
  const ln = { ...H.links, ...(o.links || {}) };
  db.prepare('INSERT INTO venue_links (venue_id, menu_url, booking_url, instagram_url, facebook_url, open_months) VALUES (?, ?, ?, ?, ?, ?)').run(v.id, ln.menu_url || null, ln.booking_url || null, ln.instagram_url || null, ln.facebook_url || null, ln.open_months || null);
  db.prepare('INSERT INTO venue_hours_extra (venue_id, seasons, closures) VALUES (?, ?, ?)').run(v.id, (H.hours_extra || {}).seasons || null, (H.hours_extra || {}).closures || null);
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify(o.visitInfo || H.visit_info));
  db.prepare('INSERT INTO venue_sport_info (venue_id, info) VALUES (?, ?)').run(v.id, JSON.stringify(H.sport_info));
  db.prepare('INSERT INTO venue_owner_features (venue_id, features) VALUES (?, ?)').run(v.id, JSON.stringify(H.owner_features || {}));
  for (const it of H.not_offered || []) db.prepare('INSERT INTO venue_not_offered (venue_id, item) VALUES (?, ?)').run(v.id, it);
  for (const c of ['clearVenueCaches', 'clearHoursExtraCache', 'clearVenueIndoorInfoCache', 'clearVenueOwnerFeaturesCache']) if (app[c]) app[c]();
  if (app.indoorCardPrice) app.indoorCardPrice(v.id);
  return app.getVenue(v.id);
}
function neighbours(app) {
  return H.neighbours.map((o) => app.createVenue({ description_fr: 'Un lieu de test.', ...o }));
}
module.exports = { fairview, neighbours, H };
