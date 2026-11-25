'use strict';
// Build My Trip: who is on the trip, and who does what (2026-11-24, Dayton's live test at 390px).
//
// "Plan a 3-day SilverStar winter trip for 2 adults and a 10-year-old … Two of us are beginners and want ski lessons;
// one adult does not ski and would prefer a spa or another relaxing activity. We need a hotel for two nights…"
//   - the hotel card said "1 adult, 1 kid": "Two of us" was read as the size of the party, less the child;
//   - the non-skier's spa was read as a spa to AVOID ("does not … spa"), and nothing was said about that adult;
//   - "What can the adult who does not ski do while the other two are skiing?" got "Which stop do you mean?".
//
// The rule here: the PARTY is what the request says in total ("2 adults and a 10-year-old", "family of four", "the six
// of us"). Words about SOME of the party ("two of us are beginners", "one adult does not ski", "the other two") say who
// takes part in what. They never change how many people the hotel is for.
//
// What the planner can do with it is small, and said plainly: a plan is ONE schedule for everyone. So:
//   - the non-skier's own wish ("a spa") is planned as a plain wish of the trip (never as a thing to avoid);
//   - the plan carries one short note (plan.partySplit) saying it is one schedule, and what the listings show for the
//     one who is not skiing: the spa stop(s) on the plan with their day and time, or that no spa is listed in the town
//     and which listed spa is nearest (its town, the straight-line distance, "far" beyond FAR_KM), and what else is
//     listed in the plan's own town that is not skiing, named by what it is. "Spa" is what the listing IS by its
//     stored data (trip-requirements.js spaListing); nothing here says a place is relaxing, suitable, open or that
//     a day visit can be had unless the listing's own words say so;
//   - the chat answers "what can the non-skier do?" from the same facts, says what adding a stop does to the one
//     shared schedule, offers to add a listed spa that is not far or something listed in town, and changes nothing
//     by itself.
//
// This file is the same on okanaganroam.com and whistlerroam.com. Pure functions: server.js passes the listings' facts.

const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10 };
const N = '(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|un|une|deux|trois|quatre|cinq|sept|huit|neuf|dix)';
const numOf = (x) => { const n = NUM[String(x || '').toLowerCase()] || Number(x); return Number.isInteger(n) && n >= 1 && n <= 16 ? n : null; };
// Lower case, no accents, apostrophes and hyphens as spaces: the form trip-planner.js requestParty reads.
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/-/g, ' ');

// What follows "two of us" / "one adult" when it says what SOME of the party do, are or want.
const PRED = '(?:is|are|was|were|isn t|aren t|do|does|did|don t|doesn t|didn t|won t|will|would|d|can|can t|cannot|could|want|wants|wanted|need|needs|prefer|prefers|has|have|had|ski|skis|snowboard|snowboards|drink|drinks|eat|eats|love|loves|like|likes|hate|hates|only|also|just|never|arrive|arrives|join|joins|leave|leaves|use|uses|ne|est|sont|veut|veulent|prefere|preferent|skie|skient|boit|boivent|mange|mangent|arrivent)\\b';
const WHO = '(?:who |that |qui )?';
const SUB_RES = [
  // "two of us are beginners", "one of us is vegetarian" (never "the six of us", "all four of us", "we are 4 of us").
  new RegExp(`(?<!\\b(?:the|all|both|we are|we re|there are|there will be|for|just the|les|tous les|nous sommes|on est) )\\b${N} (?:of us|d entre nous)\\b(?= ${WHO}${PRED})`, 'g'),
  // "one of the adults", "two of the kids", "one of them", « l'un de nous ».
  new RegExp(`\\b${N} (?:of the (?:adults|kids|children|group|party|family|guys|girls|women|men)|of our (?:group|party|family)|of them|des (?:adultes|enfants))\\b`, 'g'),
  /\bl une? (?:de nous|d entre nous|des adultes)\b/g,
  // "the other two", "the other adult", « les deux autres ».
  new RegExp(`\\b(?:the other|another|the remaining) ${N}(?: (?:adults?|of us|people|kids?|children))?\\b`, 'g'),
  /\b(?:the other|another) (?:adult|person|parent|kid|child)\b|\bthe others\b|\bthe rest of (?:us|the group)\b/g,
  new RegExp(`\\bles ${N} autres\\b|\\bl autre (?:adulte|personne|parent|enfant)\\b`, 'g'),
  // "one person has a peanut allergy", "one parent doesn't ski".
  new RegExp(`\\b(?:only |just |seulement )?(?:one|1|un|une) (?:person|personne|parent|grown up)\\b(?= ${WHO}${PRED})`, 'g'),
];
// A count with its noun, for "a smaller count that says what some of them do" ("4 adults … two adults don't ski").
const COUNT_RE = new RegExp(`\\b(?:only |just |seulement )?${N} (adults?|adultes?|people|personnes|persons|kids?|children|child|enfants?)\\b`, 'g');
const CLASS_OF = (noun) => (/^(?:kids?|children|child|enfants?)$/.test(noun) ? 'kids' : 'adults');
// The spans of a folded text that speak of SOME of the party. -> [[start, end], ...]
function subgroupSpans(text) {
  const t = fold(text), spans = [];
  for (const re of SUB_RES) { re.lastIndex = 0; let m; while ((m = re.exec(t))) { spans.push([m.index, m.index + m[0].length]); if (!m[0].length) re.lastIndex += 1; } }
  // A smaller count followed by what they do, beside a larger count of the same people: the larger one is the party.
  const counts = []; COUNT_RE.lastIndex = 0; let m;
  while ((m = COUNT_RE.exec(t))) { const n = numOf(m[1]); if (n) counts.push({ n, cls: CLASS_OF(m[2]), at: m.index, end: m.index + m[0].length, pred: new RegExp(`^ ${WHO}${PRED}`).test(t.slice(m.index + m[0].length)) }); }
  const totals = { adults: 0, kids: 0 };
  for (const c of counts) if (!spans.some(([a, b]) => c.at >= a && c.at < b)) totals[c.cls] = Math.max(totals[c.cls], c.n);
  // (A family named in total counts too: "family of four … one adult doesn't ski".)
  const fam = new RegExp(`\\bfamil(?:y|le) (?:of|de) ${N}\\b`).exec(t), grp = new RegExp(`\\b(?:group|party|groupe) (?:of|de) ${N}\\b`).exec(t);
  if (fam) totals.adults = Math.max(totals.adults, 2);
  if (grp && numOf(grp[1])) totals.adults = Math.max(totals.adults, numOf(grp[1]));
  for (const c of counts) if (c.pred && c.n < totals[c.cls]) spans.push([c.at, c.end]);
  return spans;
}
// The folded text with those spans blanked (same length), so a count that is the party is all that is left to read.
function stripSubgroups(text) {
  const t = fold(text), spans = subgroupSpans(text);
  if (!spans.length) return t;
  const out = t.split('');
  for (const [a, b] of spans) for (let i = a; i < b; i++) out[i] = ' ';
  return out.join('');
}
const hasSubgroup = (text) => subgroupSpans(text).length > 0;

// ---- the one who does not ski ----
// On the request's own text (accents and apostrophes as typed): a person or a few of the party, then "does not ski".
const AP = "[’'`]";
const ONE_WHO = `(?:(?:only |just )?(?:one|1|an?|the|our|my|another|the other|un|une|notre|mon|ma|l${AP}|le|la) ?(?:non[- ]skiing |other |second )?(?:adult|adulte|person|personne|parent|grown[- ]up|of us|of the adults|d${AP}entre nous|des adultes|friend|amie?|husband|wife|partner|spouse|mom|mum|mother|dad|father|grandma|grandpa|grandmother|grandfather|grandparent|sister|brother|mari|femme|conjointe?|m[èe]re|p[èe]re)|${N} (?:adults|adultes|of us|people|personnes|of the adults|d${AP}entre nous|friends)|grandma|grandpa)`;
const NO_SKI = `(?:(?:who |that )?(?:does not|doesn${AP}t|do not|don${AP}t|will not|won${AP}t|can${AP}t|cannot|can not|is not|isn${AP}t|are not|aren${AP}t|never)(?: want to| like to| plan to| going to)? (?:ski|skis|skiing|snowboard|snowboarding|a skier|skiers|go skiing|hit the slopes)|(?:qui )?ne (?:skie|skient)(?: pas)?|(?:qui )?ne f(?:ait|ont) pas de ski|(?:is|are|est|sont) (?:a |an |un |une |des )?non[- ]?ski(?:er|ers|eur|euse|eurs))\\b`;
const NON_SKIER_RE = new RegExp(`\\b(${ONE_WHO})\\s+${NO_SKI}`, 'i');
const NON_SKIER_NOUN_RE = new RegExp(`\\b(?:(?:one|1|an?|the|our|my|un|une|notre|le|la)|${N}) non[- ]?ski(?:er|ers|eur|euse|eurs|ing (?:adult|person|parent|friend))\\b`, 'i');
const WISH_LEAD_RE = new RegExp(`^[\\s,;:–—-]*(?:(?:and|but|so|et|mais|donc)\\s+)?(?:(?:he|she|they|who|il|elle|qui)\\s+)?(?:(?:would|${AP}d)\\s+)?(?:(?:really|instead|just|plut[oô]t)\\s+)*(?:prefers?|likes?|loves?|wants?|needs?|enjoys?|rather|is looking for|are looking for|is hoping for|pr[ée]f[èe]re(?:rait)?|aimerait|veut|voudrait)\\s+(?:(?:to\\s+)?(?:do|have|try|visit|go to|go for|get|be at|spend (?:the )?time at)\\s+)?`, 'i');
const SPA_RE = /\b(?:spas?|saunas?|massages?|hot springs?|thermal|wellness|hydroth[eé]rap\w*|nordic spa|spa nordique)\b/i;
const ADULT_RE = /\b(?:adults?|adultes?|parents?|grown[- ]ups?|husband|wife|partner|spouse|mom|mum|mother|dad|father|grandma|grandpa|grandmother|grandfather|grandparent|mari|femme|conjointe?|m[èe]re|p[èe]re)\b/i;
const LESSON_RE = new RegExp(`\\b${N} (?:of us|adults?|kids?|children|people|d${AP}entre nous|adultes?|enfants?)\\b[^.;!?]{0,70}\\b(?:lessons?|ski school|snow school|le[cç]ons?|cours de ski)\\b`, 'i');
// The request read for sub-groups. -> null, or
//   { nonSkier: { n, adult, spa, wish, span: [start, end], keep } | undefined, lessons: { n } | undefined }
// span is the whole clause in the text; keep is what the planner reads in its place (the wish alone, or nothing).
function readSplit(text) {
  const raw = String(text || '');
  const out = {};
  let m = NON_SKIER_RE.exec(raw), lead = m ? m[1] : null;
  if (!m) { m = NON_SKIER_NOUN_RE.exec(raw); lead = m ? m[0] : null; }
  if (m) {
    const n = numOf((new RegExp(`^${N}\\b`, 'i').exec(lead) || [])[1]) || 1;
    // The clause runs to the end of its sentence; what it wishes for follows "and would prefer / wants / likes".
    const after = raw.slice(m.index + m[0].length), stop = after.search(/[.;!?\n]/), tail = stop === -1 ? after : after.slice(0, stop);
    const w = WISH_LEAD_RE.exec(tail);
    const wish = w ? tail.slice(w[0].length).replace(/\s+/g, ' ').replace(/[\s,]+(?:instead|rather|plut[oô]t|à la place)\s*$/i, '').trim() : '';
    out.nonSkier = { n, adult: ADULT_RE.test(lead), spa: SPA_RE.test(wish || tail), wish, span: [m.index, m.index + m[0].length + tail.length], keep: wish };
  }
  const l = LESSON_RE.exec(raw);
  if (l && numOf(l[1])) out.lessons = { n: numOf(l[1]) };
  return out.nonSkier ? out : null;
}
// The request as the planner reads it: the non-skier's clause becomes that person's wish as a plain wish of the trip
// ("a spa or another relaxing activity"), so it is looked for and never ruled out. Everything else is as typed.
function planText(text) {
  const raw = String(text || ''), sp = readSplit(raw);
  if (!sp || !sp.nonSkier) return raw;
  const [a, b] = sp.nonSkier.span;
  // Mid-sentence ("…; one adult does not ski and…") the wish starts its own sentence.
  const before = raw.slice(0, a).replace(/[\s,;:–—-]*(?:\b(?:and|but|et|mais))?\s*$/i, ''), keep = sp.nonSkier.keep;
  const head = before && !/[.!?]$/.test(before) ? `${before}.` : before;
  const fr = /\bne (?:skie|skient|fait|font)\b|\bnon[- ]?skieu/i.test(raw.slice(a, b));
  const wish = keep ? `${fr ? 'Nous aimerions aussi' : 'We would also like'} ${keep}` : '';
  const rest = raw.slice(b).replace(/^[\s.;!?]+/, '');
  const out = [head, wish ? `${wish}.` : '', rest].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  // (A request that was only that clause is read as typed.)
  return out || raw;
}

// ---- the words ----
const clock = (m, fr) => { const h = Math.floor(m / 60), mm = m % 60; if (fr) return `${h} h${mm ? ` ${String(mm).padStart(2, '0')}` : ''}`; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`; };
const list = (a, and) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} ${and} ${a[a.length - 1]}` : a[0] || '');
const whoOf = (ns, fr) => (ns.n > 1 ? (fr ? `les ${ns.n} qui ne skient pas` : `the ${ns.n} who aren’t skiing`) : ns.adult ? (fr ? 'l’adulte qui ne skie pas' : 'the adult who isn’t skiing') : (fr ? 'la personne qui ne skie pas' : 'the one who isn’t skiing'));
// (2026-11-24, second live test) A spa is named only when the listing IS one by its stored data (trip-requirements.js
// spaListing: never a lodge, hotel or cat-ski operator whose description mentions a sauna). Naming one says its town,
// how far it is from the plan's stops in a straight line (no travel time), and that the date is not checked; when the
// listing's own words don't say a visit can be booked by itself, that day visits aren't confirmed. Beyond FAR_KM it is
// said to be far and is never the "Add it" of the note. Things listed in the plan's own town that are not skiing are
// named by what they are (a gallery, skating): never called relaxing or suitable.
const FAR_KM = 40;
const T = {
  en: {
    lead: 'This plan is one schedule for everyone.',
    has: 'For {who}: {stops} {is} listed as {what}.{check}',
    what: { spa: 'a spa', sauna: 'a sauna', both: 'a spa or sauna' },
    stop: '{name} (day {day}{at})', stopNoDay: '{name}{at}', at: ', {time}',
    noSpa: 'no spa is listed in {town}.', noSpaNoTown: 'no spa is in this plan.', noSpaAny: 'no spa is listed in {town}, and none nearby.',
    near: 'The nearest listed is {name} in {where}{out}.', far: 'The nearest listed spa is far: {name} in {where}{out}.',
    out: ', outside {town}', km: ' (about {km} in a straight line)',
    inTown: 'For {who}: {name} in {where} is listed as {what} but isn’t in this plan.{check}',
    alts: 'Listed in {town}, not skiing: {alts}.', alt: '{name} ({label})',
    check: ' Check your date with them.', checkDay: ' Day visits and your date aren’t checked here: book directly with them.',
    cant: 'It can’t plan a separate activity at the same time for {who}.',
    chip: 'One schedule for everyone', stopNote: 'For {who}',
    // The chat's answer to "what can the non-skier do?" (nothing changes).
    qHas: '{stops} {is} listed as {what} on your plan, at that time for the whole group.{check}',
    qNoSpa: 'No spa is listed in {town}.', qNoSpaNoTown: 'There’s no spa on your plan.', qNoSpaAny: 'I don’t list a spa near {town}.', qNoSpaAnyNoTown: 'I don’t list a spa near your plan.',
    qInTown: '{name} in {where} is listed as {what} and isn’t on your plan.{check}',
    qNoAlts: 'Name a kind of place (a café, a gallery, a snowshoe trail) and I’ll look.',
    effectAt: 'One schedule for everyone: it would go on day {day} at {time} for the whole group, so the others can’t be shown skiing then.',
    effectAt1: 'One schedule for everyone: it would go at {time} for the whole group, so the others can’t be shown skiing then.',
    effect: 'One schedule for everyone: an added stop takes a day and time for the whole group, so the others can’t be shown skiing then.',
    qTail: 'Your plan is one schedule for everyone, and nothing changed.', qAdd: 'Add it?', qAddName: 'Add {name}?', qAddFar: 'Add it anyway?',
    add: 'Add it', addFar: 'Add it anyway',
    shared: 'It’s on the one shared schedule, for the whole group.',
    guests: 'Hotel guests: {who}.', same0: 'The itinerary is unchanged.',
  },
  fr: {
    lead: 'Ce plan est un seul horaire pour tout le monde.',
    has: 'Pour {who} : {stops} {is} comme {what}.{check}',
    what: { spa: 'spa', sauna: 'sauna', both: 'spa ou sauna' },
    stop: '{name} (jour {day}{at})', stopNoDay: '{name}{at}', at: ', {time}',
    noSpa: 'aucun spa n’est répertorié à {town}.', noSpaNoTown: 'aucun spa dans ce plan.', noSpaAny: 'aucun spa n’est répertorié à {town}, ni à proximité.',
    near: 'Le plus proche répertorié est {name}, à {where}{out}.', far: 'Le spa répertorié le plus proche est loin : {name}, à {where}{out}.',
    out: ', hors de {town}', km: ' (environ {km} à vol d’oiseau)',
    inTown: 'Pour {who} : {name}, à {where}, est répertorié comme {what} mais n’est pas dans ce plan.{check}',
    alts: 'À {town}, sans ski : {alts}.', alt: '{name} ({label})',
    check: ' Vérifiez votre date auprès d’eux.', checkDay: ' Les visites à la journée et votre date ne sont pas vérifiées ici : réservez directement auprès d’eux.',
    cant: 'Il ne peut pas prévoir une activité séparée au même moment pour {who}.',
    chip: 'Un seul horaire pour tous', stopNote: 'Pour {who}',
    qHas: '{stops} {is} comme {what} dans votre plan, à cette heure pour tout le groupe.{check}',
    qNoSpa: 'Aucun spa n’est répertorié à {town}.', qNoSpaNoTown: 'Il n’y a pas de spa dans votre plan.', qNoSpaAny: 'Je ne répertorie aucun spa près de {town}.', qNoSpaAnyNoTown: 'Je ne répertorie aucun spa près de votre plan.',
    qInTown: '{name}, à {where}, est répertorié comme {what} et n’est pas dans votre plan.{check}',
    qNoAlts: 'Nommez un genre d’endroit (un café, une galerie, un sentier de raquette) et je regarde.',
    effectAt: 'Un seul horaire pour tous : cet arrêt irait au jour {day} à {time} pour tout le groupe; les autres ne peuvent donc pas être montrés en train de skier à ce moment.',
    effectAt1: 'Un seul horaire pour tous : cet arrêt irait à {time} pour tout le groupe; les autres ne peuvent donc pas être montrés en train de skier à ce moment.',
    effect: 'Un seul horaire pour tous : tout arrêt ajouté prend un jour et une heure pour tout le groupe; les autres ne peuvent donc pas être montrés en train de skier à ce moment.',
    qTail: 'Votre plan est un seul horaire pour tout le monde, et rien n’a changé.', qAdd: 'L’ajouter?', qAddName: 'Ajouter {name}?', qAddFar: 'L’ajouter quand même?',
    add: 'L’ajouter', addFar: 'L’ajouter quand même',
    shared: 'Il est dans l’horaire commun, pour tout le groupe.',
    guests: 'Clients de l’hôtel : {who}.', same0: 'L’itinéraire est inchangé.',
  },
};
const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o[k] == null ? '' : String(o[k])));
const stopsSaid = (stops, fr) => { const L = T[fr ? 'fr' : 'en']; return list(stops.map((s) => fill(s.day > 0 ? L.stop : L.stopNoDay, { name: s.name, day: s.day, at: Number.isInteger(s.start) ? fill(L.at, { time: clock(s.start, fr) }) : '' })), fr ? 'et' : 'and'); };
const isSaid = (n, fr) => (fr ? (n > 1 ? 'sont répertoriés' : 'est répertorié') : (n > 1 ? 'are' : 'is'));
// "a spa", "a sauna", or both: what the stops' own names and category lines call them.
const whatSaid = (xs, fr) => { const w = new Set(xs.map((x) => (x && x.what === 'sauna' ? 'sauna' : 'spa'))); return T[fr ? 'fr' : 'en'].what[w.size > 1 ? 'both' : [...w][0] || 'spa']; };
// "12 km" / « 12 km »; under 2 km to one decimal (as trip-transport-need.js kmText).
const kmSaid = (km, fr) => { const v = km < 2 ? Math.max(0.1, Math.round(km * 10) / 10) : Math.round(km); return `${fr ? String(v).replace('.', ',') : v} km`; };
const hasKm = (n) => !!n && Number.isFinite(n.km) && n.km >= 0;
const isFar = (n) => hasKm(n) && n.km > FAR_KM;
// ", outside SilverStar (about 62 km in a straight line)": only for a place in another town; the distance when known.
const outSaid = (n, f, fr) => { const L = T[fr ? 'fr' : 'en']; if (!n || f.inTown) return ''; const out = !f.town ? '' : fr ? (/^[aeiouyhéèêâîôû]/i.test(f.town) ? `, hors d’${f.town}` : fill(L.out, { town: f.town })) : fill(L.out, { town: f.town }); return `${out}${hasKm(n) ? fill(L.km, { km: kmSaid(n.km, fr) }) : ''}`; };
const checkSaid = (xs, fr) => { const L = T[fr ? 'fr' : 'en']; return xs.every((x) => x && x.dayVisit) ? L.check : L.checkDay; };
const altsOf = (f) => (f.alts || []).filter((x) => x && x.name && x.id > 0).slice(0, 2);
const altsSaid = (f, fr) => { const L = T[fr ? 'fr' : 'en'], a = altsOf(f); return a.length && f.town ? fill(L.alts, { town: f.town, alts: list(a.map((x) => fill(L.alt, { name: x.name, label: (fr && x.labelFr) || x.label || '' }).replace(/ \(\)$/, '')), fr ? 'et' : 'and') }) : ''; };

// The plan's one note. split: readSplit(); f:
//   spaStops   the plan's stops that are a spa by their own listing: [{ id, name, day, start, what, dayVisit }]
//   nearest    the nearest listed spa when the plan has none: { id, name, region, regionLabel, km, what, dayVisit } | null
//   inTown     that nearest spa is in one of the plan's own towns
//   town       the plan's town(s), as said ("SilverStar")
//   alts       listed in the plan's own towns, not skiing and not in the plan: [{ id, name, label, labelFr }]
// -> { key, n, adult, spa, text, textFr, base, baseFr, chip, chipFr, stopIds, nearest?, stopNote, stopNoteFr } | null
// base is what stands when a stop the note names is taken off the page (the page then shows base alone).
// nearest (the note's "Add it") is there only for a listed spa that is not far.
function note(split, f = {}) {
  const ns = split && split.nonSkier;
  if (!ns) return null;
  const spaStops = (f.spaStops || []).filter((s) => s && s.name);
  const say = (fr) => {
    const L = T[fr ? 'fr' : 'en'], who = whoOf(ns, fr), n = f.nearest && f.nearest.name ? f.nearest : null;
    if (spaStops.length) return `${L.lead} ${fill(L.has, { who, stops: stopsSaid(spaStops, fr), is: isSaid(spaStops.length, fr), what: whatSaid(spaStops, fr), check: checkSaid(spaStops, fr) })}`;
    if (!ns.spa) return `${L.lead} ${fill(L.cant, { who })}`;
    if (n && f.inTown) return `${L.lead} ${fill(L.inTown, { who, name: n.name, where: n.regionLabel, what: whatSaid([n], fr), check: checkSaid([n], fr) })}`;
    const head = fr ? `Pour ${who} : ` : `For ${who}: `, alts = altsSaid(f, fr);
    const spa = n ? fill(isFar(n) ? L.far : L.near, { name: n.name, where: n.regionLabel, out: outSaid(n, f, fr) }) : '';
    // One closing sentence for the places named: the date is never checked; a spa's day visits only by its own words.
    const check = (n && !(isFar(n) && alts) ? checkSaid([n], fr) : n || alts ? L.check : '').trim();
    const none = fill(n ? (f.town ? L.noSpa : L.noSpaNoTown) : (f.town ? L.noSpaAny : L.noSpaNoTown), { town: f.town });
    // Something at the plan's own town comes before a spa that is far; a spa that is near comes first.
    return [L.lead, head + none, ...(n && !isFar(n) ? [spa, alts] : [alts, spa]), check].filter(Boolean).join(' ');
  };
  const base = (fr) => `${T[fr ? 'fr' : 'en'].lead} ${fill(T[fr ? 'fr' : 'en'].cant, { who: whoOf(ns, fr) })}`;
  const offer = !spaStops.length && ns.spa && f.nearest && f.nearest.id > 0 && !isFar(f.nearest) ? { id: f.nearest.id, name: f.nearest.name, region: f.nearest.region || null, regionLabel: f.nearest.regionLabel || null } : null;
  return {
    key: 'party_split', n: ns.n, adult: !!ns.adult, spa: !!ns.spa, ...(split.lessons ? { lessons: split.lessons.n } : {}),
    text: say(false), textFr: say(true), base: base(false), baseFr: base(true), chip: T.en.chip, chipFr: T.fr.chip,
    stopIds: spaStops.map((s) => s.id), ...(offer ? { nearest: offer } : {}),
    stopNote: `${fill(T.en.stopNote, { who: whoOf(ns, false) })}.`, stopNoteFr: `${fill(T.fr.stopNote, { who: whoOf(ns, true) })}.`,
  };
}

// ---- the share link: ps=1a.s (how many do not ski, a = an adult, .s = a spa was wished for). Values only. ----
const SHARE_RE = /^([1-9])([ax])(\.s)?$/;
const toShare = (n) => (n && n.n >= 1 && n.n <= 9 ? `${n.n}${n.adult ? 'a' : 'x'}${n.spa ? '.s' : ''}` : '');
function fromShare(v) { const m = SHARE_RE.exec(String(v || '')); return m ? { nonSkier: { n: Number(m[1]), adult: m[2] === 'a', spa: !!m[3], wish: '', span: [0, 0], keep: '' } } : null; }

// ---- the chat ----
// "What can the adult who does not ski do while the other two are skiing?", "what can the non-skier do", "something
// for the one who doesn't ski", « que peut faire celle qui ne skie pas? ». t: the message, folded by trip-chat.js.
// A question or a wish for ideas about the one who is not skiing: answered, never an edit ("add a spa for the
// non-skier" is an edit and is read by the usual rules).
const CHAT_NOSKI_RE = /\b(?:non[- ]?ski(?:er|ers|ing|eur|euse|eurs)|(?:does not|doesn'?t|doesn t|do not|don'?t|don t|won'?t|won t|will not|can'?t|can t|cannot|isn'?t|isn t|is not|aren'?t|aren t|are not|not) (?:ski|skiing|a skier|skiers|snowboard\w*|go skiing)|ne (?:skie|skient)|ne f(?:ait|ont) pas de ski|while (?:we|they|the (?:others?|other \w+|rest|kids?|skiers)) (?:are |re )?(?:ski|skiing|on the (?:hill|slopes|mountain)|in (?:ski )?lessons?)|pendant que (?:nous|les autres|on) ski\w*)\b/;
const CHAT_ASK_RE = /\bwhat (?:can|could|should|would|is there|else|about|do you (?:have|suggest|recommend))\b|\b(?:anything|something|somewhere|ideas?|options?|suggestions?|activit(?:y|ies)|things? to do|alternatives?)\b[^.]*\bfor\b|\b(?:suggest|recommend)\w*\b|\b(?:is|are) there\b|\bwhere (?:can|could|should)\b|\bque (?:peut|peuvent|pourrait)\b|\bquoi faire\b|\bquelque chose pour\b|\bdes idees\b|\bqu est-ce qu\b|\?\s*$/;
const CHAT_EDIT_RE = /^(?:please |can you |could you |svp )?(?:add|book|swap|replace|remove|change|move|put|include|ajoute[rz]?|remplace[rz]?|retire[rz]?|mets|mettre)\b/;
function chatRead(t) {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  if (!s || !CHAT_NOSKI_RE.test(s) || !CHAT_ASK_RE.test(s) || CHAT_EDIT_RE.test(s)) return null;
  return { value: 'q_split' };
}
// The one place the answer offers to add (one question at most): a listed spa in the plan's own town or not far;
// else the nearest thing listed in town that is not skiing; else a far spa, asked with its distance.
// -> { id, name, kind: 'spa' | 'alt' | 'far' } | null
function chatOffer(f = {}) {
  if ((f.spaStops || []).some((s) => s && s.name)) return null;
  const n = f.nearest && f.nearest.name && f.nearest.id > 0 ? f.nearest : null, alts = altsOf(f);
  if (n && (f.inTown || !isFar(n))) return { id: n.id, name: n.name, kind: 'spa' };
  if (alts.length) return { id: alts[0].id, name: alts[0].name, kind: 'alt' };
  return n ? { id: n.id, name: n.name, kind: 'far' } : null;
}
// The answer. f as note(): { spaStops, nearest, inTown, town, alts }; slot: where the place offered would go if added
// ({ id, day, start, days }, worked out by the same rules as the add itself) or null.
// -> { reply, ask: the one question | '', add: { id, name } | null, label }
// The reply names a spa only from f (a listing that is one), with its town, the straight-line distance, that the date
// is not checked, and what adding a stop does to the one shared schedule: in few words (a phone shows six lines of
// a reply before it scrolls), what can be done first. A spa that is far is said to be far and is not offered when
// something is listed in the plan's own town; alone, it is asked as "Add it anyway?" after its distance.
function chatReply(f = {}, lang = 'en', slot = null) {
  const fr = lang === 'fr', L = T[fr ? 'fr' : 'en'];
  const spaStops = (f.spaStops || []).filter((s) => s && s.name), n = f.nearest && f.nearest.name && f.nearest.id > 0 ? f.nearest : null;
  if (spaStops.length) return { reply: `${fill(L.qHas, { stops: stopsSaid(spaStops, fr), is: isSaid(spaStops.length, fr), what: whatSaid(spaStops, fr), check: checkSaid(spaStops, fr) })} ${L.qTail}`, ask: '', add: null };
  const o = chatOffer(f);
  // A name as it is said a second time: without what follows a dash or a colon ("Brewer's Pond Skating – SilverStar").
  const short = (x) => String(x.name).split(/\s[–—-]\s|:\s/)[0].trim() || x.name;
  const effect = o && slot && slot.id === o.id && Number.isInteger(slot.start) ? fill(slot.days > 1 ? L.effectAt : L.effectAt1, { day: slot.day, time: clock(slot.start, fr) }) : L.effect;
  const add = o ? { id: o.id, name: o.name } : null;
  if (n && f.inTown) return { reply: [fill(L.qInTown, { name: n.name, where: n.regionLabel, what: whatSaid([n], fr), check: '' }), effect, checkSaid([n], fr).trim()].join(' '), ask: L.qAdd, add, label: L.add };
  const none = fill(n ? (f.town ? L.qNoSpa : L.qNoSpaNoTown) : (f.town ? L.qNoSpaAny : L.qNoSpaAnyNoTown), { town: f.town });
  if (!o) return { reply: `${none} ${L.qNoAlts} ${L.qTail}`, ask: '', add: null };
  if (o.kind === 'spa') return { reply: [none, fill(L.near, { name: n.name, where: n.regionLabel, out: outSaid(n, f, fr) }), effect, checkSaid([n], fr).trim()].join(' '), ask: L.qAdd, add, label: L.add };
  // Something listed in the plan's own town comes first (the one offered, by what it is); a far spa is named after
  // it, as far, and is not the offer.
  if (o.kind === 'alt') return { reply: [none, altsSaid({ ...f, alts: altsOf(f).slice(0, 1) }, fr), effect, n ? fill(L.far, { name: n.name, where: n.regionLabel, out: outSaid(n, f, fr) }) : '', L.check.trim()].filter(Boolean).join(' '), ask: n ? fill(L.qAddName, { name: short(o) }) : L.qAdd, add, label: L.add };
  return { reply: [none, fill(L.far, { name: n.name, where: n.regionLabel, out: outSaid(n, f, fr) }), effect, checkSaid([n], fr).trim()].join(' '), ask: L.qAddFar, add, label: L.addFar };
}
// After an add on a trip where someone is not skiing: what to check, and that the stop is in the one shared schedule.
// spa: { dayVisit } when the place added is a listed spa, else null.
function addedLines(spa, lang) { const L = T[lang === 'fr' ? 'fr' : 'en']; return [...(spa ? [(spa.dayVisit ? L.check : L.checkDay).trim()] : []), L.shared]; }
// In a chat message, "one adult doesn't ski" / "two of us won't ski" is about some of the party: never the party's size.
// t: the message folded by trip-chat.js; at: where the count ("one adult") starts.
const CHAT_NEG_AFTER_RE = /^\s+(?:who |that |qui )?(?:does not|doesn'?t|doesn t|do not|don'?t|don t|will not|won'?t|won t|can'?t|can t|cannot|is not|isn'?t|isn t|are not|aren'?t|aren t|never|ne )\b/;
function chatCountIsSubgroup(t, at, len) {
  const s = String(t || '');
  if (CHAT_NEG_AFTER_RE.test(s.slice(at + len))) return true;
  return subgroupSpans(s).some(([a, b]) => at >= a && at < b);
}
// A chat message that speaks of some of the party (and so never of its size): a sub-group phrase, or the one not skiing.
const someOfParty = (t) => { const s = String(t || ''); return subgroupSpans(s).length > 0 || CHAT_NOSKI_RE.test(s) || new RegExp(`\\b(?:one|1|un|une) (?:adult|adulte)${CHAT_NEG_AFTER_RE.source.slice(1)}`).test(s); };
// "2 adults, 1 kid" / « 2 adultes, 1 enfant ».
function partyWords(adults, kids, fr) {
  const p = [];
  if (adults > 0) p.push(fr ? `${adults} adulte${adults > 1 ? 's' : ''}` : `${adults} adult${adults > 1 ? 's' : ''}`);
  if (kids > 0) p.push(fr ? `${kids} enfant${kids > 1 ? 's' : ''}` : `${kids} kid${kids > 1 ? 's' : ''}`);
  return p.join(', ');
}
const guestsReply = (adults, kids, lang, same) => { const fr = lang === 'fr', L = T[fr ? 'fr' : 'en']; return `${fill(L.guests, { who: partyWords(adults, kids, fr) })}${same ? ` ${L.same0}` : ''}`; };

module.exports = { fold, numOf, subgroupSpans, stripSubgroups, hasSubgroup, readSplit, planText, note, whoOf, toShare, fromShare, SHARE_RE, chatRead, chatReply, chatOffer, addedLines, FAR_KM, kmSaid, chatCountIsSubgroup, someOfParty, partyWords, guestsReply, T };
