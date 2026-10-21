'use strict';
// Roam Now event pins (2026-10-20, site review pass 12): 47 of 148 events in a week had no pin on /map (Prospera Place,
// Kal Tire Place, Caravan Farm Theatre, Kelowna Event Centre, arenas ...). For an event the map's own venue link does
// not place, this tries, in order:
//   1. the trip planner's resolver (trip-event-location.js, used as is): the full venue text as exactly one listing in
//      the event's town, "&" read as "and", "Name, street address" by its name, and its curated hosts (Prospera Place,
//      Penticton Trade & Convention Centre ...);
//   2. data/event-map-points.json: busy hosts with no listing, by name in the event's own town, read loosely
//      ("Vernon Recreation Centre (Creekside Conference Centre), 3310 37th Ave, Vernon" -> "vernon recreation centre").
// Never another town, never a partial name. Returns { lat, lng } or null.
const { resolveEventLocation } = require('./trip-event-location');

function mapPointKey(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[‘’`]/g, "'").replace(/\s*&\s*/g, ' and ').replace(/'/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
// The names an event's venue text may stand for: as written, without a trailing town (any of the event's town names),
// without ", <street address>", without a trailing "(...)", and the words inside that "(...)".
function mapPointNames(text, townNames = []) {
  const out = new Set();
  const add = (t) => { const k = mapPointKey(t); if (k) out.add(k); };
  let t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const towns = townNames.map((n) => String(n || '').trim()).filter(Boolean);
  const stripTown = (s) => {
    for (const town of towns) {
      const re = new RegExp(`,\\s*${town.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:,?\\s*(?:BC|B\\.C\\.))?\\s*$`, 'i');
      if (re.test(s)) return s.replace(re, '').trim();
    }
    return s;
  };
  add(t);
  t = stripTown(t);
  add(t);
  const comma = t.search(/,\s*(?:\d|unit\b|#)/i);
  if (comma > 0) { t = t.slice(0, comma).trim(); add(t); }
  const paren = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(t);
  if (paren) { add(paren[1]); add(paren[2]); }
  return [...out];
}
let pointsCache = null;
function mapEventPoints() {
  if (pointsCache) return pointsCache;
  let rows = [];
  try { rows = require('./data/event-map-points.json').points || []; } catch (e) { rows = []; }
  const byKey = new Map();
  for (const p of rows) {
    const lat = Number(p.lat), lng = Number(p.lng);
    if (!p.region || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    for (const n of p.names || []) {
      const k = `${p.region}|${mapPointKey(n)}`;
      // The same name for two different points in one town is ambiguous: neither is used.
      byKey.set(k, byKey.has(k) && byKey.get(k) && (byKey.get(k).lat !== lat || byKey.get(k).lng !== lng) ? null : { lat, lng });
    }
  }
  pointsCache = byKey;
  return byKey;
}
// event: { venue_name_text, region }; regionVenues: listings in the event's town (id, name, region, latitude,
// longitude, redirect_to); townNames: the town's names for a trailing ", Town".
function mapEventPin(event, regionVenues = [], townNames = []) {
  if (!event || !event.region || !String(event.venue_name_text || '').trim()) return null;
  let hit = null;
  try { hit = resolveEventLocation({ venue_id: null, venue_name_text: event.venue_name_text, region: event.region }, regionVenues); } catch (e) { hit = null; }
  if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) return { lat: hit.lat, lng: hit.lng };
  const points = mapEventPoints();
  for (const n of mapPointNames(event.venue_name_text, townNames)) {
    const p = points.get(`${event.region}|${n}`);
    if (p) return { lat: p.lat, lng: p.lng };
  }
  return null;
}
module.exports = { mapEventPin, mapPointNames, mapPointKey, mapEventPoints };
