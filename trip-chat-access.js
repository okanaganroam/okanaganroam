'use strict';
// Build My Trip chat: access needs (2026-11-22, Dayton's report on the live site, mobile: a Vernon trip with a dog and
// a wheelchair user; "Please make sure every activity and the hotel are wheelchair accessible, and the dog can come
// with us." changed the hotel and said nothing about the activities or the dog).
//
// This file is the same on okanaganroam.com and whistlerroam.com. It holds:
// 1. read: "make sure every X is <need>" as an `ensure` op with one part per need (which stops, the stay), and the
//    questions about a need ("is day 2 wheelchair accessible?", "can the dog come to lunch?", "which stops are
//    accessible?", "what do I still need to check?", "why is day 2 so empty?") as ask ops. Never an edit for a question.
// 2. check: what the listings' own data says for each stop a part covers: true (it says so), null (it doesn't say),
//    false (it says not). Nothing else is ever claimed.
// 3. The replies: one short clause per part, ending with what still needs checking.
// The rule everywhere: accessible / dogs welcome is said only from a listing's own data; "not accessible" only when
// its own data says so; otherwise "doesn't say".

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, "'");

// feat: the badge key a replacement must have (the chat's swap.features; wheelchair_accessible is the listing's own
// access data, checked by the server). ev / stayEv: the plan.evidence asks. amenity: the stay amenity. planKey: plan.needs.
const NEEDS = {
  accessible: { feat: 'wheelchair_accessible', ev: 'accessible', stayEv: 'stay:accessible', amenity: 'accessible', planKey: 'wheelchair', phrase: 'wheelchair accessible', re: /\b(?:wheel ?chairs?|accessib\w+|step[- ]free|fauteuils? roulants?|mobilite reduite)\b/, textRe: /\b(?:wheel ?chairs?|accessib\w+|step[- ]free|fauteuils? roulants?|mobilite reduite)\b/ },
  dog: { feat: 'dog_friendly', ev: 'dog_friendly', stayEv: 'stay:pets', amenity: 'pets', planKey: 'dog', phrase: 'with our dog', re: /\b(?:dogs?|pup(?:py|pies)?|pets?|chiens?|chiots?|animaux|animal de compagnie)\b/, textRe: /\b(?:dogs?|pup(?:py|pies)?|pets?|chiens?|chiots?)\b/ },
  gluten_free: { feat: 'gluten_free', ev: 'gluten_free', meals: true, phrase: 'gluten-free', re: /\b(?:gluten|celiac|coeliac|coeliaque)\b/, textRe: /\b(?:gluten|celiac|coeliac|coeliaque)\b/ },
  vegan: { feat: 'vegan', ev: 'vegan', meals: true, phrase: 'vegan', re: /\b(?:vegan\w*|vegetalien\w*|veganes?)\b/, textRe: /\b(?:vegan\w*|vegetalien\w*|veganes?)\b/ },
  vegetarian: { feat: 'vegetarian', ev: 'vegetarian', meals: true, phrase: 'vegetarian', re: /\b(?:vegetarian\w*|vegetarien\w*|veggie)\b/, textRe: /\b(?:vegetarian\w*|vegetarien\w*|veggie)\b/ },
  kid_friendly: { feat: 'kid_friendly', ev: 'kid_friendly', phrase: null, re: /\b(?:kid|child|family)[- ]friendly\b|\bgood for (?:the )?kids\b|\badapte(?:e?s)? aux enfants\b/, textRe: /\b(?:kids?|children|enfants?)\b/ },
};
const NEED_KEYS = Object.keys(NEEDS);
const DOG_SLED_RE = /\b(?:dog ?sled\w*|sled dogs?|hot ?dogs?|traineaux? a chiens)\b/;
const needsIn = (t) => NEED_KEYS.filter((k) => NEEDS[k].re.test(k === 'dog' ? t.replace(DOG_SLED_RE, ' ') : t));
// The needs a request text already carries (so a later add or swap honours them, and the text gains each one once).
const needsOfText = (text) => { const t = fold(text).replace(DOG_SLED_RE, ' '); return ['accessible', 'dog'].filter((k) => NEEDS[k].textRe.test(t)); };
const textHas = (text, need) => !!NEEDS[need] && NEEDS[need].textRe.test(fold(text).replace(DOG_SLED_RE, ' '));

const POLITE_RE = /^(?:(?:please|pls|svp|s'il vous plait|s'il te plait|hi|hello|hey|bonjour|ok|okay|and|also|et|aussi)[ ,!.]+)+/;
const CAN_YOU_RE = /^(?:can|could|would|will) you (?:please )?|^(?:peux-tu|pouvez-vous|pourriez-vous|pourrais-tu) /;
const ENSURE_RE = /\b(?:make (?:sure|certain)|ensure|be sure|double[- ]check|check (?:that|if|whether)|verify (?:that|if|whether)?|confirm (?:that|if|whether)|(?:i|we) need|needs? to be|must (?:all )?be|(?:has|have) to be|should (?:all )?be|assure[rz]?-(?:toi|vous)|verifie[rz]? (?:que|si)|fai(?:s|tes) en sorte|il faut que|doi(?:t|vent) (?:tous |toutes )?etre)\b/;
const EVERY_RE = /\b(?:every(?:thing|where)?|all|each|whole|entire|any|tous|toutes|tout|chaque|partout)\b/;
const DOG_COME_RE = /\b(?:dogs?|pup(?:py)?|pets?|chiens?) (?:can|could|is able to|are able to|may|must be able to|peut|peuvent|puisse|puissent) (?:come|join|tag along|go|stay|venir|nous accompagner|nous suivre|rester)\b|\b(?:bring|take|bringing|taking|amener|emmener) (?:the|our|my|notre|le|mon) (?:dog|pup|puppy|pet|chien)\b|\b(?:can|could|may|will) (?:the|our|my) (?:dogs?|pup|puppy|pets?) (?:come|join|go|stay)\b|\b(?:le|notre|mon) chien (?:peut-il|pourra-t-il) (?:venir|nous accompagner|rester)\b/;
const Q_START_RE = /^(?:is|are|was|does|do|did|can (?:the|our|my|we|i)\b|could (?:the|our|we)\b|will (?:the|our)\b|which|what|where|how many|who|est-ce|est-il|sont-ils|y a-t-il|quels?|quelles?|lesquels|lesquelles|combien|le chien peut-il|notre chien peut-il|peut-on|pouvons-nous)\b/;
const SCOPE_RES = {
  activities: /\b(?:activit(?:y|ies|es?)|things to do|attractions?|walks?|trails?|hikes?|outings?|sights?|sorties?|promenades?|sentiers?|randonnees?)\b/,
  meals: /\b(?:restaurants?|meals?|lunch(?:es)?|dinners?|suppers?|food|places to eat|eat|eating|repas|restos?|soupers?|diners?|dejeuners?|manger)\b/,
  stay: /\b(?:hotels?|motels?|stay|place to stay|accommodations?|lodging|rooms?|inn|resort|hebergement|logement|chambres?)\b/,
  all: /\b(?:stops?|places?|everything|everywhere|whole (?:trip|plan|itinerary)|entire (?:trip|plan|itinerary)|the plan|the trip|the itinerary|my plan|our plan|arrets?|endroits?|lieux?|tout le (?:voyage|plan|sejour|itineraire)|partout|l'itineraire|le plan)\b/,
};
const STOP_SCOPES = ['activities', 'meals'];
// The scopes a clause names: -> ['activities' | 'meals' | 'stay'] (empty when it names none).
function scopesIn(t) {
  const out = [];
  if (SCOPE_RES.all.test(t)) out.push(...STOP_SCOPES);
  for (const k of ['activities', 'meals', 'stay']) if (SCOPE_RES[k].test(t) && !out.includes(k)) out.push(k);
  return out;
}
const dayIn = (t) => { const m = /\b(?:day|jour)\s*(\d)\b/.exec(t); return m ? Number(m[1]) : null; };
const mealIn = (t) => (/\b(?:dinner|supper|souper)\b/.test(t) ? 'dinner' : /\b(?:lunch|dejeuner|diner)\b/.test(t) ? 'lunch' : null);

// "… every activity and the hotel are wheelchair accessible, and the dog can come with us": one part per need, each
// with the scopes its own clause names. A diet is about the meal stops; a dog with no scope named comes everywhere.
function partsOf(t) {
  const clauses = t.split(/\s*[,;.!?]+\s*|\s+(?:and|et)\s+(?=(?:that |que )?(?:the|our|my|notre|le|mon) (?:dog|pup|puppy|pet|chien)\b)/).map((c) => c.trim()).filter(Boolean);
  const whole = scopesIn(t);
  const parts = [];
  for (const need of needsIn(t)) {
    const N = NEEDS[need];
    let scopes = [];
    for (const c of clauses) if (needsIn(c).includes(need)) for (const s of scopesIn(c)) if (!scopes.includes(s)) scopes.push(s);
    if (N.meals) scopes = ['meals'];
    else if (!scopes.length) scopes = need === 'dog' ? ['activities', 'meals', 'stay'] : whole.length ? whole : ['activities', 'meals'];
    if (need === 'kid_friendly') scopes = scopes.filter((s) => s !== 'stay');
    if (scopes.length) parts.push({ need, scopes });
  }
  return parts;
}

const CHECK_Q_RE = /\bwhat (?:else )?(?:do|should|must|would) (?:i|we) (?:still |also )?(?:need|have) to (?:check|confirm|verify|call|ask)\b|\bwhat(?:'s| is| are)? (?:still |left )?(?:left )?to (?:check|confirm|verify)\b|\bwhat (?:still |else )?needs? (?:to be )?(?:check\w*|confirm\w*|verif\w*)\b|\b(?:is there )?anything (?:else )?(?:i|we) (?:should|need to|have to|must) (?:still )?(?:check|confirm|verify)\b|\bwhat should (?:i|we) (?:double[- ])?check\b|\bque (?:dois-je|devons-nous|faut-il|doit-on) (?:encore )?(?:verifier|confirmer)\b|\bqu'est-ce (?:qu'il (?:me |nous )?reste|que je dois|qu'on doit|que nous devons) (?:encore )?a? ?(?:verifier|confirmer)\b|\bquoi (?:d'autre )?(?:verifier|confirmer)\b|\bque reste-t-il a (?:verifier|confirmer)\b/;
const THIN_Q_RE = /\b(?:why|how come|pourquoi)\b.*\b(?:empty|quiet|light|bare|thin|sparse|so little|so few|few stops|not much|nothing|only (?:one|1|two|2) (?:stops?|things?|activit\w+)|vide|si peu|peu d'arrets|rien|presque rien|seulement (?:un|une|deux) (?:arrets?|activites?))\b/;

// -> { ops, cant: null, exact: true, access: true, explain? } or null. h: { op, stopsNamed }.
function read(message, stops, h) {
  const t0 = fold(message).replace(/\s+/g, ' ').trim();
  if (!t0 || t0.length > 400) return null;
  const t1 = t0.replace(POLITE_RE, '');
  const t = t1.replace(CAN_YOU_RE, '');
  const op = h.op;
  const isQ = (Q_START_RE.test(t1) || /\?\s*$/.test(t0)) && !CAN_YOU_RE.test(t1);
  const ask = (value, extra = {}) => ({ ops: [op('ask', { value, ...extra })], cant: null, exact: true, access: true, explain: true });
  if (CHECK_Q_RE.test(t)) return ask('q_check');
  // The itinerary's buttons under a light day (plan.thinDays[].next[].message): "Keep day 2 light" changes nothing;
  // "Add an easy walk in Oliver on day 2" is an ordinary add on that day (never a new base town for the whole trip).
  const keep = /^(?:keep|leave|garde[rz]?|laisse[rz]?) (?:day|le jour) (\d) (?:light|as it is|leger|tel quel)$/.exec(t.replace(/[.!]+$/, ''));
  if (keep) return ask('q_thin', { day: Number(keep[1]), keep: true });
  const near = /^(?:add|ajoute[rz]?) (?:an? |une? |some |the )?(.+?) (?:in|near|a|pres de) ([a-z' .-]+?) (?:on day|au jour|le jour) (\d)$/.exec(t.replace(/[.!]+$/, ''));
  if (near && typeof h.kindsNamed === 'function' && !/\b(?:dinner|lunch|supper|souper|diner|dejeuner|hotel|stay|night|nuit)\b/.test(near[1])) {
    const kind = h.kindsNamed(near[1])[0] || (/\b(?:walks?|trails?|parks?|hikes?|strolls?|promenades?|sentiers?|parcs?)\b/.test(near[1]) ? 'outdoor' : /\b(?:indoor|inside|interieur)\b/.test(near[1]) ? 'indoor' : /\b(?:stops?|things?|activit\w+|arrets?)\b/.test(near[1]) ? 'activity' : null);
    if (kind) return { ops: [op('add', { kind, day: Number(near[3]) })], cant: null, exact: true, access: true };
  }
  if (THIN_Q_RE.test(t) && (dayIn(t) || /\b(?:days?|jours?|journees?|plan|trip|itinerary|morning|afternoon|evening|matin|apres-midi|soir)\b/.test(t))) return ask('q_thin', { day: dayIn(t) });
  const needs = needsIn(t).filter((k) => !NEEDS[k].meals);
  const byName = () => { try { const n = h.stopsNamed(t, stops || []); return n.byName || []; } catch (e) { return []; } };
  if (isQ) {
    // A question about a need across the plan, a day, a meal or the stay. One stop named by its name, a diet and
    // "something for the kids" keep their own answers.
    const acc = needs.filter((k) => k === 'accessible' || k === 'dog');
    if (!acc.length || byName().length) return null;
    // One stop named as a kind ("the second winery", "the brewery") keeps its own answer; a meal, a day, "which" and
    // "every" are about the plan.
    if (!mealIn(t) && !dayIn(t) && !EVERY_RE.test(t) && !/\b(?:which|quels?|quelles?|lesquels|lesquelles)\b/.test(t) && !scopesIn(t).length) { let nm = []; try { nm = h.stopsNamed(t, stops || []); } catch (e) { nm = []; } if (nm.length) return null; }
    if (/^(?:why|how come|pourquoi)\b/.test(t)) return null;
    const scopes = scopesIn(t), day = dayIn(t), meal = mealIn(t);
    if (acc.length === 1 && acc[0] === 'dog' && !DOG_COME_RE.test(t) && !/\b(?:dog|pet)[- ]friendly\b|\b(?:allow\w*|welcome|accept\w*|ok|okay|admis|acceptes?|bienvenus?)\b/.test(t)) return null;
    return ask('q_access', { needs: acc, scopes: scopes.length ? scopes : meal ? ['meals'] : day ? STOP_SCOPES : ['activities', 'meals', 'stay'], day, meal, which: /\b(?:which|what|quels?|quelles?|lesquels|lesquelles)\b/.test(t) });
  }
  // "make sure every …": a need, and either "every / all / the whole", the stay, or the dog coming along.
  if (!ENSURE_RE.test(t)) return null;
  const all = needsIn(t);
  if (!all.length) return null;
  if (!(EVERY_RE.test(t) || DOG_COME_RE.test(t) || SCOPE_RES.stay.test(t) || SCOPE_RES.all.test(t))) return null;
  if (byName().length) return null;
  const parts = partsOf(t);
  if (!parts.length) return null;
  return { ops: [op('ensure', { parts, day: dayIn(t) })], cant: null, exact: true, access: true };
}

// ---------- The check ----------
const isMeal = (s) => !!s && (!!s.role || s.type === 'restaurant' || ((s.type === 'cafe' || s.type === 'pub') && /-(?:midday|evening)$/.test(String(s.key || ''))));
const inScope = (s, scopes) => (isMeal(s) ? scopes.includes('meals') : scopes.includes('activities'));
// has(need, stop) -> true | null | false. -> [{ need, scopes, list: [{ stop, has }], ok, unk, no }]
function check(parts, stops, has, { day = null, meal = null } = {}) {
  return (parts || []).map((p) => {
    const list = (stops || []).filter((s) => inScope(s, p.scopes) && (!day || s.day === day) && (!meal || s.role === meal)).map((s) => { const v = has(p.need, s); return { stop: s, has: v === true ? true : v === false ? false : null }; });
    return { need: p.need, scopes: p.scopes, list, ok: list.filter((x) => x.has === true).map((x) => x.stop), unk: list.filter((x) => x.has === null).map((x) => x.stop), no: list.filter((x) => x.has === false).map((x) => x.stop) };
  });
}
// The plan's own evidence for a need, when the planner gives it for exactly these stops: id -> true | null | false.
function evidenceMap(planEvidence, ask, stops) {
  const e = (planEvidence || []).find((x) => x && x.ask === ask && Array.isArray(x.stops) && /^(?:verified|partial|unknown|unmet)$/.test(String(x.status)));
  if (!e) return null;
  const m = new Map();
  for (const s of e.stops) if (s && Number.isInteger(s.id)) m.set(s.id, s.has === true ? true : s.has === false ? false : null);
  // Evidence built for another set of stops (one was swapped since) is not used.
  for (const id of m.keys()) if (!(stops || []).some((s) => s.id === id)) return null;
  return m;
}

// ---------- The replies ----------
const TX = {
  en: {
    and: ' and ', more: '{n} more', head: { accessible: 'Wheelchair access', dog: 'Dog', gluten_free: 'Gluten-free', vegan: 'Vegan', vegetarian: 'Vegetarian', kid_friendly: 'Kids' },
    lists1: { accessible: 'lists wheelchair access', dog: 'lists dogs welcome', gluten_free: 'lists gluten-free options', vegan: 'lists vegan options', vegetarian: 'lists vegetarian options', kid_friendly: 'is listed as kid-friendly' },
    listsN: { accessible: 'list wheelchair access', dog: 'list dogs welcome', gluten_free: 'list gluten-free options', vegan: 'list vegan options', vegetarian: 'list vegetarian options', kid_friendly: 'are listed as kid-friendly' },
    whose: { accessible: 'whose listing says wheelchair access', dog: 'whose listing says dogs are welcome', gluten_free: 'whose listing has gluten-free options', vegan: 'whose listing has vegan options', vegetarian: 'whose listing has vegetarian options', kid_friendly: 'whose listing is kid-friendly' },
    say: { accessible: 'if they’re wheelchair accessible', dog: 'if dogs are welcome', gluten_free: 'if they have gluten-free options', vegan: 'if they have vegan options', vegetarian: 'if they have vegetarian options', kid_friendly: 'if they’re kid-friendly' },
    say1: { accessible: 'if it’s wheelchair accessible', dog: 'if dogs are welcome', gluten_free: 'if it has gluten-free options', vegan: 'if it has vegan options', vegetarian: 'if it has vegetarian options', kid_friendly: 'if it’s kid-friendly' },
    at: { accessible: 'wheelchair access at {names}', dog: 'dogs at {names}', gluten_free: 'gluten-free options at {names}', vegan: 'vegan options at {names}', vegetarian: 'vegetarian options at {names}', kid_friendly: 'whether {names} suit kids' },
    notSays: { accessible: 'says it isn’t wheelchair accessible', dog: 'says no dogs', gluten_free: 'says no gluten-free options', vegan: 'says no vegan options', vegetarian: 'says no vegetarian options', kid_friendly: 'says it isn’t for kids' },
    noun: { activities: ['activity', 'activities'], meals: ['meal stop', 'meal stops'], stops: ['stop', 'stops'] },
    noted: { accessible: 'wheelchair access', dog: 'dogs welcome', gluten_free: 'gluten-free options', vegan: 'vegan options', vegetarian: 'vegetarian options', kid_friendly: 'that it suits kids' }, both: 'both {noun}', stayIs: '{name}’s listing {has}', stayNoQ: '{name}’s listing doesn’t say {miss}',
    allN: 'all {n} {noun}', none: 'none of the {n} {noun} {says} {say}', none1: '{name} doesn’t say {say}', dont: ' don’t say', doesnt: ' doesn’t say', others: 'the other {n} {dont}', nothing: 'there’s no {noun} on the plan to check',
    swapped: 'I swapped {old} for {fresh}, {whose}', noSwap: 'I found no listed replacement for {names}', says: ['says', 'say'],
    hotel: 'Hotel', stayNow: 'now {name}; its listing {has}', stayKeeps: '{name} stays; its listing {has}', stayNo: '{name}’s listing doesn’t say {miss}, and I found no place nearby whose listing does', stayNone: 'there’s no place to stay on this plan',
    stayHas: { accessible: 'has accessible rooms', pets: 'allows pets', petsSome: 'allows pets in some rooms' }, stayMiss: { accessible: 'if it has accessible rooms', pets: 'if pets are allowed' }, stayNot: { accessible: 'says it has no accessible rooms', pets: 'says no pets' }, butNot: ' but doesn’t say {miss}',
    stayAt: { accessible: 'accessible rooms at {name}', pets: 'pets at {name}' },
    still: 'Still to check: {list}.', call: ' Call ahead.', nothingLeft: 'Nothing else to check from the listings.', details: ' Details has the full list.', count: '{n} stops',
    ask: '{n} stops don’t say {say}: {names}. Swap them for places {whose}, where I can find them? Go ahead?',
    qNone: 'Your request doesn’t mention a need I check on listings, such as a wheelchair or a dog.', qDay: 'Day {d}: ',
    sessions: 'session times at {names}', handoff: '{note}', handoffOwn: 'your dates and guests on the booking site ({label} doesn’t take them from here)', dates: 'your stay dates (not confirmed yet)',
    noneFound: 'I found no replacement whose listing does, so nothing changed.', thinKeep: 'OK, day {d} stays as it is. Nothing changed.',
    thinNone: 'No day on this plan is marked as light.', thinUnknown: 'Day {d} has {n} {noun}. I don’t know more than that; say “add something on day {d}” and I’ll look.', thinFull: 'Day {d} has {n} stops, so it isn’t marked as light.',
    needKept: 'Its listing notes {what}.', needUnknown: 'Its listing doesn’t say {say}, so call ahead.', needSwapped: 'I picked {fresh} instead of {old} because its listing {lists}.',
  },
  fr: {
    and: ' et ', more: '{n} de plus', head: { accessible: 'Accès en fauteuil roulant', dog: 'Chien', gluten_free: 'Sans gluten', vegan: 'Végane', vegetarian: 'Végétarien', kid_friendly: 'Enfants' },
    lists1: { accessible: 'indique un accès en fauteuil roulant', dog: 'indique que les chiens sont admis', gluten_free: 'indique des options sans gluten', vegan: 'indique des options véganes', vegetarian: 'indique des options végétariennes', kid_friendly: 'est indiqué comme adapté aux enfants' },
    listsN: { accessible: 'indiquent un accès en fauteuil roulant', dog: 'indiquent que les chiens sont admis', gluten_free: 'indiquent des options sans gluten', vegan: 'indiquent des options véganes', vegetarian: 'indiquent des options végétariennes', kid_friendly: 'sont indiqués comme adaptés aux enfants' },
    whose: { accessible: 'dont la fiche indique un accès en fauteuil roulant', dog: 'dont la fiche indique que les chiens sont admis', gluten_free: 'dont la fiche a des options sans gluten', vegan: 'dont la fiche a des options véganes', vegetarian: 'dont la fiche a des options végétariennes', kid_friendly: 'dont la fiche convient aux enfants' },
    say: { accessible: 's’ils sont accessibles en fauteuil roulant', dog: 'si les chiens sont admis', gluten_free: 's’ils ont des options sans gluten', vegan: 's’ils ont des options véganes', vegetarian: 's’ils ont des options végétariennes', kid_friendly: 's’ils conviennent aux enfants' },
    say1: { accessible: 's’il est accessible en fauteuil roulant', dog: 'si les chiens sont admis', gluten_free: 's’il a des options sans gluten', vegan: 's’il a des options véganes', vegetarian: 's’il a des options végétariennes', kid_friendly: 's’il convient aux enfants' },
    at: { accessible: 'l’accès en fauteuil roulant à {names}', dog: 'les chiens à {names}', gluten_free: 'les options sans gluten à {names}', vegan: 'les options véganes à {names}', vegetarian: 'les options végétariennes à {names}', kid_friendly: 'si {names} conviennent aux enfants' },
    notSays: { accessible: 'indique qu’il n’est pas accessible en fauteuil roulant', dog: 'indique que les chiens ne sont pas admis', gluten_free: 'indique qu’il n’y a pas d’options sans gluten', vegan: 'indique qu’il n’y a pas d’options véganes', vegetarian: 'indique qu’il n’y a pas d’options végétariennes', kid_friendly: 'indique que ce n’est pas pour les enfants' },
    noun: { activities: ['activité', 'activités'], meals: ['arrêt repas', 'arrêts repas'], stops: ['arrêt', 'arrêts'] },
    noted: { accessible: 'un accès en fauteuil roulant', dog: 'que les chiens sont admis', gluten_free: 'des options sans gluten', vegan: 'des options véganes', vegetarian: 'des options végétariennes', kid_friendly: 'qu’il convient aux enfants' }, both: 'les deux {noun}', stayIs: 'la fiche de {name} {has}', stayNoQ: 'la fiche de {name} ne dit pas {miss}',
    allN: 'les {n} {noun}', none: 'aucune fiche des {n} {noun} ne dit {say}', none1: 'la fiche de {name} ne dit pas {say}', dont: ' ne le disent pas', doesnt: ' ne le dit pas', others: 'les {n} autres {dont}', nothing: 'il n’y a pas d’{noun} à vérifier dans le plan',
    swapped: 'j’ai remplacé {old} par {fresh}, {whose}', noSwap: 'je n’ai trouvé aucun remplacement indiqué pour {names}', says: ['dit', 'disent'],
    hotel: 'Hôtel', stayNow: 'maintenant {name}; sa fiche {has}', stayKeeps: '{name} reste; sa fiche {has}', stayNo: 'la fiche de {name} ne dit pas {miss}, et je n’ai trouvé aucun logement proche dont la fiche le dit', stayNone: 'il n’y a pas de logement dans ce plan',
    stayHas: { accessible: 'indique des chambres accessibles', pets: 'accepte les animaux', petsSome: 'accepte les animaux dans certaines chambres' }, stayMiss: { accessible: 's’il a des chambres accessibles', pets: 'si les animaux sont acceptés' }, stayNot: { accessible: 'indique qu’il n’a pas de chambres accessibles', pets: 'indique que les animaux ne sont pas acceptés' }, butNot: ' mais ne dit pas {miss}',
    stayAt: { accessible: 'les chambres accessibles à {name}', pets: 'les animaux à {name}' },
    still: 'À vérifier : {list}.', call: ' Appelez avant d’y aller.', nothingLeft: 'Rien d’autre à vérifier d’après les fiches.', details: ' La liste complète est dans Détails.', count: '{n} arrêts',
    ask: 'Les fiches de {n} arrêts ne disent pas {say} : {names}. Je les remplace par des endroits {whose}, là où j’en trouve? J’y vais?',
    qNone: 'Votre demande ne mentionne pas de besoin que je vérifie sur les fiches, comme un fauteuil roulant ou un chien.', qDay: 'Jour {d} : ',
    sessions: 'les heures des séances à {names}', handoff: '{note}', handoffOwn: 'vos dates et le nombre de personnes sur le site de réservation ({label} ne les reçoit pas d’ici)', dates: 'les dates de votre séjour (pas encore confirmées)',
    noneFound: 'Je n’ai trouvé aucun remplacement dont la fiche le dit; rien n’a changé.', thinKeep: 'D’accord, le jour {d} reste tel quel. Rien n’a changé.',
    thinNone: 'Aucun jour de ce plan n’est marqué comme léger.', thinUnknown: 'Le jour {d} a {n} {noun}. Je n’en sais pas plus; dites « ajoute quelque chose au jour {d} » et je regarde.', thinFull: 'Le jour {d} a {n} arrêts; il n’est donc pas marqué comme léger.',
    needKept: 'Sa fiche indique {what}.', needUnknown: 'Sa fiche ne dit pas {say}; appelez avant d’y aller.', needSwapped: 'J’ai choisi {fresh} plutôt que {old} parce que sa fiche {lists}.',
  },
};
const fillT = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
function joinNames(a, t, max = 3) {
  const out = a.slice(0, max);
  if (a.length > max) out.push(fillT(t.more, { n: a.length - max }));
  return out.length <= 1 ? (out[0] || '') : `${out.slice(0, -1).join(', ')}${t.and}${out[out.length - 1]}`;
}
const scopeNoun = (scopes, n, t) => { const k = scopes.includes('activities') && scopes.includes('meals') ? 'stops' : scopes.includes('meals') ? 'meals' : 'activities'; return t.noun[k][n === 1 ? 0 : 1]; };

// One clause for a need: who is verified, what was swapped, who doesn't say. c: a check() entry after the swaps
// (c.swaps: [{ old, fresh }], c.kept: stops with no replacement found).
function needClause(c, lang) {
  const t = TX[lang === 'fr' ? 'fr' : 'en'];
  const n = c.list.length, bits = [];
  const swapped = (c.swaps || []).map((x) => x.fresh.id);
  const ok = c.ok.filter((s) => !swapped.includes(s.id));
  if (!n && !(c.swaps || []).length) return `${t.head[c.need]}${lang === 'fr' ? ' : ' : ': '}${fillT(t.nothing, { noun: scopeNoun(c.scopes, 1, t) })}.`;
  if (ok.length && ok.length === n) bits.push(`${n === 1 ? ok[0].name : fillT(n === 2 ? t.both : t.allN, { n, noun: scopeNoun(c.scopes, n, t) })} ${n === 1 ? t.lists1[c.need] : t.listsN[c.need]}`);
  else if (ok.length) bits.push(`${joinNames(ok.map((s) => s.name), t)} ${ok.length === 1 ? t.lists1[c.need] : t.listsN[c.need]}`);
  for (const x of c.swaps || []) bits.push(fillT(t.swapped, { old: x.old.name, fresh: x.fresh.name, whose: t.whose[c.need] }));
  for (const s of c.no) bits.push(`${s.name} ${t.notSays[c.need]}`);
  if (c.unk.length) {
    if (!ok.length && !(c.swaps || []).length && !c.no.length) bits.push(c.unk.length === 1 ? fillT(t.none1, { name: c.unk[0].name, say: t.say1[c.need] }) : fillT(t.none, { n: c.unk.length, noun: scopeNoun(c.scopes, c.unk.length, t), says: t.says[1], say: t.say[c.need] }));
    else bits.push(`${joinNames(c.unk.map((s) => s.name), t)}${c.unk.length === 1 ? t.doesnt : t.dont}`);
  }
  return `${t.head[c.need]}${lang === 'fr' ? ' : ' : ': '}${bits.join('; ')}.`;
}
// stay: { name, changed, has: { accessible: true|null|false, pets: 'yes'|'some'|null|false }, asked: [amenity] } | null.
function stayClause(stay, lang, answer = false) {
  const t = TX[lang === 'fr' ? 'fr' : 'en'];
  const sep = lang === 'fr' ? ' : ' : ': ';
  if (!stay) return `${t.hotel}${sep}${t.stayNone}.`;
  const yes = [], miss = [], not = [];
  for (const k of stay.asked) {
    const v = stay.has[k];
    if (v === true || v === 'yes') yes.push(t.stayHas[k]); else if (v === 'some') yes.push(t.stayHas.petsSome); else if (v === false) not.push(t.stayNot[k]); else miss.push(t.stayMiss[k]);
  }
  const join = (a) => (a.length <= 1 ? (a[0] || '') : `${a.slice(0, -1).join(', ')}${t.and}${a[a.length - 1]}`);
  if (!yes.length && !not.length) return `${t.hotel}${sep}${fillT(answer ? t.stayNoQ : t.stayNo, { name: stay.name, miss: join(miss) })}.`;
  const has = join([...yes, ...not]) + (miss.length ? fillT(t.butNot, { miss: join(miss) }) : '');
  return `${t.hotel}${sep}${fillT(answer ? t.stayIs : stay.changed ? t.stayNow : t.stayKeeps, { name: stay.name, has })}.`;
}
// What still needs checking, in one sentence: the unknowns of each need (names, or a count with a pointer to Details
// when there are many), the stay's unknowns, and any extra items (session times, the stay hand-off).
function stillLine(checks, stay, lang, extra = []) {
  const t = TX[lang === 'fr' ? 'fr' : 'en'];
  const items = [];
  let long = false;
  for (const c of checks || []) {
    const u = [...c.unk, ...c.no];
    if (!u.length) continue;
    if (u.length > 3) long = true;
    items.push(fillT(t.at[c.need], { names: u.length > 3 ? fillT(t.count, { n: u.length }) : joinNames(u.map((s) => s.name), t) }));
  }
  if (stay) for (const k of stay.asked) { const v = stay.has[k]; if (!(v === true || v === 'yes' || v === 'some')) items.push(fillT(t.stayAt[k], { name: stay.name })); }
  for (const x of extra) if (x) items.push(x);
  if (!items.length) return t.nothingLeft;
  return `${fillT(t.still, { list: items.join('; ') })}${long ? t.details : (checks || []).some((c) => c.unk.length || c.no.length) || (stay && items.length) ? t.call : ''}`;
}
// The whole reply to "make sure …": the stay, one clause per need, what is left. At most four sentences: with more
// parts than that, the needs' clauses give way to the "still to check" line (which names or counts every unknown).
function ensureReply({ stay, stayAsked, checks, lang, extra = [] }) {
  const parts = [];
  if (stayAsked) parts.push(stayClause(stay, lang));
  const clauses = (checks || []).map((c) => needClause(c, lang));
  const room = 3 - parts.length;
  parts.push(...(clauses.length <= room ? clauses : clauses.filter((x, i) => (checks[i].swaps || []).length || checks[i].ok.length).slice(0, room)));
  parts.push(stillLine(checks, stayAsked ? stay : null, lang, extra));
  return parts.join(' ');
}
// "3 stops don't say if they're wheelchair accessible: A, B and C. Swap them for places whose listings do, where I can
// find them? Go ahead?" stops: the ones that would change. needs: the needs they miss.
function askReply(stops, needs, lang) {
  const t = TX[lang === 'fr' ? 'fr' : 'en'];
  const j = lang === 'fr' ? ' ni ' : ' or ';
  return fillT(t.ask, { n: stops.length, say: needs.map((k) => t.say[k]).join(j), names: joinNames(stops.map((s) => s.name), t, 4), whose: needs.map((k) => t.whose[k]).join(t.and) });
}
// A question: the same clauses, never an edit. checks: check() entries; stay: as above or undefined (not asked).
function answerReply({ checks, stay, stayAsked, day, lang }) {
  const t = TX[lang === 'fr' ? 'fr' : 'en'];
  const parts = [];
  if (stayAsked) parts.push(stayClause(stay, lang, true));
  for (const c of (checks || []).slice(0, 3 - parts.length)) parts.push(needClause(c, lang));
  const out = parts.join(' ');
  return day ? fillT(t.qDay, { d: day }) + out : out;
}

module.exports = { NEEDS, NEED_KEYS, read, partsOf, needsIn, needsOfText, textHas, check, evidenceMap, isMeal, inScope, needClause, stayClause, stillLine, ensureReply, askReply, answerReply, joinNames, fillT, cap, TX, fold };
