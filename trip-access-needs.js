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
// ---- graded access (2026-11-23) ----
// The owner's report: the chat said "all 3 activities list wheelchair access" when BX Creek's line only said its
// Deleenheer Rd access "suits limited mobility". A line is graded from its own words, never upgraded:
//   'wheelchair'       it says wheelchair (or accessible in the formal sense, barrier-free, universally accessible) of
//                      the place itself: no subject, or the place's own unnamed trail / path / pathway
//   'wheelchair_part'  the same words, but of a named section, entrance, loop, building or feature -> part
//   'mobility'         broader or incomplete words that are not a wheelchair statement (suits limited mobility, flat,
//                      paved, level, gentle, easy grade, stroller friendly, boardwalk, no stairs), and accessible said
//                      only of parking, washrooms or picnic tables (amenity: true), and "designed for accessibility" on
//                      gravel with no wheelchair word. Never counted as wheelchair-confirmed. part: the named entrance
//                      or section when the line names one
//   'no'               stairs, steep, rough, "not accessible"
//   'unknown'          nothing said ("easy" alone says nothing)
// When in doubt a line is 'mobility', not 'wheelchair'.
const WHEEL_WORD_RE = /\bwheel ?chairs?\b|\bbarrier[- ]free\b|\buniversally accessible\b|\baccessib(?:le|ility)\b|\bstep[- ]?free\b/i;
const WHEEL_ONLY_RE = /\bwheel ?chairs?\b|\bbarrier[- ]free\b|\buniversally accessible\b/i;
const AMENITY_RE = /^(?:(?:\d+|one|two|a|an|the) )?(?:flush |universal |accessible |disabled |handicapped )*(?:parking(?: stalls?| spots?| area)?|stalls?|toilets?|washrooms?|picnic tables?|facilities)\b/i;
const MOBILITY_RE = /\b(?:limited|reduced) mobility\b|\buniversal mobility\b|\bpaved\b|\bboardwalk\b|\bflat\b|\bminimal[- ]grade\b|\blevel (?:path|trail|ground|loop|walk|paved)\b|\bgentle\b|\beasy grade\b|\blittle elevation change\b|\bminimal elevation change\b|\bstrollers?[- ](?:friendly|accessible|ok)\b|\bstroller\b(?=[^;]*\b(?:friendly|ok)\b)|\bpopular with strollers\b|\bhard[- ]surface\b|\b(?:disabled|handicapped) parking\b|\b(?:no|without) (?:stairs|steps)\b|\bramps?\b|\bsit ski(?:ing)?\b|\bdesigned for accessibility\b|\baccessibility certified\b/i;
const GRAVEL_RE = /\bgravel\b|\bunpaved\b|\baggregate\b|\bcrushed[- ]stone\b|\bdirt\b/i;
const GENERIC_SUBJECT_RE = /^(?:(?:about |over )?\d+(?:\.\d+)? ?k?m |(?:easy|flat|paved|wide|short|level|lit|gravel|and|,|\s)+)*(?:trails?|paths?|pathways?|loop|route|walk)(?:,? (?:and )?(?:washrooms?|toilets?|picnic shelter|playground|parking))*$/i;
const tidyPart = (p) => {
  let t = String(p || '').replace(/\s+/g, ' ').replace(/^[\s,;:]+|[\s,;:.]+$/g, '').replace(/^(?:and|with|has an?|the|an?) /i, '').trim();
  if (!t) return null;
  if (/^(?:portions|parts)$/i.test(t)) return 'some portions';
  // "Viewing platform" -> "viewing platform"; "Turtle Mtn Blvd to Davison Rd section" keeps its names.
  const w = t.split(' ');
  if (/^[A-Z][a-z]+$/.test(w[0]) && (w.length === 1 || /^[a-z]/.test(w[1]))) t = t.charAt(0).toLowerCase() + t.slice(1);
  return t.slice(0, 90);
};
// The subject of a predicate ("<subject> is wheelchair accessible", "<subject> suits limited mobility").
function subjectOf(clause, at) {
  const head = clause.slice(0, at);
  const m = /^(.*?)(?:\b(?:is|are|suits?|take|takes|has|have)\b[^,]*|,\s*|\bfully\b\s*)$/i.exec(head.trimEnd() + (/[a-z]$/i.test(head.trimEnd()) ? '' : ''));
  let subj = m ? m[1] : head;
  subj = subj.replace(/\b(?:is|are|suits?|take|takes|has|have)\b.*$/i, '').replace(/,\s*$/, '').trim();
  return subj;
}
// -> { level, part, amenity?, surface? } from one Access (or Accessibility) line.
function accessGrade(line) {
  const raw = String(line || '').replace(/\s+/g, ' ').trim();
  if (!raw || !/[a-z]{3}/i.test(raw)) return { level: 'unknown', part: null };
  const surface = GRAVEL_RE.test(raw) ? { surface: 'gravel' } : {};
  const NOT_RE = /\bnot (?:fully |wheelchair |stroller )?(?:accessible|suitable|suited|friendly)\b|\binaccessible\b|\bno (?:wheelchair|ramp|elevator|lift)s?\b|\bnot all\b/i;
  const clauses = raw.split(/\s*;\s*/).filter(Boolean);
  const parts = [], mobParts = [];
  let whole = false, wheelWord = false, amenity = false, mobility = false, no = false;
  for (const c0 of clauses) {
    // "Stroller accessible" is about strollers.
    const c = c0.replace(/\bstrollers?[- ]accessible\b/ig, 'stroller friendly');
    if (NOT_RE.test(c)) { no = true; continue; }
    const cNoStairs = c.replace(/\b(?:no|without) (?:stairs|steps)\b/ig, ' ');
    const neg = ACCESS_NO_RE.test(cNoStairs);
    const m = WHEEL_WORD_RE.exec(c);
    if (m && !/\b(?:restricted|shared|public)[- ]access\b/i.test(c) && !/\badaptive\b/i.test(c)) {
      // Every "accessible <thing>" / "<subject> is accessible" in the clause.
      let found = false;
      const adj = /\b(?:(\d+(?:\.\d+)? ?k?m) )?(?:(?:fully|universally) )?(?:wheel ?chair[- ])?(?:accessible|universal) ((?!from\b|for\b|to\b|and\b|by\b|via\b)[a-z][a-z' -]*?)(?=\s*(?:,|$|\band (?:\d|an? |wheel ?chair|accessible|universal)))/ig;
      let x;
      while ((x = adj.exec(c))) {
        found = true;
        const thing = x[2].trim();
        if (AMENITY_RE.test(thing)) { amenity = true; continue; }
        parts.push({ text: tidyPart(`${x[1] ? `${x[1]} ` : ''}${thing}`) });
      }
      const rest = c.replace(adj, ' ');
      const p = /\bwheel ?chairs?\b|\bbarrier[- ]free\b|\buniversally accessible\b|\baccessible\b|\baccessibility certified\b|\bstep[- ]?free\b/i.exec(rest);
      if (p) {
        found = true;
        const ramp = /\bwheel ?chair ramp\b(.*)$/i.exec(rest), to = /\bwheel ?chair access to (.+)$/i.exec(rest), users = /\bwheel ?chair users\b(.*)$/i.exec(rest);
        if (ramp) parts.push({ text: tidyPart(`ramp${ramp[1]}`) });
        else if (to) parts.push({ text: tidyPart(to[1]) });
        else if (users) parts.push({ text: tidyPart(users[1].replace(/^ can ride /, 'riding ')) });
        else {
          const subj = subjectOf(rest, p.index), tail = /\b(?:accessible|friendly|ok)\b\s+((?:from|at|via|by) .+)$/i.exec(rest);
          if (/^(?:\d+ )?(?:flush |one )*(?:toilets?|washrooms?|parking|facilities)\b/i.test(subj.replace(/^(?:one|a|the) /i, '')) || AMENITY_RE.test(subj)) amenity = true;
          else if (!subj || (GENERIC_SUBJECT_RE.test(subj) && !tail && !/\b(?:section|portion|part|main|upper|lower|first|second)\b/i.test(subj))) { if (neg) parts.push({ text: tidyPart(subj) || 'part' }); else whole = true; }
          else parts.push({ text: tidyPart(`${subj}${tail ? ` ${tail[1]}` : ''}`) });
        }
      }
      if (found) { if (WHEEL_ONLY_RE.test(c) || /\baccessible\b/i.test(c)) wheelWord = true; if (neg && !whole) no = no || false; continue; }
    }
    if (neg) { no = true; continue; }
    if (/\b(?:disabled|handicapped) parking\b/i.test(c) && !MOBILITY_RE.test(c.replace(/\b(?:disabled|handicapped) parking\b/ig, ' '))) { amenity = true; continue; }
    const mm = MOBILITY_RE.exec(c);
    if (mm && !(/\broads?\b/i.test(c) && !/\b(?:path|trail|loop)\b/i.test(c) && !/\bmobility\b/i.test(c))) {
      mobility = true;
      const subj = subjectOf(c, mm.index);
      if (subj && /\b(?:is|are|suits?)\b/i.test(c.slice(0, mm.index)) && !GENERIC_SUBJECT_RE.test(subj) && /[A-Z]/.test(subj.slice(1))) mobParts.push(tidyPart(subj));
      else { const end = /\bpaved (?:at|to) (the [a-z ]+?)(?:,|$)/i.exec(c); if (end) mobParts.push(tidyPart(end[1])); }
    }
  }
  const real = parts.filter((p) => p.text);
  const formalOnly = !WHEEL_ONLY_RE.test(raw);
  // "… designed for accessibility" / "accessible path" on gravel, with no wheelchair word: the surface leaves a doubt.
  if (whole && !no && !(formalOnly && surface.surface)) return { level: 'wheelchair', part: null, ...surface };
  if (whole && !no) return { level: 'mobility', part: null, ...surface };
  if (whole && no) return { level: 'wheelchair_part', part: null, ...surface };
  if (real.length) return { level: 'wheelchair_part', part: real.map((p) => p.text).join('; '), ...surface };
  if (no) return { level: 'no', part: null, ...surface };
  if (mobility) return { level: 'mobility', part: mobParts[0] || null, ...surface };
  if (amenity) return { level: 'mobility', part: null, amenity: true, ...surface };
  return { level: 'unknown', part: null, ...surface };
}
const LEVEL_RANK = { wheelchair: 3, wheelchair_part: 2, mobility: 1, unknown: 0, no: -1 };
// How strongly a listing's access suits a wheelchair pick: 3 confirmed, 2 in part, 1 a mobility note (not an
// amenity-only line), 0 nothing said, -1 its own words say no.
const accessRank = (a) => (!a ? 0 : a.level === 'mobility' && a.amenity ? 0 : LEVEL_RANK[a.level] == null ? (a.has === true ? 3 : a.has === false ? -1 : 0) : LEVEL_RANK[a.level]);
// A listing's access, from its own data only. d: { ownerAccessible (the owner's own Wheelchair accessible answer),
// accessLine (an outdoor place's Access line or a Plan your visit row labelled Accessibility), stayAccessible (stay_info) }
// -> { level, part, has, says, source: 'owner' | 'line' | 'stay' | null, paved?, amenity?, surface? }
// has (kept for older readers): true only for 'wheelchair'; false for 'no'; null for the rest.
function accessOf(d) {
  const x = d || {};
  if (x.stayAccessible === true || x.stayAccessible === false) return { level: x.stayAccessible ? 'wheelchair' : 'no', part: null, has: x.stayAccessible, says: null, source: 'stay' };
  const line = String(x.accessLine || '').trim(), g = accessGrade(line);
  const paved = g.level !== 'no' && !g.amenity && (/\bpaved\b|\bboardwalk\b|\bstep[- ]?free\b/i.test(line) || (g.level === 'wheelchair' && ACCESS_PAVED_RE.test(line))) ? { paved: true } : {};
  if (x.ownerAccessible === true && g.level !== 'no') return { level: 'wheelchair', part: null, has: true, says: line || null, source: 'owner', ...paved };
  const extra = { ...(g.amenity ? { amenity: true } : {}), ...(g.surface ? { surface: g.surface } : {}) };
  if (g.level !== 'unknown') return { level: g.level, part: g.part || null, has: g.level === 'wheelchair' ? true : g.level === 'no' ? false : null, says: line, source: 'line', ...paved, ...extra };
  return { level: 'unknown', part: null, has: null, says: line || null, source: null };
}
// A listing's word on dogs (2026-11-23: where the dog can go is said, or said to be unknown; never guessed).
// d: { dogLine (an outdoor place's Dogs line), badge (its Dog-Friendly badge or place on the dog-friendly list),
//      type (the listing's type), ownLine (the listing's own Dogs line: the owner's answer or its Plan your visit row),
//      patioOnly / outsideOnly / someTrips (the site's own reading of the owner's answer) }
// -> { has: true | false | null, says, source: 'line' | 'owner' | 'badge' | null, where }
// where (only when has is true):
//   'outdoors'    an outdoor place's own Dogs line, with its condition (on leash, a section, a season) in says
//   'inside'      its own line says dogs can come inside
//   'patio' / 'outside' / 'some_trips'   its own line says patio only, outside only, some trips only
//   'stated'      its own line says something else (quoted)
//   'unsaid'      the Dog-Friendly badge and nothing more, at a place with an indoors (a restaurant, a café, a pub, a
//                 winery, a brewery, an indoor attraction, a shop): the badge doesn't say inside or patio only
//   null          the badge at an open-air place (a park, a trail, a beach, a tour)
const OPEN_AIR_TYPES = ['outdoor', 'beach', 'tour', 'sport', 'golf', 'ski', 'stay'];
const DOG_PATIO_RE = /\b(?:patio|terrace|deck|terrasse)\b[^.;]{0,24}\b(?:only|seulement|uniquement)\b|\b(?:only|seulement|uniquement)\b[^.;]{0,24}\b(?:patio|terrace|deck|terrasse)\b|\bdogs? (?:are )?(?:welcome |allowed |ok )?on (?:the |our )?(?:patio|terrace|deck)\b(?![^.;]*\binside\b)/i;
const DOG_OUTSIDE_RE = /\b(?:outside|outdoors?) only\b|\bonly (?:outside|outdoors)\b|\bnot (?:allowed |permitted |welcome )?(?:inside|indoors)\b|\bno dogs (?:allowed |permitted )?(?:inside|indoors)\b|(?:à l[’']extérieur|dehors) seulement|pas (?:de chiens? )?à l[’']intérieur/i;
const DOG_INSIDE_RE = /\b(?:inside|indoors|in the (?:taproom|tasting room|shop|store|lounge))\b|à l[’']intérieur/i;
function dogOf(d) {
  const x = d || {}, line = String(x.dogLine || '').trim(), own = String(x.ownLine || '').trim();
  const fromLine = dogFromText(line), fromOwn = own ? dogFromText(own) : null;
  if (fromLine === false) return { has: false, says: line, source: 'line', where: null };
  if (fromOwn === false && !x.patioOnly && !x.outsideOnly && !DOG_PATIO_RE.test(own) && !DOG_OUTSIDE_RE.test(own)) return { has: false, says: own, source: 'owner', where: null };
  const yes = x.badge === true || fromLine === true || fromOwn === true || !!x.patioOnly || !!x.outsideOnly;
  if (!yes) return { has: null, says: line || own || null, source: null, where: null };
  if (own) {
    const where = x.outsideOnly || DOG_OUTSIDE_RE.test(own) ? 'outside' : x.patioOnly || DOG_PATIO_RE.test(own) ? 'patio' : x.someTrips ? 'some_trips' : DOG_INSIDE_RE.test(own) ? 'inside' : 'stated';
    return { has: true, says: own, source: 'owner', where };
  }
  if (fromLine === true) return { has: true, says: line, source: 'line', where: 'outdoors' };
  return { has: true, says: line || null, source: 'badge', where: OPEN_AIR_TYPES.includes(String(x.type || 'outdoor')) ? null : 'unsaid' };
}

// ---- the words, shared by the plan's evidence, the chat and the shared copy ----
const WINTER_MONTHS = [11, 12, 1, 2, 3];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// The cold-months word for a trip: its month when it is dated in November to March ("January"), "winter" when it has
// no dates and its request says winter, else null (nothing is said about patios).
function coldSeason(date, text) {
  const m = /^\d{4}-(\d{2})-\d{2}$/.exec(String(date || ''));
  if (m) { const n = Number(m[1]); return WINTER_MONTHS.includes(n) ? { en: MONTHS_EN[n - 1], fr: MONTHS_FR[n - 1] } : null; }
  const t = fold(text);
  const named = /\b(january|february|march|november|december|janvier|fevrier|mars|novembre|decembre)\b/.exec(t);
  if (named) { const i = ['january', 'february', 'march', 'november', 'december'].indexOf(named[1]), j = ['janvier', 'fevrier', 'mars', 'novembre', 'decembre'].indexOf(named[1]); const n = [1, 2, 3, 11, 12][i >= 0 ? i : j]; return { en: MONTHS_EN[n - 1], fr: MONTHS_FR[n - 1] }; }
  if (/\b(?:winter|snow|ski(?:ing)?|christmas|new year'?s|hiver|neige|noel)\b/.test(t)) return { en: 'winter', fr: 'hiver' };
  return null;
}
const withThe = (part) => (/^(?:some|riding|one|two|the|\d+ accessible)\b/i.test(part) ? part : `the ${part}`);
// One stop's access, in one short clause for Details (the listing's own line, quoted; what it covers; what is left).
function accessStopText(r, fr) {
  const q = r.says ? (fr ? `« ${r.says} »` : `“${String(r.says).replace(/[“”"]/g, '')}”`) : '';
  if (r.level === 'wheelchair_part') {
    if (fr) return `${r.name} : ${q}. ${r.part ? `Seul ceci est couvert : ${r.part}` : 'Une partie seulement est couverte'}; vérifiez le reste.`;
    return `${r.name}: ${q}. ${r.part ? `Only ${withThe(r.part)} is covered` : 'Only part of it is covered'}: check the rest.`;
  }
  if (r.level === 'mobility' && r.amenity) return fr ? `${r.name} : ${q}. Cela vise les installations, pas le parcours : demandez avant d’y aller.` : `${r.name}: ${q}. That covers facilities, not the route: ask before you go.`;
  if (r.level === 'mobility') return fr ? `${r.name} : ${q}. Aucune mention des fauteuils roulants : vérifiez la surface et la largeur.` : `${r.name}: ${q}. No mention of wheelchairs: check the surface and width.`;
  return '';
}
// ---- the short notes (2026-11-23): ONE place for the few words said of a stop for a need ----
// The owner's report: the BX Ranch Trail card said "A good walk with your dog" and nothing of the wheelchair; restaurant
// cards showed "Dog-Friendly" without saying indoors or patio is unconfirmed. Every surface that says a stop's need in
// a few words (the plan's collapsed card, the Book my trip sheet, the shared copy, the copied itinerary) reads it here,
// so they never differ. compact: the shorter form for a line that also carries the other need or a suggested time.
//   accessShort(r)  r: { level, part, amenity }   (an 'accessible' evidence row)
//   dogShort(r)     r: { has, where, says }       (a 'dog_friendly' evidence row)
// Nothing is upgraded: 'unknown' is "check ahead", a badge with no word on indoors is "check indoor or patio access".
function accessShort(r, fr, compact) {
  const x = r || {}, level = x.level || (x.has === true ? 'wheelchair' : x.has === false ? 'no' : 'unknown');
  if (level === 'wheelchair') return compact ? (fr ? 'Fauteuil : oui selon la fiche' : 'Wheelchair: yes per listing') : (fr ? 'Accessible en fauteuil selon sa fiche' : 'Wheelchair accessible per its listing');
  if (level === 'wheelchair_part') return fr ? `Fauteuil roulant : ${x.part ? `${x.part} seulement` : 'en partie seulement'}` : `Wheelchair: ${x.part ? `${x.part} only` : 'in part only'}`;
  if (level === 'mobility') {
    if (x.amenity) return fr ? 'Accès : installations seulement · à vérifier' : 'Access: facilities only · check ahead';
    if (x.part) return fr ? `Accès : ${x.part} · à vérifier` : `Access: ${x.part} · check ahead`;
    return fr ? 'Note de mobilité seulement · à vérifier' : 'Mobility note only · check ahead';
  }
  if (level === 'no') return compact ? (fr ? 'Fauteuil : non selon la fiche' : 'Wheelchair: no per listing') : (fr ? 'Non accessible en fauteuil selon sa fiche' : 'Not wheelchair accessible per its listing');
  return compact ? (fr ? 'Fauteuil : à vérifier' : 'Wheelchair: check ahead') : (fr ? 'Accès en fauteuil : à vérifier' : 'Wheelchair access: check ahead');
}
// A listing's own Dogs line in a few words: its condition, without "Dogs allowed". The first clause when the line is
// long, and then "· limits apply" if what is left out limits where or when (no, not, only, except), else "…".
const DOG_LEAD_RE = /^(?:leashed |well-behaved )?(?:dogs?|pets?)(?: (?:are|is))? (?:allowed|welcome|permitted|ok)\b[\s,;:]*(?:but |if (?:kept )?|when )?/i;
const DOG_LIMIT_RE = /\b(?:no|not|none|never|only|except|excepted|prohibited|banned)\b/i;
const DOG_SHORT_MAX = 38;
const DOG_FR = [[/^on[- ](?:a )?leash only$/i, 'en laisse seulement'], [/^on[- ](?:a )?leash$/i, 'en laisse'], [/^on[- ](?:a )?leash at all times$/i, 'en laisse en tout temps'], [/^allowed$/i, 'admis'], [/^must be on (?:a )?leash$/i, 'en laisse obligatoire']];
function dogLineShort(says, fr) {
  const whole = String(says || '').replace(/[“”"«»]/g, '').replace(/\s+/g, ' ').trim().replace(/[.;,]+$/, '');
  if (!whole) return '';
  const tidy = (t) => {
    // "… on leash only (Deleenheer Rd section)" -> "… on leash only, Deleenheer Rd section"
    let x = String(t).trim().replace(/[.;,]+$/, '').replace(/\s+\(([^()]{3,40})\)$/, ', $1');
    const lead = /^(?:dogs?|pets?) (?:must|on|under|can|only|not)\b/i.test(x), leashed = /^leashed (?:dogs?|pets?)\b/i.test(x);
    if (leashed) x = x.replace(/^leashed (?:dogs?|pets?)\s*/i, '').replace(/^(?:are |is )?(?:allowed|welcome|permitted|ok)\b/i, '');
    else x = lead ? x.replace(/^(?:dogs?|pets?) /i, '') : x.replace(DOG_LEAD_RE, '');
    x = x.trim().replace(/^[,;:]\s*/, '').replace(/^(.+?) (?:are |is )?(?:welcome|ok)$/i, '$1');
    if (leashed) x = x ? `on leash${/^(?:in|on|at|only)\b/i.test(x) ? ' ' : '; '}${x}` : 'on leash';
    if (!x) x = 'allowed';
    if (/^[A-Z][a-z'-]*(?: [a-z(]|$)/.test(x)) x = x.charAt(0).toLowerCase() + x.slice(1);
    return x;
  };
  let text = tidy(whole), rest = '';
  if (text.length > DOG_SHORT_MAX) {
    const cut = /^(.*?)(?:\s*;\s*|\s+\(|,\s+(?=but |except |not |no |none ))(.*)$/.exec(whole);
    if (cut && tidy(cut[1]).length <= DOG_SHORT_MAX + 8) { text = tidy(cut[1]); rest = cut[2]; }
    else { const w = text.slice(0, DOG_SHORT_MAX + 1); rest = text.slice(w.lastIndexOf(' ')); text = w.slice(0, w.lastIndexOf(' ')).replace(/[,;:]+$/, ''); }
  }
  if (fr) for (const [re, f] of DOG_FR) if (re.test(text)) { text = f; break; }
  if (!rest) return text;
  return DOG_LIMIT_RE.test(rest) ? `${text} · ${fr ? 'avec limites' : 'limits apply'}` : `${text}…`;
}
function dogShort(r, fr, compact) {
  const x = r || {}, line = dogLineShort(x.says, fr);
  if (x.has === false) return fr ? 'Chiens non admis selon sa fiche' : 'No dogs per its listing';
  if (x.has === true) {
    if (x.where === 'unsaid') return compact ? (fr ? 'Chiens : intérieur ou terrasse à vérifier' : 'Dogs: check inside or patio') : (fr ? 'Chiens : vérifier intérieur ou terrasse' : 'Dogs: check indoor or patio access');
    if (x.where === 'patio') return fr ? 'Chiens : terrasse seulement' : 'Dogs: patio only';
    if (x.where === 'outside') return fr ? 'Chiens : dehors seulement' : 'Dogs: outside only';
    if (x.where === 'some_trips') return fr ? 'Chiens : certaines sorties seulement' : 'Dogs: some trips only';
    if (x.where === 'inside' && (!line || /…$|limits apply$|avec limites$/.test(line))) return fr ? 'Chiens : admis à l’intérieur' : 'Dogs: welcome inside';
    if (line) return /^(?:no|not) /i.test(line) ? (/^no dogs\b/i.test(line) ? line.charAt(0).toUpperCase() + line.slice(1) : `${fr ? 'Chiens : ' : 'Dogs: '}${line}`) : `${fr ? 'Chiens : ' : 'Dogs: '}${line}`;
    return fr ? 'Chiens : indiqué comme admis' : 'Dogs: listed as dog-friendly';
  }
  // The listing has a Dogs line that says both yes and no (a season, an area): its own first words, never a yes.
  if (line) return /^no dogs\b/i.test(line) ? line.charAt(0).toUpperCase() + line.slice(1) : `${fr ? 'Chiens : ' : 'Dogs: '}${line}${/limits apply|avec limites|…$/.test(line) || DOG_LIMIT_RE.test(line) ? '' : ` · ${fr ? 'à vérifier' : 'check ahead'}`}`;
  return fr ? 'Chiens : à vérifier' : 'Dogs: check ahead';
}
// Is this short note something to check (not a plain yes)? For the Book my trip sheet's "To confirm with each place".
const accessOpen = (r) => !!r && (r.level || (r.has === true ? 'wheelchair' : 'unknown')) !== 'wheelchair';
// (A badge beside a Dogs line that says both yes and no, a season or an area, is still to check.)
const dogOpen = (r) => !!r && !(r.has === true && (!r.where || r.where === 'outdoors' || r.where === 'inside') && !(!r.where && r.says && dogFromText(r.says) !== true));
// The notes of one stop from a plan's evidence, only for the needs the plan carries (plan.needs).
// -> { access, dog (evidence rows or null), notes: [full], compact: [compact], text (full, " · "), open: [notes still to check],
//      chipOff (the Dog-Friendly chip would read as settled: the note stands in for it), dir (directions caveat or pin) }
function stopNeedNotes(plan, id, fr) {
  const out = { access: null, dog: null, notes: [], compact: [], text: '', open: [], chipOff: false, dir: null };
  const p = plan || {}, needs = p.needs;
  if (id == null || !Array.isArray(p.evidence)) return out;
  const row = (ask) => { const e = p.evidence.find((x) => x && x.ask === ask && Array.isArray(x.stops)); return (e && e.stops.find((x) => x && x.id === id)) || null; };
  if (hasNeed(needs, 'wheelchair')) out.access = row('accessible');
  if (hasNeed(needs, 'dog')) out.dog = row('dog_friendly');
  if (out.access) { const n = accessShort(out.access, fr); out.notes.push(n); out.compact.push(accessShort(out.access, fr, true)); if (accessOpen(out.access)) out.open.push(n); if (out.access.dir) out.dir = out.access.dir; }
  if (out.dog) { const n = dogShort(out.dog, fr); out.notes.push(n); out.compact.push(dogShort(out.dog, fr, true)); if (dogOpen(out.dog)) out.open.push(n); out.chipOff = out.dog.has === true && out.dog.where === 'unsaid'; }
  // No car (2026-11-23, trip-transport-need.js): the hop that reaches this stop, when it is more than a short walk.
  if (hasNeed(needs, 'no_car')) { const r = row('no_car'); if (r && r.check && r.note) { const n = (fr && r.noteFr) || r.note; out.notes.push(n); out.compact.push((fr && r.noteShortFr) || r.noteShort || n); } }
  // A food allergy (2026-11-23, trip-allergy-need.js): every stop that serves food says to ask; never a yes.
  if (hasNeed(needs, 'allergy')) { const r = row('allergy'); if (r && r.note) { const n = (fr && r.noteFr) || r.note; out.notes.unshift(n); out.compact.unshift(n); out.open.unshift(n); out.allergy = n; } }
  out.text = out.notes.join(' · ');
  return out;
}
// Directions for a stop whose listing covers only a named entrance or section (2026-11-23). The plan's and the shared
// copy's map links go to the listing's own map location, which is not necessarily that entrance: said in one line,
// unless the listing's data holds a pin for it (pin: { name, lat, lng }, from the site's own entrance data), which the
// link then uses, named. Never a word that the route or the whole place is accessible.
// (A feature such as a playground, a building or a viewpoint is not an entrance or a stretch of the route.)
const PART_ENTRANCE_RE = /\b(?:access|entrance|section|trail|loop|path|pathway|lot|gate|trailhead|parking|rd|road|blvd|ave|avenue|st|street|hwy|from|to)\b/i;
function accessDirections(r, pin) {
  const x = r || {};
  if (!(x.level === 'wheelchair_part' || x.level === 'mobility') || !x.part || x.amenity || !PART_ENTRANCE_RE.test(x.part)) return null;
  if (pin && Number.isFinite(Number(pin.lat)) && Number.isFinite(Number(pin.lng)) && pin.name) {
    const name = String(pin.name).trim();
    return { pin: { name, lat: Number(pin.lat), lng: Number(pin.lng) }, url: `https://www.google.com/maps/search/?api=1&query=${Number(pin.lat)},${Number(pin.lng)}`,
      label: `Directions to ${name}`, labelFr: `Itinéraire vers ${name}`,
      text: `Directions go to ${name}, the entrance on file for ${withThe(x.part)}.`, textFr: `L’itinéraire mène à ${name}, l’entrée au dossier pour : ${x.part}.` };
  }
  return { pin: null, text: `Directions go to the listing’s map location, not necessarily ${withThe(x.part)}: check the entrance.`, textFr: `L’itinéraire mène à l’emplacement de la fiche, pas forcément à : ${x.part}. Vérifiez l’entrée.` };
}
// Kept for older callers: the short note of a stop listed in part or with only a mobility note.
function accessStopNote(r, fr) {
  return r && (r.level === 'wheelchair_part' || r.level === 'mobility') ? accessShort(r, fr) : '';
}
// The expanded card's line for one stop (no name: the card is the stop's own).
function accessStopMore(r, fr) {
  const q = r.says ? (fr ? `« ${r.says} »` : `“${String(r.says).replace(/[“”"]/g, '')}”`) : '';
  const head = fr ? 'Accès en fauteuil roulant : ' : 'Wheelchair access: ';
  if (r.level === 'wheelchair_part' || r.level === 'mobility') return head + accessStopText({ ...r, name: '' }, fr).replace(/^\s*:\s*/, '');
  if (r.level === 'wheelchair') return head + (fr ? `indiqué sur la fiche${q ? ` (${q})` : ''}.` : `listed${q ? ` (${q})` : ' on its listing'}.`);
  if (r.level === 'no') return head + (fr ? `la fiche indique ${q}; pas adapté à un fauteuil roulant d’après la fiche.` : `its listing says ${q}, so it doesn’t suit a wheelchair as listed.`);
  return head + (fr ? 'la fiche ne le précise pas : demandez avant d’y aller.' : 'its listing doesn’t say: ask before you go.');
}
// r: { has, where, says }; cold: { en, fr } | null.
function dogStopMore(r, fr, cold) {
  const head = fr ? 'Chien : ' : 'Dog: ', says = String(r.says || '').replace(/[“”"]/g, '').replace(/\.$/, '');
  const patio = cold ? (fr ? ` (une terrasse peut être fermée en ${cold.fr})` : ` (a patio may be closed in ${cold.en})`) : '';
  if (r.has === false) return head + (says ? (fr ? `la fiche indique « ${says} ».` : `its listing says “${says}”.`) : (fr ? 'non indiqué comme acceptant les chiens.' : 'not listed as dog-friendly.'));
  if (r.has !== true) return head + (fr ? 'la fiche ne le précise pas : demandez avant d’y aller.' : 'its listing doesn’t say: ask before you go.');
  if (r.where === 'unsaid') return head + (fr ? `a le badge Chiens admis; la fiche ne dit pas si les chiens peuvent entrer ou seulement aller sur une terrasse${patio} : demandez avant d’y aller.` : `has the Dog-Friendly badge; its listing doesn’t say if dogs can come inside or only on a patio${patio}: ask before you go.`);
  if (says) return head + (fr ? `la fiche indique « ${says} »${r.where === 'patio' ? patio : ''}.` : `its listing says “${says}”${r.where === 'patio' ? patio : ''}.`);
  return head + (fr ? 'a le badge Chiens admis.' : 'has the Dog-Friendly badge.');
}
// Both needs at one stay whose listing has accessible rooms and takes pets: one room with both is not confirmed.
const STAY_BOTH = {
  its: { text: 'Its listing has accessible rooms and pet-friendly rooms, but doesn’t say one room is both: ask the hotel to confirm an accessible, dog-friendly room.', textFr: 'Sa fiche indique des chambres accessibles et des chambres où les animaux sont acceptés, mais ne dit pas qu’une même chambre offre les deux : demandez à l’hôtel de confirmer une chambre accessible qui accepte les chiens.' },
  named: (name) => ({ text: `Place to stay: ${name}’s listing has accessible rooms and pet-friendly rooms, but doesn’t say one room is both: ask the hotel to confirm an accessible, dog-friendly room.`, textFr: `Hébergement : la fiche de ${name} indique des chambres accessibles et des chambres où les animaux sont acceptés, mais ne dit pas qu’une même chambre offre les deux : demandez à l’hôtel de confirmer une chambre accessible qui accepte les chiens.` }),
  short: 'Stay: accessible + dog room to confirm', shortFr: 'Hébergement : chambre accessible + chien à confirmer',
};
const stayBoth = (needs, facts) => hasNeed(needs, 'wheelchair') && hasNeed(needs, 'dog') && !!facts && facts.accessible === true && (facts.pets === 'yes' || facts.pets === 'some');

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

module.exports = { readNeeds, hasNeed, needOf, accessFromText, accessGrade, accessRank, dogFromText, accessOf, dogOf, thinDays, ACCESS_PAVED_RE, coldSeason, accessStopText, accessStopNote, accessStopMore, dogStopMore, accessShort, dogShort, dogLineShort, stopNeedNotes, accessDirections, accessOpen, dogOpen, STAY_BOTH, stayBoth, OPEN_AIR_TYPES };
