'use strict';
// Build My Trip: the notes that belong to a tour stop (2026-11-24, Dayton's report at 390px).
//
// "Can you add the guided boat tour in Kelowna you suggested? … avoid wineries." added Luxury Lake Tours on day 2. The
// plan's card said "2:15 PM · book a departure time" and the chat's reply said the operator also runs wine tours (pick
// an outing with no winery stop) and to check the date. A freshly opened shared copy said only "2:15 PM · Tour &
// Experience · Kelowna": the notes lived in that one reply, not on the stop.
//
// Here the notes are worked out for the STOP, from what is already known and nothing else:
//   suggested   the time is the planner's own suggestion and a departure has to be booked: a Tours listing that is not
//               rentals only, at a time that is not one of its own stored departures (the plan's "book a departure
//               time" rule, trip-planner.js);
//   also        the trip rules a kind out ("avoid wineries", asks=no:winery) and this operator also runs tours of that
//               kind, by its own facts: one line saying to pick an outing without such a stop;
//   date        an operator-run outing on a trip with dates: check the date with the operator.
// The plan's card, its Details, the Book my trip sheet, the copied text and the shared copy all say these same words.
// Nothing is carried in the share link: the copy works them out again from the link's stops, times, dates and asks and
// the listings as they are now, so a link made before this reads the same way, and a stop taken off takes its notes
// with it. Nothing here says a tour is booked, held or open on a date.
//
// This file is the same on okanaganroam.com and whistlerroam.com. Pure functions; server.js passes the listing's facts.

// The kind of tour that goes to the places a rule keeps out.
const TOUR_OF = { winery: 'wine_tour', brewery: 'brewery_tour' };
// A brewery tour is not a kind the planner infers: the listing's own words say it.
const OWN_WORDS = { brewery: /\b(?:brewer(?:y|ies)|craft[- ]beer|beer|brew ?pub|microbrasseries?) (?:tasting )?(?:tours?|crawls?|hops?)\b|\btours? of (?:the |local |nearby )?(?:craft )?brewer(?:y|ies)\b|\b(?:tourn[ée]es?|tours?|circuits?) (?:de|des) (?:micro)?brasseries\b/i };
// Planner kinds that are an outing an operator runs for you (trip-requirements.js TOUR_PLANNER_KINDS, never rentals).
const NOT_RUN = ['rentals'];

const T = {
  en: {
    time: 'Suggested time · {book}', book: 'book a departure time with the operator',
    also: 'Also runs {what}: pick an outing with no {one} stop.',
    date: 'Check your date with the operator.',
    what: { winery: 'wine tours', brewery: 'brewery tours' }, one: { winery: 'winery', brewery: 'brewery' },
  },
  fr: {
    time: 'Heure suggérée · {book}', book: 'réservez un départ auprès de l’exploitant',
    also: 'Propose aussi des {what} : choisissez une sortie sans arrêt dans {one}.',
    date: 'Vérifiez votre date auprès de l’exploitant.',
    what: { winery: 'tours des vignobles', brewery: 'tours de microbrasseries' }, one: { winery: 'un vignoble', brewery: 'une microbrasserie' },
  },
};

// Does this listing also run tours of a kind the trip rules out? kinds: its planner kinds; text: its own name and words.
function alsoRuns(kind, kinds, text) {
  if (!TOUR_OF[kind]) return false;
  if ((kinds || []).includes(TOUR_OF[kind])) return true;
  return !!(OWN_WORDS[kind] && OWN_WORDS[kind].test(String(text || '')));
}
// An outing an operator runs: a Tours listing that is not rentals only, or a listing whose own facts make it one (a
// guided boat tour listed under Outdoors). tourKinds: the operator's own answers; kinds: the planner kinds.
function operatorRun({ type, kinds = [], tourKinds = null, tourKindSet = [] } = {}) {
  const rentalsOnly = Array.isArray(tourKinds) && tourKinds.length > 0 && tourKinds.every((k) => k === 'rentals');
  if (type === 'tour') return !rentalsOnly;
  return (kinds || []).some((k) => tourKindSet.includes(k) && !NOT_RUN.includes(k));
}

// One stop's notes. f:
//   type, kinds, tourKinds, tourKindSet   the listing's facts (above)
//   text                                  its own name and words
//   start                                 the stop's time on the plan or in the link (minutes), or null
//   departure                             the plan timed it by one of the listing's own stored departures
//   departures                            the listing's stored departure times (minutes), when it is a link asking
//   scheduled                             the stop already carries a suggested-time note of its own (trip-timing.js)
//   exclusions                            the kinds the trip rules out (['winery'])
//   dated                                 the trip has dates the traveller gave
// -> null (not an operator-run outing, or nothing to say), or
//    { suggested, also, date, book, bookFr, time, timeFr, note, noteFr, lines, linesFr }
function notes(f = {}) {
  if (!operatorRun(f)) return null;
  const rentalsOnly = Array.isArray(f.tourKinds) && f.tourKinds.length > 0 && f.tourKinds.every((k) => k === 'rentals');
  const hasTime = Number.isInteger(f.start);
  // (The plan says so itself for a stop it timed by a stored departure; a link is checked against the stored ones.)
  const ownDeparture = f.departure === true || (hasTime && (f.departures || []).includes(f.start));
  const suggested = f.type === 'tour' && !rentalsOnly && hasTime && !ownDeparture && !f.scheduled;
  const also = (f.exclusions || []).find((k) => alsoRuns(k, f.kinds, f.text)) || null;
  const date = !!f.dated && !f.scheduled;
  if (!suggested && !also && !date) return null;
  const say = (L) => [also ? T[L].also.replace('{what}', T[L].what[also]).replace('{one}', T[L].one[also]) : '', date ? T[L].date : ''].filter(Boolean).join(' ');
  const out = { suggested, also, date, note: say('en'), noteFr: say('fr') };
  if (suggested) { out.book = T.en.book; out.bookFr = T.fr.book; out.time = T.en.time.replace('{book}', T.en.book); out.timeFr = T.fr.time.replace('{book}', T.fr.book); }
  // Every line, in order (the shared copy and the plan's Details print them as they are).
  out.lines = [out.time, out.note].filter(Boolean);
  out.linesFr = [out.timeFr, out.noteFr].filter(Boolean);
  return out;
}

// The plan's schedule rows, marked in place: row.activity = notes(...) for each operator-run stop. factsOf(id) gives
// { type, kinds, tourKinds, text } or null. A row that is not one has no such key.
function applyNotes(plan, factsOf, { exclusions = [], dated = false, tourKindSet = [] } = {}) {
  for (const row of (plan && plan.schedule) || []) {
    delete row.activity;
    if (!row || !row.venueId || row.eventId) continue;
    let f = null;
    try { f = factsOf(row.venueId); } catch (e) { f = null; }
    if (!f) continue;
    const n = notes({ ...f, tourKindSet, start: Number.isInteger(row.startMinutes) ? row.startMinutes : null, departure: !!row.departure, scheduled: !!(row.timing && row.timing.schedule), exclusions, dated });
    if (n) row.activity = n;
  }
  return plan;
}

module.exports = { TOUR_OF, T, alsoRuns, operatorRun, notes, applyNotes };
