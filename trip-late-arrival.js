'use strict';
// Build My Trip: one of the party arrives later (or leaves earlier) than the others (2026-11-23).
//
// The owner's report, at 390px: "Plan a 3-day girls getaway in Naramata for three adults from October 8 to October 10,
// 2027. … Our friend arrives only on October 9 and needs a separate room for one night." The plan showed three adults
// and two assumed rooms for both nights, the booking link carried 3 adults / 2 rooms / Oct 8–10 as if that were the
// arrangement, the shared copy said nothing of it, and the chat follow-up ("only include her for activities from
// October 9") added an unrelated activity.
//
// This module reads the arrangement from the request's own words (English and French), works it out against the trip's
// days, and words it once for every surface (summary, stay card, Details, Book my trip, chat, shared copy):
//   - who is there which nights ("2 adults Oct 8–10 · 1 more from Oct 9, own room, 1 night");
//   - the stay as the bookings it really takes. No booking link (the hotel's own site, Booking.com, Expedia, Stay22)
//     can hold different dates per room, so a later arrival with a room of their own is TWO separate bookings, each
//     with its own link built by the usual exact-link builder for its own dates, adults and rooms. A link is never
//     shown as the arrangement unless it carries it;
//   - each day's head count (Day 1 for 2, from Day 2 for all 3), which the estimate uses too.
// Conservative: only a clear statement about one (or a counted few) of the party, with a date, weekday or day that
// falls inside the trip. Anything else leaves the plan exactly as it was. Room availability is never claimed.
//
// The time of day they arrive (2026-11-24). The owner, same request: the plan marked Day 2 "for all 3" and so assumed the
// friend could join the 9 AM activity on the day she arrives, without asking when she arrives. Now:
//   - a time said with the statement or answered in the chat is read (need.at: { m: minutes } for a clock time,
//     { part: 'afternoon' } for a part of the day, each part a window: DAYPARTS);
//   - with no time, the arrival day is never "for all 3": it is "for 2 + 1 arriving", the plan asks once
//     ("What time do they arrive on Oct 9?") and says the day's stops are for 2 until then;
//   - with a time, each stop of that day is for 2 when it starts before the arrival, "not confirmed for all 3" when it
//     starts within an hour after it (how long it takes to get there from wherever they arrive is not known, and is
//     never claimed), and for everyone after that. No stop is moved for it.
// A departure time ("leaves at noon on the 10th") is the same rule turned round.

const SBL = require('./stay-booking-links');

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/œ/g, 'oe');
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

// ---------- Reading ----------
const NUM = { a: 1, an: 1, one: 1, another: 1, the: 1, our: 1, my: 1, un: 1, une: 1, notre: 1, mon: 1, ma: 1, "l'un": 1, "l'une": 1, "l'autre": 1, two: 2, deux: 2, three: 3, trois: 3, four: 4, quatre: 4, five: 5, cinq: 5, six: 6 };
const DET = "(?:our|my|a|an|the|one|another|two|three|four|five|six|[1-6]|notre|nos|mon|ma|mes|un|une|deux|trois|quatre|cinq|l'une?|l'autre)";
const ADJ = '(?:other|third|fourth|fifth|last|best|dear|good|old|close|autre|troisieme|quatrieme|meilleure?|bonne?|chere?|grande?)';
const ONE = "friend|girlfriend|boyfriend|sister|brother|mom|mum|mother|dad|father|daughter|son|cousin|aunt|uncle|niece|nephew|colleague|coworker|co-worker|partner|husband|wife|fiancee?|grandmother|grandma|grandfather|grandpa|person|guest|adult|bridesmaid|buddy|pal|roommate|bestie|amie?|copine|copain|soeur|frere|mere|pere|fille|fils|cousine|collegue|conjointe?|mari|femme|blonde|chum|personne|invitee?|adulte";
const MANY = "friends|girlfriends|sisters|brothers|daughters|sons|cousins|colleagues|coworkers|parents|grandparents|people|guests|adults|bridesmaids|buddies|pals|roommates|amie?s|copines|copains|soeurs|freres|filles|cousines|collegues|personnes|invitee?s|adultes|couple|of us|of them|of the group|of our group|d'entre nous|de nous|du groupe|d'entre elles|d'entre eux";
// (A name between the subject and the verb, "our friend Sarah arrives…", is allowed: one word, never a joining word.)
const NAME = "(?: (?!and\\b|or\\b|et\\b|ou\\b|group|groupe|who\\b|qui\\b|is\\b|are\\b|will\\b|can\\b|has\\b|have\\b|needs?\\b|wants?\\b|only\\b|just\\b|also\\b|est\\b|sera\\b|va\\b|doit\\b|ne\\b|n'|nous\\b|se\\b)[a-z][a-z'-]{1,15})?";
const SUBJ = `(?:(${DET}) (?:${ADJ} )?(${ONE}|${MANY})(?: of (?:ours|mine))?${NAME}|(she|he|elle|il))`;
const SOFT = '(?:(?:only|just|also|now|then|unfortunately|sadly|actually|probably|seulement|juste|malheureusement) )?';
// Arriving. (A verb of being there -- "is with us", "stays" -- is a join or a leave by the word after it: from / until.)
const JOIN_V = "(?:(?:is|are|'s|will be|'ll be|would be|is going to be|are going to be) (?:only |just |now )?(?:arriving|joining(?: us| in)?|coming(?: up| in| along)?|flying in|getting (?:in|here|there)|meeting (?:us|up with us)|driving (?:up|in)|landing|able to (?:join(?: us)?|come|arrive|make it))"
  + "|(?:will|'ll|can|could|would|may|might|is able to|are able to|is going to|are going to|plans? to|has to|have to|needs? to|gets? to) (?:only |just )?(?:arrive|join(?: us| in)?|come(?: up| in| along)?|get (?:in|here|there)|fly in|make it|meet (?:us|up with us)|drive (?:up|in)|land)"
  + "|(?:can't|cannot|can not|won't|will not|doesn't|does not|don't|do not|isn't|aren't|is not|are not) (?:be )?(?:able to )?(?:arriv\\w+|join\\w*(?: us)?|com\\w+|get\\w*(?: in| here| there)|fly\\w* in|make it|land\\w*)"
  + "|(?:arrives?|joins?(?: us| in)?|comes(?: up| in| along)?|gets (?:in|here|there)|flies in|lands|meets (?:us|up with us)|shows up|drives (?:up|in))"
  + "|(?:n')?(?:arrive(?:ra|ront|nt)?|arrivera|(?:nous |se |vous )?(?:rejoint|rejoindra|rejoignent|rejoindront)|se (?:joint|joindra|joignent|joindront) a nous|vient|viendra|viennent|viendront|ne peut (?:venir|arriver|nous rejoindre)|ne (?:nous )?(?:rejoint|rejoindra)|ne (?:vient|viendra)))";
const LEAVE_V = "(?:(?:is|are|'s|will be|'ll be) (?:only |just )?(?:leaving|heading (?:home|back|out|off)|flying (?:home|out|back)|going (?:home|back)|departing|checking out)"
  + "|(?:will|'ll|can|has to|have to|needs? to|must|is going to|are going to|plans? to|has got to) (?:only |just )?(?:leave|head (?:home|back|out|off)|fly (?:home|out|back)|go (?:home|back)|depart|check out)"
  + "|(?:leaves?|heads (?:home|back|out|off)|flies (?:home|out|back)|goes (?:home|back)|departs?|checks out)"
  + "|(?:part|partira|partent|partiront|repart|repartira|repartent|repartiront|quitte|quittera|quittent|doit (?:partir|repartir|rentrer|nous quitter)|doivent (?:partir|repartir|rentrer)|s'en va|rentre|rentrera|rentrent))";
const THERE_V = "(?:(?:is|are|'s|will be|'ll be|will|'ll|can|can only|could only) (?:only |just )?(?:be )?(?:there|here|with us|staying|stay|around|coming along)|(?:stays?|only stays?)"
  + "|(?:est|sera|sont|seront|reste|restera|restent|resteront) (?:seulement |juste )?(?:la|avec nous|des notres)?)";
const SKIP_V = "(?:(?:will |'ll |is going to |are going to |has to |have to |needs? to |must |wants? to |can't make |cannot make |won't make |will not make )?(?:skip(?:s|ping)?|miss(?:es|ing)?|sit(?:s|ting)? out|(?:won't|will not|can't|cannot|isn't|is not|aren't) be (?:there|here|with us|around|joining(?: us)?) (?:on|for)|(?:isn't|is not|aren't|won't be|will not be) (?:there|here|with us|around) (?:on|for))"
  + "|(?:va |vont |doit |doivent )?(?:manquer|sauter|rater|manque|saute|rate|manquera|sautera|ratera)|ne sera pas (?:la|avec nous))";
const SUBJ_RE = new RegExp(`(?:^|[\\s,(:])${SUBJ}(?: |(?='))${SOFT}(?:(${JOIN_V})|(${LEAVE_V})|(${SKIP_V})|(${THERE_V}))(?![a-z])`);

const MONTHS = ['jan(?:uary|vier|v)?', 'feb(?:ruary)?|fev(?:rier|r)?', 'mar(?:ch|s)?', 'apr(?:il)?|avr(?:il)?', 'may|mai', 'june?|juin', 'july?|juil(?:let)?', 'aug(?:ust)?|aout', 'sep(?:t|tember|tembre)?', 'oct(?:ober|obre)?', 'nov(?:ember|embre)?', 'dec(?:ember|embre)?'];
const WD = ['sun(?:day)?|dimanche', 'mon(?:day)?|lundi', 'tues?(?:day)?|mardi', 'wed(?:nesday)?|mercredi', 'thu(?:rs?(?:day)?)?|jeudi', 'fri(?:day)?|vendredi', 'sat(?:urday)?|samedi'];
const ORD = { first: 1, '1st': 1, one: 1, premier: 1, premiere: 1, un: 1, une: 1, second: 2, '2nd': 2, two: 2, deuxieme: 2, seconde: 2, deux: 2, third: 3, '3rd': 3, three: 3, troisieme: 3, trois: 3, fourth: 4, '4th': 4, four: 4, quatrieme: 4, quatre: 4, fifth: 5, '5th': 5, five: 5, cinquieme: 5, cinq: 5, sixth: 6, six: 6, seventh: 7, seven: 7, sept: 7 };
const CNT = { a: 1, an: 1, one: 1, 1: 1, un: 1, une: 1, two: 2, 2: 2, deux: 2, three: 3, 3: 3, trois: 3 };
// The day a clause names. -> { iso } | { md: [m, d] } | { wd } | { day } | { last: true } | { night } | { lastNight: true }
//   | { late: n } (that many days after day 1) | { early: n } (that many days before the last day) | { nights: n } | null
function whenIn(r) {
  const iso = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(r);
  if (iso && isDate(iso[1])) return { iso: iso[1] };
  for (let m = 0; m < 12; m++) {
    const a = new RegExp(`\\b(?:${MONTHS[m]})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th|er|e)?\\b(?!\\s*(?:nights?|days?|nuits?|jours?|adults?|people|rooms?))`).exec(r) || new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th|er|e)?\\s+(?:of\\s+)?(?:${MONTHS[m]})\\b`).exec(r);
    if (a && Number(a[1]) >= 1 && Number(a[1]) <= 31) return { md: [m + 1, Number(a[1])] };
  }
  for (let w = 0; w < 7; w++) if (new RegExp(`\\b(?:${WD[w]})\\b`).test(r)) return { wd: w };
  const dn = /\b(?:day|jour|journee) (\d|one|two|three|four|five|six|seven|un|deux|trois|quatre|cinq|sept)\b/.exec(r);
  if (dn) return { day: /^\d$/.test(dn[1]) ? Number(dn[1]) : ORD[dn[1]] };
  const two = /\b(?:the |les |le |la )?(?:first|premiers?|premieres?) (two|three|2|3|deux|trois) (days?|nights?|jours?|journees?|nuits?)\b/.exec(r);
  if (two) return { late: CNT[two[1]] };
  const od = /\b(?:the |le |la |our |notre )?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|premier|premiere|deuxieme|seconde|troisieme|quatrieme|cinquieme|last|final|dernier|derniere) (day|night|evening|jour|journee|nuit|soir|soiree)\b/.exec(r);
  if (od) {
    const night = /night|evening|nuit|soir/.test(od[2]);
    if (/last|final|dernier/.test(od[1])) return night ? { lastNight: true } : { last: true };
    return night ? { night: ORD[od[1]] } : { day: ORD[od[1]] };
  }
  const rel = /\b(a|an|one|1|two|2|three|3|un|une|deux|trois) (?:full |whole )?(?:days?|nights?|jours?|journees?|nuits?) (late|later|after|behind|early|earlier|sooner|before|plus tard|apres|en retard|plus tot|avant|d'avance)\b/.exec(r);
  if (rel) return /late|after|behind|plus tard|apres|retard/.test(rel[2]) ? { late: CNT[rel[1]] } : { early: CNT[rel[1]] };
  if (/\b(?:the next day|the following day|the day after|le lendemain|le jour suivant)\b/.test(r)) return { late: 1 };
  const nn = /\b(?:after|apres|for|pour|pendant) (?:only |just |seulement |juste )?(?:the first |la premiere |les (?:deux |trois )?premieres? )?(one|1|a|an|two|2|three|3|une|deux|trois)? ?(?:nights?|nuits?)\b/.exec(r);
  if (nn) return { nights: CNT[nn[1]] || 1 };
  const dom = /\b(?:the|le|du|au|on the) (\d{1,2})(?:st|nd|rd|th|er|e)?\b(?!\s*(?:h\b|:|am\b|pm\b|heures?\b|nights?|nuits?|days?|jours?|of us|adults?|adultes?|people|personnes?|rooms?|chambres?))/.exec(r) || /\b(\d{1,2})(?:st|nd|rd|th)\b/.exec(r);
  if (dom && Number(dom[1]) >= 1 && Number(dom[1]) <= 31) return { dom: Number(dom[1]) };
  return null;
}
// ---------- The time of day ----------
// A part of the day is a window, not a time: nobody is counted in before it opens, and nobody is counted as surely
// there until an hour after it closes. c: the code a shared link carries; pad: minutes after the window before a stop
// is "for everyone" (0 for "in time for dinner": the traveller said they are at dinner).
const DAYPARTS = {
  early_morning: { c: 'em', from: 360, to: 540, en: 'early-morning', fr: 'tôt le matin', say: 'early in the morning', sayFr: 'tôt le matin' },
  morning: { c: 'm', from: 480, to: 720, en: 'morning', fr: 'matin', say: 'in the morning', sayFr: 'en matinée' },
  midday: { c: 'n', from: 690, to: 780, en: 'midday', fr: 'midi', say: 'around lunchtime', sayFr: 'à l’heure du lunch' },
  after_lunch: { c: 'al', from: 780, to: 900, en: 'after-lunch', fr: 'après le lunch', say: 'after lunch', sayFr: 'après le lunch' },
  early_afternoon: { c: 'ea', from: 720, to: 840, en: 'early-afternoon', fr: 'début d’après-midi', say: 'in the early afternoon', sayFr: 'en début d’après-midi' },
  mid_afternoon: { c: 'ma', from: 840, to: 960, en: 'mid-afternoon', fr: 'milieu d’après-midi', say: 'in the mid-afternoon', sayFr: 'en milieu d’après-midi' },
  late_afternoon: { c: 'la', from: 960, to: 1080, en: 'late-afternoon', fr: 'fin d’après-midi', say: 'in the late afternoon', sayFr: 'en fin d’après-midi' },
  afternoon: { c: 'a', from: 720, to: 1020, en: 'afternoon', fr: 'après-midi', say: 'in the afternoon', sayFr: 'dans l’après-midi' },
  dinner: { c: 'd', from: 1020, to: 1020, pad: 0, en: 'dinner-time', fr: 'souper', say: 'in time for dinner', sayFr: 'à temps pour le souper' },
  evening: { c: 'e', from: 1020, to: 1260, en: 'evening', fr: 'soir', say: 'in the evening', sayFr: 'en soirée' },
  night: { c: 'nt', from: 1260, to: 1439, en: 'late-night', fr: 'fin de soirée', say: 'late at night', sayFr: 'tard le soir' },
};
const NEAR_MIN = 60;        // after an arrival: a stop starting this soon after it is "not confirmed for everyone"
const LEAVE_NEAR_MIN = 120; // before a departure: a stop starting this close to it may not be over in time
const PART_RES = [
  ['night', /\b(?:late at night|at night|late in the evening|late evening|in the night|overnight|tard le soir|tard en soiree|en fin de soiree|dans la nuit|de nuit)\b/],
  ['dinner', /\b(?:in time for|for|by|before|just before|a temps pour|pour|avant) (?:the |le |un )?(?:dinner|supper|souper)\b|\b(?:dinner ?time|supper ?time|a l'heure du souper)\b/],
  ['evening', /\b(?:evening|tonight|after work|soir|soiree|apres le travail|late in the day|end of the day|(?:en )?fin de journee|tard)\b/],
  ['after_lunch', /\b(?:after lunch|apres le lunch)\b/],
  ['early_afternoon', /\bearly(?: in the)? afternoon\b|\b(?:en )?debut d(?:'| l')apres-midi\b|\btot (?:dans|en) l'apres-midi\b/],
  ['mid_afternoon', /\bmid[- ]?afternoon\b|\bmiddle of the afternoon\b|\bmilieu d(?:'| l')apres-midi\b/],
  ['late_afternoon', /\blate(?: in the)? afternoon\b|\bend of the afternoon\b|\bfin d(?:'| l')apres-midi\b/],
  ['afternoon', /\b(?:afternoon|apres-midi|aprem)\b/],
  ['midday', /\b(?:midday|mid-day|lunch ?time|(?:around|for|by|before) lunch|l'heure du lunch|pour le lunch|(?:en )?milieu de journee)\b/],
  ['early_morning', /\b(?:early(?: in the)? morning|first thing|at dawn|tot le matin|de bon matin|a l'aube|tres tot)\b/],
  ['morning', /\b(?:morning|matin|matinee|avant-midi)\b/],
];
const MONTH_WORD = 'jan|feb|fev|mar|apr|avr|may|mai|jun|jui|jul|aug|aou|sep|oct|nov|dec';
// A bare hour with no am / pm: 1 to 7 is the afternoon, 8 to 11 the morning, 12 noon. The reply always says the
// time back ("2 PM"), so a wrong guess is seen and corrected.
const bareHour = (h) => (h >= 1 && h <= 7 ? h + 12 : h);
// The time of day a clause names (folded text). -> { m: minutes } | { part } | null.
//   bare: a number alone counts ("2", "around 3") -- only for an answer to the question, never inside a request.
function timeIn(text, opts = {}) {
  const t = String(text || '');
  let m;
  if ((m = /(?:^|[^\d:.])(\d{1,2})(?:[:.h](\d{2}))?\s*(a|p)\.?m\b\.?/.exec(t))) {
    const h = Number(m[1]), mm = m[2] ? Number(m[2]) : 0;
    if (h >= 1 && h <= 12 && mm < 60) return { m: ((h % 12) + (m[3] === 'p' ? 12 : 0)) * 60 + mm };
  }
  if ((m = /(?:^|[^\d:.])(\d{1,2})\s*h\s*(\d{2})?\b/.exec(t))) {
    const h = Number(m[1]), mm = m[2] ? Number(m[2]) : 0;
    if (h <= 23 && mm < 60) return { m: h * 60 + mm };
  }
  if ((m = /(?:^|[^\d:.-])(\d{1,2}):([0-5]\d)(?![\d:])/.exec(t))) { const h = Number(m[1]); if (h <= 23) return { m: bareHour(h) * 60 + Number(m[2]) }; }
  if ((m = /\b(\d{1,2})\s*o'? ?clock\b/.exec(t))) { const h = Number(m[1]); if (h >= 1 && h <= 12) return { m: bareHour(h) * 60 }; }
  if (/\b(?:noon|midi)\b/.test(t.replace(/\b(?:apres|avant)-midi\b/g, ''))) return { m: 720 };
  if ((m = new RegExp(`\\b(?:at|around|about|by|circa|vers)\\s+(\\d{1,2})(?:\\s*ish)?\\b(?!\\s*(?:[:.\\d]|st\\b|nd\\b|rd\\b|th\\b|er\\b|e\\b|nights?|nuits?|days?|jours?|adults?|adultes?|people|personnes?|rooms?|chambres?|of\\b|(?:${MONTH_WORD})))`).exec(t))) {
    const h = Number(m[1]);
    if (h >= 1 && h <= 12) return { m: bareHour(h) * 60 };
    if (h >= 13 && h <= 23) return { m: h * 60 };
  }
  for (const [part, re] of PART_RES) if (re.test(t)) return { part };
  if (opts.bare && (m = /^(?:(?:at|around|about|by|maybe|probably|vers|environ)\s+)*(\d{1,2})(?:\s*ish)?$/.exec(t.trim()))) {
    const h = Number(m[1]);
    if (h >= 1 && h <= 12) return { m: bareHour(h) * 60 };
    if (h >= 13 && h <= 23) return { m: h * 60 };
  }
  return null;
}
const sameAt = (a, b) => (!a && !b) || (!!a && !!b && ((Number.isInteger(a.m) && a.m === b.m) || (!!a.part && a.part === b.part)));
const validAt = (a) => !!a && ((Number.isInteger(a.m) && a.m >= 0 && a.m < 1440) || (typeof a.part === 'string' && !!DAYPARTS[a.part]));
// The window a time stands for: { from, to, pad } in minutes of the day.
function atWindow(at) {
  if (!validAt(at)) return null;
  if (Number.isInteger(at.m)) return { from: at.m, to: at.m, pad: NEAR_MIN, before: LEAVE_NEAR_MIN };
  const p = DAYPARTS[at.part];
  return { from: p.from, to: p.to, pad: p.pad === 0 ? 0 : NEAR_MIN, before: LEAVE_NEAR_MIN };
}
// Who a stop of the arrival (or departure) day is for, by when it starts. Used by the server, the plan page and the
// shared page (its source is sent to both: it must stay self-contained).
//   'few': before they arrive / after they leave; 'near': too close to say; 'all': everyone; '': no start time known.
function lateStopState(win, kind, start) {
  if (!win || typeof start !== 'number' || !(start >= 0)) return '';
  if (kind === 'leave') return start >= win.to ? 'few' : start >= win.from - (win.before || 120) ? 'near' : 'all';
  return start < win.from ? 'few' : start < win.to + win.pad ? 'near' : 'all';
}
// What the arrival (or departure) day's title and its sentence say, from the SAME per-stop states as the notes under
// its stops (2026-11-24: the title said "2 until 3 PM, then all 3" over a stop marked "not confirmed for all 3"). Only
// the time they arrive is known, never that they can make a given stop, so nothing here says "then all 3":
//   a stop close to the arrival      -> "2 before 3 PM · check activities close to arrival"
//   none close, some well after it   -> "2 before 3 PM · planned for 3 after"
//   every stop before it (or none)   -> "for 2 · 1 arrives 3 PM"
// L: the words for one language (words().tpl.L); list: that day's stops on screen, [{ name, start }].
// Sent to the plan page and the shared page with lateStopState: it must stay self-contained.
function lateDaySay(L, list) {
  var near = [], all = 0, i, x, st;
  for (i = 0; i < (list || []).length; i++) { x = list[i]; st = x ? lateStopState(L.win, L.kind, x.start) : ''; if (st === 'near') near.push(x); else if (st === 'all') all++; }
  near.sort(function(a, b){ return a.start - b.start; });
  var two = function(n){ return (n < 10 ? '0' : '') + n; };
  var clock = function(m){ var h = Math.floor(m / 60), mm = m % 60; if (L.fr) return h + ' h' + (mm ? ' ' + two(mm) : ''); return (h % 12 === 0 ? 12 : h % 12) + (mm ? ':' + two(mm) : '') + (h < 12 ? ' AM' : ' PM'); };
  var k = near.length ? 'near' : (all || L.kind === 'leave') ? 'plan' : 'few';
  var mid = k === 'few' ? L.mid.few : L.mid.base;
  if (near.length) mid += ' ' + L.mid.near + near.map(function(s){ return (s.name ? s.name + ' (' : '(') + clock(s.start) + ')'; }).join(', ') + '.';
  if (all && L.mid.later) mid += ' ' + L.mid.later;
  return { head: L.head[k], mid: mid, state: k };
}
const CLIENT_SRC = `${String(lateStopState)}\n  ${String(lateDaySay)}`;
const clock = (m, fr) => { const h = Math.floor(m / 60), mm = m % 60; if (fr) return `${h} h${mm ? ` ${String(mm).padStart(2, '0')}` : ''}`; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`; };
// "2 PM" / "afternoon" (what a title and a note call the time), and "12–5 PM" (what a part of the day was taken as).
const atTag = (at, fr) => (Number.isInteger(at.m) ? clock(at.m, fr) : (fr ? DAYPARTS[at.part].fr : DAYPARTS[at.part].en));
function atSpan(at, fr) {
  if (!at || !at.part) return '';
  const p = DAYPARTS[at.part];
  if (p.from === p.to) return clock(p.from, fr);
  if (fr) return `${clock(p.from, true)}–${clock(p.to, true)}`;
  const a = clock(p.from, false), b = clock(p.to, false);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}
// The clause of a statement a time is read from: up to where it turns to what they need ("…and needs a separate room
// for one night" is about the room, never "at night").
function timeClause(rest) {
  let r = String(rest || '');
  const cut = /\b(?:and|et|but|mais|so|donc|,)?\s*(?:(?:she|he|they|elle|il|ils|elles) )?(?:needs?|wants?|will need|would like|has to have|a besoin|aura besoin|veut|voudrait|ont besoin)\b/.exec(r);
  if (cut) r = r.slice(0, cut.index);
  const room = ROOM_RE.exec(r);
  if (room) r = r.slice(0, room.index);
  return r;
}

// A room of their own for the one who comes later (singular: "separate rooms" for everyone is trip-stays.js's rule).
const ROOM_RE = /\b(?:(?:her|his|their|an?|one|the|sa|leur|une) )?(?:own|separate|private|single|second|extra|additional|another|different)(?: hotel| single| private)? (?:room|bedroom)\b(?!s)|\broom (?:of|to) (?:her|his|their) own\b|\broom (?:to|for) (?:herself|himself|themselves|just her|just him)\b|\b(?:sa|leur) propre chambre\b|\b(?:une |sa |leur )?chambre (?:separee|a part|individuelle|seule|privee|supplementaire|de plus|pour elle(?: seule)?|pour lui(?: seul)?|pour eux|pour elles|a elle|a lui)\b|\bune (?:autre|deuxieme|seconde) chambre\b/;
const NOT_ROOM_RE = /\b(?:no|not|without|doesn't need|does not need|don't need|pas besoin d'|sans) (?:(?:a|an|her|his|their|une|de) )?(?:own |separate |private |extra |second )?(?:room|chambre)\b|\bshar(?:e|es|ing) (?:a |our |the |one |my )?(?:room|bed)\b|\bpartage(?:r|ra)? (?:la |notre |une |ma )?chambre\b/;
// Sentences of a text, each with where it starts (a month's short form "Oct. 9" does not end a sentence).
function sentences(raw) {
  const out = [], re = /[.!?;\n]+\s+|\n+/g;
  let last = 0, m;
  while ((m = re.exec(raw))) {
    const before = raw.slice(Math.max(0, m.index - 5), m.index).toLowerCase();
    if (m[0][0] === '.' && /(?:^|[^a-z])(?:jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|janv|fevr|févr|avr|juil|déc)$/.test(before)) continue;
    // ("3 p.m. on October 9": the dot of a.m. / p.m. does not end a sentence either.)
    if (m[0][0] === '.' && /(?:^|[^a-z])[ap]\.m$/.test(before)) continue;
    out.push({ at: last, end: m.index + m[0].length, text: raw.slice(last, m.index + m[0].length) });
    last = m.index + m[0].length;
  }
  if (last < raw.length) out.push({ at: last, end: raw.length, text: raw.slice(last) });
  return out;
}
// One sentence -> { kind, n, when, ownRoom, at } or null. `at` is where the statement starts in the sentence.
function readSentence(sentence) {
  const t = fold(sentence).replace(/\s+/g, ' ');
  const m = SUBJ_RE.exec(t);
  if (!m) return null;
  const det = m[1], noun = m[2] || '', pron = m[3];
  // A sentence about everyone ("we arrive…", "my husband and I arrive…") is the trip's own dates, not this.
  const head = t.slice(0, m.index + m[0].length);
  if (/\b(?:and i|and me|et moi|we all|nous tous|all of us|everyone|everybody|tout le monde)\b/.test(head)) return null;
  // A negation of the statement itself, or a question, changes nothing.
  if (/\b(?:no longer|not anymore|n'arrive plus|ne vient plus)\b/.test(t)) return null;
  const rest = t.slice(m.index + m[0].length, m.index + m[0].length + 110);
  const when = whenIn(rest);
  if (!when) return null;
  let kind = null;
  if (m[4]) kind = 'join';
  else if (m[5]) kind = 'leave';
  else if (m[6]) {
    // "skips day 1", "misses the first night" -> joins the day after; "skips the last day" -> leaves the day before.
    if (when.last || when.lastNight) return { kind: 'leave', n: null, when: { early: 1 }, skip: true };
    const k = when.day || when.night || (when.late ? when.late : null);
    if (!k) return null;
    kind = 'join';
    Object.keys(when).forEach((x) => delete when[x]);
    when.late = k;
  } else if (m[7]) {
    // "is only with us from Saturday" / "until Saturday", "only stays the first night".
    if (/\b(?:from|starting|as of|after|a partir d[ue]|des le|a compter d[ue])\b/.test(rest) && !when.nights) kind = 'join';
    else if (/\b(?:until|till|til|through|up to|jusqu'au|jusqu'a|jusqu'en)\b/.test(rest) || when.nights || when.night === 1) kind = 'leave';
    else if (when.lastNight || (when.night && when.night > 1)) kind = 'join';
    else return null;
  }
  // How many: "two friends", "one of us", "a couple"; a plural with no number is not counted (asked instead).
  let n = null;
  if (pron) n = 1;
  else if (/^couple$/.test(noun)) n = 2;
  else if (/^[1-6]$/.test(det)) n = Number(det);
  else if (new RegExp(`^(?:${MANY})$`).test(noun)) n = /^(?:of |d'entre |de nous|du groupe)/.test(noun) ? (NUM[det] || null) : (NUM[det] > 1 ? NUM[det] : null);
  else n = NUM[det] || null;
  const out = { kind, n, when, at: m.index + (/^[\s,(:]/.test(m[0]) ? 1 : 0) };
  if (pron) out.pronoun = true;
  // The time of day, when the statement gives one ("…on October 9 at 3 pm", "…Saturday afternoon").
  const time = timeIn(timeClause(rest));
  if (time) out.time = time;
  return out;
}
// The need, from a whole request. -> { key: 'late_arrival', kind: 'join' | 'leave', n, when, ownRoom, phrase } or null.
// The first clear statement wins; a room of their own may be said in the same sentence or the next one.
function readLate(text) {
  const raw = String(text || '');
  if (!raw || raw.length > 4000) return null;
  const ss = sentences(raw);
  for (let i = 0; i < ss.length; i++) {
    const r = readSentence(ss[i].text);
    if (!r) continue;
    const t = fold(ss[i].text), next = ss[i + 1] ? fold(ss[i + 1].text) : '';
    const own = (ROOM_RE.test(t.slice(r.at)) && !NOT_ROOM_RE.test(t)) || (!!next && /^\s*(?:she|he|they|and|elle|il|ils|elles|et)\b/.test(next) && ROOM_RE.test(next) && !NOT_ROOM_RE.test(next) && !readSentence(ss[i + 1].text));
    return { key: 'late_arrival', kind: r.kind, n: r.n, when: r.when, ownRoom: !!own, ...(r.time ? { at: r.time } : {}), ...(r.pronoun ? { pronoun: true } : {}), phrase: ss[i].text.replace(/\s+/g, ' ').trim().slice(0, 160) };
  }
  return null;
}
// The request without the statement (what the planner searches with): its sentence from where the statement starts,
// and a next sentence that only says the room. Everything else is left as typed; a request without it is not touched.
function stripLate(text) {
  const raw = String(text || '');
  if (!readLate(raw)) return raw;
  const ss = sentences(raw);
  let out = '', done = false;
  for (let i = 0; i < ss.length; i++) {
    const r = done ? null : readSentence(ss[i].text);
    if (!r) { out += ss[i].text; continue; }
    done = true;
    // (The fold keeps each letter's place, so `at` is the same place in the sentence as typed.)
    const sameLen = fold(ss[i].text).length === ss[i].text.length;
    let head = sameLen ? ss[i].text.slice(0, r.at) : '';
    head = head.replace(/[\s,]*(?:\b(?:and|but|also|plus|et|mais|aussi)\b)?[\s,]*$/i, '');
    // What follows the statement after a comma ("…, no car") is another part of the request and stays; a year
    // ("October 9, 2027") and the room said after a comma belong to the statement.
    const tail = sameLen ? ss[i].text.slice(r.at).split(/,\s+/) : [];
    let k = 1;
    while (k < tail.length && (/^\s*20\d{2}\b/.test(tail[k]) || (ROOM_RE.test(fold(tail[k])) && fold(tail[k]).length < 70) || (fold(tail[k]).length < 40 && !!timeIn(fold(tail[k]))))) k++;
    const after = tail.slice(k).join(', ').replace(/[\s.!?;]+$/, '');
    const kept = [head.replace(/[\s,;:]+$/, ''), after].filter((x) => /[a-z0-9]{2}/i.test(x)).join(', ');
    if (kept) out += `${kept}. `;
    const next = ss[i + 1] ? fold(ss[i + 1].text) : '';
    if (next && /^\s*(?:she|he|they|and|elle|il|ils|elles|et)\b/.test(next) && ROOM_RE.test(next) && !readSentence(ss[i + 1].text)) i++;
  }
  return out.replace(/\s+$/, '').replace(/\s{2,}/g, ' ');
}

// ---------- Working it out against the trip ----------
// ctx: { days, dayDates: [iso | null, ...], dated (the visitor's own dates), adults, kids, roomsGiven }
// -> null (nothing staggered: they arrive on day 1), { unresolved: 'no_dates' | 'outside' | 'party' | 'one_day', need },
//    or the arrangement:
//    { key, kind, n, day, days, adults, kids, base, ownRoom, mode: 'split' | 'shared' | 'day', rooms: { a, b, aAssumed,
//      bAssumed }, nightsA, nightsB, dated, start, end, date }
//    day: the first day they are there (join) or the last (leave). mode 'split': a room of their own for their nights
//    (two bookings); 'shared': they join a room the others have (one booking); 'day': they have no night at all.
// The day of the trip a statement names: a number, or 'no_dates' / 'outside' when it cannot be placed.
function dayIn(need, days, dayDates) {
  const dates = Array.isArray(dayDates) && dayDates.length === days && dayDates.every(isDate) ? dayDates : null;
  const w = (need && need.when) || {};
  let k = null;
  const byDate = (test) => { if (!dates) return 'no_dates'; const i = dates.findIndex(test); return i < 0 ? 'outside' : i + 1; };
  if (w.iso) k = byDate((d) => d === w.iso);
  else if (w.md) k = byDate((d) => Number(d.slice(5, 7)) === w.md[0] && Number(d.slice(8)) === w.md[1]);
  else if (w.dom) k = byDate((d) => Number(d.slice(8)) === w.dom);
  else if (Number.isInteger(w.wd)) k = byDate((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === w.wd);
  else if (w.day) k = w.day;
  else if (w.last) k = days;
  else if (w.night) k = need.kind === 'leave' ? w.night + 1 : w.night;
  else if (w.lastNight) k = days - 1;
  else if (w.late) k = need.kind === 'join' ? 1 + w.late : null;
  else if (w.early) k = need.kind === 'leave' ? days - w.early : null;
  else if (w.nights) k = need.kind === 'leave' ? 1 + w.nights : days - w.nights;
  return typeof k === 'string' ? k : Number.isInteger(k) ? k : 'outside';
}
// Two statements that come to the same thing on this trip ("arrives October 9" and "skips day 1").
function sameOnTrip(have, said, days, dayDates) {
  if (!have || !said || have.kind !== said.kind) return false;
  if (!(said.n == null || said.pronoun || have.n == null || have.n === said.n)) return false;
  const a = dayIn(have, days, dayDates), b = dayIn(said, days, dayDates);
  return Number.isInteger(a) && a === b;
}
function resolve(need, ctx = {}) {
  if (!need) return null;
  const days = Number.isInteger(ctx.days) ? ctx.days : 0;
  const bad = (why) => ({ key: 'late_arrival', unresolved: why, need });
  if (days < 2) return bad('one_day');
  const dates = Array.isArray(ctx.dayDates) && ctx.dayDates.length === days && ctx.dayDates.every(isDate) ? ctx.dayDates : null;
  const k = dayIn(need, days, ctx.dayDates);
  if (typeof k === 'string') return bad(k);
  if (need.kind === 'join') { if (k <= 1) return null; if (k > days) return bad('outside'); }
  else { if (k >= days) return null; if (k < 1) return bad('outside'); }
  const adults = Number.isInteger(ctx.adults) && ctx.adults > 0 ? ctx.adults : null;
  if (!adults || !Number.isInteger(need.n) || need.n < 1 || need.n >= adults) return bad('party');
  const n = need.n, base = adults - n, kids = Number.isInteger(ctx.kids) && ctx.kids > 0 ? ctx.kids : 0;
  const nightsA = days - 1, nightsB = need.kind === 'join' ? days - k : k - 1;
  const R = Number.isInteger(ctx.roomsGiven) && ctx.roomsGiven >= 1 ? ctx.roomsGiven : null;
  const def = SBL.stayDefaultRooms;
  let mode, rooms;
  if (nightsB <= 0) { mode = 'day'; const r = SBL.stayRoomsFor(base, R); rooms = { a: r.rooms, b: 0, aAssumed: !!r.assumed && base >= 3 }; }
  else if (need.ownRoom) { const b = def(n); mode = 'split'; rooms = { a: R ? Math.max(1, Math.min(base, R - b)) : def(base), b, aAssumed: !R && base >= 3 }; }
  else if (R) { mode = 'shared'; rooms = { a: Math.min(R, adults), b: 0 }; }
  else if (def(adults) > def(base)) { mode = 'split'; rooms = { a: def(base), b: def(adults) - def(base), aAssumed: base >= 3, bAssumed: true }; }
  else { mode = 'shared'; rooms = { a: def(adults), b: 0, aAssumed: adults >= 3 }; }
  const dated = !!(dates && ctx.dated);
  return { key: 'late_arrival', kind: need.kind, n, day: k, days, adults, kids, base, ownRoom: !!need.ownRoom, mode, rooms, nightsA, nightsB, dated, ...(dated ? { start: dates[0], end: dates[days - 1], date: dates[k - 1] } : {}), ...(validAt(need.at) ? { at: need.at } : {}) };
}
// How many are there on a day (adults and kids; the kids travel with the ones who are there throughout).
// (On the day they arrive or leave, the count is the whole party only for the stops they are there for: stopFor.)
function peopleOn(arr, day) {
  if (!arr || arr.unresolved) return null;
  const there = arr.kind === 'join' ? day >= arr.day : day <= arr.day;
  return arr.base + arr.kids + (there ? arr.n : 0);
}

// ---------- Words ----------
const MO_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MO_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const dayOf = (iso, fr) => { const m = Number(iso.slice(5, 7)) - 1, d = Number(iso.slice(8)); return fr ? `${d === 1 ? '1er' : d} ${MO_FR[m]}` : `${MO_EN[m]} ${d}`; };
function rangeOf(a, b, fr) {
  const am = Number(a.slice(5, 7)) - 1, bm = Number(b.slice(5, 7)) - 1, ad = Number(a.slice(8)), bd = Number(b.slice(8));
  if (a === b) return dayOf(a, fr);
  if (am === bm) return fr ? `${ad}–${bd} ${MO_FR[am]}` : `${MO_EN[am]} ${ad}–${bd}`;
  return fr ? `${ad} ${MO_FR[am]}–${bd} ${MO_FR[bm]}` : `${MO_EN[am]} ${ad}–${MO_EN[bm]} ${bd}`;
}
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const adultsOf = (n, fr) => (fr ? plural(n, 'adulte', 'adultes') : plural(n, 'adult', 'adults'));
const roomsOf = (n, fr) => (fr ? plural(n, 'chambre', 'chambres') : plural(n, 'room', 'rooms'));
const nightsOf = (n, fr) => (fr ? plural(n, 'nuit', 'nuits') : plural(n, 'night', 'nights'));
const ASSUMED = { en: ' (assumed)', fr: ' (supposé)' };
// What every surface says of the arrangement itself (no stay needed). -> { line, who, days: { 1: '…' }, act, short }
//   line: "2 adults Oct 8–10 · 1 more from Oct 9, own room, 1 night"     who: "2 adults + 1 from Oct 9"
//   days[d]: "for 2" / "for all 3"     act: "Day 1 is planned for 2; all 3 from Oct 9 (Day 2)."
function words(arr, fr, stops) {
  if (!arr || arr.unresolved) return null;
  const join = arr.kind === 'join', d = arr.day, all = arr.base + arr.kids + arr.n, few = arr.base + arr.kids;
  const whenDay = arr.dated ? dayOf(arr.date, fr) : (fr ? `jour ${d}` : `day ${d}`);
  const whenFr = arr.dated ? `le ${whenDay}` : `le ${whenDay}`;
  const range = arr.dated ? rangeOf(arr.start, arr.end, fr) : (fr ? `les ${arr.days} jours` : `all ${arr.days} days`);
  const from = join ? (fr ? `dès ${whenFr}` : `from ${whenDay}`) : (fr ? `jusqu’au ${whenDay}` : `until ${whenDay}`);
  const more = fr ? `${arr.n} de plus` : `${arr.n} more`;
  let tail = '';
  if (arr.mode === 'split') tail = `, ${fr ? 'chambre à part' : 'own room'}${arr.rooms.bAssumed ? ASSUMED[fr ? 'fr' : 'en'] : ''}, ${nightsOf(arr.nightsB, fr)}`;
  else if (arr.mode === 'shared') tail = `, ${nightsOf(arr.nightsB, fr)}`;
  else tail = fr ? ', sans nuitée' : ', no night';
  // The time of day: said beside the day when known ("from Oct 9, 2 PM"); "time not set" when not.
  const at = validAt(arr.at) ? arr.at : null, tag = at ? atTag(at, fr) : '';
  const timed = at ? `, ${tag}` : (fr ? ' (heure à préciser)' : ' (time not set)');
  const line = `${adultsOf(arr.base, fr)}${arr.dated ? ' ' : ', '}${range} · ${more} ${from}${timed}${tail}`;
  const who = `${adultsOf(arr.base, fr)} + ${arr.n} ${from}`;
  const days = {};
  for (let i = 1; i <= arr.days; i++) { const p = peopleOn(arr, i); days[i] = p === all ? (fr ? `pour les ${all}` : `for all ${all}`) : (fr ? `pour ${few}` : `for ${few}`); }
  // The day they arrive (or leave) is never "for all 3" by itself: "for 2 + 1 arriving (time not set)" until the time
  // is known; then what lateDaySay works out from that day's stops (each stop says which it is: stop.few / stop.near).
  // Never "then all 3": the time they arrive is known, not that they can make a stop.
  const allW = fr ? `les ${all}` : `all ${all}`;
  const exact = !!(at && Number.isInteger(at.m));
  const they = arr.n > 1;
  let tpl = null;
  if (!at) days[d] = join ? (fr ? `pour ${few} + ${arr.n} qui arrive${they ? 'nt' : ''} (heure à préciser)` : `for ${few} + ${arr.n} arriving (time not set)`) : (fr ? `pour ${few} + ${arr.n} qui part${they ? 'ent' : ''} (heure à préciser)` : `for ${few} + ${arr.n} leaving (time not set)`);
  else {
    const part = exact ? null : DAYPARTS[at.part];
    let head, mid;
    if (join && !fr) {
      const bef = exact ? `before ${tag}` : `before the ${tag} arrival`, comes = `${arr.n} arrive${they ? '' : 's'}`;
      head = { near: `${few} ${bef} · check activities close to arrival`, plan: `${few} ${bef} · planned for ${all} after`, few: `for ${few} · ${comes} ${exact ? tag : part.say}` };
      mid = { base: `for ${few} ${bef}.`, few: `for ${few}; ${comes} ${exact ? `at ${tag}` : part.say}.`, near: `Close to the arrival, not confirmed for ${allW}: `, later: `Later stops are planned for ${allW}.` };
    } else if (join) {
      const bef = exact ? `avant ${tag}` : `avant l’arrivée (${tag})`, comes = `${arr.n} arrive${they ? 'nt' : ''}`;
      head = { near: `${few} ${bef} · vérifier les activités près de l’arrivée`, plan: `${few} ${bef} · prévu pour ${all} ensuite`, few: `pour ${few} · ${comes} ${exact ? `à ${tag}` : part.sayFr}` };
      mid = { base: `pour ${few} ${bef}.`, few: `pour ${few}; ${comes} ${exact ? `à ${tag}` : part.sayFr}.`, near: `Près de l’arrivée, non confirmé pour ${allW} : `, later: `Les arrêts suivants sont prévus pour ${allW}.` };
    } else if (!fr) {
      const bef = exact ? `before ${tag}` : `before the ${tag} departure`;
      head = { near: `${allW} ${bef} · check activities close to departure`, plan: `${allW} ${bef} · ${few} after` };
      mid = { base: `${allW} ${bef}, ${few} after.`, near: `Close to the departure, not confirmed for ${allW}: `, later: '' };
    } else {
      const bef = exact ? `avant ${tag}` : `avant le départ (${tag})`;
      head = { near: `${allW} ${bef} · vérifier les activités près du départ`, plan: `${allW} ${bef} · ${few} ensuite` };
      mid = { base: `${allW} ${bef}, ${few} ensuite.`, near: `Près du départ, non confirmé pour ${allW} : `, later: '' };
    }
    head.few = head.few || head.plan; mid.few = mid.few || mid.base;
    tpl = { L: { win: atWindow(at), kind: arr.kind, fr: !!fr, head, mid } };
    tpl.say = lateDaySay(tpl.L, Array.isArray(stops) ? stops.filter((x) => x && Number.isInteger(x.start)) : []);
    days[d] = tpl.say.head;
  }
  const stop = !at ? null : join
    ? (fr ? { few: `Avant l’arrivée (${tag}) : pour ${few}`, near: `Près de l’arrivée (${tag}) : non confirmé pour ${allW}` } : { few: `Before the ${tag} arrival: for ${few}`, near: `Close to the ${tag} arrival: not confirmed for ${allW}` })
    : (fr ? { few: `Après le départ (${tag}) : pour ${few}`, near: `Près du départ (${tag}) : non confirmé pour ${allW}` } : { few: `After the ${tag} departure: for ${few}`, near: `Close to the ${tag} departure: not confirmed for ${allW}` });
  // "Day 1 is planned for 2. Oct 9 (Day 2): for 2 before 3 PM. Close to the arrival, not confirmed for all 3: Trail
  // (3:45 PM). Later stops are planned for all 3."
  const dayList = (a, b) => (a === b ? (fr ? `Le jour ${a} est prévu` : `Day ${a} is planned`) : (fr ? `Les jours ${a} à ${b} sont prévus` : `Days ${a}–${b} are planned`));
  const dayName = arr.dated ? (fr ? `${cap(whenDay)} (jour ${d})` : `${whenDay} (Day ${d})`) : (fr ? `Jour ${d}` : `Day ${d}`);
  let act;
  if (join) {
    const pre = fr ? `${dayList(1, d - 1)} pour ${few}.` : `${dayList(1, d - 1)} for ${few}.`;
    if (tpl) { tpl.pre = `${pre} ${dayName}${fr ? ' : ' : ': '}`; tpl.post = ''; }
    const mid = at ? `${dayName}${fr ? ' : ' : ': '}${tpl.say.mid}`
      : (fr ? `${dayName} : pour ${few} jusqu’à ${they ? 'leur' : 'son'} arrivée (heure à préciser).` : `${dayName}: for ${few} until they arrive (time not set).`);
    const post = !at && d < arr.days ? (fr ? ` ${cap(allW)} dès le jour ${d + 1}.` : ` All ${all} from Day ${d + 1}.`) : '';
    act = `${pre} ${mid}${post}`;
  } else {
    const pre = d === 2 ? (fr ? `Le jour 1 est pour ${allW}. ` : `Day 1 is for all ${all}. `) : d > 2 ? (fr ? `Les jours 1 à ${d - 1} sont pour ${allW}. ` : `Days 1–${d - 1} are for all ${all}. `) : '';
    const mid = at ? `${dayName}${fr ? ' : ' : ': '}${tpl.say.mid}`
      : (fr ? `${dayName} : pour ${allW} jusqu’à ${they ? 'leur' : 'son'} départ (heure à préciser).` : `${dayName}: for all ${all} until they leave (time not set).`);
    const post = fr ? ` ${dayList(d + 1, arr.days)} pour ${few}.` : ` ${dayList(d + 1, arr.days)} for ${few}.`;
    if (tpl) { tpl.pre = `${pre}${dayName}${fr ? ' : ' : ': '}`; tpl.post = post; }
    act = `${pre}${mid}${post}`;
  }
  // The one question, while the time is not known (the plan under that day, Details, and the chat's reply).
  const ask = at ? '' : join
    ? (fr ? `À quelle heure ${they ? 'arrivent-ils' : 'arrive cette personne'} ${whenFr}? D’ici là, les arrêts du jour ${d} sont pour ${few}, plus ${arr.n} dès ${they ? 'leur' : 'son'} arrivée.` : `What time do they arrive on ${whenDay}? Until I know, Day ${d} stops are for ${few}, plus ${arr.n} once they’re there.`)
    : (fr ? `À quelle heure ${they ? 'partent-ils' : 'part cette personne'} ${whenFr}? D’ici là, les arrêts du jour ${d} sont pour ${allW}, moins ${arr.n} après ${they ? 'leur' : 'son'} départ.` : `What time do they leave on ${whenDay}? Until I know, Day ${d} stops are for all ${all}, less ${arr.n} once they’ve left.`);
  // (Beside the plan's own line, which already says the day is for 2 until they arrive, only the question itself.)
  const askShort = ask ? ask.slice(0, ask.indexOf('?') + 1) : '';
  return { line, who, days, act, range, from, stop, ask, askShort, tag, dayName, tpl };
}
const cap = (x) => String(x || '').replace(/^./, (c) => c.toUpperCase());

// ---------- The stay ----------
// The bookings the stay takes, against the stay's own dates (trip: whereToStay.trip: arrive, leave, nights, adults,
// kids, kidAges, dog, datesGiven, datesPast, stayStatus, tripStart…). -> [{ n, adults, kids, rooms, roomsAssumed,
// arrive, leave, nights }] : one booking ('shared', 'day') or two ('split').
function stayParts(arr, trip) {
  const t = trip || {};
  if (!arr || arr.unresolved || !isDate(t.arrive) || !isDate(t.leave) || !(t.leave > t.arrive)) return null;
  const kids = Number.isInteger(t.kids) && t.kids > 0 ? t.kids : 0;
  const all = { n: 1, adults: arr.mode === 'shared' ? arr.adults : arr.base, kids, rooms: arr.rooms.a, ...(arr.rooms.aAssumed ? { roomsAssumed: true } : {}), arrive: t.arrive, leave: t.leave, nights: daysBetween(t.arrive, t.leave) };
  if (arr.mode !== 'split') return [all];
  // Their own nights: from the day they come (join) or up to the day they go (leave), inside the stay's dates.
  const dayOne = isDate(t.tripStart) ? t.tripStart : t.arrive;
  const edge = addDays(dayOne, arr.day - 1);
  const b = arr.kind === 'join' ? { arrive: edge > t.arrive ? edge : t.arrive, leave: t.leave } : { arrive: t.arrive, leave: edge < t.leave ? edge : t.leave };
  const nights = daysBetween(b.arrive, b.leave);
  if (!(nights >= 1)) return [all];
  return [all, { n: 2, adults: arr.n, kids: 0, rooms: arr.rooms.b, ...(arr.rooms.bAssumed ? { roomsAssumed: true } : {}), arrive: b.arrive, leave: b.leave, nights }];
}
// Are the stay's dates ones to say ("Oct 8–10")? The visitor's own trip dates, or a stay they confirmed.
const tripDated = (t) => !!(t && !t.datesPast && (t.stayStatus === 'confirmed' || t.stayStatus === 'proposed' || t.datesGiven === true));
// "2 adults, 1 room, Oct 8–10" (no dates: "2 adults, 1 room, 2 nights").
function partText(p, dated, fr) {
  return [adultsOf(p.adults, fr) + (p.kids ? (fr ? ` + ${plural(p.kids, 'enfant', 'enfants')}` : ` + ${plural(p.kids, 'kid', 'kids')}`) : ''), roomsOf(p.rooms, fr) + (p.roomsAssumed ? ASSUMED[fr ? 'fr' : 'en'] : ''), dated ? rangeOf(p.arrive, p.leave, fr) : nightsOf(p.nights, fr)].join(', ');
}
const CANT = { en: 'One booking link can’t hold different dates per room, so these are two separate bookings.', fr: 'Un lien de réservation ne peut pas avoir des dates différentes par chambre : ce sont deux réservations distinctes.' };
// (2026-11-24) Said beside the buttons on the plan and on the shared copy: nothing here checks or holds a room.
const CONFIRM = { en: 'Availability, rooms and the booking itself are confirmed on the booking site.', fr: 'La disponibilité, les chambres et la réservation elle-même se confirment sur le site de réservation.' };
// Does a link carry anything of its booking (its own URL, read by the handoff's reader)?
const carriesAny = (l) => { const c = SBL.stayLinkCarries(l.key, l.url); return !!(c.dates || c.adults || c.rooms); };
// One stay card's bookings. stay: the stay as the link builder takes it; trip: whereToStay.trip.
//   opts: { env, regionLabel, belongs(url) -> bool }
// -> { mode, parts, links (booking 1's, what every "first link" surface opens), links2, distinct, handoff, handoff2,
//      text: { head, parts: [..], note, sheet, btn: [..] }, textFr: {…} } or null.
//   distinct: each booking has a button of its own (its link carries its own guests or dates). Otherwise ONE button
//   and the two bookings said beside it (a hotel's own site can't be pre-filled).
function cardSplit(stay, trip, arr, opts = {}) {
  const parts = stayParts(arr, trip);
  if (!parts || !stay) return null;
  const t = trip || {};
  // (As for every stay link: dates the visitor has not confirmed, or dates already past, are never sent.)
  const noDates = t.datesGiven === false || !!t.datesPast;
  const keep = (list) => list.filter((l) => l && l.url && (typeof opts.belongs !== 'function' || opts.belongs(l.url)));
  const build = (p) => keep(SBL.stayBookingLinks(stay, { arrive: noDates ? null : p.arrive, leave: noDates ? null : p.leave, adults: p.adults, kids: p.kids || null, ...(p.kids && Array.isArray(t.kidAges) && t.kidAges.length === p.kids ? { kidAges: t.kidAges } : {}), rooms: p.rooms, dog: !!t.dog }, { env: opts.env, regionLabel: opts.regionLabel }));
  const tripOf = (p) => ({ ...t, arrive: p.arrive, leave: p.leave, nights: p.nights, adults: p.adults, kids: p.kids || null, rooms: p.rooms });
  const links = build(parts[0]), links2 = parts[1] ? build(parts[1]) : [];
  const handoff = SBL.stayHandoff(links, tripOf(parts[0])), handoff2 = parts[1] ? SBL.stayHandoff(links2, tripOf(parts[1])) : [];
  const first = links[0], second = links2.find((l) => first && l.key === first.key) || links2[0];
  const distinct = !!(parts[1] && first && second && first.url !== second.url && (carriesAny(first) || carriesAny(second)));
  const dated = tripDated(t), confirmed = t.stayStatus === 'confirmed' && !t.datesPast;
  const W = (fr) => {
    const L = fr ? 'fr' : 'en', w = words(arr, fr) || {};
    const pt = parts.map((p) => partText(p, dated, fr));
    const label = (i) => (fr ? `Réservation ${i + 1}` : `Booking ${i + 1}`);
    // (2026-11-24) A button says the booking its own link opens with: "2 adults · Oct 8–10". Only what the link's URL
    // really carries is said (stayLinkCarries): a link with the guests but no dates yet is "2 adults", and the dates
    // stay in the note beside it. Two buttons that would read the same keep their number.
    const says = (p, l) => { const c = l ? SBL.stayLinkCarries(l.key, l.url) : {}; return [c.adults ? adultsOf(p.adults, fr) + (p.kids && c.children ? (fr ? ` + ${plural(p.kids, 'enfant', 'enfants')}` : ` + ${plural(p.kids, 'kid', 'kids')}`) : '') : '', c.dates ? rangeOf(p.arrive, p.leave, fr) : ''].filter(Boolean).join(' · '); };
    const names = parts[1] ? [says(parts[0], first), says(parts[1], second)] : [];
    const named = names.length === 2 && names[0] && names[1] && names[0] !== names[1] ? names : names.map((x, i) => [label(i), x].filter(Boolean).join(' · '));
    const ho = (h) => ((h && h[0]) ? (fr ? h[0].noteFr : h[0].note) : '');
    const dot = (x) => (/[.!?]$/.test(x) ? x : `${x}.`);
    let head, note, card, chat, btn = [];
    if (arr.mode === 'split' && parts[1]) {
      head = fr ? 'Deux réservations distinctes' : 'Two separate bookings';
      btn = distinct ? named : [];
      const each = pt.map((x, i) => dot(`${label(i)}${fr ? ' : ' : ': '}${x}`)).join(' ');
      // The stay card's own short line, and the chat's.
      // One button: the hotel's own site takes nothing from here; another site's link takes guests only with dates.
      const ownSite = !first || first.key === 'own' || first.key === 'search';
      const both = distinct ? '' : ownSite ? (fr ? ' Faites les deux sur le site de l’hôtel.' : ' Make both on the hotel’s own site.')
        : !confirmed ? (fr ? ' Confirmez les dates pour avoir un lien par réservation.' : ' Confirm the dates to get a link for each booking.')
          : (fr ? ' Faites les deux sur ce site.' : ' Make both bookings on that site.');
      card = (fr ? `Deux réservations, car un lien ne peut pas contenir les deux. ${pt.map((x, i) => dot(`${i + 1} : ${x}`)).join(' ')}` : `Two bookings, since one link can’t hold both. ${pt.map((x, i) => dot(`${i + 1}: ${x}`)).join(' ')}`) + both;
      chat = (fr ? `deux réservations distinctes, car un lien de réservation ne peut pas avoir des dates différentes par chambre. ${pt.map((x, i) => dot(`${i + 1} : ${x}`)).join(' ')}` : `two separate bookings, since one booking link can’t hold different dates per room. ${pt.map((x, i) => dot(`${i + 1}: ${x}`)).join(' ')}`)
        + (distinct ? (fr ? ' Chacune a son bouton sur la carte d’hébergement.' : ' Each has its own button on the stay card.') : both);
      // What each button really opens with (only once the stay's dates are confirmed, as for every stay link).
      const full = (h) => !!(h && h[0] && h[0].carries.dates && h[0].carries.adults && h[0].carries.rooms);
      const carry = !distinct ? (ownSite ? (fr ? 'Ce lien ne peut pas être prérempli : faites-y les deux réservations.' : 'This link can’t be pre-filled: make both bookings there.') : both.trim())
        : !confirmed ? '' : full(handoff) && full(handoff2) ? (fr ? 'Chaque lien s’ouvre avec ses propres dates, voyageurs et chambres.' : 'Each link opens with its own dates, guests and rooms.')
          : `${label(0)}${fr ? ' : ' : ': '}${ho(handoff)} ${label(1)}${fr ? ' : ' : ': '}${ho(handoff2)}`;
      note = [CANT[L], each, carry].filter(Boolean).join(' ');
    } else if (arr.mode === 'shared') {
      head = fr ? 'Une réservation' : 'One booking';
      const whenDay = arr.dated ? dayOf(arr.date, fr) : (fr ? `jour ${arr.day}` : `day ${arr.day}`);
      note = fr
        ? `Ce lien vaut pour la nuit la plus occupée : ${dot(pt[0])} ${arr.n} ${arr.kind === 'join' ? `arrive${arr.n > 1 ? 'nt' : ''} le` : `part${arr.n > 1 ? 'ent' : ''} le`} ${whenDay} : dites-le à l’hôtel, un lien de réservation ne peut pas changer les voyageurs d’une nuit à l’autre.`
        : `This link is for the fullest night: ${dot(pt[0])} ${arr.n} ${arr.kind === 'join' ? `arrive${arr.n > 1 ? '' : 's'}` : `leave${arr.n > 1 ? '' : 's'}`} ${whenDay}: tell the hotel, a booking link can’t change guests from night to night.`;
    } else {
      head = fr ? 'Une réservation' : 'One booking';
      note = fr ? `L’hébergement est pour ${dot(pt[0])} ${w.line ? `${arr.n} de plus ${w.from}, sans nuitée.` : ''}` : `The stay is for ${dot(pt[0])} ${w.line ? `${arr.n} more ${w.from}, with no night.` : ''}`;
    }
    return { head, parts: pt, btn, note: note.trim(), card: (card || note).trim(), chat: (chat || note.replace(/^./, (c) => c.toLowerCase())).trim(), confirm: CONFIRM[L] };
  };
  return { mode: arr.mode, parts, links, links2, distinct, handoff, handoff2, text: W(false), textFr: W(true) };
}
// The whereToStay block with the arrangement on it: trip.split (what the page prints), and each card's bookingLinks
// (booking 1's), bookingLinks2, handoff, handoff2 and split (its own words: which buttons, which note).
// byId: Map(id -> stay as the link builder takes it). Without an arrangement the block is returned as it is.
function applyToStay(block, arr, byId, opts = {}) {
  if (!block || !block.pick || !arr || arr.unresolved) return block;
  const t = block.trip || {};
  const parts = stayParts(arr, t);
  if (!parts) return block;
  const add = (card) => {
    const stay = byId.get(card.id);
    const s = stay ? cardSplit(stay, t, arr, { env: opts.env, regionLabel: card.regionLabel, belongs: typeof opts.belongs === 'function' ? (u) => opts.belongs(card.id, u) : null }) : null;
    if (!s) return card;
    return { ...card, bookingLinks: s.links, ...(s.links2.length ? { bookingLinks2: s.links2 } : {}), handoff: s.handoff, ...(s.handoff2.length ? { handoff2: s.handoff2 } : {}), split: { mode: s.mode, distinct: s.distinct, text: s.text, textFr: s.textFr } };
  };
  const w = words(arr, false), wf = words(arr, true);
  const split = { mode: arr.mode, kind: arr.kind, n: arr.n, day: arr.day, base: arr.base, ownRoom: arr.ownRoom, parts, line: w.line, lineFr: wf.line, who: w.who, whoFr: wf.who };
  return { ...block, trip: { ...t, rooms: arr.rooms.a + arr.rooms.b, split }, pick: add(block.pick), alternatives: (block.alternatives || []).map(add) };
}

// ---------- The plan's evidence entry (summary item, the Details sentence, the shared copy's line) ----------
function entry(arr, stayText, stops) {
  if (!arr) return null;
  if (arr.unresolved) {
    const why = arr.unresolved;
    const t = {
      no_dates: ['Later arrival: tell me which day of the trip (for example “day 2”), since this plan has no dates yet. The stay and the days are still planned for everyone.', 'Arrivée décalée : dites-moi quel jour du voyage (par exemple « jour 2 »), car ce plan n’a pas encore de dates. L’hébergement et les journées restent prévus pour tout le monde.'],
      outside: ['Later arrival: that date isn’t one of this trip’s days, so the stay and the days are still planned for everyone. Tell me which day they join or leave.', 'Arrivée décalée : cette date n’est pas dans les jours du voyage; l’hébergement et les journées restent prévus pour tout le monde. Dites-moi quel jour.'],
      party: ['Later arrival: tell me how many of you there are in all and how many come later, and I’ll set the stay and the days. They are still planned for everyone.', 'Arrivée décalée : dites-moi combien vous êtes en tout et combien arrivent plus tard, et j’ajusterai l’hébergement et les journées. Ils restent prévus pour tout le monde.'],
      one_day: ['Later arrival: noted. This is a one-day plan, so nothing changes in it.', 'Arrivée décalée : noté. Ce plan ne compte qu’une journée, rien n’y change.'],
    }[why] || ['Later arrival: not set on this plan yet.', 'Arrivée décalée : pas encore prise en compte.'];
    return { ask: 'late_arrival', label: 'Later arrival', labelFr: 'Arrivée décalée', status: 'unknown', stops: [], unresolved: why, short: 'Later arrival: not set yet', shortFr: 'Arrivée décalée : à préciser', text: t[0], textFr: t[1] };
  }
  const w = words(arr, false, stops), wf = words(arr, true, stops);
  const st = stayText || {};
  const dot = (x) => (/[.!?]$/.test(x) ? x : `${x}.`);
  // copy: what a copied itinerary says (no question in it); text: the plan's own line (the question last, while open).
  const copy = [dot(w.line), st.en || '', w.act].filter(Boolean).join(' ');
  const copyFr = [dot(wf.line), st.fr || '', wf.act].filter(Boolean).join(' ');
  const text = [copy, w.askShort].filter(Boolean).join(' '), textFr = [copyFr, wf.askShort].filter(Boolean).join(' ');
  // day, kind, win and stop: what the page needs to say who each stop of that day is for (lateStopState).
  // say / sayFr: what it needs to word that day's title and sentence again from the stops on screen (lateDaySay), so
  // the title and the notes can never disagree, also after a stop of that day is swapped, added or removed.
  const win = atWindow(arr.at);
  const sayOf = (x, lead) => ({ L: x.tpl.L, pre: x.tpl.pre, post: x.tpl.post, lead: lead ? `${lead} ` : '' });
  return { ask: 'late_arrival', label: arr.kind === 'join' ? 'Later arrival' : 'Earlier departure', labelFr: arr.kind === 'join' ? 'Arrivée décalée' : 'Départ anticipé', status: 'partial', stops: [], short: w.line, shortFr: wf.line, text, textFr, copy, copyFr, days: w.days, daysFr: wf.days, act: w.act, actFr: wf.act, mode: arr.mode, share: toShare(arr),
    kind: arr.kind, day: arr.day, ...(win ? { win, stop: w.stop, stopFr: wf.stop, say: sayOf(w, [dot(w.line), st.en || ''].filter(Boolean).join(' ')), sayFr: sayOf(wf, [dot(wf.line), st.fr || ''].filter(Boolean).join(' ')) } : { askTime: w.ask, askTimeFr: wf.ask }) };
}
// The stops of the arrival (or departure) day as a plan holds them: [{ name, start }] (start: minutes, from the plan's
// own schedule). The page words the day again from the stops on screen; this is the same reading on the server.
function planDayStops(plan, arr) {
  if (!plan || !arr || arr.unresolved || !Array.isArray(plan.days)) return [];
  const rows = Array.isArray(plan.schedule) ? plan.schedule : [];
  const day = plan.days.find((x) => x && x.day === arr.day);
  return ((day && day.stops) || []).map((s) => {
    const v = s && s.venue; if (!v) return null;
    const r = rows.find((x) => x && x.day === arr.day && x.venueId === v.id && typeof x.startMinutes === 'number');
    return r ? { name: v.name, start: Math.round(r.startMinutes) } : null;
  }).filter(Boolean);
}
// The stay sentence of the entry, from the chosen card's own words.
function stayTextOf(plan) {
  const card = plan && plan.whereToStay && plan.whereToStay.pick;
  const s = card && card.split;
  if (!s || !s.text) return null;
  return { en: s.text.note, fr: s.textFr.note };
}

// ---------- Sharing: la=j1d2o (join | leave, how many, which day, a room of their own said or not) ----------
// (2026-11-24) The time of day, only when known: la=j1d2o.t1400 (a clock time) or la=j1d2o.wa (a part of the day, by
// its code). A link without it -- every link made before -- reads as "time not set", which is the honest state.
const SHARE_RE = /^([jl])([1-9])d([1-9]\d?)([ox])(?:\.(?:t([01]\d|2[0-3])([0-5]\d)|w([a-z]{1,2})))?$/;
function toShare(arr) {
  if (!arr || arr.unresolved) return '';
  const at = validAt(arr.at) ? arr.at : null;
  const t = !at ? '' : Number.isInteger(at.m) ? `.t${String(Math.floor(at.m / 60)).padStart(2, '0')}${String(at.m % 60).padStart(2, '0')}` : `.w${DAYPARTS[at.part].c}`;
  return `${arr.kind === 'leave' ? 'l' : 'j'}${arr.n}d${arr.day}${arr.ownRoom ? 'o' : 'x'}${t}`;
}
function fromShare(v) {
  const m = SHARE_RE.exec(String(v || ''));
  if (!m || Number(m[3]) > 31) return null;
  let at = null;
  if (m[5]) at = { m: Number(m[5]) * 60 + Number(m[6]) };
  else if (m[7]) { const part = Object.keys(DAYPARTS).find((k) => DAYPARTS[k].c === m[7]); if (!part) return null; at = { part }; }
  return { key: 'late_arrival', kind: m[1] === 'l' ? 'leave' : 'join', n: Number(m[2]), when: { day: Number(m[3]) }, ownRoom: m[4] === 'o', ...(at ? { at } : {}), phrase: '' };
}
// The words a request gains when the arrangement is said in the chat (so every later turn reads it again).
function requestWords(need, lang) {
  const fr = lang === 'fr', n = need.n || 1, w = need.when || {};
  const whenEn = w.iso ? `on ${w.iso}` : w.md ? `on ${MO_EN[w.md[0] - 1]} ${w.md[1]}` : w.dom ? `on the ${w.dom}th` : Number.isInteger(w.wd) ? `on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][w.wd]}` : w.day ? `on day ${w.day}` : w.last ? 'on the last day' : w.night ? `for night ${w.night}` : w.lastNight ? 'for the last night' : w.late ? `${w.late} day${w.late > 1 ? 's' : ''} late` : w.early ? `${w.early} day${w.early > 1 ? 's' : ''} early` : w.nights ? `after ${w.nights} night${w.nights > 1 ? 's' : ''}` : '';
  const whenFr = w.iso ? `le ${w.iso}` : w.md ? `le ${w.md[1]} ${['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][w.md[0] - 1]}` : w.dom ? `le ${w.dom}` : Number.isInteger(w.wd) ? ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][w.wd] : w.day ? `le jour ${w.day}` : w.last ? 'le dernier jour' : w.night ? `pour la nuit ${w.night}` : w.lastNight ? 'pour la dernière nuit' : w.late ? `${w.late} jour${w.late > 1 ? 's' : ''} plus tard` : w.early ? `${w.early} jour${w.early > 1 ? 's' : ''} plus tôt` : w.nights ? `après ${w.nights} nuit${w.nights > 1 ? 's' : ''}` : '';
  // The time of day, in words the reader above reads back the same ("at 2:30 PM", "in the afternoon"; « à 14 h 30 »).
  const at = validAt(need.at) ? need.at : null;
  const atEn = !at ? '' : Number.isInteger(at.m) ? ` at ${clock(at.m, false)}` : ` ${DAYPARTS[at.part].say}`;
  const atFr = !at ? '' : Number.isInteger(at.m) ? ` à ${clock(at.m, true)}` : ` ${DAYPARTS[at.part].sayFr}`;
  if (fr) return `${n} d’entre nous ${need.kind === 'leave' ? (n > 1 ? 'partent' : 'part') : (n > 1 ? 'arrivent' : 'arrive')} ${whenFr}${atFr}${need.ownRoom ? ' et a besoin d’une chambre séparée' : ''}`;
  const nw = ['', 'one', 'two', 'three', 'four', 'five', 'six'][n] || String(n);
  return `${nw} of us ${need.kind === 'leave' ? (n > 1 ? 'leave' : 'leaves') : (n > 1 ? 'arrive' : 'arrives')} ${whenEn}${atEn}${need.ownRoom ? ' and needs a separate room' : ''}`;
}
// Does a request that says `have` already say what `said` says (same kind, same day words, the same room)?
const whenKey = (w) => JSON.stringify(Object.keys(w || {}).sort().map((k) => [k, w[k]]));
function same(have, said) {
  if (!have || !said) return false;
  return have.kind === said.kind && (said.n == null || said.pronoun || have.n === said.n) && whenKey(have.when) === whenKey(said.when);
}

// ---------- The chat ----------
// A message about the arrangement is answered here, before any other rule reads it: the statement itself, "make sure
// the hotel booking reflects this", "only include her for activities from October 9", "she'll skip day 1". These are
// statements and instructions about WHO is there, never a request to add a stop ("include … activities" used to add
// an activity). Anything else in the message is handed back (rest) for the usual rules.
//   -> { ops: [{ o: 'late', … }], cant: null, access: true, late: true, rest? } or null (not about this)
const PERSON_REF = "(?:her|him|them|she|he|they|our friend|my friend|the friend|our (?:other |third )?(?:friend|guest|sister|brother|mom|mother|dad|father|daughter|son|cousin)|the (?:third|other|late|last) (?:person|guest|friend|adult|one)|the late(?:comer| arrival)|whoever (?:arrives|comes) late|elle|lui|eux|elles|notre amie?|mon amie?|la troisieme personne)";
// "include her … from October 9", "count him in from day 2", "leave her out of day 1", "add her to the activities from
// Saturday": about a person already of the party. Never "add a spa for her" or "book her a massage" (a stop to add).
const PARTICIPATE_RE = new RegExp(`\\b(?:include|count|keep|leave|inclu(?:re|ez|s)|compte[rz]?)(?:-(?:la|le|les)\\b|\\b[^.;!?]{0,14}\\b${PERSON_REF}\\b)[^.;!?]{0,60}\\b(?:from|starting|as of|after|until|before|only on|on|for|in|out of|a partir|des|a compter|apres|jusqu|avant|pour|dans)\\b|\\b(?:add|ajoute[rz]?)(?:-(?:la|le|les)| (?:her|him|them|our friend|my friend|notre amie?)) (?:to|into|in|for|from|on|a|aux|au|dans|pour)\\b(?! (?:an?|some|une?|des) )`);
const PARTICIPATE2_RE = new RegExp(`\\b(?:activities|activites|things|stops|plans?|tours?|tastings?|dinners?|meals?|outings?|sorties|repas|soupers?|degustations?)\\b[^.;!?]{0,40}\\b(?:for|with|without|sans|pour|avec|include|includes|should include|inclu\\w*)\\b[^.;!?]{0,12}\\b(?:${PERSON_REF}(?! (?:birthday|favou?rite|anniversaire))|(?:just |only |seulement )?(?:the )?(?:two|three|2|3|deux|trois) of us)\\b`);
const NEW_STOP_RE = /\b(?:add|include|book|find|get|reserve|ajoute[rz]?|inclu(?:re|ez|s)|trouve[rz]?|reserve[rz]?)\b[^.;!?]{0,6}\b(?:an?|some|another|une?|des|du)\b/;
const DAY_FOR_RE = /\b(?:day (?:1|one)|the first day|jour 1|le premier jour|la premiere journee)\b[^.;!?]{0,30}\b(?:just|only|for|pour|seulement|juste)\b[^.;!?]{0,12}\b(?:the )?(?:two|three|four|2|3|4|deux|trois|quatre)(?: of us| d'entre nous)?\b/;
const BOOKING_REF_RE = /\b(?:hotel|hotels|booking|bookings|reservation|reservations|stay|room|rooms|expedia|booking\.com|link|links|checklist|accommodation|hebergement|chambre|chambres|lien|liens)\b/;
const REFLECT_RE = /\b(?:reflects?|reflecting|shows?|showing|match(?:es)?|accounts? for|takes? (?:this|that|it|her|him|them) into account|right|correct|updated?|fix(?:ed)?|adjust(?:ed)?|changed?|split|separate|tien(?:ne|t) compte|reflete(?:nt)?|corrig\w+|ajust\w+|a jour|separ\w+)\b/;
const THIS_RE = new RegExp(`\\b(?:this|that|it|these|arrival|arrangement|late|later|${PERSON_REF}|cela|ca|ceci|arrivee|son arrivee|en tien(?:ne|t) compte|en tiennent compte)\\b`);
const STOP_EDIT_RE = /\b(?:swap|replace|remove|drop|delete|switch|move|echange[rz]?|remplace[rz]?|enleve[rz]?|retire[rz]?|supprime[rz]?|deplace[rz]?)\b/;
const HER_ROOM_RE = new RegExp(`\\b(?:${PERSON_REF}|she|he|they|elle|il)\\b[^.;!?]{0,30}`);
// Cut at a sentence end, and inside a sentence where a new instruction starts (", and only include her…").
const CLAUSE_RE = /\s*(?:[,;]\s*(?:and|but|also|plus|et|mais|aussi)?|\s(?:and|but|et|mais)\s)\s*(?=(?:please |can you |could you |svp |s'il vous plait |pouvez-vous |peux-tu )?(?:only |just |also |seulement |juste )?(?:include|count|make sure|ensure|plan|book|add|keep|put|swap|replace|remove|drop|find|inclu(?:re|ez|s)|compte[rz]?|assure[rz]?|veille[rz]?|ajoute[rz]?|remplace[rz]?|enleve[rz]?|prevo(?:ir|yez)|mett(?:re|ez))\b)/g;
function clausesOf(raw) {
  const out = [];
  for (const s of sentences(raw)) {
    const text = s.text.trim();
    if (!text) continue;
    const f = fold(text);
    if (f.length !== text.length) { out.push(text); continue; }
    let last = 0, m;
    CLAUSE_RE.lastIndex = 0;
    while ((m = CLAUSE_RE.exec(f))) { if (m.index > last) out.push(text.slice(last, m.index)); last = m.index + m[0].length; if (!m[0]) CLAUSE_RE.lastIndex++; }
    out.push(text.slice(last));
  }
  return out.map((p) => p.replace(/^[\s,;.]+|[\s,;.]+$/g, '')).filter((p) => /[a-z]{2}/i.test(p));
}
// "forget the late arrival", "she's coming for the whole trip after all": the arrangement comes off the plan.
const FORGET_RE = new RegExp(`\\b(?:remove|forget|cancel|drop|delete|scrap|ignore|never mind|enleve[rz]?|oublie[rz]?|annule[rz]?|retire[rz]?|supprime[rz]?)\\b[^.;!?]{0,30}\\b(?:late(?:r)? arrival|early departure|earlier departure|arrival change|staggered arrival|separate bookings?|second booking|two bookings|arrivee decalee|depart anticipe|deux reservations)\\b|\\b${PERSON_REF}\\b[^.;!?]{0,20}\\b(?:no longer|not|isn't|is not|won't be|n'arrive plus|ne part plus)\\b[^.;!?]{0,20}\\b(?:late|later|early|earlier|plus tard|plus tot)\\b|\\b${PERSON_REF}\\b[^.;!?]{0,30}\\b(?:the whole (?:trip|time|stay)|the full (?:trip|stay)|all (?:three|3|the) (?:days|nights)|from the start|with us after all|tout le (?:voyage|sejour)|des le debut)\\b`);
// The time they arrive (or leave), said in the chat on a plan that already has the arrangement (2026-11-24):
//   "she arrives at 2 pm", "her flight lands at 2:30", "they get in mid-afternoon", "arrival time is 3", « elle arrive
//   vers 15 h », "change her arrival to 4 pm": a person of the party (or "arrival") with an arriving word and a time;
//   "2 pm", "around 3", "in the evening", "not sure yet": a bare answer, ONLY while the question is the open one
//   (pending: the chat's last reply asked it, or the plan is showing it and nothing else is being asked).
// Never a message that edits stops or times ("start day 2 at 2 pm", "move dinner to 7"), and never a question.
// -> { at } | { unsure: true } | null
const TIME_WHO = "(?:she|he|they|her|his|their|our friend|my friend|the friend|our (?:other |third )?(?:friend|guest|sister|brother|mom|mother|dad|father|daughter|son|cousin)|the (?:third|other|late|last) (?:person|guest|friend|adult|one)|elle|il|ils|elles|notre amie?|mon amie?|la troisieme personne|cette personne)";
const TIME_JOIN = "(?:arriv\\w+|land\\w*|get(?:s|ting)? (?:in|here|there)|com(?:es|ing) in|show(?:s|ing) up|join\\w*|touch(?:es)? down|atterri\\w*|sera la|seront la|nous rejoi\\w+)";
const TIME_LEAVE = "(?:leav\\w+|head(?:s|ing)? (?:home|back|out|off)|depart\\w*|fl(?:y|ies|ying) (?:home|out|back)|go(?:es|ing)? (?:home|back)|check(?:s|ing)? out|takes? off|part(?:ent|ira|iront)?|repart\\w*|quitt\\w+|s'en va|rentre\\w*)";
const TIME_OTHER_RE = /\b(?:start|begin|move|push|shift|swap|replace|remove|drop|delete|add|book|reserve|find|skip|dinner at|lunch at|breakfast at|commence[rz]?|debute[rz]?|deplace[rz]?|remplace[rz]?|enleve[rz]?|ajoute[rz]?|reserve[rz]?)\b/;
const UNSURE_RE = /^(?:(?:i'?m |we'?re |i am |we are )?not sure(?: yet)?|(?:i |we )?(?:don't|do not) know(?: yet)?|no idea(?: yet)?|not yet|unknown|tbd|tba|(?:je |on |nous )?ne sai[st] pas(?: encore)?|(?:je |on )?sais pas|aucune idee|pas encore|pas sure?)[\s.!]*$/;
function timeChat(message, have, pending) {
  const raw = String(message || '').replace(/\s+/g, ' ').trim();
  if (!have || !Number.isInteger(have.n) || !raw || raw.length > 120 || /\?\s*$/.test(raw)) return null;
  const t = fold(raw).replace(/[.!]+$/, '').trim();
  if (pending && UNSURE_RE.test(t)) return { unsure: true };
  if (TIME_OTHER_RE.test(t)) return null;
  const verb = have.kind === 'leave' ? TIME_LEAVE : TIME_JOIN, noun = have.kind === 'leave' ? '(?:departure|depart|leaving|flight|vol)' : '(?:arrival|arrivee|arriving|flight|vol)';
  const about = new RegExp(`\\b${TIME_WHO}\\b[^.;!?]{0,30}\\b${verb}`).test(t) || new RegExp(`\\b${TIME_WHO} (?:flight|plane|bus|train|ride|vol|avion|autobus)\\b[^.;!?]{0,20}\\b${verb}`).test(t)
    || new RegExp(`\\b${noun}\\b(?: time)?(?: is| est| will be| sera|:| to| a| at| now)?\\b`).test(t) || new RegExp(`^(?:make|change|set|update|mets|change[rz]?|mettez)\\b[^.;!?]{0,25}\\b${noun}\\b`).test(t);
  if (about) { const at = timeIn(t) || timeIn(t.replace(/^.*\b(?:at|to|a|vers|around|about|by)\s+(?=\d)/, ''), { bare: true }); return at ? { at } : null; }
  if (!pending) return null;
  // A bare answer: nothing but the time and its small words.
  const at = timeIn(t, { bare: true });
  if (!at) return null;
  const left = t.replace(/o'? ?clock/g, ' ').replace(/[\d:.,'-]+/g, ' ').replace(/\b(?:am|pm|a m|p m|ish|noon|midi|h)\b/g, ' ')
    .replace(/\b(?:at|around|about|by|maybe|probably|i think|we think|i guess|roughly|approximately|sometime|some time|in|the|on|that|day|early|late|mid|middle|end|of|time|for|before|just|after|first thing|morning|afternoon|evening|night|tonight|lunch|lunchtime|midday|dinner|supper|work|or so|sharp|vers|environ|a|le|la|en|dans|de|du|d|l|fin|debut|milieu|tot|tard|matin|matinee|apres|midi|soir|soiree|souper|temps|pour|heures?|aprem|journee|nuit|peut-etre|probablement|je pense|bon)\b/g, ' ').replace(/\s+/g, '');
  return left ? null : { at };
}
function chatRead(message, stops, h, ctx = {}) {
  const raw = String(message || '').replace(/\s+/g, ' ').trim();
  if (!raw || raw.length > 600) return null;
  const have = readLate(ctx.request || '');
  if (have && raw.length < 160 && !readLate(raw) && FORGET_RE.test(fold(raw)) && !STOP_EDIT_RE.test(fold(raw).replace(/\b(?:remove|drop|delete|enleve[rz]?|retire[rz]?|supprime[rz]?)\b/, ''))) return { ops: [h.op('late', { late: null, forget: true })], cant: null, exact: true, access: true, late: true };
  const said = readLate(raw);
  // The time alone, on a plan that has the arrangement: recorded with it (the request's statement gains the time).
  if (have && !said) {
    const tm = timeChat(raw, have, !!ctx.pendingTime);
    if (tm && tm.unsure) return { ops: [h.op('late', { late: null, said: false, unsure: true })], cant: null, exact: true, access: true, late: true };
    if (tm && tm.at) return { ops: [h.op('late', { late: sameAt(have.at, tm.at) ? null : { ...have, at: tm.at }, said: true, time: true })], cant: null, exact: true, access: true, late: true };
  }
  const parts = clausesOf(raw);
  const rest = [];
  let about = false, room = false, book = false, part = false, question = false, forget = false;
  for (const p of parts) {
    const t = fold(p).replace(/\s+/g, ' ');
    const stmt = !!readSentence(p);
    const ctxOk = !!(have || said);
    const isRoom = ROOM_RE.test(t) && !NOT_ROOM_RE.test(t) && HER_ROOM_RE.test(t) && !STOP_EDIT_RE.test(t);
    const isBook = ctxOk && BOOKING_REF_RE.test(t) && REFLECT_RE.test(t) && THIS_RE.test(t) && !STOP_EDIT_RE.test(t) && !/\b(?:pool|hot tub|kitchen|cheaper|nicer|piscine|cuisine|moins cher)\b/.test(t);
    const isPart = (PARTICIPATE_RE.test(t) || (PARTICIPATE2_RE.test(t) && !NEW_STOP_RE.test(t)) || DAY_FOR_RE.test(t)) && !STOP_EDIT_RE.test(t);
    if (stmt) { about = true; if (/\?\s*$/.test(p)) question = true; if (isRoom) room = true; if (/\b(?:no longer|not anymore|after all|finalement)\b/.test(t)) forget = true; continue; }
    if (isRoom && ctxOk) { about = true; room = true; continue; }
    if (isBook) { about = true; book = true; continue; }
    if (isPart) { about = true; part = true; continue; }
    // "does the booking cover our friend arriving late?", "is day 1 for two?": a question about it, on a plan that has it.
    if (have && /\?\s*$/.test(p) && (/\b(?:late|later|arriv\w+|join\w*|friend|two bookings|separate booking|second room|decal\w+|plus tard|amie?)\b/.test(t)) && !STOP_EDIT_RE.test(t) && (BOOKING_REF_RE.test(t) || /\b(?:day|days|activities|jour|jours|activites)\b/.test(t))) { about = true; question = true; continue; }
    rest.push(p);
  }
  if (!about) return null;
  // What is recorded: a statement the request does not already make (with the room, when said beside it).
  let need = said ? { ...said, ownRoom: said.ownRoom || room } : null;
  // (The same statement with a new time of day -- "our friend arrives October 9 at 4 pm" -- changes the time only.)
  if (need && have && same(have, need)) { const t2 = need.at && !sameAt(have.at, need.at) ? need.at : null; if (need.ownRoom && !have.ownRoom) need = { ...have, ownRoom: true, addRoom: true, ...(t2 ? { at: t2 } : {}) }; else need = t2 ? { ...have, at: t2 } : null; }
  if (!need && have && room && !have.ownRoom) need = { ...have, ownRoom: true, addRoom: true };
  const op = h.op('late', { late: need, said: !!said, room, book, part, question, ...(forget ? { forget: true } : {}), ...(!have && !said ? { orphan: true } : {}) });
  const out = { ops: [op], cant: null, exact: true, access: true, late: true };
  if (rest.length) out.rest = rest.join('. ');
  return out;
}
// The one reply. arr: the arrangement as it now stands (or { unresolved }, or null); card: the chosen stay card (or
// null: no place to stay on the plan); o: { recorded, restated, orphan }.
function chatReply(arr, card, lang, o = {}) {
  const fr = lang === 'fr';
  const out = chatReplyText(arr, card, lang, o);
  return o.alone === false ? out.replace(/ (?:No stops changed|Aucun arrêt n’a changé)\.$/, '') : out;
}
// "9 AM" beside a stop's name in a reply.
const stopList = (list, fr) => list.map((x) => `${x.name} (${clock(x.start, fr)})`).join(', ');
// The reply to a time of day (o.time: 'set' | 'changed'; o.stops: that day's stops on screen, [{ name, start }]).
function timeReply(arr, lang, o = {}) {
  const fr = lang === 'fr', at = arr.at, w = words(arr, fr), win = atWindow(at), join = arr.kind === 'join';
  const few = arr.base + arr.kids, all = few + arr.n, allW = fr ? `les ${all}` : `all ${all}`;
  const day = arr.dated ? dayOf(arr.date, fr) : (fr ? `jour ${arr.day}` : `day ${arr.day}`);
  const span = at.part ? atSpan(at, fr) : '';
  const when = Number.isInteger(at.m) ? (fr ? `à ${clock(at.m, true)}` : `at ${clock(at.m, false)}`) : `${fr ? DAYPARTS[at.part].sayFr : DAYPARTS[at.part].say}${fr ? ` (compté comme ${span})` : ` (taken as ${span})`}`;
  const what = join ? (fr ? 'arrivée' : 'arrival') : (fr ? 'départ' : 'departure');
  const open = o.time === 'changed'
    ? (fr ? `Modifié : ${what} le ${day} ${when}.` : `Updated: ${what} on ${day} ${when}.`)
    : (fr ? `Noté : ${what} le ${day} ${when}.` : `Noted: ${what} on ${day} ${when}.`);
  const list = (o.stops || []).filter((x) => x && x.name && Number.isInteger(x.start)).sort((a, b) => a.start - b.start);
  const by = { few: [], near: [], all: [] };
  for (const x of list) { const st = lateStopState(win, arr.kind, x.start); if (by[st]) by[st].push(x); }
  const bits = [];
  if (!list.length) bits.push(`${fr ? `Jour ${arr.day}` : `Day ${arr.day}`}${fr ? ' : ' : ': '}${w.days[arr.day]}.`);
  else {
    const D = fr ? `jour ${arr.day}` : `Day ${arr.day}`;
    if (by.few.length) bits.push(join
      ? (fr ? `Au ${D}, avant l’arrivée, pour ${few} : ${stopList(by.few, fr)}.` : `${D} before the arrival is for ${few}: ${stopList(by.few, fr)}.`)
      : (fr ? `Au ${D}, après le départ, pour ${few} : ${stopList(by.few, fr)}.` : `${D} after the departure is for ${few}: ${stopList(by.few, fr)}.`));
    if (by.near.length) bits.push(join
      ? (fr ? `Près de l’arrivée, donc non confirmé pour ${allW} : ${stopList(by.near, fr)}.` : `Close to the arrival, so not confirmed for ${allW}: ${stopList(by.near, fr)}.`)
      : (fr ? `Près du départ, donc non confirmé pour ${allW} : ${stopList(by.near, fr)}.` : `Close to the departure, so not confirmed for ${allW}: ${stopList(by.near, fr)}.`));
    if (by.all.length) bits.push(by.few.length || by.near.length
      ? (join ? (fr ? `Les arrêts suivants sont prévus pour ${allW}.` : `Later stops are planned for ${allW}.`) : (fr ? `Les arrêts d’avant sont prévus pour ${allW}.` : `Earlier stops are planned for ${allW}.`))
      : (join ? (fr ? `Tous les arrêts du ${D} commencent plus tard : prévus pour ${allW}.` : `Every ${D} stop starts later: planned for ${allW}.`) : (fr ? `Tous les arrêts du ${D} commencent bien avant : prévus pour ${allW}.` : `Every ${D} stop starts well before: planned for ${allW}.`)));
  }
  return [open, ...bits, o.alone === false ? '' : (fr ? 'Aucun arrêt n’a changé.' : 'No stops changed.')].filter(Boolean).join(' ');
}
// The question a reply about the arrangement ends with, while the time is not known ('' once it is).
function chatAsk(arr, lang) {
  if (!arr || arr.unresolved || validAt(arr.at)) return '';
  return words(arr, lang === 'fr').askShort;
}
// The tag the chat's open question rides back on (a client sends it with the next message, never shown).
const ASK_TAG = '[arrival time]';
function chatReplyText(arr, card, lang, o = {}) {
  const fr = lang === 'fr';
  // "not sure yet": nothing changes, and the day stays as it is said.
  if (o.unsure && arr && !arr.unresolved) { const w0 = words(arr, fr); return fr ? `Pas de souci. D’ici là : ${w0.days[arr.day]} au jour ${arr.day}. Dites-moi l’heure quand vous la saurez. Aucun arrêt n’a changé.` : `No problem. Until then, Day ${arr.day} stays ${w0.days[arr.day]}. Tell me the time when you know it. No stops changed.`; }
  if (o.time && arr && !arr.unresolved && validAt(arr.at)) return timeReply(arr, lang, o);
  if (o.orphan || (!arr && !o.recorded && !o.cleared && !o.start)) return fr
    ? 'Je n’ai personne qui arrive plus tard sur ce plan. Quel jour arrive-t-elle ou arrive-t-il? Dites-le-moi (« notre amie arrive le jour 2 ») et j’ajusterai l’hébergement et les journées. Aucun arrêt n’a changé.'
    : 'I don’t have anyone arriving later on this plan. Which day do they arrive? Tell me (“our friend arrives on day 2”) and I’ll set the stay and the days. No stops changed.';
  if (!arr && o.cleared) return fr ? 'Compris : tout le monde est là du début à la fin, et l’hébergement redevient une seule réservation pour tout le groupe. Aucun arrêt n’a changé.' : 'Got it: everyone is there from start to finish, so the stay is one booking for the whole party again. No stops changed.';
  if (!arr) return fr ? 'Tout le monde est donc là du début à la fin : rien à changer. Aucun arrêt n’a changé.' : 'Then everyone is there from start to finish: nothing to change. No stops changed.';
  if (arr.unresolved) {
    const q = {
      no_dates: ['Which day of the trip do they join (for example “day 2”)? This plan has no dates yet, so I can’t place that date.', 'Quel jour du voyage (par exemple « jour 2 »)? Ce plan n’a pas encore de dates, je ne peux donc pas situer cette date.'],
      outside: ['That date isn’t one of this trip’s days. Which day do they join or leave?', 'Cette date n’est pas dans les jours du voyage. Quel jour arrive ou part cette personne?'],
      party: ['How many of you are there in all, and how many come later? Then I can set the stay and the days.', 'Combien êtes-vous en tout, et combien arrivent plus tard? Je pourrai alors ajuster l’hébergement et les journées.'],
      one_day: ['This is a one-day plan, so there’s nothing to split.', 'Ce plan ne compte qu’une journée : rien à répartir.'],
    }[arr.unresolved] || ['Which day do they join?', 'Quel jour?'];
    return `${fr ? q[1] : q[0]} ${fr ? 'Aucun arrêt n’a changé.' : 'No stops changed.'}`;
  }
  const w = words(arr, fr, o.stops);
  const s = card && card.split ? (fr ? card.split.textFr : card.split.text) : null;
  const open = o.recorded ? (fr ? 'Noté, c’est sur votre plan.' : 'Noted, it’s on your plan.') : (fr ? 'Déjà sur votre plan.' : 'Already on your plan.');
  const stay = s ? `${fr ? 'Hébergement : ' : 'Stay: '}${s.chat}` : (fr ? 'Hébergement : aucun sur ce plan, donc rien à réserver ici pour les chambres.' : 'Stay: none on this plan, so there’s nothing to book here for the rooms.');
  const act = `${fr ? 'Activités : ' : 'Activities: '}${w.act}`;
  return [open, stay, act, o.alone === false ? '' : (fr ? 'Aucun arrêt n’a changé.' : 'No stops changed.')].filter(Boolean).join(' ');
}

module.exports = {
  readLate, readSentence, stripLate, whenIn, resolve, peopleOn, words, stayParts, partText, cardSplit, applyToStay, entry, stayTextOf,
  toShare, fromShare, requestWords, same, sameOnTrip, dayIn, chatRead, chatReply, clausesOf, CANT, CONFIRM, ROOM_RE,
  timeIn, timeChat, sameAt, validAt, atWindow, atTag, lateStopState, lateDaySay, planDayStops, chatAsk, ASK_TAG, DAYPARTS, CLIENT_SRC, SHARE_RE,
};
