'use strict';
// Build My Trip: every VISIT is a stop (2026-11-24, Dayton's live test at 390px).
//
// A 3-day SilverStar plan showed 8 stops: the ski hill each morning and the same restaurant on two evenings. A freshly
// shared copy showed 5: the share link was built from the plan's stops with each LISTING sent once, so the hill and the
// dinner place were missing from days 2 and 3.
//
// A plan's stop is a visit: a listing at a place in the plan (its day and part of the day: "2-evening"), with its own
// time. The same listing may be visited on another day, or twice in one day (lunch and dinner at the one restaurant).
// So:
//   - the share link carries every visit, in the plan's order, each with its own day (days=) and time (t=). The link's
//     stops= simply repeats the listing; the shared page already reads it that way, so no parameter was added and a
//     link made before (each listing once) opens exactly as it did;
//   - a visit's time is its own schedule row: the nth visit of a listing on a day reads that day's nth row for it;
//   - a listing counts as "removed from the plan" only when no visit of it is left (its one booking row and its notes
//     stay for the visit that remains). Remove, Undo and Swap act on one visit: they are keyed by the visit's place in
//     the plan, never by the listing.
//
// The functions below run in the browser (the planner page) and in the tests, from this one source. This file is the
// same on okanaganroam.com and whistlerroam.com.

const CLIENT_SRC = String.raw`
  // Which visit of a listing this is on its day: 0 for the first. dayStops: that day's stops in order; part: this
  // stop's part of the day; id: the listing.
  function tripVisitNth(dayStops, part, id){
    var n = 0, list = dayStops || [];
    for (var i = 0; i < list.length; i++) { var q = list[i]; if (q && q.daypart === part) break; if (q && q.venue && q.venue.id === id) n++; }
    return n;
  }
  // The schedule row of the nth visit of a listing on a day (rows: plan.schedule). null when it has none.
  function tripVisitRow(rows, day, id, nth){
    var skip = nth || 0, list = rows || [];
    for (var i = 0; i < list.length; i++) { var r = list[i]; if (!r || (day != null && r.day !== day)) continue; if (r.venueId === id) { if (skip > 0) { skip--; continue; } return r; } }
    return null;
  }
  // The stops a share link carries, from the plan's own stop buttons in page order: [{ ref, key, day, name }]. A venue
  // with a place in the plan (key "2-evening") is one stop per place; anything else is one stop per listing, as before.
  function tripVisitList(btns, max){
    var seen = {}, out = [], REF = /^(venue|event):[1-9][0-9]*$/;
    (btns || []).forEach(function(b){
      var r = b && b.ref, key = (b && b.key) || '';
      if (!r || !REF.test(r)) return;
      var placed = /^venue:/.test(r) && /^[1-9][0-9]?-[a-z]+$/.test(key), once = placed ? key : r;
      if (seen[once]) return;
      seen[once] = 1; out.push({ ref: r, day: b.day > 0 ? b.day : 0, name: b.name || '', key: placed ? key : '' });
    });
    return out.slice(0, max > 0 ? max : out.length);
  }
  // The listings with no visit left on the plan. days: plan.days; removed: { "2-evening": id } (the page's removed
  // places). A listing visited twice with one visit removed is NOT in it.
  function tripVisitGone(days, removed){
    var ids = {}, kept = {};
    (days || []).forEach(function(d){ (d.stops || []).forEach(function(s){ if (!s || !s.venue) return; if (removed && removed[d.day + '-' + s.daypart]) ids[s.venue.id] = 1; else kept[s.venue.id] = 1; }); });
    Object.keys(kept).forEach(function(id){ delete ids[id]; });
    return ids;
  }
  // A listing's visits still on the plan, with their day and time: [{ day, start }] in plan order.
  function tripVisitsOf(days, rows, removed, id){
    var out = [];
    (days || []).forEach(function(d){ (d.stops || []).forEach(function(s){
      if (!s || !s.venue || s.venue.id !== id || (removed && removed[d.day + '-' + s.daypart])) return;
      var r = tripVisitRow(rows, d.day, id, tripVisitNth(d.stops, s.daypart, id));
      out.push({ day: d.day, start: r && typeof r.startMinutes === 'number' ? r.startMinutes : null });
    }); });
    return out;
  }
  var tripVisitsApi = { nth: tripVisitNth, row: tripVisitRow, list: tripVisitList, gone: tripVisitGone, of: tripVisitsOf };
`;

module.exports = { CLIENT_SRC };
