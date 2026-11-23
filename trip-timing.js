'use strict';
// Build My Trip: what a stop's time on the plan is (2026-11-23, Dayton: a cinema showed "7:45 PM–8:45 PM" as if it were
// a showtime and a film's length). Every time on a plan is the planner's own suggestion; this says which stops run on a
// schedule of their own that we do not hold, and what is known about the hours. Pure functions; server.js passes the
// listing's kinds in.
//
//   row.timing = {
//     schedule: 'showtimes' | 'classes' | 'sessions'   the stop runs at set times we do not hold (absent otherwise);
//     allowMinutes: 120                                a realistic allowance (a film is about 2 h), only when the next
//                                                      stop leaves room for it; else no length is said at all;
//     hours: 'listed' | 'unknown'                      the suggested time fits the listed opening hours, or none are held;
//     checkUrl: 'https://…'                            the listing's own stored website (never a search), when it has one
//   }
// A tour's departure (row.departure / row.bookDeparture) and an event's own start time are already said as they are.

// The listing kinds (indoor-kinds.js, sport kinds) that run at set times.
const SCHEDULE_OF = { cinema: 'showtimes', theatre: 'showtimes', classes: 'classes', yoga: 'classes', skischool: 'classes', pool: 'sessions', rink: 'sessions', curling: 'sessions' };
const ALLOW = { showtimes: 120 };
// A listing with no kinds on file yet is read by its name (indoor and sport listings only).
const NAME_RE = [
  [/\b(?:cinemas?|cin[ée]mas?|movie theat(?:er|re)s?|cineplex|drive-?in|theat(?:er|re)|playhouse)\b/i, 'showtimes'],
  [/\b(?:aquatic|swimming pool|lazy river|public swim|ice rink|skating rink|arena|curling)\b|\(pool\b/i, 'sessions'],
  [/\b(?:yoga|pilates|pottery|dance studio)\b/i, 'classes'],
];

// -> 'showtimes' | 'classes' | 'sessions' | null
function scheduleKind(venue, kinds) {
  for (const k of kinds || []) if (SCHEDULE_OF[k]) return SCHEDULE_OF[k];
  if (!venue || !['indoor', 'sport'].includes(venue.type)) return null;
  const name = String(venue.name || '');
  for (const [re, kind] of NAME_RE) if (re.test(name)) return kind;
  return null;
}
function httpsUrl(u) {
  if (typeof u !== 'string' || u.length > 500) return null;
  try { const x = new URL(u.trim()); return x.protocol === 'https:' && !x.username && x.hostname.includes('.') ? x.toString() : null; } catch (e) { return null; }
}
// The timing of one schedule row. next: the start (minutes) of the next timed stop that day, or null.
function rowTiming(row, venue, kinds, next) {
  if (!row || typeof row.startMinutes !== 'number' || row.departure || row.bookDeparture) return null;
  const out = {};
  const schedule = scheduleKind(venue, kinds);
  if (schedule) {
    out.schedule = schedule;
    if (ALLOW[schedule] && (next == null || next >= row.startMinutes + ALLOW[schedule])) out.allowMinutes = ALLOW[schedule];
    const url = httpsUrl(venue && venue.website);
    if (url) out.checkUrl = url;
  }
  const why = Array.isArray(row.confirmationReasons) ? row.confirmationReasons : [];
  out.hours = why.includes('hours') || why.includes('listing_hours') || row.status === 'unverified' ? 'unknown' : 'listed';
  return out;
}
// Adds row.timing to a plan's schedule rows. kindsOf(venueId) -> the listing's kinds; venueOf(venueId) -> { name, website }.
function applyTiming(plan, kindsOf, venueOf) {
  if (!plan || !Array.isArray(plan.schedule)) return plan;
  const rows = plan.schedule;
  rows.forEach((r, i) => {
    if (!r || r.venueId == null || r.eventId != null) return;
    let next = null;
    for (let j = i + 1; j < rows.length; j++) { const n = rows[j]; if (!n || n.day !== r.day) break; if (typeof n.startMinutes === 'number') { next = n.startMinutes; break; } }
    let kinds = [], venue = null;
    try { kinds = kindsOf(r.venueId) || []; venue = venueOf(r.venueId); } catch (e) { kinds = []; }
    const t = rowTiming(r, venue, kinds, next);
    if (t) r.timing = t; else delete r.timing;
  });
  return plan;
}

// ---- the words (one place; the page, the shared copy and the chat use the same) ----
const WORDS = {
  en: { around: 'around', showtimes: 'Showtimes vary', classes: 'Class times vary', sessions: 'Session times vary', check: { showtimes: 'Check showtimes', classes: 'Check class times', sessions: 'Check session times' }, none: { showtimes: 'showtimes', classes: 'class times', sessions: 'session times' } },
  fr: { around: 'vers', showtimes: 'Les séances varient', classes: 'L’horaire des cours varie', sessions: 'L’horaire des séances varie', check: { showtimes: 'Voir les séances', classes: 'Voir l’horaire des cours', sessions: 'Voir l’horaire des séances' }, none: { showtimes: 'l’horaire des séances', classes: 'l’horaire des cours', sessions: 'l’horaire des séances' } },
};
function clock(m, fr) {
  const h = Math.floor(m / 60), mm = m % 60;
  if (fr) return `${h} h${mm ? ` ${String(mm).padStart(2, '0')}` : ''}`;
  return `${(h % 12) || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h >= 12 ? 'PM' : 'AM'}`;
}
function allowText(min, fr) {
  if (!(min > 0)) return '';
  const h = min / 60;
  return fr ? `prévoyez environ ${Number.isInteger(h) ? h : String(h).replace('.', ',')} h` : `allow about ${h} h`;
}
// "Suggested: around 7:45 PM, allow about 2 h. Showtimes vary: check Landmark Cinemas’ showtimes."
function suggestedLine(startMinutes, timing, name, fr) {
  const w = fr ? WORDS.fr : WORDS.en, t = timing || {};
  if (!t.schedule) return '';
  const head = fr ? `Heure suggérée : ${w.around} ${clock(startMinutes, true)}` : `Suggested: ${w.around} ${clock(startMinutes, false)}`;
  const allow = allowText(t.allowMinutes, fr);
  const tail = fr ? `${w[t.schedule]} : vérifiez ${w.none[t.schedule]} de ${name}.` : `${w[t.schedule]}: check ${name}’s ${w.none[t.schedule]}.`;
  return `${head}${allow ? `, ${allow}` : ''}. ${tail}`;
}

module.exports = { SCHEDULE_OF, scheduleKind, rowTiming, applyTiming, WORDS, clock, allowText, suggestedLine, httpsUrl };
