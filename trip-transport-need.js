'use strict';
// Build My Trip: "we do not have a car", read as a need of the trip (2026-11-23).
//
// The owner's report: "Plan a 3-day romantic getaway in Osoyoos … We do not have a car and want a relaxed pace." The plan
// kept its stops in town but said nothing a visitor could see about getting between them, and the chat answered "most
// stops need a car; taxis are limited" and left it there.
//
// This module reads the need from the request's own words and says, for the stops as they are, which hops between them
// are a short walk and which need a ride. It knows ONLY the straight-line distance between two stored map locations:
//   - a hop of WALK_KM or less is worded as "a short walk", always as approximate (no walking route is checked);
//   - a longer hop, or one with no stored location, is "check a ride";
//   - no taxi, bus, shuttle or route is ever looked up, named or implied to exist.
// The plan's evidence entry (ask 'no_car'), each card's note, the summary, the chat and the shared copy all read the
// same rows, so they say the same thing.

const WALK_KM = 1;
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'");
// "No driving after the wineries" / "a designated driver" is how they get home from tastings, not a trip without a car.
const NO_CAR_RE = /\b(?:no cars?|without (?:a |our |my |any )?car|car[- ]?free|(?:don'?t|do not|dont|won'?t|will not) (?:have|own|bring|be bringing) (?:a |our |my |the |any )?(?:car|vehicle)|not bringing (?:a |our |the )?car|no vehicle|no rental car|(?:we|i) (?:don'?t|do not|dont) drive(?! (?:after|home|back|at night))|(?:rely|relying) on (?:public )?(?:transit|buses|the bus)|by public transit|(?:coming|arriving|travell?ing|getting there|going) by (?:bus|coach|shuttle|train)|sans (?:voiture|auto|vehicule)|pas de (?:voiture|vehicule|char)|pas d'auto|(?:n'avons|n'ai|n'a|n'ont|n'aurons|n'aurai) pas (?:de |d')(?:voiture|auto|vehicule)|en autobus|en autocar)\b/;
const NOT_RE = /\b(?:not|never|isn'?t|aren'?t)\s*$/;
function clauseAt(text, at) {
  const t = String(text || '');
  let a = at, b = at;
  while (a > 0 && !/[.;!?\n]/.test(t[a - 1])) a--;
  while (b < t.length && !/[.;!?\n]/.test(t[b])) b++;
  return t.slice(a, b).replace(/\s+/g, ' ').trim().slice(0, 140);
}
// -> { key: 'no_car', who: 'all', phrase } or null. Part of the request's words, so every re-plan reads it again.
function readNoCar(text) {
  const raw = String(text || ''), t = fold(raw), m = NO_CAR_RE.exec(t);
  if (!m || NOT_RE.test(t.slice(Math.max(0, m.index - 12), m.index))) return null;
  return { key: 'no_car', who: 'all', phrase: clauseAt(raw, m.index) };
}

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
function point(o) {
  if (!o) return null;
  const lat = num(o.lat != null ? o.lat : o.latitude), lng = num(o.lng != null ? o.lng : o.longitude);
  return lat != null && lng != null && (lat || lng) ? { lat, lng } : null;
}
function kmBetween(a, b) {
  const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lng - a.lng) * r;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}
// "about 1.4 km" under 2 km, whole kilometres from there: never more exact than a straight line deserves.
function kmText(km, fr) {
  const v = km < 2 ? Math.max(0.1, Math.round(km * 10) / 10) : Math.round(km);
  return `${fr ? String(v).replace('.', ',') : v} km`;
}

// The hops of a plan, day by day, in the order the stops are visited. Each day starts from the place to stay when the
// plan has one with a stored location.
//   list: [{ id, name, day, lat?, lng? }] in order.   stay: { id, name, lat?, lng? } or null.   coordsOf(id) -> point
//   -> [{ day, to: { id, name }, from: { id, name, stay? } | null, km: number | null, walk: boolean }]
function legsOf(list, stay, coordsOf) {
  const at = (x) => point(x) || (typeof coordsOf === 'function' && x && x.id != null ? point(coordsOf(x.id)) : null);
  const home = stay && stay.id != null ? { id: stay.id, name: stay.name || '', stay: true, p: at(stay) } : null;
  const out = [];
  let day = null, prev = null;
  for (const x of list || []) {
    if (!x || x.id == null) continue;
    const d = x.day || 0;
    if (d !== day) { day = d; prev = home && home.p ? home : null; }
    const cur = { id: x.id, name: x.name || '', p: at(x) };
    if (prev && prev.id !== cur.id) {
      const km = prev.p && cur.p ? kmBetween(prev.p, cur.p) : null;
      out.push({ day: d, to: { id: cur.id, name: cur.name }, from: { id: prev.id, name: prev.name, ...(prev.stay ? { stay: true } : {}) }, km, walk: km != null && km <= WALK_KM });
    }
    prev = cur;
  }
  return out;
}
const hopEn = (l) => `${l.from.stay ? 'your stay' : l.from.name} to ${l.to.name}${l.km != null ? ` (about ${kmText(l.km, false)})` : ''}`;
const hopFr = (l) => `${l.from.stay ? 'votre hébergement' : l.from.name} à ${l.to.name}${l.km != null ? ` (env. ${kmText(l.km, true)})` : ''}`;
const UNVERIFIED = { en: 'Taxis, shuttles and buses aren’t checked here: confirm a ride before you go.', fr: 'Les taxis, navettes et autobus ne sont pas vérifiés ici : confirmez un transport avant de partir.' };

// One stop's note, from its hop: only a hop that is not a short walk says anything.
function stopNotes(l) {
  if (!l || l.walk) return {};
  const fromEn = l.from.stay ? 'your stay' : l.from.name, fromFr = l.from.stay ? 'votre hébergement' : l.from.name;
  if (l.km == null) return {
    note: `No car: no map location to measure from ${fromEn} · check a ride`, noteFr: `Sans voiture : distance depuis ${fromFr} inconnue · prévoyez un transport`,
    noteShort: 'No car: check a ride', noteShortFr: 'Sans voiture : transport à prévoir',
  };
  return {
    note: `No car: about ${kmText(l.km, false)} from ${fromEn} · check a ride`, noteFr: `Sans voiture : env. ${kmText(l.km, true)} depuis ${fromFr} · prévoyez un transport`,
    noteShort: `About ${kmText(l.km, false)} away · check a ride`, noteShortFr: `Env. ${kmText(l.km, true)} · transport à prévoir`,
  };
}
// The sentences for a set of hops (the evidence text, the chat's answer). -> { rides, total, text, textFr, short, shortFr }
function describe(legs) {
  const total = legs.length, far = legs.filter((l) => !l.walk), rides = far.length;
  if (!total) return { rides: 0, total: 0, text: `No car: noted. ${UNVERIFIED.en}`, textFr: `Sans voiture : noté. ${UNVERIFIED.fr}`, short: 'No car: rides aren’t checked here', shortFr: 'Sans voiture : transports non vérifiés ici' };
  if (!rides) return {
    rides, total,
    text: `No car: every trip between stops is under about ${WALK_KM} km in a straight line, a short walk. Walking routes aren’t checked.`,
    textFr: `Sans voiture : chaque trajet entre les arrêts fait moins d’environ ${WALK_KM} km à vol d’oiseau, une courte marche. Les itinéraires à pied ne sont pas vérifiés.`,
    short: 'No car: short walks between stops (approximate)', shortFr: 'Sans voiture : courtes marches entre les arrêts (approximatif)',
  };
  const longest = far.filter((l) => l.km != null).sort((a, b) => b.km - a.km)[0] || null;
  const egEn = longest ? `${rides > 1 ? '; the longest is ' : ': '}${hopEn(longest)}` : '';
  const egFr = longest ? `${rides > 1 ? '; le plus long : ' : ' : '}${hopFr(longest)}` : '';
  return {
    rides, total,
    text: `No car: ${rides} of ${total} trips between stops ${rides > 1 ? 'are' : 'is'} more than a short walk (over about ${WALK_KM} km in a straight line)${egEn}. ${UNVERIFIED.en}`,
    textFr: `Sans voiture : ${rides} des ${total} trajets entre les arrêts ${rides > 1 ? 'dépassent' : 'dépasse'} une courte marche (plus d’environ ${WALK_KM} km à vol d’oiseau)${egFr}. ${UNVERIFIED.fr}`,
    short: `No car: check a ride for ${rides} of ${total} trips between stops. Taxis and shuttles aren’t checked here`,
    shortFr: `Sans voiture : prévoyez un transport pour ${rides} des ${total} trajets entre les arrêts. Taxis et navettes non vérifiés ici`,
  };
}
// The plan.evidence entry. stops: one row per hop, keyed by the stop the hop arrives at (a stop reached twice keeps
// its first hop that needs a ride). Never 'verified': nothing about transport is.
function entry(list, stay, coordsOf) {
  const legs = legsOf(list, stay, coordsOf), d = describe(legs), rows = [];
  for (const l of legs) {
    const have = rows.find((r) => r.id === l.to.id);
    if (have && (have.check || l.walk)) continue;
    const row = { id: l.to.id, name: l.to.name, has: null, day: l.day, km: l.km == null ? null : Math.round(l.km * 10) / 10, from: l.from.stay ? null : l.from.name, ...(l.from.stay ? { fromStay: true } : {}), walk: l.walk, check: !l.walk, ...stopNotes(l) };
    if (have) rows[rows.indexOf(have)] = row; else rows.push(row);
  }
  return { ask: 'no_car', label: 'No car', labelFr: 'Sans voiture', stops: rows, status: 'unknown', hops: d.total, rides: d.rides, text: d.text, textFr: d.textFr, short: d.short, shortFr: d.shortFr };
}

module.exports = { WALK_KM, readNoCar, legsOf, describe, entry, stopNotes, kmBetween, kmText, hopEn, hopFr, UNVERIFIED };
