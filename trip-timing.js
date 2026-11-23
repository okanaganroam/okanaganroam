'use strict';
// Build My Trip: what a stop's time on the plan is (2026-11-23, Dayton: a cinema showed "7:45 PM–8:45 PM" as if it were
// a showtime and a film's length; then a parkour gym showed an exact "9 AM" with no word that its sessions need
// checking). Every time on a plan is the planner's own suggestion. This file says which stops run on a schedule of their
// own that we do not hold (no session, class, lane or showtime is stored anywhere on the site), what must be checked for
// each, what is known about the hours, and what the listing itself says about ages. Pure functions; server.js passes the
// listing's own data in (its kinds, words, stored links, hours). The words are here once: the plan, the Book my trip
// sheet, the shared copy and the chat all say them from this table (clientSource() puts them in the page).
//
//   row.timing = {
//     schedule: one of the kinds below        the stop runs at set times we do not hold (absent otherwise);
//     allowMinutes: 120                       a realistic allowance (a film is about 2 h), only when the next stop
//                                             leaves room for it; else no length is said at all;
//     hours: 'listed' | 'unknown'             the suggested time fits the listed opening hours, or none are held;
//     open: { a: 540, b: 1200, wd: 'sun' }    a scheduled stop's listed hours that day ("Open 9 AM–8 PM Sun by its listed
//                                             hours"): open is not the same as a session being on;
//     checkUrl: 'https://…'                   the listing's own stored link (never a search): its booking link for a kind
//                                             that is booked, else its website; checkVia: 'booking' when it is the former;
//     kidAges: [6, 9] | kids: true            children are in the party and the listing states no ages: "check it suits";
//     agesSaid: { en, fr }                    what the listing itself states about ages (never read from a badge)
//   }
// What stays as it is: an event's own start time, a tour's stored departure (row.departure) or "book a departure time"
// (row.bookDeparture), and a place you simply walk into (a park, museum, gallery, restaurant, a winery with listed
// hours): "Within its listed hours." or "Hours not verified: check before you go."

// ---- the kinds of schedule, and what must be checked for each (the one list) ----
// book: the listing's stored booking link is the right step when it has one (else its website); ages: with children in
// the party, the age line is said (a film's rating is not ours to read, a tasting is for adults).
const TT_WORDS = {
  // Cinemas and theatres: showtimes.
  showtimes: { en: ['Showtimes vary', 'showtimes', 'Check showtimes'], fr: ['Les séances varient', 'l’horaire des séances', 'Voir les séances'] },
  // Classes, lessons, yoga, pottery and paint studios: class times.
  classes: { ages: true, en: ['Class times vary', 'class times', 'Check class times'], fr: ['L’horaire des cours varie', 'l’horaire des cours', 'Voir l’horaire des cours'] },
  // Pools and curling: public swim and session times.
  sessions: { ages: true, en: ['Session times vary', 'session times', 'Check session times'], fr: ['L’horaire des séances varie', 'l’horaire des séances', 'Voir l’horaire des séances'] },
  // Skating rinks and arenas: public skate times.
  skate: { ages: true, en: ['Public skate times vary', 'public skate times', 'Check public skate times'], fr: ['Les heures de patinage public varient', 'l’horaire du patinage public', 'Voir le patinage public'] },
  // Parkour, gymnastics, ninja and climbing gyms, trampoline parks, kids' play centres: sessions and drop-in times.
  dropin: { ages: true, has: ['session and drop-in times', 'l’horaire des séances et des heures libres'], en: ['Sessions and drop-in times vary', 'schedule', 'Check sessions'], fr: ['Les séances et les heures libres varient', 'l’horaire', 'Voir les séances'] },
  // Bowling: a lane is booked.
  lanes: { book: true, ages: true, en: ['Lanes can be fully booked', 'lane times', 'Book a lane'], fr: ['Les allées peuvent être toutes réservées', 'les disponibilités des allées', 'Réserver une allée'] },
  // Escape rooms: a room is booked for a time slot.
  rooms: { book: true, ages: true, en: ['Rooms are booked by time slot', 'room times', 'Book a room'], fr: ['Les salles se réservent par plage horaire', 'les plages horaires', 'Réserver une salle'] },
  // VR, laser tag, go-karts, axe throwing, paintball: sessions booked by time slot.
  booked: { book: true, ages: true, en: ['Sessions are booked by time slot', 'session times', 'Check sessions'], fr: ['Les séances se réservent par plage horaire', 'l’horaire des séances', 'Voir les séances'] },
  // Spas, thermal circuits and saunas: a booked session.
  spa: { book: true, ages: true, en: ['Spa and sauna sessions are booked ahead', 'available times', 'Book a session'], fr: ['Les séances de spa et de sauna se réservent à l’avance', 'les disponibilités', 'Réserver une séance'] },
  // Tube parks: tickets for a timed session.
  tickets: { book: true, ages: true, en: ['Tickets are for timed sessions', 'ticket times', 'Check ticket times'], fr: ['Les billets sont pour des séances à heure fixe', 'l’horaire des billets', 'Voir les heures des billets'] },
  // A tasting room whose own listing says by appointment / reservations required.
  appointment: { book: true, en: ['Tastings are by appointment', 'tasting times', 'Book a tasting'], fr: ['Les dégustations sont sur rendez-vous', 'les heures de dégustation', 'Réserver une dégustation'] },
};
// The listing kinds (indoor-kinds.js, sport-kinds.js) that run at set times. 'games' is read below (an arcade is walked
// into; VR, laser tag, karting and axe throwing are booked).
const SCHEDULE_OF = { cinema: 'showtimes', theatre: 'showtimes', classes: 'classes', yoga: 'classes', skischool: 'classes', pool: 'sessions', swim: 'sessions', curling: 'sessions', rink: 'skate',
  climbing: 'dropin', kids: 'dropin', bowling: 'lanes', escape: 'rooms', spa: 'spa' };
const ALLOW = { showtimes: 120 };
const BOOKED_GAMES_RE = /\b(?:vr|virtual reality|r[ée]alit[ée] virtuelle|laser[- ]?tag|lazer|go[- ]?karts?|karting|axe[- ]?throwing|lancer de haches?|paintball)\b/i;
// A listing with no kinds on file yet is read by its name (indoor and sport listings; a rink or a tube park outdoors too).
const NAME_RE = [
  [/\b(?:cinemas?|cin[ée]mas?|movie theat(?:er|re)s?|cineplex|drive-?in|theat(?:er|re)|playhouse)\b/i, 'showtimes'],
  [/\bescape\b/i, 'rooms'],
  [/\b(?:bowling(?! greens?)|lanes)\b/i, 'lanes'],
  [/\b(?:parkour|gymnastics|ninja|trampolines?|bouldering|climbing(?!.*\b(?:boulder|park|trail|bluffs?)\b)|indoor play|play (?:centre|center|area)|tots gym)\b/i, 'dropin'],
  [BOOKED_GAMES_RE, 'booked'],
  [/\b(?:spa|saunas?|thermal|hydrotherapy)\b/i, 'spa'],
  [/\b(?:tube park|tubing)\b/i, 'tickets'],
  [/\b(?:rinks?|skating|arenas?|patinoire)\b/i, 'skate'],
  [/\b(?:aquatic|swimming pool|outdoor pool|community pool|lazy river|public swim|curling)\b|\(pool\b/i, 'sessions'],
  [/\b(?:yoga|pilates|pottery|dance studio|paint(?:ing)? studio|art school)\b/i, 'classes'],
];
// The listing's own description, only when its name says nothing and it is not a walk-in place by name: the plain
// phrases only (a museum that mentions a film is not a cinema).
const WALK_IN_NAME_RE = /\b(?:museums?|galler(?:y|ies)|librar(?:y|ies)|archives|casino|heritage|cultural|observatory|art)\b/i;
const DESC_RE = [
  [/\b(?:movie theat(?:er|re)|cinema|showtimes)\b/i, 'showtimes'],
  [/\bescape (?:rooms?|games?)\b/i, 'rooms'],
  [/\b(?:(?:5|10|five|ten)[- ]pin|bowling (?:alley|lanes?|centre|center))\b/i, 'lanes'],
  [/\b(?:parkour|trampoline park|ninja (?:course|gym|warrior)|(?:climbing|bouldering) gym|gymnastics|indoor play(?:ground)?|play ?(?:centre|center)|soft play|open[- ]gym)\b/i, 'dropin'],
  [/\b(?:vr|virtual reality|r[ée]alit[ée] virtuelle|laser[- ]?tag|axe[- ]?throwing|paintball)\b/i, 'booked'],
  [/\b(?:floating sauna|sauna sessions?|thermal (?:circuit|spa|baths?)|hydrotherapy circuit|nordic spa)\b/i, 'spa'],
  [/\bpublic skat(?:e|ing)\b/i, 'skate'],
  [/\b(?:public swim(?:s|ming)?|lane swim(?:s|ming)?|lazy river|aquatic centre)\b/i, 'sessions'],
  [/\bpools?\b(?! (?:tables?|halls?|cues?))/i, 'sessions', 'indoor'], // a rec centre's pool (a skate park beside a pool is not one)
  [/\b(?:class schedule|drop-in classes|pottery (?:classes|studio)|paint-your-own|yoga (?:studio|classes))\b/i, 'classes'],
];
// A tasting room's own words: by appointment or reservations required (never "recommended", never "tours by appointment").
const TASTING_TYPES = ['winery', 'brewery', 'distillery'];
const APPOINTMENT_RE = /\bappointment[- ](?:only|based|style)\b|\bby appointment only\b|\btastings? (?:are |is )?(?:only )?(?:by|available by) (?:appointment|reservation)\b|\breservations? (?:are |is )?required\b|\bby reservation only\b|\bsur rendez-vous seulement\b|\br[ée]servation (?:obligatoire|requise)\b/i;
const WALK_IN_RE = /\bwalk[- ]?ins? (?:are )?(?:welcome|available|accepted)\b|\bno (?:appointments?|reservations?) (?:needed|necessary|required)\b|\b(?:appointments?|reservations?) (?:are )?not required\b/i;

// -> one of the TT_WORDS keys, or null. venue: { name, type, description?, text? (its other own words), appointment?
// (its owner's own answer: true / false) }; kinds: its kinds on file.
function scheduleKind(venue, kinds) {
  const v = venue || {}, name = String(v.name || ''), words = `${v.description || ''} ${v.text || ''}`;
  for (const k of kinds || []) {
    if (SCHEDULE_OF[k]) return SCHEDULE_OF[k];
    if (k === 'games' && BOOKED_GAMES_RE.test(`${name} ${words}`)) return 'booked';
  }
  if (TASTING_TYPES.includes(v.type)) {
    if (v.appointment === true) return 'appointment';
    return v.appointment !== false && APPOINTMENT_RE.test(words) && !WALK_IN_RE.test(words) ? 'appointment' : null;
  }
  const outdoors = v.type === 'outdoor';
  if (!['indoor', 'sport'].includes(v.type) && !outdoors) return null;
  for (const [re, kind] of NAME_RE) if ((!outdoors || kind === 'skate' || kind === 'tickets') && re.test(name)) return kind;
  if (outdoors || (kinds || []).length || WALK_IN_NAME_RE.test(name)) return null;
  for (const [re, kind, only] of DESC_RE) if ((!only || only === v.type) && re.test(words)) return kind;
  return null;
}
function httpsUrl(u) {
  if (typeof u !== 'string' || u.length > 500) return null;
  try { const x = new URL(u.trim()); return x.protocol === 'https:' && !x.username && x.hostname.includes('.') ? x.toString() : null; } catch (e) { return null; }
}
// The one stored link for the step: the booking link for a kind that is booked, else the website; the other when the
// first is not on file. -> { url, via: 'booking' | 'website' } | null
function checkLink(schedule, venue) {
  const v = venue || {}, site = httpsUrl(v.website), book = httpsUrl(v.bookingUrl), w = TT_WORDS[schedule] || {};
  const first = w.book ? (book ? 'booking' : site ? 'website' : null) : (site ? 'website' : book ? 'booking' : null);
  return first ? { url: first === 'booking' ? book : site, via: first } : null;
}

// ---- what the listing itself states about ages (its owner's answer, its Ages line, its own words; never a badge) ----
const AGE_RE = /\ball ages\b|\btous les [aâ]ges\b|\badults only\b|\b(?:ages?|aged|kids|children)\s+(\d{1,2})\s*(?:to|-|–|—)\s*(\d{1,2})\b|\b(?:ages?|aged)\s+(\d{1,2})\s*(?:\+|and (?:up|over|older))|\b(\d{1,2}) and over\b|\b(\d{1,2})\s*(?:years?(?: old)?|yrs?)\s*(?:and|or|&)\s*(?:up|over|older)\b|\bminimum age (?:is |of )?(\d{1,2})\b|\bfrom age (\d{1,2})\b|(?:à|\ba) partir de (\d{1,2}) ans\b|\b(\d{1,2}) ans et plus\b/i;
function agePhrase(text) {
  const m = AGE_RE.exec(String(text || ''));
  if (!m) return null;
  if (/all ages|tous les/i.test(m[0])) return { en: 'all ages', fr: 'tous les âges' };
  if (/adults only/i.test(m[0])) return { en: 'adults only', fr: 'adultes seulement' };
  if (m[1] && m[2]) { const a = Number(m[1]), b = Number(m[2]); return b > a && b <= 21 ? { en: `ages ${a} to ${b}`, fr: `de ${a} à ${b} ans` } : null; }
  const n = Number(m[3] || m[4] || m[5] || m[6] || m[7] || m[8] || m[9]);
  return n >= 1 && n <= 21 ? { en: `ages ${n}+`, fr: `${n} ans et plus` } : null;
}
// ownerLine: the owner's own "Who can come" answer as the page says it ("Ages 5 and up."); rows: its Plan your visit
// lines; description: its story. -> { en: 'Its listing says ages 5+.', fr: 'Sa fiche indique : 5 ans et plus.' } | null
function agesStated({ ownerLine = null, rows = [], description = '' } = {}) {
  const say = (p) => (p ? { en: `Its listing says ${p.en}.`, fr: `Sa fiche indique : ${p.fr}.` } : null);
  const own = agePhrase(ownerLine);
  if (own) return say(own);
  const line = (rows || []).find((r) => r && /^(?:ages?|[aâ]ges?|who can come)$/i.test(String(r.label || '').trim()) && typeof r.text === 'string' && r.text.trim());
  if (line) {
    // Its own Ages line, in its words (the first sentence); in French the plain reading when there is one.
    const first = String(line.text).split(/[.;]\s/)[0].replace(/[\s.;]+$/, '').trim(), p = agePhrase(line.text);
    if (first.length <= 90) return { en: `Its listing says: “${first}”.`, fr: p ? `Sa fiche indique : ${p.fr}.` : `Sa fiche indique : « ${first} ».` };
    if (p) return say(p);
  }
  for (const t of (rows || []).map((r) => (r && typeof r.text === 'string' ? r.text : '')).concat(String(description || ''))) { const p = agePhrase(t); if (p) return say(p); }
  return null;
}

// The timing of one schedule row. next: the start (minutes) of the next timed stop that day, or null.
// venue: { name, type, website, bookingUrl?, description?, text?, appointment?, ages? (agesStated), open? ({ a, b, wd }) }.
// party: { kidAges: [6, 9] } | { kids: 2 } | null.
function rowTiming(row, venue, kinds, next, party) {
  if (!row || typeof row.startMinutes !== 'number' || row.departure || row.bookDeparture) return null;
  const out = {};
  const schedule = scheduleKind(venue, kinds);
  if (schedule) {
    out.schedule = schedule;
    if (ALLOW[schedule] && (next == null || next >= row.startMinutes + ALLOW[schedule])) out.allowMinutes = ALLOW[schedule];
    const link = checkLink(schedule, venue);
    if (link) { out.checkUrl = link.url; if (link.via === 'booking') out.checkVia = 'booking'; }
    if (TT_WORDS[schedule].ages) {
      const ages = party && Array.isArray(party.kidAges) ? party.kidAges.filter((a) => Number.isInteger(a) && a >= 0 && a <= 17).slice(0, 6) : [];
      if (venue && venue.ages && venue.ages.en) out.agesSaid = { en: venue.ages.en, fr: venue.ages.fr || venue.ages.en };
      else if (ages.length) out.kidAges = ages;
      else if (party && party.kids > 0) out.kids = true;
    }
    const o = venue && venue.open;
    if (o && Number.isInteger(o.a) && Number.isInteger(o.b) && o.a <= row.startMinutes && row.startMinutes < o.b) out.open = { a: o.a, b: o.b, wd: o.wd };
  }
  const why = Array.isArray(row.confirmationReasons) ? row.confirmationReasons : [];
  out.hours = why.includes('hours') || why.includes('listing_hours') || row.status === 'unverified' ? 'unknown' : 'listed';
  return out;
}
// Adds row.timing to a plan's schedule rows. kindsOf(venueId) -> the listing's kinds; venueOf(venueId, row) -> the
// listing (rowTiming's venue); party: the children on the trip, when the request or the party control says.
function applyTiming(plan, kindsOf, venueOf, party) {
  if (!plan || !Array.isArray(plan.schedule)) return plan;
  const rows = plan.schedule;
  rows.forEach((r, i) => {
    if (!r || r.venueId == null || r.eventId != null) return;
    let next = null;
    for (let j = i + 1; j < rows.length; j++) { const n = rows[j]; if (!n || n.day !== r.day) break; if (typeof n.startMinutes === 'number') { next = n.startMinutes; break; } }
    let kinds = [], venue = null;
    try { kinds = kindsOf(r.venueId) || []; venue = venueOf(r.venueId, r); } catch (e) { kinds = []; }
    const t = rowTiming(r, venue, kinds, next, party || null);
    if (t) r.timing = t; else delete r.timing;
  });
  return plan;
}

// ---- the words (one place; the page, the sheet, the shared copy and the chat say the same). These functions are also
// sent to the page as they are (clientSource), so they use nothing but TT_WORDS and each other. ----
function ttClock(m, fr) {
  var h = Math.floor(m / 60), mm = m % 60;
  if (fr) return h + ' h' + (mm ? ' ' + String(mm).padStart(2, '0') : '');
  return ((h % 12) || 12) + (mm ? ':' + String(mm).padStart(2, '0') : '') + ' ' + (h >= 12 ? 'PM' : 'AM');
}
// "ages 6 and 9" / "age 6" / "your kids"; « aux enfants de 6 et 9 ans ».
function ttKids(t, fr) {
  var a = t && t.kidAges && t.kidAges.length ? t.kidAges : null;
  if (!a) return t && t.kids ? (fr ? 'à vos enfants' : 'your kids') : '';
  var list = a.length === 1 ? String(a[0]) : a.slice(0, -1).join(', ') + (fr ? ' et ' : ' and ') + a[a.length - 1];
  return fr ? (a.length === 1 ? 'à un enfant de ' : 'aux enfants de ') + list + ' ans' : (a.length === 1 ? 'age ' : 'ages ') + list;
}
// "Sessions and drop-in times vary: check Ethos Parkour & Movement’s schedule and that it suits ages 6 and 9."
// With ages on its listing: "… schedule. Its listing says ages 5+."
function ttCheck(t, name, fr) {
  var w = t && TT_WORDS[t.schedule];
  if (!w) return '';
  var k = ttKids(t, fr), said = t.agesSaid ? ' ' + (fr ? t.agesSaid.fr : t.agesSaid.en) : '';
  return fr ? w.fr[0] + ' : vérifiez ' + w.fr[1] + ' de ' + name + (k ? ' et qu’il convient ' + k : '') + '.' + said
    : w.en[0] + ': check ' + name + '’s ' + w.en[1] + (k ? ' and that it suits ' + k : '') + '.' + said;
}
// "Open 9 AM–8 PM Sun by its listed hours." (a scheduled stop only: open is not a session)
function ttOpen(t, fr) {
  var o = t && t.open;
  if (!o) return '';
  var d = (fr ? { mon: 'lun.', tue: 'mar.', wed: 'mer.', thu: 'jeu.', fri: 'ven.', sat: 'sam.', sun: 'dim.' } : { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' })[o.wd] || '';
  return fr ? 'Ouvert de ' + ttClock(o.a, true) + ' à ' + ttClock(o.b, true) + (d ? ' ' + d : '') + ' selon ses heures indiquées.' : 'Open ' + ttClock(o.a, false) + '–' + ttClock(o.b, false) + (d ? ' ' + d : '') + ' by its listed hours.';
}
// The link's label for the kind ("Check sessions", "Book a lane"), the short reason ("Sessions and drop-in times vary"),
// what is checked ("schedule") and the short age line for a list ("Check it suits ages 6 and 9." / "Its listing says ages 5+.").
function ttLink(kind, fr) { var w = TT_WORDS[kind]; return w ? (fr ? w.fr[2] : w.en[2]) : ''; }
function ttWhy(kind, fr) { var w = TT_WORDS[kind]; return w ? (fr ? w.fr[0] : w.en[0]) : ''; }
function ttWhat(kind, fr) { var w = TT_WORDS[kind]; return w ? (fr ? w.fr[1] : w.en[1]) : ''; }
function ttAgeNote(t, fr) {
  if (t && t.agesSaid) return fr ? t.agesSaid.fr : t.agesSaid.en;
  var k = ttKids(t, fr);
  return k ? (fr ? 'Vérifiez qu’il convient ' + k + '.' : 'Check it suits ' + k + '.') : '';
}
// The same in a few words, for a list row: "check ages 6 and 9" / « vérifiez l’âge (6 et 9 ans) ». Nothing when the
// listing states its ages (the card says them).
function ttAgeShort(t, fr) {
  if (!t || t.agesSaid) return '';
  var a = t.kidAges && t.kidAges.length ? t.kidAges : null;
  if (!a) return t.kids ? (fr ? 'vérifiez l’âge' : 'check ages') : '';
  var list = a.length === 1 ? String(a[0]) : a.slice(0, -1).join(', ') + (fr ? ' et ' : ' and ') + a[a.length - 1];
  return fr ? 'vérifiez l’âge (' + list + ' ans)' : 'check ' + (a.length === 1 ? 'age ' : 'ages ') + list;
}
// The words and the functions above, for a page's own script.
function clientSource() {
  return 'var TT_WORDS = ' + JSON.stringify(TT_WORDS).replace(/</g, '\\u003c') + ';\n' + [ttClock, ttKids, ttCheck, ttOpen, ttLink, ttWhy, ttWhat, ttAgeNote, ttAgeShort].map((f) => f.toString()).join('\n');
}

const clock = ttClock;
function allowText(min, fr) {
  if (!(min > 0)) return '';
  const h = min / 60;
  return fr ? `prévoyez environ ${Number.isInteger(h) ? h : String(h).replace('.', ',')} h` : `allow about ${h} h`;
}
// "Suggested: around 7:45 PM, allow about 2 h. Showtimes vary: check Landmark Cinemas’ showtimes."
function suggestedLine(startMinutes, timing, name, fr) {
  const t = timing || {};
  if (!t.schedule || !TT_WORDS[t.schedule]) return '';
  const head = fr ? `Heure suggérée : vers ${clock(startMinutes, true)}` : `Suggested: around ${clock(startMinutes, false)}`;
  const allow = allowText(t.allowMinutes, fr);
  return `${head}${allow ? `, ${allow}` : ''}. ${ttCheck(t, name, fr)}`;
}
// ---- the chat: which kind a question names ("what time is parkour?", "do we need to book bowling?"); t is folded
// (lower case, no accents). -> a TT_WORDS key or null.
const ASK_RE = [
  ['showtimes', /\b(?:movies?|films?|cinema|screening|show(?:ing|time)?s?|theat(?:er|re)|spectacle)\b/],
  ['rooms', /\b(?:escape|evasion)\b/],
  ['lanes', /\b(?:bowling|lanes?|quilles)\b/],
  ['dropin', /\b(?:parkour|gym|gymnastics?|gymnastique|climbing|bouldering|escalade|trampolines?|ninja|play ?(?:centre|center|place|ground|area)|open gym)\b/],
  ['booked', /\b(?:vr|virtual reality|realite virtuelle|laser ?tag|go ?karts?|karting|axe throwing|axes?|haches?|paintball)\b/],
  ['spa', /\b(?:spa|saunas?|thermal|massages?)\b/],
  ['tickets', /\b(?:tube park|tubing|tubes?|glissades?)\b/],
  ['skate', /\b(?:skat\w*|rink|arena|patin\w*|patinoire)\b/],
  ['sessions', /\b(?:swim\w*|pool|piscine|baignade|curling)\b/],
  ['classes', /\b(?:class(?:es)?|lessons?|cours|yoga|pottery|poterie)\b/],
  ['appointment', /\b(?:tastings?|degustations?)\b/],
];
function askKind(t) { for (const [k, re] of ASK_RE) if (re.test(String(t || ''))) return k; return null; }
// What the chat says it does not hold ("showtimes", "session and drop-in times").
function hasNoun(kind, fr) { const w = TT_WORDS[kind]; return w ? (w.has ? w.has[fr ? 1 : 0] : w[fr ? 'fr' : 'en'][1]) : ''; }

// The older table's shape (the chat's words).
const WORDS = { en: { around: 'around', check: {}, none: {} }, fr: { around: 'vers', check: {}, none: {} } };
for (const k of Object.keys(TT_WORDS)) for (const l of ['en', 'fr']) { WORDS[l][k] = TT_WORDS[k][l][0]; WORDS[l].none[k] = TT_WORDS[k][l][1]; WORDS[l].check[k] = TT_WORDS[k][l][2]; }

module.exports = { TT_WORDS, SCHEDULE_OF, scheduleKind, askKind, hasNoun, checkLink, agePhrase, agesStated, rowTiming, applyTiming, WORDS, clock, allowText, suggestedLine, httpsUrl,
  ttClock, ttKids, ttCheck, ttOpen, ttLink, ttWhy, ttWhat, ttAgeNote, ttAgeShort, clientSource };
