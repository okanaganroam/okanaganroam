'use strict';
// Build My Trip travel agent chat: honest evidence and explanations (2026-11-22, Dayton's report on the live site: a
// six-person Kelowna weekend with "gluten-free dining" showed "I couldn't fit gluten free on these dates" above meal
// stops that all carry the Gluten-Free-Friendly badge, with no dates set, and "Why did you say you could not fit gluten
// free…" got "Which stop do you mean?").
//
// 1. tripEvidenceFor: what the plan on screen supports for one thing the request asked for (gluten-free, vegan,
//    vegetarian), from plan.evidence when the planner gives it and else from the listings' own badges on the stops
//    shown. One of verified / partial / unknown / unmet, in one line. The same function runs on the page (the agent's
//    first line) and on the server (the chat's answers), so the two never contradict each other. A badge is all we
//    hold: never a menu item, never a promise about cross-contamination.
// 2. explainRules: questions about the plan's own warnings and choices ("why did you say…", "is everything
//    gluten-free?", "why is there an event on day 3?", "why two wineries?", "what does the warning mean?"). Answers,
//    never edits.
// 3. answer: the replies, from facts in hand. A cause that is not known is said so, with one next step.

// ---- 1. Evidence (plain ES5: this function's source is also sent to the page) ----
// ask: 'gluten_free' | 'vegan' | 'vegetarian'. stops: [{ id, name, type, key: '<day>-<daypart>', feats: [badge keys] }].
// planEvidence: plan.evidence (or null). -> { ask, status, source: 'plan' | 'badges', total, has: [stop], not: [stop],
// line, caveat, offer: [names] } or null when the ask is not one we hold a badge for.
function tripEvidenceFor(ask, stops, planEvidence, lang) {
  var F = {
    gluten_free: { badge: 'Gluten-Free-Friendly', badgeFr: 'Sans gluten', en: 'gluten-free', fr: 'sans gluten' },
    vegan: { badge: 'Vegan-Friendly', badgeFr: 'Options véganes', en: 'vegan', fr: 'véganes' },
    vegetarian: { badge: 'Vegetarian-Friendly', badgeFr: 'Options végétariennes', en: 'vegetarian', fr: 'végétariennes' }
  };
  var f = F[ask]; if (!f) return null;
  var fr = lang === 'fr', list = [], status = null, source = 'badges', given = null, i;
  for (i = 0; i < (planEvidence || []).length; i++) { var e = planEvidence[i]; if (e && e.ask === ask && !given) given = e; }
  // Evidence built for another set of stops (one was removed or swapped on the page since) is not used: the badges of
  // the stops shown are read instead.
  if (given && Array.isArray(given.stops) && (stops || []).length) { for (i = 0; i < given.stops.length; i++) { var gi = given.stops[i], on = false; for (var q = 0; q < stops.length; q++) if (gi && stops[q] && stops[q].id === gi.id) on = true; if (gi && gi.id && !on) { given = null; break; } } }
  if (given && Array.isArray(given.stops) && /^(verified|partial|unknown|unmet)$/.test(String(given.status))) {
    source = 'plan'; status = given.status;
    for (i = 0; i < given.stops.length; i++) { var g = given.stops[i]; if (g && g.name) list.push({ id: g.id, name: String(g.name), has: g.has === true ? true : g.has === false ? false : null }); }
  } else {
    // The meal stops: every restaurant, and a café or pub that is the day's lunch or dinner (never a bar after dinner).
    for (i = 0; i < (stops || []).length; i++) {
      var s = stops[i]; if (!s || !s.name) continue;
      var part = String(s.key || '').split('-')[1] || '';
      var meal = s.type === 'restaurant' || ((s.type === 'cafe' || s.type === 'pub') && (part === 'midday' || part === 'evening'));
      if (meal) list.push({ id: s.id, name: String(s.name), has: (s.feats || []).indexOf(ask) !== -1 ? true : null });
    }
    var n0 = 0; for (i = 0; i < list.length; i++) if (list[i].has === true) n0++;
    status = !list.length ? 'unknown' : n0 === list.length ? 'verified' : n0 > 0 ? 'partial' : 'unknown';
  }
  var has = [], not = [], no = [];
  for (i = 0; i < list.length; i++) { if (list[i].has === true) has.push(list[i]); else { not.push(list[i]); if (list[i].has === false) no.push(list[i]); } }
  function join(a) { var and = fr ? ' et ' : ' and '; return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + and + a[a.length - 1]; }
  function names(a, max) { var out = []; for (var j = 0; j < a.length && j < max; j++) out.push(a[j].name); if (a.length > max) out.push(fr ? (a.length - max) + ' de plus' : (a.length - max) + ' more'); return join(out); }
  var badge = fr ? '« ' + f.badgeFr + ' »' : f.badge, word = fr ? f.fr : f.en, total = list.length, line, offer = [];
  if (status === 'verified' && total) {
    line = total === 1 ? (fr ? 'Votre arrêt repas, ' + has[0].name + ', a le badge ' + badge + ' sur sa fiche.' : 'Your meal stop, ' + has[0].name + ', has the ' + badge + ' badge on its listing.')
      : (fr ? 'Chaque arrêt repas ici a le badge ' + badge + ' sur sa fiche.' : 'Every meal stop here has the ' + badge + ' badge on its listing.');
  } else if (status === 'partial') {
    var dont = not.length === 1 ? (fr ? ' ne le dit pas' : ' doesn’t say') : (fr ? ' ne le disent pas' : ' don’t say');
    var ask2 = not.length === 1 ? (fr ? 'Voulez-vous que je le remplace?' : 'Want me to swap it?') : not.length === 2 ? (fr ? 'Voulez-vous que je remplace ces deux-là?' : 'Want me to swap those two?') : (fr ? 'Voulez-vous que je les remplace?' : 'Want me to swap them?');
    line = (fr ? has.length + ' des ' + total + ' arrêts repas ont le badge ' + badge + '; ' : has.length + ' of ' + total + ' meal stops ' + (has.length === 1 ? 'has' : 'have') + ' the ' + badge + ' badge; ') + names(not, 3) + dont + '. ' + ask2;
    for (i = 0; i < not.length && i < 3; i++) offer.push(not[i].name);
  } else if (status === 'unmet') {
    line = no.length ? (fr ? names(no, 3) + (no.length === 1 ? ' n’a' : ' n’ont') + ' pas d’options ' + word + ' selon ' + (no.length === 1 ? 'sa fiche' : 'leurs fiches') + '.' : names(no, 3) + (no.length === 1 ? ' doesn’t list ' : ' don’t list ') + word + ' options.')
      : (fr ? 'Je n’ai trouvé aucun arrêt repas avec le badge ' + badge + ' pour ce plan.' : 'I found no meal stop with the ' + badge + ' badge for this plan.');
  } else {
    status = 'unknown';
    line = !total ? (fr ? 'Il n’y a pas d’arrêt repas dans ce plan, donc rien à vérifier pour le ' + word + '.' : 'There’s no meal stop in this plan, so there’s nothing to check for ' + word + '.')
      : (fr ? 'Aucun arrêt repas ici n’a le badge ' + badge + ' sur sa fiche, donc je ne peux pas confirmer d’options ' + word + '. Demandez au restaurant en réservant.' : 'None of the meal stops here has the ' + badge + ' badge on its listing, so I can’t confirm ' + word + ' options. Ask the restaurant when you book.');
  }
  // The planner's own sentence, when it gives one, is the one said (the itinerary shows the same words).
  var own = given && source === 'plan' ? (fr && typeof given.textFr === 'string' && given.textFr ? given.textFr : typeof given.text === 'string' ? given.text : '') : '';
  if (own) line = status === 'partial' && offer.length ? own.replace(/\s+$/, '') + ' ' + (not.length === 1 ? (fr ? 'Voulez-vous que je le remplace?' : 'Want me to swap it?') : (fr ? 'Voulez-vous que je les remplace?' : 'Want me to swap them?')) : own;
  var ownCaveat = !!own && /cross-contamination|contamination crois/i.test(own);
  var caveat = ownCaveat ? '' : ask === 'gluten_free'
    ? (fr ? 'Un badge veut dire que l’endroit indique des options sans gluten; ce n’est pas une garantie contre la contamination croisée, alors dites-le au restaurant en réservant.' : 'A badge means the place lists gluten-free options; it isn’t a guarantee against cross-contamination, so tell the restaurant when you book.')
    : (fr ? 'Un badge veut dire que l’endroit indique des options ' + word + '; confirmez avec le restaurant en réservant.' : 'A badge means the place lists ' + word + ' options; confirm with the restaurant when you book.');
  return { ask: ask, status: status, source: source, total: total, has: has, not: not, line: line, caveat: caveat, offer: offer, badge: badge, word: word, own: !!own };
}

// ---- 2. The questions ----
const FEAT_RES = { gluten_free: /\b(?:gluten|celiac|coeliac|coeliaque)\b/, vegan: /\b(?:vegan\w*|vegetalien\w*|veganes?)\b/, vegetarian: /\b(?:vegetarian\w*|vegetarien\w*|veggie)\b/ };
const featureIn = (t) => Object.keys(FEAT_RES).find((k) => FEAT_RES[k].test(t)) || null;
const WHY_RE = /\b(?:why|how come|pourquoi|comment ca se fait|explain|expliqu\w+)\b/;
const WHY_NOT_EDIT_RE = /\bwhy (?:not|don'?t (?:you|we)) (?:add|swap|try|include|put|do|book|go)\b|\bpourquoi (?:ne )?pas (?:ajouter|essayer|mettre)\b/;
const EDIT_START_RE = /^(?:please\s+|svp\s+|s'il vous plait\s+)?(?:add|swap|replace|remove|drop|make|find|change|move|put|book|ajoute[rz]?|remplace[rz]?|enleve[rz]?|retire[rz]?|change[rz]?|trouve[rz]?|mets|deplace[rz]?)\b/;
const Q_START_RE = /^(?:is|are|was|were|does|do|did|what|what's|when|why|how|where|which|who|est-ce|c'est|pourquoi|comment|combien|quand|quel|quels|quelle|quelles|lesquels|lesquelles|que|qu'est-ce|y a-t-il|explain|explique[rz]?)\b/;
const WARN_WORD_RE = /\b(?:warnings?|avertissements?|mise en garde|caveats?|that (?:note|line|message)|the (?:note|line|message) (?:about|that|at the top|above)|cette (?:note|ligne)|ce message)\b/;
const SAID_RE = /\bwhy (?:did|do|does|would) (?:you|it|the plan|the page|the site|the agent) (?:say|tell|claim|write|show|think)\b|\bwhy does it say\b|\bwhy (?:couldn'?t|could not|can'?t|cannot) (?:you|it) (?:fit|find|include|add)\b|\b(?:you|it) said (?:you )?(?:couldn'?t|could not)\b|\bpourquoi (?:as-tu|avez-vous|tu as|vous avez) (?:dit|ecrit)\b|\bpourquoi (?:ca dit|c'est ecrit|est-il ecrit|il est ecrit|ca indique)\b|\bpourquoi (?:n'as-tu|n'avez-vous|tu n'as|vous n'avez) pas pu\b/;
const EVENT_WORD_RE = /\b(?:events?|shows?|concerts?|gigs?|evenements?|spectacles?)\b/;
const COUNT_RE = /\b(?:two|three|four|five|six|2|3|4|5|6|only one|just one|only 1|so many|so few|that many|deux|trois|quatre|cinq|seulement une?|juste une?|autant de|si peu de|tant de)\b/;
const ALLERGY_RE = /\b(?:allerg\w+|celiac|coeliac|coeliaque|cross[- ]contaminat\w+|contamination croisee|nut[- ]free|peanuts?|arachides?|noix|shellfish|dairy[- ]free|lactose|safe (?:for|to eat))\b/;
const EVID_Q_RE = /\b(?:everything|every|all|each|any|which|what|are|is|do|does|how many|tout|tous|toutes|chaque|quels?|quelles?|lesquels|lesquelles|est-ce|combien)\b/;
const MORE_RE = /\b(?:another|a second|a 2nd|one more|an extra|an additional|a third|une? autre|une? deuxieme|une? second[e]?|encore une?|une? de plus)\b/;
const MORE_VERB_RE = /\b(?:add|include|fit in|put in|squeeze in|want|need|ajoute[rz]?|inclure|incluez|veux|voulons|aimerais|aimerions)\b/;
const FEAT_SWAP_RE = /\b(?:swap|replace|change|switch|remplace[rz]?|change[rz]?|echange[rz]?)\b.*\b(?:for|with|to|pour|par|contre)\b[^.]*\b(?:gluten|vegan\w*|vegetarian\w*|vegetalien\w*|vegetarien\w*|veganes?)\b/;

// A message that is a question about the plan (never a request to change it): the turn that answers it may not change
// the plan, whatever the reader made of it (server.js runTripChatTurn).
function isExplainQuestion(t) {
  if (!t || WHY_NOT_EDIT_RE.test(t) || EDIT_START_RE.test(t)) return false;
  if (/^(?:why|how come|pourquoi|what does|what do you mean|what did you|what(?:'s| is| was) (?:that|the|this) (?:warning|note|line|message)|que veut dire|qu'est-ce que (?:ca|cela) veut dire|explain|explique[rz]?)\b/.test(t)) return true;
  if (WARN_WORD_RE.test(t) && (Q_START_RE.test(t) || /\?\s*$/.test(t))) return true;
  return false;
}
// t: the folded message. h: { op, kindsNamed, stopsNamed }. -> { ops: [ask...], explain } | { ops: [edit...], exact } | null.
function explainRules(t, h, stops) {
  const op = h.op;
  const isQ = Q_START_RE.test(t) || /\?\s*$/.test(t);
  const dayM = /\b(?:day|jour)\s*(\d)\b/.exec(t);
  const day = dayM ? Number(dayM[1]) : null;
  const feat = featureIn(t);
  const kinds = () => (typeof h.kindsNamed === 'function' ? h.kindsNamed(t.replace(/\bnon[- ]drink\w*/g, ' ')).filter((k) => k !== 'kids' && k !== 'activity') : []);
  const named = () => { try { const n = typeof h.stopsNamed === 'function' ? h.stopsNamed(t, stops || []) : []; return (n.byName && n.byName.length ? n.byName : []); } catch (e) { return []; } };
  const ask = (value, extra = {}) => ({ ops: [op('ask', { value, ...extra })], cant: null, exact: true, explain: true });
  if (WHY_NOT_EDIT_RE.test(t)) return null;
  // "swap X and Y for gluten-free places" (what the chat offers after a partial answer): those stops, with the badge.
  if (feat && FEAT_SWAP_RE.test(t) && !isExplainQuestion(t)) {
    const by = named();
    const all = /\b(?:those|them|these|the ones|ceux|celles|les)\b/.test(t) && !by.length;
    if (by.length || all) return { ops: (by.length ? by : [null]).slice(0, 3).map((s) => op('replace', { stops: s ? [s] : [], features: [feat], featSwap: true, featAll: !s })), cant: null, exact: true, featSwap: true };
  }
  // "add another winery on day 2", "a second winery on day 2": one MORE of that kind (never a swap of the one there).
  if (MORE_RE.test(t) && MORE_VERB_RE.test(t) && !isQ && !/\b(?:instead|swap|replace|remplace[rz]?|plutot|day|night|jour(?:nee)?|nuit)\s*$/.test(t) && !/\b(?:another|one more|an extra|une? autre|une? de plus)\s+(?:day|night|jour|journee|nuit)\b/.test(t)) {
    const kind = kinds()[0] || null;
    if (kind) return { ops: [op('add', { kind, day, more: true })], cant: null, exact: true, more: true };
  }
  if (!isQ && !WHY_RE.test(t)) return null;
  if (EDIT_START_RE.test(t)) return null;
  // The plan's own warnings: "why did you say you could not fit gluten free…", "what does the warning mean?".
  if (SAID_RE.test(t) || (WARN_WORD_RE.test(t) && isQ)) return ask('q_warning', { feature: feat, kind: feat ? null : kinds()[0] || null });
  // An allergy: only what a badge supports, never a promise.
  if (ALLERGY_RE.test(t) && !named().length) return ask('q_allergy', { feature: feat || (/\b(?:celiac|coeliac|coeliaque)\b/.test(t) ? 'gluten_free' : null) });
  // "is everything gluten-free?", "which restaurants are gluten-free?": the badge on the meal stops shown.
  if (feat && isQ && EVID_Q_RE.test(t) && !named().length) return ask('q_evidence', { feature: feat, which: /\b(?:which|what|quels?|quelles?|lesquels|lesquelles)\b/.test(t) });
  if (WHY_RE.test(t) && feat && !named().length) return ask('q_evidence', { feature: feat });
  // "why is there an event on day 3?"
  if (WHY_RE.test(t) && EVENT_WORD_RE.test(t) && !/\b(?:no|not|aucun|pas d)\b/.test(t)) return ask('q_why_event', { day });
  // "why two wineries?", "why only one brewery?"
  if (WHY_RE.test(t) && COUNT_RE.test(t)) { const kind = kinds()[0] || null; if (kind) return ask('q_why_count', { kind }); }
  return null;
}

// ---- 3. The answers ----
const TX = {
  en: {
    wrong: 'That line was wrong: {line}', partly: 'That line was only partly right: {line}', stands: 'Here’s what it was based on: {line}',
    noteAbout: 'That is about {names}, which {v} have the badge.', names: 'They are {names}.', noteQuote: 'It came from the planner’s note “{w}”, which is about {names}: {v} have the badge.', noteQuoteBare: 'It came from the planner’s note “{w}”', dont: 'they don’t', doesnt: 'it doesn’t',
    warnNone: 'There’s no warning on this plan right now. Everything you asked for that I can check is in it.', warnQuote: 'The note says: “{w}”', warnUnknown: 'I don’t know the exact reason. Say “add {what}” and I’ll try again.', warnNoneShort: 'There’s no warning on this plan right now.', warnAbout: 'The line about {word} food means this:',
    warnMissing: 'The plan says it could not include {what}.', warnKindHas: 'That line was wrong: your plan has {what}: {list}.', warnMore: 'Other notes on this plan: {rest}', is: 'is', are: 'are',
    allergy: 'I can’t confirm that. Listings only carry badges such as Gluten-Free-Friendly; they don’t list allergens or how food is prepared, so tell the restaurant about the allergy when you book.',
    warnPrinted: 'Here’s what the plan notes: {lines}', evSuggest: 'One that is listed: {name} ({date}). It isn’t on your plan until you pick dates.', evNone: 'There’s no event on your plan right now.', evWhy: '{name}{at} is there because you asked for {asked}, and it’s a What’s On listing for {cat}{date}.', evWhyBare: 'I don’t know exactly why the planner chose {name}{at}; it’s a What’s On listing{date}. Say “remove the event” and I’ll take it out.',
    evNoDates: 'You haven’t given dates, so tell me when you’re coming and I’ll check what’s on then.', evOn: ' on {date}', evAt: ' at {place}',
    cats: { 'live-music': 'live music', festival: 'a festival', market: 'a market', hockey: 'a hockey game', comedy: 'comedy', 'sports-recreation': 'sports', 'arts-culture': 'arts and culture', family: 'family events', 'food-drink': 'food and drink' }, catEvent: 'an event',
    cntAsked: 'You asked for {n} {plural}, so the plan has {m}: {list}.', cntMore: 'You asked for {n} {plural}, but the plan has {m}: {list}. Say “remove {last}” and I’ll take one out.', cntFewer: 'You asked for {n} {plural}, but the plan has only {m}: {list}. I don’t know why the planner found no more; say “add another {what}” and I’ll try.',
    cntNoNum: 'Your request asked for {plural} without a number; the plan has {m}: {list}.', cntNotAsked: 'Your request didn’t ask for {plural}; the planner added {list}, and I don’t know more than that. Say “remove {last}” if you’d rather not.', cntNone: 'There’s no {what} in your plan. Say “add {add}” if you’d like one.',
    onDay: '{name} on day {d}', num: ['no', 'one', 'two', 'three', 'four', 'five', 'six'],
    unknownQ: 'I’m not sure what that question is about. I can explain a stop (“why this restaurant?”), a note on the plan (“what does the warning mean?”) or what I last changed.',
    full: 'Day {d} has no free spot for another {what}.', fullSwap: 'I can swap {name}{at} for {a}', fullOther: 'add one on day {d} at {time}', fullOr: ', or ', fullWhich: '. Which?', fullWhichF: '. Which?', fullOne: '. Shall I?', fullI: 'I can ', fullNone: 'Every other stop that day is a meal or one you kept, and the other days are full too, so I left the plan as it is.',
    saySwap: 'swap {name} for {a}', sayOther: 'add another {what} on day {d}', sayFeat: 'swap {names} for {word} places',
  },
  fr: {
    wrong: 'Cette ligne était fausse : {line}', partly: 'Cette ligne n’était qu’en partie juste : {line}', stands: 'Voici sur quoi elle reposait : {line}',
    noteAbout: 'Elle concerne {names}, qui {v} le badge.', names: 'Ce sont {names}.', noteQuote: 'Elle venait de la note du planificateur « {w} », qui concerne {names} : {v} le badge.', noteQuoteBare: 'Elle venait de la note du planificateur « {w} »', dont: 'ils n’ont pas', doesnt: 'il n’a pas',
    warnNone: 'Il n’y a aucun avertissement sur ce plan en ce moment. Tout ce que vous avez demandé et que je peux vérifier y est.', warnQuote: 'La note dit : « {w} »', warnUnknown: 'Je n’en connais pas la raison exacte. Dites « ajoute {what} » et j’essaie encore.', warnNoneShort: 'Il n’y a aucun avertissement sur ce plan en ce moment.', warnAbout: 'La ligne sur les options {word} veut dire ceci :',
    warnMissing: 'Le plan dit qu’il n’a pas pu inclure {what}.', warnKindHas: 'Cette ligne était fausse : votre plan a {what} : {list}.', warnMore: 'Autres notes du plan : {rest}', is: '', are: '',
    allergy: 'Je ne peux pas le confirmer. Les fiches n’ont que des badges comme « Sans gluten »; elles n’indiquent ni les allergènes ni la préparation, alors parlez de l’allergie au restaurant en réservant.',
    warnPrinted: 'Voici ce que le plan indique : {lines}', evSuggest: 'Un événement à l’affiche : {name} ({date}). Il n’est pas dans votre plan tant que vous n’avez pas choisi de dates.', evNone: 'Il n’y a aucun événement dans votre plan en ce moment.', evWhy: '{name}{at} est là parce que vous avez demandé {asked}, et c’est une fiche Quoi faire pour {cat}{date}.', evWhyBare: 'Je ne sais pas exactement pourquoi le planificateur a choisi {name}{at}; c’est une fiche Quoi faire{date}. Dites « enlève l’événement » et je le retire.',
    evNoDates: 'Vous n’avez pas donné de dates; dites-moi quand vous venez et je vérifie ce qu’il y a à ce moment-là.', evOn: ' le {date}', evAt: ' ({place})',
    cats: { 'live-music': 'de la musique en direct', festival: 'un festival', market: 'un marché', hockey: 'un match de hockey', comedy: 'de l’humour', 'sports-recreation': 'du sport', 'arts-culture': 'des arts et de la culture', family: 'des événements en famille', 'food-drink': 'de la gastronomie' }, catEvent: 'un événement',
    cntAsked: 'Vous avez demandé {n} {plural}, donc le plan en a {m} : {list}.', cntMore: 'Vous avez demandé {n} {plural}, mais le plan en a {m} : {list}. Dites « enlève {last} » et j’en retire un.', cntFewer: 'Vous avez demandé {n} {plural}, mais le plan n’en a que {m} : {list}. Je ne sais pas pourquoi le planificateur n’en a pas trouvé plus; dites « ajoute {another} » et j’essaie.',
    cntNoNum: 'Votre demande parlait de {plural} sans nombre; le plan en a {m} : {list}.', cntNotAsked: 'Votre demande ne parlait pas de {plural}; le planificateur a ajouté {list}, et je n’en sais pas plus. Dites « enlève {last} » si vous préférez.', cntNone: 'Il n’y a pas de {what} dans votre plan. Dites « ajoute {add} » si vous en voulez.',
    onDay: '{name} au jour {d}', num: ['aucun', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six'],
    unknownQ: 'Je ne suis pas sûr de comprendre la question. Je peux expliquer un arrêt (« pourquoi ce restaurant? »), une note du plan (« que veut dire l’avertissement? ») ou mon dernier changement.',
    full: 'Le jour {d} n’a pas de place libre pour {another}.', fullSwap: 'Je peux remplacer {name}{at} par {a}', fullOther: 'en ajouter {un} au jour {d} à {time}', fullOr: ', ou ', fullWhich: '. Lequel?', fullWhichF: '. Laquelle?', fullOne: '. Je le fais?', fullI: 'Je peux ', fullNone: 'Les autres arrêts de ce jour sont des repas ou des arrêts que vous avez gardés, et les autres jours sont pleins aussi, donc je n’ai rien changé.',
    saySwap: 'remplace {name} par {a}', sayOther: 'ajoute {another} au jour {d}', sayFeat: 'remplace {names} par des endroits {word}',
  },
};
const fillT = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
const DRINK_FOOD_TYPES = ['restaurant', 'cafe', 'pub', 'brewery', 'winery', 'cidery', 'distillery', 'cocktail'];
const EVENT_ASK_RES = { 'live-music': /\b(?:live music|music|concerts?|bands?|musique|gigs?)\b/, festival: /\bfestivals?\b/, market: /\b(?:markets?|marches?)\b/, hockey: /\b(?:hockey|rockets|games?|match)\b/, comedy: /\b(?:comedy|humour|stand[- ]up)\b/, 'sports-recreation': /\b(?:sports?|games?|match)\b/ };
const ANY_EVENT_RE = /\b(?:events?|what'?s on|shows?|things happening|evenements?|spectacles?)\b/;

// What the request text asked for by number ("two wineries"): the number before the kind's own words, or 0.
const NUMS = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, 'a couple of': 2, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5 };
function countAsked(reqFolded, kindRe) {
  if (!kindRe) return { asked: false, n: 0 };
  const hit = kindRe.exec(reqFolded);
  if (!hit) return { asked: false, n: 0 };
  const m = /\b(one|two|three|four|five|six|\d|a couple of|un|une|deux|trois|quatre|cinq)\s+(?:\w+\s+)?$/.exec(reqFolded.slice(0, hit.index));
  return { asked: true, n: m ? (NUMS[m[1]] || Number(m[1]) || 0) : 0, word: m ? m[1] : null, at: m ? m.index : -1 };
}
// "two wineries" in the request becomes "three wineries" when the visitor adds one more (the planner's trip-total cap
// reads that number). -> the new text, or null when the request names no number or already allows it.
function raiseCountText(text, kindRe, total, fold) {
  const f = fold(text);
  if (f.length !== String(text).length) return null;
  const c = countAsked(f, kindRe);
  if (!c.asked || !c.n || c.n >= total || c.at < 0 || total > 6) return null;
  const fr = /^(?:un|une|deux|trois|quatre|cinq)$/.test(c.word);
  const word = (fr ? TX.fr.num : TX.en.num)[total];
  return `${String(text).slice(0, c.at)}${word}${String(text).slice(c.at + c.word.length)}`;
}

// facts: { stops, request, evidence (plan.evidence or null), warnings: [text], missing: [{ label, kind, value }],
// events: [{ name, place, categories, date }], dated, kindRe(kind), kindMatches, KINDS, plural(kind, L), joinList, fold,
// clock, legacy(op) } -> { reply, note, offer: [{ say }] }
function answer(op, facts, lang) {
  const L = lang === 'fr' ? 'fr' : 'en';
  const t = TX[L];
  const stops = facts.stops || [];
  const join = (a) => facts.joinList(a, L);
  const gf = (feature) => tripEvidenceFor(feature, stops, facts.evidence || null, L);
  const offerOf = (ev) => (ev && ev.status === 'partial' && ev.offer.length ? [{ say: fillT(t.sayFeat, { names: join(ev.offer), word: ev.word }) }] : []);
  // The plan's own note about that feature ("Not every stop is listed as gluten-free friendly."), quoted, with the
  // food and drink stops it is about (the ones without the badge).
  const noteFor = (feature, ev) => {
    const w = (facts.warnings || []).find((x) => FEAT_RES[feature].test(facts.fold(x)));
    if (!w) return '';
    const hasIds = new Set(ev.has.map((s) => s.id));
    const lacking = stops.filter((s) => DRINK_FOOD_TYPES.includes(s.type) && !(s.feats || []).includes(feature) && !hasIds.has(s.id));
    return lacking.length && ev.source === 'badges' ? fillT(t.noteQuote, { w: w.replace(/[“”]/g, '"'), names: join(lacking.slice(0, 4).map((s) => s.name)), v: lacking.length === 1 ? t.doesnt : t.dont }) : fillT(t.noteQuoteBare, { w });
  };
  if (op.value === 'q_evidence' || (op.value === 'q_allergy' && op.feature)) {
    const ev = gf(op.feature);
    if (!ev) return { reply: t.unknownQ };
    const list = (op.which || op.value === 'q_allergy') && ev.has.length && ev.status !== 'partial' ? ` ${fillT(t.names, { names: join(ev.has.slice(0, 8).map((s) => s.name)) })}` : '';
    return { reply: `${op.value === 'q_allergy' ? `${t.allergy} ` : ''}${ev.line}${list}`, note: ev.caveat, noteKey: op.feature, offer: offerOf(ev) };
  }
  if (op.value === 'q_allergy') return { reply: t.allergy };
  if (op.value === 'q_warning') {
    const missing = facts.missing || [];
    if (op.feature) {
      const ev = gf(op.feature);
      const lead = ev.status === 'verified' ? t.wrong : ev.status === 'partial' ? t.partly : t.stands;
      const named = ev.status === 'verified' && ev.has.length > 1 ? ` ${fillT(t.names, { names: join(ev.has.slice(0, 8).map((s) => s.name)) })}` : '';
      const lineLc = ev.line.charAt(0).toLowerCase() + ev.line.slice(1);
      const said = ev.own ? `${lead.replace(/\s*:\s*\{line\}$/, '.')} ${ev.line}` : fillT(lead, { line: lineLc }) + named;
      return { reply: [said, noteFor(op.feature, ev)].filter(Boolean).join(' '), note: ev.caveat, noteKey: op.feature, offer: offerOf(ev) };
    }
    if (op.kind && facts.KINDS[op.kind]) {
      const on = stops.filter((s) => facts.kindMatches(op.kind, s));
      if (on.length) return { reply: fillT(t.warnKindHas, { what: facts.KINDS[op.kind][L], list: join(on.slice(0, 4).map((s) => fillT(t.onDay, { name: s.name, d: s.day }))) }) };
      return { reply: facts.legacy({ value: 'q_why_not', kind: op.kind }) };
    }
    // "what does the warning mean?": only what the page itself shows (the agent's first line): a diet asked for, said from
    // the evidence, and a kind of place the plan could not include. Notes the visitor never saw are not quoted.
    const feats = [...new Set(missing.filter((m) => m.kind === 'feature' && FEAT_RES[m.value]).map((m) => m.value))];
    for (const e of facts.evidence || []) if (e && FEAT_RES[e.ask] && !feats.includes(e.ask)) feats.push(e.ask);
    for (const f of Object.keys(FEAT_RES)) if (!feats.includes(f) && (facts.warnings || []).some((w) => FEAT_RES[f].test(facts.fold(w)))) feats.push(f);
    // The planner's own lines (plan.evidence entries the page prints, and the ones it could not meet), as written.
    const printed = (facts.evidence || []).filter((e) => e && typeof e.text === 'string' && e.text && (e.line === true || e.status === 'unmet') && !FEAT_RES[e.ask]).slice(0, 2).map((e) => (L === 'fr' && e.textFr ? e.textFr : e.text));
    if (printed.length) { const ev0 = feats.length ? gf(feats[0]) : null; return { reply: [fillT(t.warnPrinted, { lines: printed.join(' ') }), ev0 && ev0.status !== 'verified' ? ev0.line : ''].filter(Boolean).join(' '), ...(ev0 && ev0.status !== 'verified' ? { note: ev0.caveat, noteKey: feats[0], offer: offerOf(ev0) } : {}) }; }
    const kindMiss = missing.find((m) => m.kind !== 'feature' && m.label);
    const missLine = kindMiss ? fillT(t.warnMissing, { what: kindMiss.label }) + ' ' + fillT(t.warnUnknown, { what: kindMiss.label }) : '';
    if (feats.length) {
      const ev = gf(feats[0]);
      const head = ev.status === 'verified' ? (kindMiss ? '' : t.warnNoneShort) : fillT(t.warnAbout, { word: ev.word });
      return { reply: [missLine, head, ev.line].filter(Boolean).join(' '), note: ev.caveat, noteKey: feats[0], offer: offerOf(ev) };
    }
    return { reply: missLine || t.warnNone };
  }
  if (op.value === 'q_why_event') {
    const evs = facts.events || [];
    // The planner's own word on events and live music (plan.evidence), and the dated suggestions it holds back until
    // the visitor picks dates.
    const evLine = (facts.evidence || []).find((e) => e && ['live_music', 'event'].includes(e.ask) && typeof e.text === 'string' && e.text);
    if (!evs.length && evLine) { const sg = (facts.suggestions || [])[0]; return { reply: [L === 'fr' && evLine.textFr ? evLine.textFr : evLine.text, sg && sg.name ? fillT(t.evSuggest, { name: sg.name, date: (L === 'fr' && sg.dateLabelFr) || sg.dateLabel || '' }) : ''].filter(Boolean).join(' ') }; }
    if (!evs.length) return { reply: t.evNone };
    const req = facts.fold(facts.request || '');
    const out = evs.slice(0, 2).map((e) => {
      const cat = (e.categories || []).find((c) => EVENT_ASK_RES[c] && EVENT_ASK_RES[c].test(req)) || (ANY_EVENT_RE.test(req) ? (e.categories || [])[0] || 'event' : null);
      const at = e.place ? fillT(t.evAt, { place: e.place }) : '';
      const date = e.dateLabel ? fillT(t.evOn, { date: e.dateLabel }) : '';
      const catW = cat ? (t.cats[cat] || t.catEvent) : '';
      return cat ? fillT(t.evWhy, { name: e.name, at, asked: catW, cat: catW, date }) : fillT(t.evWhyBare, { name: e.name, at, date });
    });
    if (!facts.dated) out.push(t.evNoDates);
    return { reply: out.join(' ') };
  }
  if (op.value === 'q_why_count') {
    const k = facts.KINDS[op.kind];
    if (!k) return { reply: t.unknownQ };
    const on = stops.filter((s) => facts.kindMatches(op.kind, s));
    const plural = facts.plural(op.kind, L), what = facts.noun(op.kind, L);
    if (!on.length) return { reply: fillT(t.cntNone, { what, add: k[L] }) };
    const c = countAsked(facts.fold(facts.request || ''), facts.kindRe(op.kind));
    const list = join(on.slice(0, 5).map((s) => fillT(t.onDay, { name: s.name, d: s.day })));
    const v = { n: c.n ? (t.num[c.n] || c.n) : '', m: t.num[on.length] || on.length, plural, list, last: on[on.length - 1].name, what, another: L === 'fr' ? `${/^une\b/i.test(k.fr) ? 'une' : 'un'} autre ${what}` : `another ${what}` };
    if (!c.asked) return { reply: fillT(t.cntNotAsked, v) };
    if (!c.n) return { reply: fillT(t.cntNoNum, v) };
    return { reply: fillT(on.length === c.n ? t.cntAsked : on.length > c.n ? t.cntMore : t.cntFewer, v) };
  }
  return { reply: t.unknownQ };
}

// "Day 2 has no free spot for another winery. I can swap Mill Creek Regional Park (10:15 AM) for a winery, or add one
// on day 3 at 1:15 PM. Which?" full: { day, kind, swap: stop | null, other: { day, start } | null }. -> { reply, offer }
function fullReply(full, h, lang) {
  const L = lang === 'fr' ? 'fr' : 'en';
  const t = TX[L];
  const what = h.noun(full.kind, L), a = h.KINDS[full.kind][L], fem = L === 'fr' && /^une\b/i.test(a), another = L === 'fr' ? `${fem ? 'une' : 'un'} autre ${what}` : `another ${what}`;
  const head = fillT(t.full, { d: full.day, what, another });
  const offer = [], bits = [];
  if (full.swap) { bits.push(fillT(t.fullSwap, { name: full.swap.name, at: Number.isInteger(full.swap.start) ? ` (${h.clock(full.swap.start, L)})` : '', a })); offer.push({ say: fillT(t.saySwap, { name: full.swap.name, a }), words: [full.swap.name] }); }
  if (full.other) { bits.push((bits.length ? '' : t.fullI) + fillT(t.fullOther, { d: full.other.day, time: h.clock(full.other.start, L), un: fem ? 'une' : 'un' })); offer.push({ say: fillT(t.sayOther, { what, another, d: full.other.day }), day: full.other.day }); }
  if (!bits.length) return { reply: `${head} ${t.fullNone}`, offer: [] };
  return { reply: `${head} ${bits.join(t.fullOr)}${bits.length > 1 ? (fem ? t.fullWhichF : t.fullWhich) : t.fullOne}`, offer };
}
// The visitor's answer to an offer ("the first one", "day 3", "swap the park", "yes" when there is one choice): the
// offered message it stands for, or null (the answer is then read as any other message).
function pickOffer(message, offers, fold) {
  const t = fold(String(message || '')).replace(/\s+/g, ' ').trim();
  const list = (offers || []).filter((o) => typeof o === 'string' && o);
  if (!t || !list.length || t.length > 80) return null;
  if (/^(?:no|nope|non|never mind|leave it|neither|aucun|laisse|rien)\b/.test(t)) return null;
  const yes = /^(?:yes|yep|yeah|sure|ok|okay|please|do it|go ahead|oui|d'accord|vas-y|allez-y)\b/.test(t);
  const dayM = /\b(?:day|jour)\s*(\d)\b/.exec(t);
  if (dayM) { const hit = list.find((o) => new RegExp(`\\b(?:day|jour)\\s*${dayM[1]}\\b`).test(fold(o))); if (hit) return hit; }
  if (/\b(?:second|2nd|latter|last|other day|deuxieme|dernier|l'autre jour)\b/.test(t) && list.length > 1) return list[1];
  if (/\b(?:first|1st|former|swap|replace|premier|remplace[rz]?|echange[rz]?)\b/.test(t)) return list[0];
  if (/\b(?:those|them|both|it|that|these|ceux|les deux|celui)\b/.test(t) && list.length === 1) return list[0];
  // A word of a place named in an offer ("the park", "Mill Creek").
  const words = t.split(/[^a-z0-9']+/).filter((w) => w.length >= 4 && !/^(?:swap|replace|with|pour|that|this|then|please|winery|brewery|sure)$/.test(w));
  const byWord = list.filter((o) => words.some((w) => fold(o).split(/[^a-z0-9']+/).includes(w)));
  if (byWord.length === 1) return byWord[0];
  if (yes && list.length === 1) return list[0];
  return null;
}

module.exports = { tripEvidenceFor, explainRules, isExplainQuestion, answer, fullReply, pickOffer, raiseCountText, countAsked, featureIn, FEAT_RES, TX };
