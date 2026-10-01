'use strict';

// /favorites page rules (Stage 4.4, 2026-10-01).
//
// Pure functions only, written in ES5 so the SAME source runs in node tests and
// in the browser: server.js inlines favoritesCore.toString() into the page.
// The page script does the DOM, fetch and storage I/O around these rules.
//
// Two browser stores (see saved-items.js):
//   okanaganFavorites  -- names; written by app.js / the engagement scripts;
//                         decides whether a Favorite button is pressed.
//   okanaganSaved      -- {v:1, items:[...]} hidden ids (venue:<id>,
//                         event:<id>@<occurrence|null>), written by the
//                         Stage 4.3 capture script.
//
// The page shows every saved item plus every legacy name with no saved item
// ("name-only"). Rules (approved in the Phase 4 preflights):
// - a redirected venue becomes its canonical venue, and the saved id is
//   rewritten (D2c); the legacy name is left as it was;
// - a name-only favourite with exactly one exact-name match adopts that id; with
//   several it waits for the visitor to choose; with none it is "no longer
//   listed" -- never guessed, never silently deleted;
// - Remove drops the item, and drops the legacy name too when no other saved
//   item still carries it, so the rest of the site agrees;
// - nothing here invents a date: an event saved without one is "No date saved".
function favoritesCore() {
  var MAX = 100;

  function parse(text, fallback) {
    if (typeof text !== 'string' || !text) return fallback;
    try { var v = JSON.parse(text); return v === null || v === undefined ? fallback : v; } catch (e) { return fallback; }
  }
  function readLegacy(text) {
    var l = parse(text, []);
    if (!Array.isArray(l)) return [];
    var out = [];
    for (var i = 0; i < l.length; i++) if (typeof l[i] === 'string' && l[i] && out.indexOf(l[i]) === -1) out.push(l[i]);
    return out;
  }
  function validItem(x) {
    return !!x && (x.k === 'venue' || x.k === 'event') && typeof x.id === 'number' && x.id > 0 && Math.floor(x.id) === x.id;
  }
  function readSaved(text) {
    var s = parse(text, null);
    var items = (s && s.v === 1 && Array.isArray(s.items)) ? s.items.filter(validItem) : [];
    return { v: 1, items: items };
  }
  function refOf(x) {
    if (x.k === 'venue') return 'venue:' + x.id;
    return x.occ ? 'event:' + x.id + '@' + x.occ : 'event:' + x.id;
  }
  function copy(o) { var c = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k]; return c; }

  // What to ask the resolver: every saved ref, and every legacy name that no
  // saved item carries.
  function plan(legacy, saved) {
    var named = {}, refs = [], names = [];
    saved.items.forEach(function (x) { if (x.name) named[x.name] = true; var r = refOf(x); if (refs.indexOf(r) === -1) refs.push(r); });
    legacy.forEach(function (n) { if (!named[n]) names.push(n); });
    return { refs: refs, names: names };
  }
  // The resolver takes at most 100 items and 100 names per request.
  function batches(p) {
    var out = [];
    for (var i = 0; i < Math.max(p.refs.length, p.names.length); i += MAX) out.push({ items: p.refs.slice(i, i + MAX), names: p.names.slice(i, i + MAX) });
    return out;
  }
  function parseRef(r) {
    var m = /^venue:([1-9][0-9]*)$/.exec(r);
    if (m) return { k: 'venue', id: Number(m[1]) };
    m = /^event:([1-9][0-9]*)(?:@([1-9][0-9]*))?$/.exec(r);
    return m ? { k: 'event', id: Number(m[1]), occ: m[2] ? Number(m[2]) : null } : null;
  }

  // The resolver's answers -> the new saved list and what the page shows.
  // "resolved" is {items: [...], names: [...]} merged from every batch.
  function apply(legacy, saved, resolved, nowIso) {
    var byRef = {}, byName = {};
    (resolved.items || []).forEach(function (r) { byRef[r.ref] = r; });
    (resolved.names || []).forEach(function (n) { byName[n.name] = n; });
    var changed = false, items = [], seen = {};
    var view = { places: [], events: [], choose: [], gone: [] };

    function keep(item, r) {
      var ref = refOf(item);
      if (seen[ref]) { changed = true; return; } // the same item twice (e.g. a redirect onto an already-saved venue): one entry
      seen[ref] = true;
      items.push(item);
      if (!r || r.status === 'missing') { view.gone.push({ ref: ref, name: item.name || ref }); return; }
      if (item.k === 'venue') {
        view.places.push({ ref: ref, name: r.venue.name, region: r.venue.region, type: r.venue.type, url: r.venue.url, savedName: item.name || '' });
        return;
      }
      view.events.push({
        ref: ref, eventRef: r.event.ref, name: r.event.name, region: r.event.region, url: r.event.url, savedName: item.name || '',
        status: r.status, date: r.occurrence ? r.occurrence.date : null, endDate: r.occurrence ? r.occurrence.endDate : null, time: r.occurrence ? r.occurrence.time : null,
      });
    }

    saved.items.forEach(function (x) {
      var r = byRef[refOf(x)];
      if (r && r.status === 'redirected' && x.k === 'venue') {
        var c = parseRef(r.canonical);
        var moved = copy(x);
        moved.id = c.id;
        moved.redirectedFrom = x.id;
        changed = true;
        keep(moved, { status: 'active', venue: r.venue });
        return;
      }
      keep(x, r);
    });

    plan(legacy, saved).names.forEach(function (n) {
      var r = byName[n];
      if (!r) { view.gone.push({ name: n, nameOnly: true, unresolved: true }); return; }
      if (r.status === 'resolved') {
        var c = r.candidates[0], adopted;
        if (c.kind === 'venue') {
          adopted = { k: 'venue', id: parseRef(c.ref).id, name: n, savedAt: nowIso, adopted: true };
          if (seen[refOf(adopted)]) return;
          changed = true;
          keep(adopted, { status: 'active', venue: c });
        } else {
          adopted = { k: 'event', id: parseRef(c.ref).id, occ: null, date: null, time: null, name: n, savedAt: nowIso, adopted: true };
          if (seen[refOf(adopted)]) return;
          changed = true;
          keep(adopted, { status: 'undated', event: { ref: c.ref, name: c.name, region: c.region, url: c.url } });
        }
        return;
      }
      if (r.status === 'ambiguous') { view.choose.push({ name: n, candidates: r.candidates }); return; }
      view.gone.push({ name: n, nameOnly: true });
    });

    return { saved: { v: 1, items: items }, changed: changed, view: view };
  }

  // Remove one entry: a saved item (by ref) or a name-only favourite (by
  // name). The legacy name goes too once no saved item still carries it.
  function remove(legacy, saved, entry) {
    var name = entry.name, items = saved.items;
    if (entry.ref) {
      var gone = items.filter(function (x) { return refOf(x) === entry.ref; });
      if (gone.length && gone[0].name) name = gone[0].name;
      items = items.filter(function (x) { return refOf(x) !== entry.ref; });
    }
    var stillNamed = name && items.some(function (x) { return x.name === name; });
    var nextLegacy = (name && !stillNamed) ? legacy.filter(function (n) { return n !== name; }) : legacy.slice();
    return { legacy: nextLegacy, saved: { v: 1, items: items } };
  }

  // The visitor picked which same-name place (or event) a name-only favourite
  // meant. An event chosen this way has no saved date (decision: no picker).
  function choose(saved, name, candidateRef, nowIso) {
    var c = parseRef(candidateRef);
    if (!c) return saved;
    var item = c.k === 'venue'
      ? { k: 'venue', id: c.id, name: name, savedAt: nowIso, chosen: true }
      : { k: 'event', id: c.id, occ: null, date: null, time: null, name: name, savedAt: nowIso, chosen: true };
    var ref = refOf(item);
    if (saved.items.some(function (x) { return refOf(x) === ref; })) return saved;
    return { v: 1, items: saved.items.concat([item]) };
  }

  // Event rows: upcoming (incl. cancelled / postponed, by date), no date saved
  // (undated, or the saved date is no longer listed), and past.
  function eventGroups(events) {
    var upcoming = [], undated = [], past = [];
    events.forEach(function (e) {
      if (e.status === 'past') past.push(e);
      else if (e.status === 'undated' || e.status === 'missing_occurrence') undated.push(e);
      else upcoming.push(e);
    });
    var byDate = function (a, b) { var x = (a.date || '') + ' ' + (a.time || ''), y = (b.date || '') + ' ' + (b.time || ''); return x < y ? -1 : x > y ? 1 : 0; };
    upcoming.sort(byDate);
    past.sort(function (a, b) { return byDate(b, a); });
    return { upcoming: upcoming, undated: undated, past: past };
  }

  return { MAX: MAX, readLegacy: readLegacy, readSaved: readSaved, refOf: refOf, parseRef: parseRef, plan: plan, batches: batches, apply: apply, remove: remove, choose: choose, eventGroups: eventGroups };
}

module.exports = { favoritesCore };
