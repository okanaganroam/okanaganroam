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
// Round 15 (2026-10-20): a place that must never get a pin (a private home: its address is not for the map) and the
// vague places the round-15 steps below never read as a host ("Various wineries ...", "Participating ... wineries",
// "Downtown Vernon", "Main Street", "30th Avenue ...", a wine trail, "Okanagan Symphony Orchestra").
const MAP_PRIVATE_PLACE = /\bprivate\s+(?:home|house|residence|property|address|location)\b|\b(?:home|residential)\s+address\b|\baddress\s+(?:on|upon|provided|sent|given|after|when|with)\b/i;
const MAP_VAGUE_PLACE = /\b(?:various|participating|multiple|several|throughout|downtown|main\s+st(?:reet)?|avenue|wineries|breweries|wine\s+trail|trolley|tour|orchestra|symphony|society|association|council|near|area|region|locations?|tba|tbd)\b|^\d|\bbetween\b|\bbehind\b|\band\b.*\b(?:street|park|st|ave)\b/i;
const MAP_HOST_WORD = /\b(?:winery|wines|cellars|vineyards?|estate|resort|hotel|inn|lodge|brewing|brewery|distillery|centre|center|hall|theatre|farm|ranch)\b/;
function mapPlaceIsPrivate(text) { return MAP_PRIVATE_PLACE.test(String(text || '')); }
// Street words as written either way ("Road" / "Rd", "37th" / "37", "West" / "W").
const MAP_STREET_WORDS = { street: 'st', road: 'rd', drive: 'dr', avenue: 'ave', av: 'ave', boulevard: 'blvd', crescent: 'cres', place: 'pl', court: 'crt', ct: 'crt', lane: 'ln', highway: 'hwy', way: 'way', west: 'w', east: 'e', north: 'n', south: 's', terrace: 'terr', parkway: 'pkwy', trail: 'trl' };
// "106-1641 Dartmouth Rd", "#106 1475 Fairview Road (Cannery Trade Centre)", "500 Cook Rd Unit 2" -> "1641 dartmouth rd",
// "1475 fairview rd", "500 cook rd"; anything that is not "<number> <street>" -> null.
function mapStreetKey(segment) {
  let t = String(segment || '').replace(/\([^()]*\)/g, ' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  t = t.replace(/^(?:unit|suite|ste\.?|#)\s*[a-z0-9]+[\s,-]+(?=\d)/, '').replace(/^\d+[a-z]?\s*-\s*(?=\d)/, '');
  t = t.replace(/\s+(?:unit|suite|ste\.?|#)\s*[a-z0-9-]+\s*$/, '').replace(/\s+#\s*[a-z0-9-]+$/, '');
  const m = /^(\d+[a-z]?)\s+(.+)$/.exec(t);
  if (!m) return null;
  const words = m[2].replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
    .map((w) => MAP_STREET_WORDS[w] || w.replace(/^(\d+)(?:st|nd|rd|th)$/, '$1'));
  if (!words.length || !words.some((w) => /[a-z]/.test(w) || /^\d+$/.test(w))) return null;
  return `${m[1]} ${words.join(' ')}`;
}
function mapDistanceM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad), y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * R;
}
// Several listings for one place agree only when they sit within 250 m of each other; the one nearest the rest is used.
function mapOnePlace(points) {
  const ps = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0));
  if (!ps.length) return null;
  for (const a of ps) for (const b of ps) if (mapDistanceM(a, b) > 250) return null;
  let best = ps[0], bestSum = Infinity;
  for (const a of ps) { const sum = ps.reduce((n, b) => n + mapDistanceM(a, b), 0); if (sum < bestSum) { best = a; bestSum = sum; } }
  return { lat: best.lat, lng: best.lng };
}
const venuePoint = (v) => ({ lat: Number(v.latitude), lng: Number(v.longitude), ok: v.latitude != null && v.longitude != null && String(v.latitude).trim() !== '' && String(v.longitude).trim() !== '' });
// The venue text read as "<leading name>, <number> <street>[, town]": { lead, street } (street null when none).
function mapLeadAndStreet(text, townNames = []) {
  const parts = String(text || '').replace(/\s+/g, ' ').split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { lead: '', street: null, rest: '' };
  const towns = new Set(townNames.map((n) => mapPointKey(n)).filter(Boolean));
  const rest = parts.slice(1).filter((p) => !towns.has(mapPointKey(p)) && !/^(?:bc|b\.c\.)$/i.test(p));
  const street = rest.length ? mapStreetKey(rest[0]) : null;
  return { lead: parts[0], street, rest: (street ? rest.slice(1) : rest).join(', ') };
}
// Round 15 (2026-10-20), map only: a host whose listing has another name.
//   a. "<Place> at <Host>" listings: "Kismet Estate Winery, 316 Road 20" -> "Manzil Indian Restaurant at Kismet Estate
//      Winery" (every such listing in the town, when they are one place);
//   b. the same street address: "Hotel Eldorado, 500 Cook Rd" -> the listings at 500 Cook Rd (Eldorado Yacht Club,
//      Lakeside Dining Room), "Spirit Ridge Resort, 1200 Rancher Creek Road" -> The Bear, The Fish, The Root & The
//      Berry. The listings (and known host points) at that number on that street in the event's own town, within 250 m
//      of each other; a "(second location at ...)" note in a listing's address never counts.
// Never when the leading name is vague, starts with a number (a bare address may be a home) or the text is private.
function mapListingHostPin(event, regionVenues, townNames) {
  const text = String(event.venue_name_text || '');
  const { lead, street, rest } = mapLeadAndStreet(text, townNames);
  const leadKey = mapPointKey(lead);
  // The words other than the street address must name one place: "Big White, near Kelowna" never does.
  if (!leadKey || leadKey.length < 4 || MAP_VAGUE_PLACE.test(lead) || (rest && MAP_VAGUE_PLACE.test(rest))) return null;
  const live = (regionVenues || []).filter((v) => v && v.region === event.region && v.redirect_to == null && venuePoint(v).ok);
  const hosts = live.filter((v) => {
    const at = /^(.+?)\s+(?:at|@)\s+(?:the\s+)?(.+)$/i.exec(String(v.name || '').trim());
    return at && mapPointKey(at[2]) === leadKey.replace(/^the /, '');
  });
  // A host named by a place word or three words or more ("Kismet Estate Winery"), never a bare "Big White".
  if (hosts.length && (leadKey.split(' ').length >= 3 || MAP_HOST_WORD.test(leadKey))) return mapOnePlace(hosts.map(venuePoint));
  if (!street) return null;
  const same = live.filter((v) => String(v.address || '').split(',').some((seg) => mapStreetKey(seg) === street)).map(venuePoint);
  for (const [k, p] of mapEventPointAddresses()) if (k === `${event.region}|${street}`) same.push(...p);
  return same.length ? mapOnePlace(same) : null;
}
let pointAddressCache = null;
function mapEventPointAddresses() {
  if (pointAddressCache) return pointAddressCache;
  let rows = [];
  try { rows = require('./data/event-map-points.json').points || []; } catch (e) { rows = []; }
  const out = new Map();
  for (const p of rows) {
    const k = p.region && p.address ? mapStreetKey(String(p.address).split(',')[0]) : null;
    if (!k || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) continue;
    const key = `${p.region}|${k}`;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push({ lat: Number(p.lat), lng: Number(p.lng) });
  }
  pointAddressCache = out;
  return out;
}
// event: { venue_name_text, region }; regionVenues: listings in the event's town (id, name, region, latitude,
// longitude, redirect_to, address); townNames: the town's names for a trailing ", Town".
function mapEventPin(event, regionVenues = [], townNames = []) {
  if (!event || !event.region || !String(event.venue_name_text || '').trim()) return null;
  // Round 15: a private home never gets a pin, whatever else its text names.
  if (mapPlaceIsPrivate(event.venue_name_text)) return null;
  let hit = null;
  try { hit = resolveEventLocation({ venue_id: null, venue_name_text: event.venue_name_text, region: event.region }, regionVenues); } catch (e) { hit = null; }
  if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) return { lat: hit.lat, lng: hit.lng };
  const points = mapEventPoints();
  for (const n of mapPointNames(event.venue_name_text, townNames)) {
    const p = points.get(`${event.region}|${n}`);
    if (p) return { lat: p.lat, lng: p.lng };
  }
  return mapListingHostPin(event, regionVenues, townNames);
}
module.exports = { mapEventPin, mapPointNames, mapPointKey, mapEventPoints, mapPlaceIsPrivate, mapStreetKey, mapListingHostPin };
