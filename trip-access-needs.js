'use strict';
// Build My Trip: a wheelchair (or other mobility) need and a dog, read as needs of the trip (2026-11-24).
//
// The owner's report: "Plan a relaxed 2-day trip in Vernon for two adults on January 16–17, 2027. We have a dog, need
// gluten-free food and want easy walks and a dog-friendly hotel. One of us uses a wheelchair." The plan showed "Easy
// walk", "Gluten-free" and "Dog-friendly" and said nothing of the wheelchair; day 2 was one lunch.
//
// This module reads the need from the request, and says what a listing's OWN data says about access and dogs:
//   true   its data says so (the owner's Wheelchair accessible answer; an outdoor place's Access line that says
//          wheelchair, accessible, step-free, limited mobility, paved, flat or boardwalk; a stay's accessible fact)
//   false  its data says it is not (stairs, steep, rough, rocky, "not accessible"; "no dogs")
//   null   its data does not say
// "Easy" is never access: an "easy walk" with no Access line is null. Nothing here is inferred from a description.

// ---- the request ----
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'");
// Words that say a wheelchair or other wheeled / step-free need. "Stroller-friendly" is not one of them.
const WHEEL_RES = [
  /\bwheel ?chairs?\b/, /\bstep[- ]?free\b/, /\b(?:mobility|motori[sz]ed) scooters?\b/, /\bpower ?chairs?\b/,
  /\b(?:uses?|using|with|has|have|on|needs?) (?:a |an |her |his |their |my |our )?(?:walker|rollator|walking frame|crutches)\b/,
  /\b(?:limited|reduced|restricted) mobility\b/, /\bmobility (?:issues?|limitations?|problems?|challenges?|impairments?|aids?|devices?|needs?)\b/,
  /\b(?:fully |barrier[- ]free |mobility[- ])?accessible (?:rooms?|hotels?|motels?|stays?|places?|trails?|walks?|paths?|restaurants?|activit(?:y|ies)|stops?|entrances?|washrooms?|toilets?|venues?|options?|things)\b/,
  /\b(?:must|need(?:s)?(?: to)?|has to|have to|should) be accessible\b/, /\baccessibility\b/, /\bbarrier[- ]free\b/,
  /\bfauteuils? roulants?\b/, /\bmobilite reduite\b/, /\bdeambulateurs?\b/, /\bmarchettes?\b/, /\bsans marches?\b/,
  /\baccessibles? (?:aux|en|pour) (?:fauteuils?|personnes a mobilite)\b/, /\baccessibilite\b/,
];
const WHEEL_NOT_RE = /\b(?:no|not|don'?t|doesn'?t|without|nobody|no one|aucun|pas de|pas besoin|sans)\b[^.;!?]{0,40}$/;
const ONE_RE = /\b(?:one of us|one of (?:my|our|the) \w+|one person|one adult|one guest|one friend|someone|somebody|a friend|a member|my (?:mum|mom|mother|dad|father|wife|husband|partner|spouse|friend|son|daughter|sister|brother|grandma|grandmother|grandpa|grandfather|nan|aunt|uncle|boyfriend|girlfriend|fianc[e]+|in[- ]laws?|kid|child)|our (?:son|daughter|friend|mum|mom|dad|grandma|grandpa|kid|child)|(?:she|he) (?:uses?|is|has)|l'une? de nous|l'une? d'entre nous|une personne|une amie?|un ami|quelqu'un|ma (?:mere|femme|conjointe|fille|soeur|grand-mere|blonde)|mon (?:pere|mari|conjoint|fils|frere|grand-pere|ami|chum))\b/;
const DOG_RE = /\b(?:dogs?|pups?|puppy|puppies|pooch|chiens?|chienne|toutous?)\b(?! ?(?:sled|sleds|sledding|team|teams|mushing))/;
const DOG_NOT_RE = /\b(?:hot|corn|chili|no|not|without|sans|pas de)\s*$/;
// The clause a match sits in (between sentence marks), trimmed, in the visitor's own words.
function clauseAt(text, at) {
  const t = String(text || '');
  let a = at, b = at;
  while (a > 0 && !/[.;!?\n]/.test(t[a - 1])) a--;
  while (b < t.length && !/[.;!?\n]/.test(t[b])) b++;
  return t.slice(a, b).replace(/\s+/g, ' ').trim().slice(0, 140);
}
// -> [{ key: 'wheelchair', who: 'one' | 'all', phrase, surface?: 'paved' }, { key: 'dog', who: 'all', phrase }]
// The need is part of the request's words, so a re-plan from the same request reads it again.
function readNeeds(text) {
  const raw = String(text || ''), t = fold(raw), out = [];
  if (!t.trim()) return out;
  for (const re of WHEEL_RES) {
    const m = re.exec(t);
    if (!m || WHEEL_NOT_RE.test(t.slice(Math.max(0, m.index - 40), m.index))) continue;
    const phrase = clauseAt(raw, m.index), need = { key: 'wheelchair', who: ONE_RE.test(fold(phrase)) ? 'one' : 'all', phrase };
    // "paved paths only", "no gravel", "step-free only": the surface the visitor said they need.
    if (/\b(?:paved|step[- ]?free|hard[- ]surfaced?)\b[^.;!?]{0,30}\bonly\b|\bonly\b[^.;!?]{0,30}\b(?:paved|step[- ]?free)\b|\bno gravel\b|\bpas de gravier\b|\bpave seulement\b/.test(t)) need.surface = 'paved';
    out.push(need);
    break;
  }
  const d = DOG_RE.exec(t);
  if (d && !DOG_NOT_RE.test(t.slice(Math.max(0, d.index - 12), d.index))) out.push({ key: 'dog', who: 'all', phrase: clauseAt(raw, d.index) });
  return out;
}
const hasNeed = (needs, key) => Array.isArray(needs) && needs.some((n) => n && typeof n === 'object' && n.key === key);
const needOf = (needs, key) => (Array.isArray(needs) ? needs.find((n) => n && typeof n === 'object' && n.key === key) : null) || null;

// ---- what a listing's own lines say ----
const ACCESS_YES_RE = /\bwheel ?chairs?(?:[- ](?:accessible|friendly|ok))?\b|\b(?:fully |barrier[- ]free |universally )?accessible\b|\baccessibility\b|\bstep[- ]?free\b|\bbarrier[- ]free\b|\b(?:limited|reduced) mobility\b|\bramps?\b|\belevators?\b/i;
const ACCESS_SURFACE_RE = /\bpaved\b|\bboardwalk\b|\bflat\b|\bminimal[- ]grade\b|\blevel (?:path|trail|ground|loop|walk)\b/i;
const ACCESS_NO_RE = /\bnot (?:fully |wheelchair |stroller )?(?:accessible|suitable|suited)\b|\binaccessible\b|\bno (?:wheelchair|ramp|elevator|lift)s?\b|\bstair(?:s|cases?|ways?)?\b|\bsteps\b|\brugged\b|\bsteep\b|\bstrenuous\b|\brough\b|\brock(?:y|s)\b|\bboulders?\b|\bswitchbacks?\b|\buneven\b|\bscrambl\w+\b|\bladders?\b|\bunmaintained\b|\bbackcountry\b|\bsingletrack\b|\broots\b/i;
const ACCESS_PAVED_RE = /\bpaved\b|\bboardwalk\b|\bwheel ?chairs?[- ]accessible\b|\bstep[- ]?free\b/i;
// true / false / null from one Access (or Accessibility) line of a listing. Its explicit words (wheelchair, accessible,
// step-free, limited mobility) win; a surface word alone (paved, flat, boardwalk) counts unless the line also says
// stairs, steep or rough; "not accessible" is always a no.
// "Accessible" said only of the parking, a washroom, a picnic table or a playground is not access to the place itself.
const ACCESS_FACILITY_RE = /\b(?:\d+ )?(?:wheel ?chair[- ])?accessible (?:parking stalls?|parking|stalls?|toilets?|washrooms?|picnic tables?|playgrounds?|water park)\b|\b(?:universal|accessible) washrooms?\b|\b(?:toilets?|washrooms?) (?:is|are) (?:wheel ?chair[- ])?accessible\b|\b(?:disabled|handicapped) parking\b/ig;
function accessFromText(line) {
  const t = String(line || '').replace(ACCESS_FACILITY_RE, ' ').replace(/\s+/g, ' ').trim();
  if (!t || !/[a-z]{3}/i.test(t)) return null;
  if (/\bnot (?:fully |wheelchair |stroller )?(?:accessible|suitable|suited)\b|\binaccessible\b|\bno (?:wheelchair|ramp|elevator|lift)s?\b|\bnot all\b/i.test(t)) return false;
  // "No stairs" is the listing saying step-free, not a staircase.
  if (/\b(?:no|without) (?:stairs|steps)\b/i.test(t) && !ACCESS_NO_RE.test(t.replace(/\b(?:no|without) (?:stairs|steps)\b/ig, ' '))) return true;
  // "Accessible" said of something else ("an accessible viewpoint") is still the listing's own word; "adaptive bike
  // trail" and "easy" are not.
  if (ACCESS_YES_RE.test(t)) return true;
  if (ACCESS_NO_RE.test(t)) return false;
  // A paved road to a parking lot is not a path.
  if (ACCESS_SURFACE_RE.test(t) && !/\broads?\b/i.test(t)) return true;
  return null;
}
const DOG_NO_RE = /\bno (?:dogs?|pets?|animals)\b(?! (?:on|in|at|near) (?:the )?(?:bike|boardwalk|beach|playground|store|market|cabin|buildings?))|\b(?:dogs?|pets?|animals) (?:are |is )?(?:not (?:permitted|allowed|welcome)|strictly prohibited|prohibited|banned)\b(?! (?:near|in (?:the )?(?:store|market|cabin|buildings?|restrooms?)|at the|on the (?:boardwalk|beach)))/i;
const DOG_YES_RE = /\b(?:dogs?|pets?) (?:are |is )?(?:allowed|welcome|permitted|ok|can |must be (?:on|under|leashed|kept)|on[- ]leash|on a leash|on all)\b|\b(?:leashed|well-behaved) (?:dogs?|pets?)\b|\bdog park\b|\bon[- ]leash\b|\bon a leash\b|\boff[- ]leash\b|\bleash(?:ed)? (?:at all times|required)\b|\b(?:pet|dog)[- ]friendly\b|\bpet beach(?:es)?\b|\bdog (?:runs?|trail|area)\b|^welcome\b/i;
// true / false / null from a listing's Dogs line. A line that says both (a seasonal ban) is null: it depends on the day.
function dogFromText(line) {
  const t = String(line || '').trim();
  if (!t) return null;
  // Clause by clause: "No dogs or other pets allowed" is a no; "On leash; no dogs on the main beach" says both.
  let no = false, yes = false;
  for (const c of t.split(/[;.]/)) {
    if (DOG_NO_RE.test(c) || /\bnot suitable for (?:dogs?|pets?)\b|\bleave your dog at home\b|\b(?:dogs?|pets?)(?: and [a-z-]+)? (?:are )?not permitted\b/i.test(c)) no = true;
    else if (DOG_YES_RE.test(c)) yes = true;
  }
  if (no && yes) return null;
  return no ? false : yes ? true : null;
}
// A listing's access, from its own data only. d: { ownerAccessible (the owner's own Wheelchair accessible answer),
// accessLine (an outdoor place's Access line or a Plan your visit row labelled Accessibility), stayAccessible (stay_info) }
// -> { has: true | false | null, says: the line itself or null, source: 'owner' | 'line' | 'stay' | null, paved? }
function accessOf(d) {
  const x = d || {};
  if (x.stayAccessible === true || x.stayAccessible === false) return { has: x.stayAccessible, says: null, source: 'stay' };
  const line = String(x.accessLine || '').trim(), fromLine = accessFromText(line);
  if (x.ownerAccessible === true && fromLine !== false) return { has: true, says: line || null, source: 'owner', ...(ACCESS_PAVED_RE.test(line) ? { paved: true } : {}) };
  if (fromLine !== null) return { has: fromLine, says: line, source: 'line', ...(fromLine && ACCESS_PAVED_RE.test(line) ? { paved: true } : {}) };
  return { has: null, says: line || null, source: null };
}
// A listing's word on dogs: its Dogs line when it says yes or no, else its Dog-Friendly badge (true), else null.
function dogOf(d) {
  const x = d || {}, line = String(x.dogLine || '').trim(), fromLine = dogFromText(line);
  if (fromLine === false) return { has: false, says: line, source: 'line' };
  if (x.badge === true) return { has: true, says: line || null, source: 'badge' };
  if (fromLine === true) return { has: true, says: line, source: 'line' };
  return { has: null, says: line || null, source: null };
}

// ---- thin days ----
// A day of a multi-day plan that ended up with no stop, or one stop: said, never shown as a finished day.
//   plan.thinDays = [{ day, stops, reason: [codes], text, textFr, next: [{ label, labelFr, message }] }]
// reason codes (each one true of this plan):
//   'no_match'    the planner found no further listing that fits the request for that day (its own warning says so)
//   'last_day'    it is the day they leave, kept light
//   'dog'         every stop must list dogs as welcome
//   'wheelchair'  the plan is for a wheelchair user and the other listed walks don't say if they are accessible
//   'used'        the listings that fit are already in the plan on another day
// ctx.thin(plan, day) -> { kindLabel, kindLabelFr, town, fit, used, accessUnknown, indoor, nearby: { name, town, minutes } }
// (all optional: what the site's listings can add; without it the line says only what the plan itself shows).
const isMeal = (s) => !!(s && s.venue && ['restaurant', 'cafe', 'pub', 'brewery', 'cocktail'].includes(s.venue.type));
function mealWord(s) {
  const l = `${s.label || ''} ${s.daypart || ''}`.toLowerCase();
  if (/breakfast|brunch/.test(l)) return ['breakfast', 'le déjeuner'];
  if (/dinner|supper|evening|night/.test(l)) return ['dinner', 'le souper'];
  return ['lunch', 'le dîner'];
}
function thinDays(plan, ctx = {}) {
  if (!plan || plan.kind !== 'multi_day' || !Array.isArray(plan.days) || plan.days.length < 2) return [];
  const out = [], needs = plan.needs || [], last = plan.days[plan.days.length - 1];
  for (const d of plan.days) {
    const real = (d.stops || []).filter((s) => s && ((s.venue && s.venue.id != null) || s.event));
    if (real.length > 1) continue;
    // A day the visitor asked to keep free is theirs: only a day the planner could not fill is said.
    const warned = (plan.warnings || []).some((w) => new RegExp(`\\b(?:on |for |^Day )day ${d.day}\\b|^Day ${d.day} has no`, 'i').test(String(w)) && /No (?:matching|suitable)|no additional matching/i.test(String(w)));
    const gap = (d.stops || []).some((s) => s && !s.venue && !s.event && !((s.caveats || []).some((c) => /Reserved for/.test(c))));
    if (!warned && !gap && real.length === 1) continue;
    const info = (typeof ctx.thin === 'function' ? ctx.thin(plan, d) : null) || {};
    const reason = [];
    if (warned || gap) reason.push('no_match');
    if (d === last || d.departureDay) reason.push('last_day');
    if (hasNeed(needs, 'dog')) reason.push('dog');
    if (info.fit > 0 && info.used >= info.fit) reason.push('used');
    if (hasNeed(needs, 'wheelchair') && info.accessUnknown > 0) reason.push('wheelchair');
    const only = real[0], town = info.town || d.regionLabel || '';
    const head = !only ? [`Nothing is planned on day ${d.day} yet`, `Rien n’est prévu le jour ${d.day} pour l’instant`]
      : isMeal(only) ? [`Only ${mealWord(only)[0]} is planned on day ${d.day} for now`, `Seul ${mealWord(only)[1]} est prévu le jour ${d.day} pour l’instant`]
        : [`Only one stop is planned on day ${d.day} for now`, `Un seul arrêt est prévu le jour ${d.day} pour l’instant`];
    const kind = info.kindLabel || 'stops', kindFr = info.kindLabelFr || 'arrêts';
    const at = town ? [` in ${town}`, ` à ${town}`] : ['', ''];
    let why;
    if (reason.includes('wheelchair')) why = [`the other listed ${kind}${at[0]} don’t say if they’re wheelchair accessible`, `les autres fiches (${kindFr})${at[1]} ne précisent pas l’accès en fauteuil roulant`];
    else if (reason.includes('used')) why = [`the listed ${kind}${at[0]} that fit your request are already in this plan`, `les fiches (${kindFr})${at[1]} qui conviennent sont déjà dans ce plan`];
    else if (reason.includes('dog') && reason.includes('no_match')) why = [`nothing else listed${at[0]} both fits your request and says dogs are welcome`, `rien d’autre de répertorié${at[1]} ne convient à votre demande tout en indiquant que les chiens sont admis`];
    else if (reason.includes('no_match')) why = [`nothing else listed${at[0]} fit your request that day`, `rien d’autre de répertorié${at[1]} ne convenait à votre demande ce jour-là`];
    else why = ['it is the day you leave', 'c’est le jour du départ'];
    // One-tap next steps the chat can act on, from what the listings say could work (at most two).
    const next = [];
    if (info.nearby && info.nearby.name) next.push({ label: 'Look nearby', labelFr: 'Voir à proximité', message: `Add ${info.kindOne || 'a stop'} in ${info.nearby.town} on day ${d.day}`, detail: `${info.nearby.name}, ${info.nearby.town}${info.nearby.km ? ` (about ${info.nearby.km} km away)` : ''}` });
    if (info.indoor && info.indoor.name) next.push({ label: 'Add an indoor stop', labelFr: 'Ajouter une activité intérieure', message: `Add an indoor stop on day ${d.day}`, detail: info.indoor.name });
    if (next.length < 2) next.push({ label: `Keep day ${d.day} light`, labelFr: `Garder le jour ${d.day} léger`, message: `Keep day ${d.day} light` });
    out.push({ day: d.day, stops: real.length, reason, text: `${head[0]}: ${why[0]}.`, textFr: `${head[1]} : ${why[1]}.`, next: next.slice(0, 2) });
  }
  return out;
}

module.exports = { readNeeds, hasNeed, needOf, accessFromText, dogFromText, accessOf, dogOf, thinDays, ACCESS_PAVED_RE };
