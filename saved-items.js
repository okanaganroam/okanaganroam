'use strict';

// Saved-item identity (Stage 4.3, 2026-10-01).
//
// Favourites were saved by NAME only (okanaganFavorites, written by the frozen
// app.js and the server-rendered engagement scripts). This module is the pure
// half of the hidden identity layer that sits beside that list without
// changing it:
//
//   venue:<venueId>                  e.g. venue:571
//   event:<eventId>@<occurrenceId>   e.g. event:256@466  (one specific date)
//   event:<eventId>                  an event saved with no upcoming date
//
// Venue, event and occurrence ids are SQLite INTEGER PRIMARY KEY AUTOINCREMENT
// keys, so they are never reused; the type prefix keeps venue 12 and event 12
// apart. Nothing here reads the database itself: the server injects the
// lookups (`deps`), as it does for discovery-search.js, so every rule below is
// testable with plain objects.
//
// Rules this module enforces:
// - a venue id that was retired as a duplicate resolves to its canonical
//   venue (`redirected`, with the canonical ref); a missing one is reported
//   `missing`, never silently swapped for another venue;
// - a legacy favourite name is matched EXACTLY; two or more candidates are
//   `ambiguous` and are never guessed;
// - an occurrence is reported as stored: upcoming, past, cancelled or
//   postponed; an event saved without an occurrence is `undated` (no
//   occurrence is invented);
// - reconcile() rewrites redirected venue ids to their canonical id and never
//   deletes an item.

const MAX_ITEMS = 100;
const MAX_NAMES = 100;
const MAX_NAME_LENGTH = 120;
const MAX_REDIRECT_HOPS = 5;

const REF_RE = /^(venue):([1-9]\d{0,9})$|^(event):([1-9]\d{0,9})(?:@([1-9]\d{0,9}))?$/;

function parseRef(text) {
  const m = REF_RE.exec(String(text || ''));
  if (!m) return null;
  if (m[1]) return { k: 'venue', id: Number(m[2]) };
  return { k: 'event', id: Number(m[4]), occ: m[5] ? Number(m[5]) : null };
}

function formatRef(ref) {
  if (!ref) return null;
  if (ref.k === 'venue') return `venue:${ref.id}`;
  if (ref.k === 'event') return ref.occ ? `event:${ref.id}@${ref.occ}` : `event:${ref.id}`;
  return null;
}

// Bounded, strict input. Returns { ok, refs, names } or { ok: false, error }.
function validateResolveInput({ items = [], names = [] } = {}) {
  const itemList = (Array.isArray(items) ? items : [items]).filter((x) => x !== undefined && x !== '');
  const nameList = (Array.isArray(names) ? names : [names]).filter((x) => x !== undefined && x !== '');
  if (itemList.length > MAX_ITEMS) return { ok: false, error: `at most ${MAX_ITEMS} items` };
  if (nameList.length > MAX_NAMES) return { ok: false, error: `at most ${MAX_NAMES} names` };
  const refs = [];
  for (const raw of itemList) {
    const ref = parseRef(raw);
    if (!ref) return { ok: false, error: `invalid item: ${String(raw).slice(0, 40)}` };
    refs.push(ref);
  }
  for (const n of nameList) {
    if (typeof n !== 'string' || n.length > MAX_NAME_LENGTH) return { ok: false, error: `names must be at most ${MAX_NAME_LENGTH} characters` };
  }
  return { ok: true, refs, names: nameList };
}

function venueView(v, deps) {
  return { ref: formatRef({ k: 'venue', id: v.id }), name: v.name, region: v.region, type: v.type, url: deps.venueUrl(v) };
}

function resolveVenue(ref, deps) {
  let v = deps.getVenue(ref.id);
  if (!v) return { ref: formatRef(ref), status: 'missing' };
  let hops = 0;
  const seen = new Set([v.id]);
  while (v.redirect_to) {
    const next = deps.getVenue(v.redirect_to);
    if (!next || seen.has(next.id) || ++hops > MAX_REDIRECT_HOPS) return { ref: formatRef(ref), status: 'missing' };
    seen.add(next.id);
    v = next;
  }
  if (v.id === ref.id) return { ref: formatRef(ref), status: 'active', venue: venueView(v, deps) };
  return { ref: formatRef(ref), status: 'redirected', canonical: formatRef({ k: 'venue', id: v.id }), venue: venueView(v, deps) };
}

function resolveEvent(ref, deps) {
  const e = deps.getEvent(ref.id);
  if (!e) return { ref: formatRef(ref), status: 'missing' };
  const event = { ref: formatRef({ k: 'event', id: e.id }), name: e.name, region: e.region, url: deps.eventUrl(e) };
  if (!ref.occ) return { ref: formatRef(ref), status: 'undated', event };
  const o = deps.getOccurrence(ref.occ);
  if (!o || o.event_id !== e.id) return { ref: formatRef(ref), status: 'missing_occurrence', event };
  const occurrence = { id: o.id, date: o.start_date, endDate: o.end_date, time: o.start_time || null };
  let status = 'upcoming';
  if (o.status === 'cancelled') status = 'cancelled';
  else if (o.status === 'postponed') status = 'postponed';
  else if (o.end_date < deps.today) status = 'past';
  return { ref: formatRef(ref), status, event, occurrence };
}

function resolveName(name, deps) {
  const candidates = [
    ...deps.findVenuesByName(name).map((v) => ({ kind: 'venue', ...venueView(v, deps) })),
    ...deps.findEventsByName(name).map((e) => ({ kind: 'event', ref: formatRef({ k: 'event', id: e.id }), name: e.name, region: e.region, url: deps.eventUrl(e) })),
  ];
  const status = candidates.length === 0 ? 'missing' : candidates.length === 1 ? 'resolved' : 'ambiguous';
  return { name, status, candidates };
}

function resolveSavedItems(input, deps) {
  const checked = validateResolveInput(input);
  if (!checked.ok) return checked;
  return {
    ok: true,
    items: checked.refs.map((ref) => (ref.k === 'venue' ? resolveVenue(ref, deps) : resolveEvent(ref, deps))),
    names: checked.names.map((n) => resolveName(n, deps)),
  };
}

// The sidecar (okanaganSaved) after a resolve: redirected venue ids become the
// canonical id (decision D2c); everything else -- including missing items --
// is kept exactly as it was. Never drops a distinct item; never touches
// okanaganFavorites.
function reconcileSidecar(sidecar, resolvedItems) {
  const items = (sidecar && Array.isArray(sidecar.items)) ? sidecar.items : [];
  const canonicalOf = new Map();
  for (const r of resolvedItems || []) if (r && r.status === 'redirected') canonicalOf.set(r.ref, parseRef(r.canonical));
  let changed = false;
  const rewritten = items.map((item) => {
    if (!item || item.k !== 'venue') return item;
    const canon = canonicalOf.get(formatRef(item));
    if (!canon) return item;
    changed = true;
    return { ...item, id: canon.id, redirectedFrom: item.id };
  });
  // A rewrite can make an item identical to one already saved (the canonical
  // venue was saved too): the two are the same saved venue, so they merge
  // (first one kept). Different items are never merged.
  const seen = new Set();
  const out = rewritten.filter((item) => {
    if (!item || item.k !== 'venue') return true;
    const key = formatRef(item);
    if (seen.has(key)) { changed = true; return false; }
    seen.add(key);
    return true;
  });
  return { sidecar: { v: 1, items: out }, changed };
}

module.exports = {
  MAX_ITEMS,
  MAX_NAMES,
  MAX_NAME_LENGTH,
  parseRef,
  formatRef,
  validateResolveInput,
  resolveSavedItems,
  reconcileSidecar,
};
