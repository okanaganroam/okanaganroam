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
//
// One count, one definition (2026-11-24, Dayton: the planner said "9 rides to check" where a fresh shared copy of the
// same stops said "8 of 11 trips"). A TRIP BETWEEN STOPS is one hop of a day, in the order the stops are visited: from
// the place to stay to the day's first stop (when the plan has a stay with a stored map location), then from each stop
// to the next. The way back to the stay at the end of a day is not counted. A hop is LONGER THAN A SHORT WALK when the
// straight-line distance between the two stored map locations is over WALK_KM (1 km), or when one of them has no stored
// location. describe() is the only place that counts, and entry() the only place that words a stop's note: the planner
// page runs the same code in the browser (CLIENT_SRC) on the stops as they are on screen, after every remove, swap, add
// and Undo, so a note never names a stop that is no longer the one before it, and the planner and the shared copy
// (which reads the link's stops again) give the same numbers.
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

// Everything that measures and words the hops, in one function with no outside names, written so it also runs in the
// browser as it is (CLIENT_SRC below; the planner page calls it as tripNoCarApi).
function tripNoCar() {
  var WALK_KM = 1;
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function point(o) {
    if (!o) return null;
    var lat = num(o.lat != null ? o.lat : o.latitude), lng = num(o.lng != null ? o.lng : o.longitude);
    return lat != null && lng != null && (lat || lng) ? { lat: lat, lng: lng } : null;
  }
  function kmBetween(a, b) {
    var r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lng - a.lng) * r;
    var x = Math.pow(Math.sin(dl / 2), 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.pow(Math.sin(dn / 2), 2);
    return 2 * 6371 * Math.asin(Math.sqrt(x));
  }
  // "about 1.4 km" under 2 km, whole kilometres from there: never more exact than a straight line deserves.
  function kmText(km, fr) {
    var v = km < 2 ? Math.max(0.1, Math.round(km * 10) / 10) : Math.round(km);
    return (fr ? String(v).replace('.', ',') : v) + ' km';
  }
  // The hops of a plan, day by day, in the order the stops are visited. Each day starts from the place to stay when the
  // plan has one with a stored location.
  //   list: [{ id, name, day, lat?, lng? }] in order.   stay: { id, name, lat?, lng? } or null.   coordsOf(id) -> point
  //   -> [{ day, to: { id, name }, from: { id, name, stay? } | null, km: number | null, walk: boolean }]
  function legsOf(list, stay, coordsOf) {
    function at(x) { return point(x) || (typeof coordsOf === 'function' && x && x.id != null ? point(coordsOf(x.id)) : null); }
    var home = stay && stay.id != null ? { id: stay.id, name: stay.name || '', stay: true, p: at(stay) } : null;
    var out = [], day = null, prev = null;
    (list || []).forEach(function (x) {
      if (!x || x.id == null) return;
      var d = x.day || 0;
      if (d !== day) { day = d; prev = home && home.p ? home : null; }
      var cur = { id: x.id, name: x.name || '', p: at(x) };
      if (prev && prev.id !== cur.id) {
        var km = prev.p && cur.p ? kmBetween(prev.p, cur.p) : null, from = { id: prev.id, name: prev.name };
        if (prev.stay) from.stay = true;
        out.push({ day: d, to: { id: cur.id, name: cur.name }, from: from, km: km, walk: km != null && km <= WALK_KM });
      }
      prev = cur;
    });
    return out;
  }
  function hopEn(l) { return (l.from.stay ? 'your stay' : l.from.name) + ' to ' + l.to.name + (l.km != null ? ' (about ' + kmText(l.km, false) + ')' : ''); }
  function hopFr(l) { return (l.from.stay ? 'votre hébergement' : l.from.name) + ' à ' + l.to.name + (l.km != null ? ' (env. ' + kmText(l.km, true) + ')' : ''); }
  var UNVERIFIED = { en: 'Taxis, shuttles and buses aren’t checked here: confirm a ride before you go.', fr: 'Les taxis, navettes et autobus ne sont pas vérifiés ici : confirmez un transport avant de partir.' };
  // One stop's note, from its hop: only a hop that is not a short walk says anything. The distance is always said to
  // be a straight line, and from the stop (or the stay) that is before it NOW.
  function stopNotes(l) {
    if (!l || l.walk) return {};
    var fromEn = l.from.stay ? 'your stay' : l.from.name, fromFr = l.from.stay ? 'votre hébergement' : l.from.name;
    if (l.km == null) return {
      note: 'No car: no map location to measure from ' + fromEn + ' · check a ride', noteFr: 'Sans voiture : distance depuis ' + fromFr + ' inconnue · prévoyez un transport',
      noteShort: 'No car: check a ride', noteShortFr: 'Sans voiture : transport à prévoir'
    };
    return {
      note: 'No car: about ' + kmText(l.km, false) + ' in a straight line from ' + fromEn + ' · check a ride', noteFr: 'Sans voiture : env. ' + kmText(l.km, true) + ' à vol d’oiseau depuis ' + fromFr + ' · prévoyez un transport',
      noteShort: 'About ' + kmText(l.km, false) + ' (straight line) · check a ride', noteShortFr: 'Env. ' + kmText(l.km, true) + ' (vol d’oiseau) · transport à prévoir'
    };
  }
  // The one count and its words (the evidence text, the summary chip, the Book my trip line, the shared copy).
  //   -> { rides, total, text, textFr, short, shortFr, chip, chipFr }
  // homed: the hops start from the place to stay (said in the definition).
  function describe(legs, homed) {
    var total = legs.length, far = legs.filter(function (l) { return !l.walk; }), rides = far.length;
    var howEn = homed ? 'Counted from your stay to each day’s first stop, then from stop to stop.' : 'Counted from stop to stop within each day.';
    var howFr = homed ? 'Compté de votre hébergement au premier arrêt de chaque jour, puis d’un arrêt au suivant.' : 'Compté d’un arrêt au suivant, chaque jour.';
    if (!total) return { rides: 0, total: 0, text: 'No car: noted. ' + UNVERIFIED.en, textFr: 'Sans voiture : noté. ' + UNVERIFIED.fr, short: 'No car: rides aren’t checked here', shortFr: 'Sans voiture : transports non vérifiés ici', chip: 'rides not checked', chipFr: 'transports non vérifiés' };
    var one = total === 1, each = rides > 1 ? 'each' : 'it', eachFr = rides > 1 ? 'chacun' : 'celui-ci';
    if (!rides) return {
      rides: rides, total: total,
      text: (one ? 'No car: the 1 trip between stops is a short walk (' : 'No car: ' + (total === 2 ? 'both' : 'all ' + total) + ' trips between stops are a short walk (') + WALK_KM + ' km or less in a straight line). Walking routes aren’t checked. ' + howEn,
      textFr: (one ? 'Sans voiture : le seul trajet entre les arrêts est une courte marche (' : 'Sans voiture : les ' + total + ' trajets entre les arrêts sont de courtes marches (') + WALK_KM + ' km ou moins à vol d’oiseau). Les itinéraires à pied ne sont pas vérifiés. ' + howFr,
      short: 'No car: short walks between stops (' + WALK_KM + ' km or less in a straight line)', shortFr: 'Sans voiture : courtes marches entre les arrêts (' + WALK_KM + ' km ou moins à vol d’oiseau)',
      chip: 'short walks (approx.)', chipFr: 'courtes marches (approx.)'
    };
    return {
      rides: rides, total: total,
      text: 'No car: ' + rides + ' of ' + total + (one ? ' trip' : ' trips') + ' between stops ' + (rides > 1 ? 'are' : 'is') + ' longer than a short walk (over ' + WALK_KM + ' km in a straight line). Check a taxi, shuttle or bus for ' + each + '; none is checked here. ' + howEn,
      textFr: 'Sans voiture : ' + rides + (rides > 1 ? ' trajets' : ' trajet') + ' sur ' + total + ' entre les arrêts ' + (rides > 1 ? 'dépassent' : 'dépasse') + ' une courte marche (plus de ' + WALK_KM + ' km à vol d’oiseau). Vérifiez un taxi, une navette ou un autobus pour ' + eachFr + '; aucun n’est vérifié ici. ' + howFr,
      short: 'No car: ' + rides + ' of ' + total + (one ? ' trip' : ' trips') + ' between stops ' + (rides > 1 ? 'are' : 'is') + ' over ' + WALK_KM + ' km in a straight line. Check a taxi, shuttle or bus for ' + each + '; none is checked here',
      shortFr: 'Sans voiture : ' + rides + (rides > 1 ? ' trajets' : ' trajet') + ' sur ' + total + ' entre les arrêts ' + (rides > 1 ? 'dépassent' : 'dépasse') + ' ' + WALK_KM + ' km à vol d’oiseau. Vérifiez un taxi, une navette ou un autobus pour ' + eachFr + '; aucun n’est vérifié ici',
      chip: rides + ' of ' + total + (one ? ' trip' : ' trips') + ' over ' + WALK_KM + ' km', chipFr: rides + ' ' + (rides > 1 ? 'trajets' : 'trajet') + ' sur ' + total + ' de plus de ' + WALK_KM + ' km'
    };
  }
  // The plan.evidence entry. stops: one row per hop, keyed by the stop the hop arrives at (a stop reached twice keeps
  // its first hop that needs a ride). Never 'verified': nothing about transport is.
  function entry(list, stay, coordsOf) {
    var legs = legsOf(list, stay, coordsOf), homed = legs.some(function (l) { return l.from.stay; }), d = describe(legs, homed), rows = [];
    legs.forEach(function (l) {
      var have = rows.filter(function (r) { return r.id === l.to.id; })[0];
      if (have && (have.check || l.walk)) return;
      var row = { id: l.to.id, name: l.to.name, has: null, day: l.day, km: l.km == null ? null : Math.round(l.km * 10) / 10, from: l.from.stay ? null : l.from.name, walk: l.walk, check: !l.walk }, n = stopNotes(l), k;
      if (l.from.stay) row.fromStay = true;
      for (k in n) if (Object.prototype.hasOwnProperty.call(n, k)) row[k] = n[k];
      if (have) rows[rows.indexOf(have)] = row; else rows.push(row);
    });
    return { ask: 'no_car', label: 'No car', labelFr: 'Sans voiture', stops: rows, status: 'unknown', hops: d.total, rides: d.rides, walkKm: WALK_KM, homed: homed, text: d.text, textFr: d.textFr, short: d.short, shortFr: d.shortFr, chip: d.chip, chipFr: d.chipFr };
  }
  return { WALK_KM: WALK_KM, point: point, legsOf: legsOf, describe: describe, entry: entry, stopNotes: stopNotes, kmBetween: kmBetween, kmText: kmText, hopEn: hopEn, hopFr: hopFr, UNVERIFIED: UNVERIFIED };
}
const API = tripNoCar();
// The same code for the planner page (trip-planner-v4-page.js): the hops of the stops as they are on screen.
const CLIENT_SRC = `var tripNoCarApi = (${String(tripNoCar)})();`;

module.exports = { ...API, readNoCar, tripNoCar, CLIENT_SRC };
