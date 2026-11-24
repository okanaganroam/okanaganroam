'use strict';
// Build My Trip chat (2026-11-24, Dayton's report at 390px). On a Peachland plan whose summary said "There's no guided
// boat tour listed in Peachland… The nearest is Luxury Lake Tours in Kelowna":
//   "Can you add the guided boat tour in Kelowna you suggested? Keep all the other stops and avoid wineries."
//     answered that no guided boat tour was listed (the summary had just named one), and
//   "Please add Luxury Lake Tours in Kelowna to our trip."
//     moved the trip to Kelowna, changed five stops, added other operators and said "I couldn't do one other thing".
// The causes were all in how the words were read: "in Kelowna" was read as a new base town, "Luxury" as "fancier
// meals", and the listing's own name was never looked up.
//
// Here: the word rules for ONE stop to add that the message identifies itself --
//   a listing by its own name                      "add Luxury Lake Tours in Kelowna"
//   the place the plan itself suggested            "add the one you suggested", "that tour", "the nearest one"
//   a kind of place in a town the trip is not in   "add a guided boat tour in Kelowna"
//   a town the trip is not in, and nothing else    "add something in Kelowna"  (asked: what?)
// A town said this way says where the PLACE is. It never moves the trip: only words that say so do ("change the trip
// to Kelowna", "base us in Kelowna"), and those are left to the rules that were already there.
// No database and no network here: the server gives the listings' names (index) and what the plan suggested.
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, "'");

const ADD_RE = /\b(?:add|adding|include|put|fit in|squeeze in|work in|ajoute[rz]?|ajoutons|inclure|incluez|inclus|mets|mettez|mettre)\b/;
// A place asked for without "add": "can we do…", "we'd love…". Only ever read beside a listing's own name.
const WANT_RE = /\b(?:can we (?:do|go|visit|try)|could we (?:do|go|visit|try)|we(?:'d| would) (?:like|love)|we want|i want|i(?:'d| would) (?:like|love)|let'?s (?:do|go|visit|try)|on (?:veut|aimerait)|nous (?:voulons|aimerions)|j'aimerais)\b/;
const EDIT_RE = /\b(?:swap|replace|switch|remove|take (?:out|off)|drop|skip|delete|get rid of|instead of|remplace[rz]?|enleve[rz]?|retire[rz]?|supprime[rz]?|a la place de)\b/;
// Words that really ask for the trip itself to go somewhere else.
const MOVE_RE = /\b(?:change|move|switch|shift|relocate|deplace[rz]?|change[rz]?|deplacons)\b[^.?!]{0,40}\b(?:trip|plan|base|everything|itinerary|vacation|holiday|getaway|voyage|sejour|tout)\s+(?:to|into|over to|a|au|aux|vers|en|pour)\s+(?!include\b|add\b|have\b|fit\b|inclure\b|ajouter\b)|\bbase (?:us|me|the trip|it|ourselves)\b|\bbased (?:in|out of)\b|\bre-?plan\b|\bplan (?:it|everything|the (?:whole |entire )?trip) (?:in|for|around)\b|\b(?:make|turn) (?:it|this) (?:a|an|into)\b[^.?!]{0,30}\btrip\b/;
// A meal asked for in a town ("add dinner in Kelowna") is the usual rules' to read.
const MEAL_RE = /\b(?:dinner|supper|lunch|brunch|breakfast|meal|bite|eat|food|drinks?|souper|diner|dejeuner|repas|manger)\b/;
const STAY_RE = /\b(?:hotels?|motels?|place to stay|somewhere to stay|lodging|accommodations?|airbnb|cabins?|condos?|rooms?|logement|hebergement|chambres?)\b/;
const NIGHT_RE = /\b(?:a|an|one|another|extra|more|une?|autre)\s+(?:more\s+|extra\s+)?(?:nights?|days?|nuits?|jours?|journees?)\b/;
// The place the plan (or the chat) itself named.
const SAID_RE = /\b(?:you|u)(?:'ve| have| had)?(?: just| already)? (?:suggest(?:ed)?|recommend(?:ed)?|mention(?:ed)?|named|proposed|offered|found|listed|said)\b|\b(?:your|the) (?:suggest(?:ed|ion)|recommend(?:ed|ation))\b|\b(?:from|in) (?:the|your) summary\b|\bque (?:tu as|vous avez|t'as) (?:suggere|propose|mentionne|recommande|nomme)e?s?\b|\b(?:ta|votre|la) (?:suggestion|recommandation)\b|\b(?:suggere|propose|recommande)e?s? (?:plus haut|ci-dessus)\b/;
const NEAR_RE = /\b(?:the |that )?(?:nearest|closest)\b|\bl[ea] plus proche\b/;
const THAT_RE = /\bthat (?:one|tour|cruise|boat tour|boat cruise|place|spot|option|operator|activity)\b|\b(?:add|include|put) (?:it|that|this)\b|\bcet(?:te)? (?:excursion|croisiere|endroit|activite|option)\b|\b(?:celui|celle)-la\b|\b(?:ajoute[rz]?|mets|mettez)[- ]l[ea]\b/;

// ---------- Listings by their own names ----------
// Words that are not a name by themselves ("Lake View", "Wine Tours"): a listing whose whole name is such words is
// never matched (the kind rules read those words).
const GENERIC = new Set(('a an the of in at on to and our my your for with by de du des la le les au aux et wine tour boat rental lake beach park cafe coffee bar grill restaurant kitchen pub hotel spa market trail'
  + ' golf club winery brewery view patio dinner lunch brunch breakfast cruise day trip plan stop guided sunset farm garden museum gallery shop store house place center centre downtown valley mountain river creek'
  + ' north south east west big little old new food drink tasting room experience adventure company co inc ltd').split(' '));
const stem = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
// -> [{ w, at, end }]: the words of a folded text, each with where it sits.
function words(t) {
  const out = [];
  const re = /[a-z0-9]+(?:'[a-z]+)?/g;
  let m;
  while ((m = re.exec(t))) { const w = stem(m[0].replace(/'s?$/, '').replace(/'/g, '')); if (w && w !== 'and') out.push({ w, at: m.index, end: m.index + m[0].length }); }
  return out;
}
const keyOf = (name) => { const k = words(fold(name)).map((x) => x.w); return k[0] === 'the' ? k.slice(1) : k; };
// rows: [{ id, name, region, type }] -> an index for namesIn. regionLabels: so a town's own name is never a listing's.
function buildIndex(rows, regionLabels = {}) {
  const generic = new Set(GENERIC), towns = new Set();
  for (const l of Object.values(regionLabels || {})) { towns.add(keyOf(l).join(' ')); for (const w of keyOf(l)) generic.add(w); }
  const byFirst = new Map();
  for (const r of rows || []) {
    if (!r || !r.name) continue;
    const full = String(r.name);
    const names = [full, full.replace(/\s*\([^)]*\)\s*/g, ' '), full.split(/\s+[-–—|:]\s+/)[0]];
    const seen = new Set();
    for (const n of names) {
      const k = keyOf(n);
      const sig = k.join(' ');
      if (!k.length || seen.has(sig)) continue;
      seen.add(sig);
      // Plain words only ("Lake View", "Wine Tours") or a town's own name: not a name to match. A town with other
      // words is one ("Kelowna Cruises").
      if (towns.has(sig) || k.every((w) => GENERIC.has(w)) || (k.length < 2 && generic.has(k[0]))) continue;
      if (k.length < 2 && (k[0].length < 7 || generic.has(k[0]))) continue;
      if (!byFirst.has(k[0])) byFirst.set(k[0], []);
      byFirst.get(k[0]).push({ k, row: { id: r.id, name: full, region: r.region, type: r.type } });
    }
  }
  return { byFirst };
}
// The listings a folded text names, longest name first. -> [{ at, end, n, rows: [{ id, name, region, type }] }]
function namesIn(t, index) {
  if (!index || !index.byFirst) return [];
  const ws = words(t);
  const hits = [];
  for (let i = 0; i < ws.length; i++) {
    // ("the" opens no name: a listing's own leading "The" is dropped from its key.)
    for (const c of index.byFirst.get(ws[i].w) || []) {
      if (i + c.k.length > ws.length) continue;
      let ok = true;
      for (let j = 1; j < c.k.length; j++) if (ws[i + j].w !== c.k[j]) { ok = false; break; }
      if (ok) hits.push({ i, n: c.k.length, at: ws[i].at, end: ws[i + c.k.length - 1].end, row: c.row });
    }
  }
  // A name inside a longer one that also matched is not a second place ("Lake Tours" inside "Luxury Lake Tours").
  const top = hits.filter((h) => !hits.some((o) => o !== h && o.n > h.n && o.i <= h.i && o.i + o.n >= h.i + h.n));
  const spans = [];
  for (const h of top) {
    let s = spans.find((x) => x.at === h.at && x.end === h.end);
    if (!s) { s = { at: h.at, end: h.end, n: h.n, rows: [] }; spans.push(s); }
    if (!s.rows.some((r) => r.id === h.row.id)) s.rows.push(h.row);
  }
  return spans.sort((a, b) => b.n - a.n || a.at - b.at);
}

// ---------- Towns ----------
// The towns a folded text names as where something is ("in Kelowna", "near Penticton", "…, Kelowna").
function townsIn(t, regions, regionLabels) {
  const out = [];
  for (const r of regions || []) {
    const label = fold(regionLabels[r] || r).replace(/[^a-z0-9 ]/g, '.');
    if (!label) continue;
    const m = new RegExp(`(?:\\b(?:in|at|near|around|from|by|a|au|en|dans|pres de|vers)\\s+(?:the\\s+|downtown\\s+)?|,\\s*)${label}\\b`).exec(t);
    if (m) out.push({ region: r, at: m.index, end: m.index + m[0].length });
  }
  // The longest label at a place wins ("West Kelowna" is not also "Kelowna").
  return out.filter((x) => !out.some((o) => o !== x && o.at <= x.at && o.end >= x.end && (o.end - o.at) > (x.end - x.at))).sort((a, b) => a.at - b.at);
}
// The towns a message names only to say where a listing it names is ("Luxury Lake Tours in Kelowna"): never a new
// base for the trip, whatever else the message asks.
function locatingTowns(message, ctx = {}) {
  const t = fold(message).replace(/\s+/g, ' ').trim();
  if (!ctx.index || MOVE_RE.test(t)) return [];
  const names = namesIn(t, ctx.index);
  if (!names.length) return [];
  return townsIn(t, ctx.regions, ctx.regionLabels || {}).filter((w) => names.some((n) => w.at >= n.end && w.at - n.end <= 3 && n.rows.some((r) => r.region === w.region))).map((w) => w.region);
}

// A name the visitor typed that is no listing: "add Fancy Boat Co in Kelowna" -> "Fancy Boat Co".
function typedName(raw) {
  const W = "[\\p{Lu}][\\p{L}\\p{N}'’&.+-]*";
  const m = new RegExp(`(?:^|[^\\p{L}])(?:[Aa]dd|[Ii]nclude|[Pp]ut|[Aa]joute[rz]?|[Ii]nclure|[Mm]ets)\\s+(?:the\\s+|le\\s+|la\\s+)?(${W}(?:\\s+(?:${W}|of|the|and|&|de|du|des|la|le|les|\\+))*\\s+${W})`, 'u').exec(String(raw || ''));
  if (!m) return null;
  const name = m[1].replace(/[.,;!?]+$/, '').trim();
  return name.length >= 4 && name.length <= 60 ? name : null;
}

const DAY_WORDS = [[/\b(?:first|1st|premier|premiere)\s+(?:day|jour|journee)\b/, 1], [/\b(?:second|2nd|deuxieme)\s+(?:day|jour|journee)\b/, 2], [/\b(?:third|3rd|troisieme)\s+(?:day|jour|journee)\b/, 3]];
function whenIn(t, { days = 1, weekdays = {} } = {}) {
  const dm = /\b(?:day|jour)\s*(\d)\b/.exec(t);
  let day = dm ? Number(dm[1]) : null;
  if (!day) for (const [re, d] of DAY_WORDS) if (re.test(t)) { day = d; break; }
  if (!day && /\b(?:last|dernier|derniere)\s+(?:day|jour|journee)\b/.test(t)) day = days;
  if (!day && Object.keys(weekdays || {}).length) { const wm = new RegExp(`\\b(${Object.keys(weekdays).join('|')})s?\\b`).exec(t); if (wm) day = weekdays[wm[1]]; }
  if (day && (day < 1 || day > days)) day = null;
  const time = /\b(?:morning|matin|matinee)\b/.test(t) ? 'morning' : /\b(?:afternoon|apres-midi)\b/.test(t) ? 'afternoon' : /\b(?:evening|tonight|soir|soiree)\b/.test(t) ? 'evening' : /\b(?:lunch|diner|dejeuner|midi)\b/.test(t) ? 'midday' : null;
  return { day: day || null, time };
}

// One message (or one part of it). ctx:
//   index                 buildIndex(...) of the listings; without it no name is read
//   regions, regionLabels the towns of this site
//   tripRegions           the towns the trip is already in (its stops and its stay)
//   stops                 the stops on screen ({ id })
//   suggested             () => [{ kind, id, region }]: what the plan on screen itself suggested (its "The nearest is…")
//   kindsNamed            (t) => [kind]: the chat's own kinds of place, by its own words
//   canList               (kind) => true when the listings of that kind can be told (never a meal: "dinner in Kelowna")
//   days, weekdays
// -> null (not one of these: the usual rules read it), or
//    { toId } | { which: [ids] } | { ref: 'suggested', toId } | { ref: 'none' } | { kind, region } | { said, region?, kind? } | { region }
//    each with { day, time } when the message gives them.
function read(message, ctx = {}) {
  const raw = String(message || '').replace(/\s+/g, ' ').trim();
  const t = fold(raw);
  if (!t || !ctx.index) return null;
  const adding = ADD_RE.test(t);
  if ((!adding && !WANT_RE.test(t)) || EDIT_RE.test(t) || MOVE_RE.test(t) || NIGHT_RE.test(t)) return null;
  const when = whenIn(t, ctx);
  const onPlan = new Set((ctx.stops || []).map((s) => s.id));
  const trip = new Set(ctx.tripRegions || []);
  const towns = townsIn(t, ctx.regions, ctx.regionLabels || {});
  // 1. A listing by its own name. A town said with it tells two of the same name apart.
  // A listing named as where something else goes ("add a coffee stop before Stairway to Heaven Trail", "dinner near
  // Luxury Lake Tours") is not the thing to add: the usual rules read that message.
  const ANCHOR_RE = /\b(?:after|before|near|next to|beside|close to|around|by|apres|avant|pres de|a cote de)\s+(?:the\s+|le\s+|la\s+|l')?$/;
  const allNames = namesIn(t, ctx.index);
  if (allNames.some((n) => ANCHOR_RE.test(t.slice(0, n.at)))) return null;
  const names = allNames;
  if (names.length) {
    const n = names[0];
    const inTown = n.rows.filter((r) => towns.some((w) => w.region === r.region));
    const inTrip = n.rows.filter((r) => trip.has(r.region));
    const rows = inTown.length ? inTown : n.rows.length > 1 && inTrip.length ? inTrip : n.rows;
    // (A question about a stop already on the plan -- "can we do Luxury Lake Tours earlier?" -- is the usual rules'.)
    if (!adding && rows.some((r) => onPlan.has(r.id))) return null;
    return rows.length === 1 ? { toId: rows[0].id, ...when } : { which: rows.slice(0, 3).map((r) => r.id), ...when };
  }
  if (!adding) return null;
  if (STAY_RE.test(t)) return null;
  const kinds = typeof ctx.kindsNamed === 'function' ? ctx.kindsNamed(t) : [];
  const listable = kinds.filter((k) => typeof ctx.canList !== 'function' || ctx.canList(k));
  const far = towns.filter((w) => !trip.has(w.region));
  // 2. The place the plan itself suggested.
  const said = SAID_RE.test(t), near = NEAR_RE.test(t), that = THAT_RE.test(t);
  if (said || near || that) {
    let sug = [];
    try { sug = (typeof ctx.suggested === 'function' ? ctx.suggested() : []) || []; } catch (e) { sug = []; }
    sug = sug.filter((s) => s && !onPlan.has(s.id));
    let pick = sug;
    if (pick.length > 1 && towns.length) { const p = pick.filter((s) => towns.some((w) => w.region === s.region)); if (p.length) pick = p; }
    if (pick.length > 1 && kinds.length) { const p = pick.filter((s) => kinds.includes(s.kind) || (s.chatKinds || []).some((k) => kinds.includes(k))); if (p.length) pick = p; }
    // A town or a kind the message names that the suggestion is not: not that suggestion.
    if (pick.length === 1 && far.length && !far.some((w) => w.region === pick[0].region)) pick = [];
    if (pick.length === 1) return { ref: 'suggested', toId: pick[0].id, ...when };
    if (pick.length > 1) return { ref: 'suggested', which: pick.slice(0, 3).map((s) => s.id), ...when };
    if (said && !listable.length) return { ref: 'none', ...when };
  }
  // 3. A kind of place in a town the trip is not in.
  if (listable.length && far.length) return { kind: listable[0], region: far[0].region, ...(said || near || that ? { the: true } : {}), ...when };
  // 4. A name that is no listing of ours.
  const typed = typedName(raw);
  if (typed) {
    const tk = keyOf(typed);
    const isTown = (ctx.regions || []).some((r) => fold((ctx.regionLabels || {})[r] || r) === fold(typed));
    const nameKinds = typeof ctx.kindsNamed === 'function' ? ctx.kindsNamed(fold(typed)) : [];
    const plain = tk.every((w) => GENERIC.has(w)) || (!far.length && nameKinds.length > 0);
    if (!isTown && !plain) return { said: typed, ...(towns.length ? { region: towns[0].region } : {}), ...(nameKinds.filter((k) => typeof ctx.canList !== 'function' || ctx.canList(k))[0] ? { kind: nameKinds.filter((k) => typeof ctx.canList !== 'function' || ctx.canList(k))[0] } : {}), ...when };
  }
  // 5. A town the trip is not in and nothing to add named: asked, never a move. (A meal there is the usual rules'.)
  if (far.length && !kinds.length && !MEAL_RE.test(t)) {
    // Only when nothing else is named ("add something in Kelowna", "add a stop in Kelowna to our trip"): words for a
    // thing to add that no rule here knows ("an easy walk in Oliver on day 2") are the usual rules' to read.
    let rest = `${t.slice(0, far[0].at)} ${t.slice(far[0].end)}`;
    rest = rest.replace(ADD_RE, ' ').replace(/\b(?:please|can you|could you|would you|can we|could we|we(?:'d| would) like to|i(?:'d| would) like to|svp|s'il vous plait|pouvez-vous|peux-tu)\b/g, ' ')
      .replace(/\b(?:to|into|on|in|for|a|au|dans|sur) (?:our|the|my|this|notre|le|mon|ce) (?:trip|plan|itinerary|day|voyage|itineraire|sejour)\b/g, ' ').replace(/\b(?:on |le |au )?(?:day|jour) \d\b/g, ' ')
      .replace(/\b(?:something|somewhere|anything|things?|stops?|places?|visits?|spots?|activit(?:y|ies)|day ?trips?|quelque chose|arrets?|endroits?|activites?|visites?)\b/g, ' ').replace(/\b(?:a|an|the|some|one|another|more|to do|too|also|as well|une?|des|le|la|les|aussi|autre)\b/g, ' ');
    if (!/[a-z]{2}/.test(rest)) return { region: far[0].region, ...when };
  }
  return null;
}

// "Keep all the other stops", "leave everything else as it is": nothing to do (a change in the chat never touches
// another stop), so the words are taken out before the rest is read.
const KEEP_REST_RE = /(?:^|[,;.!?]\s*|\s+(?:and|but|et|mais)\s+)(?:please\s+|but\s+|svp\s+)?(?:keep|leave|don'?t (?:change|touch|move)|do not (?:change|touch|move)|garde[rz]?|laisse[rz]?|ne (?:change[rz]?|touche[rz]?) pas)\s+(?:all\s+|tou(?:s|tes)\s+)?(?:(?:of\s+)?(?:the|my|our|les|mes|nos)\s+)?(?:other|rest|remaining|everything else|all else|autres?|reste)(?:\s+(?:of\s+)?(?:the\s+|my\s+|our\s+)?(?:stops?|places?|things?|plan|trip|itinerary|arrets?|etapes?))?(?:\s+(?:as (?:it is|they are|is)|the same|in place|unchanged|where they are|tels? quels?|comme (?:ca|ils sont)))?(?=\s*(?:[,;.!?]|$|\s(?:and|but|et|mais)\s))/i;
// -> the message without those words (the same letters otherwise), or the message itself.
function stripKeepRest(message) {
  const m = String(message || '');
  const f = fold(m);
  if (f.length !== m.length) return m;
  const hit = KEEP_REST_RE.exec(f);
  if (!hit) return m;
  const lead = /^[.!?]/.test(hit[0]) ? hit[0][0] : '';
  const rest = `${m.slice(0, hit.index)}${lead} ${m.slice(hit.index + hit[0].length).replace(/^\s*(?:and|but|et|mais)\s+/i, '')}`.replace(/\s+/g, ' ').replace(/\s+([,;.!?])/g, '$1').replace(/([,;.!?])[,;.]+/g, '$1').replace(/^[\s,;.]+/, '').trim();
  return /[a-zA-Z]{2}/.test(rest) ? rest : m;
}

// ---------- Where an added stop may go ----------
// The parts of a day tried, in order, for a kind of listing. A meal is never put in the middle of an afternoon unless
// asked; an activity is never put in the evening unless asked.
const MEAL_TYPES = ['restaurant', 'pub', 'cafe'];
const LATE_TYPES = ['brewery', 'cocktail', 'distillery', 'pub'];
function partsFor(type, time) {
  if (time === 'morning') return ['morning'];
  if (time === 'afternoon') return ['afternoon', 'late'];
  if (time === 'midday') return MEAL_TYPES.includes(type) ? ['midday'] : ['afternoon'];
  if (time === 'evening') return MEAL_TYPES.includes(type) ? ['evening', 'night'] : ['late', 'evening', 'night'];
  if (type === 'cafe') return ['morning', 'afternoon', 'late'];
  if (MEAL_TYPES.includes(type)) return ['evening', 'midday'];
  if (LATE_TYPES.includes(type)) return ['late', 'afternoon', 'night'];
  return ['afternoon', 'late', 'morning'];
}
// The least time a stop of that type is given before a slot counts as "free" for it.
const needMinutes = (type, tour) => (tour ? 90 : MEAL_TYPES.includes(type) ? 60 : ['winery', 'brewery', 'distillery', 'cocktail', 'shop'].includes(type) ? 45 : 60);

// ---------- Words ----------
const T = {
  en: {
    added: 'Added {name} on day {d} at {time}.', added1: 'Added {name} at {time}.', where: 'It’s in {town}, {out}{km}.', operator: 'Check your date with the operator.', nothingElse: 'Nothing else changed.',
    alsoTours: 'It also runs {what}: pick an outing with no {one} stop.', tourWords: { winery: 'wine tours', brewery: 'brewery tours' },
    already: '{name} is already on day {d}{at}. Nothing changed.', already1: '{name} is already on your plan{at}. Nothing changed.',
    excluded: '{name} is {what}, and you asked to avoid {many}, so I haven’t added it. Say “{many} are fine now” to lift that.', isA: 'a {one}', atA: 'at a {one}', tourOf: { winery: 'a wine tour', brewery: 'a brewery tour' },
    dry: '{name} is {what}, and this trip has no alcohol stops, so I haven’t added it.',
    closed: '{name}’s listing shows it closed on {dates}, so I haven’t added it.', closedDay: '{name}’s listing shows it closed on day {d}.',
    notListed: 'I don’t list “{said}”{inTown}, so I can’t add it.', inTown: ' in {town}',
    noneKind: 'I list no {noun} in {town}.', altAsk: 'The nearest {noun} I list is {name}, in {town}{km}. Add it instead?', nearAsk: 'Nearest: {name}, in {town}, {out}{km}. Add it?',
    nearOther: 'The nearest other {noun} I list is {name}, in {town}{km}. Add it instead?',
    which: 'In {town} I list {names}. Which one?', whichName: 'I list {name} in {towns}. Which one?', whichSug: 'Which one: {names}?',
    whatIn: 'What would you like to add in {town}? Your trip stays based in {base}.', whatIn0: 'What would you like to add in {town}? Your other stops stay as they are.',
    noSuggestion: 'I haven’t suggested a place on this plan. Tell me its name and I’ll add it.', gone: 'That place is no longer listed, so nothing changed.',
    clash: 'There’s no free slot long enough for {name}. It would clash with {old} (day {d}, {time}). Replace that stop?', clash1: 'There’s no free slot long enough for {name}. It would clash with {old} ({time}). Replace that stop?',
    clashOn: 'Day {d} has no free slot long enough for {name} then: it would clash with {old} at {time}. Replace that stop?',
    clashDay: 'Day {d} has no free slot long enough for {name}: it would clash with {old} at {time}. Put it on day {d2} at {time2} instead?', clashDayPlain: 'Day {d} has no free slot long enough for {name}. Put it on day {d2} at {time2} instead?',
    noFit: 'I couldn’t fit {name} into this plan without moving other stops, so nothing changed.', short: 'I can add a named place to a day plan with times. Nothing changed.',
    addIt: 'Add it', addInstead: 'Add it instead', replace: 'Replace that stop', putDay: 'Put it on day {d}', view: 'View {name}', kmAbout: ' (about {km} in a straight line)', or: 'or', and: 'and', outside: 'outside {base}',
  },
  fr: {
    added: '{name} ajouté au jour {d} à {time}.', added1: '{name} ajouté à {time}.', where: 'C’est à {town}, {out}{km}.', operator: 'Vérifiez votre date auprès de l’exploitant.', nothingElse: 'Rien d’autre n’a changé.',
    alsoTours: 'Sa fiche propose aussi des {what} : choisissez une sortie sans arrêt dans un {one}.', tourWords: { winery: 'tours des vignobles', brewery: 'tours de microbrasseries' },
    already: '{name} est déjà au jour {d}{at}. Rien n’a changé.', already1: '{name} est déjà dans votre plan{at}. Rien n’a changé.',
    excluded: '{name} est {what}, et vous avez demandé d’éviter les {many} : je ne l’ai pas ajouté. Dites « les {many} sont permis » pour lever cette règle.', isA: 'un {one}', atA: 'dans un {one}', tourOf: { winery: 'un tour des vignobles', brewery: 'un tour de microbrasseries' },
    dry: '{name} est {what}, et ce voyage est sans alcool : je ne l’ai pas ajouté.',
    closed: 'La fiche de {name} l’indique fermé le {dates} : je ne l’ai pas ajouté.', closedDay: 'La fiche de {name} l’indique fermé au jour {d}.',
    notListed: 'Je ne répertorie pas « {said} »{inTown} : je ne peux pas l’ajouter.', inTown: ' à {town}',
    noneKind: 'Je ne répertorie aucun choix « {noun} » à {town}.', altAsk: 'Le plus proche que je répertorie ({noun}) : {name}, à {town}{km}. Voulez-vous que je l’ajoute à la place?', nearAsk: 'Le plus proche : {name}, à {town}, {out}{km}. Voulez-vous que je l’ajoute?',
    nearOther: 'L’autre choix le plus proche ({noun}) : {name}, à {town}{km}. Voulez-vous que je l’ajoute à la place?',
    which: 'À {town}, je répertorie {names}. Lequel?', whichName: 'Je répertorie {name} à {towns}. Lequel?', whichSug: 'Lequel : {names}?',
    whatIn: 'Que voulez-vous ajouter à {town}? Votre voyage reste basé à {base}.', whatIn0: 'Que voulez-vous ajouter à {town}? Vos autres arrêts restent tels quels.',
    noSuggestion: 'Je n’ai suggéré aucun endroit pour ce plan. Dites-moi son nom et je l’ajouterai.', gone: 'Cet endroit n’est plus répertorié : rien n’a changé.',
    clash: 'Aucune plage libre assez longue pour {name}. Il prendrait la place de {old} (jour {d}, {time}). Remplacer cet arrêt?', clash1: 'Aucune plage libre assez longue pour {name}. Il prendrait la place de {old} ({time}). Remplacer cet arrêt?',
    clashOn: 'Le jour {d} n’a aucune plage libre assez longue pour {name} à ce moment : il prendrait la place de {old} à {time}. Remplacer cet arrêt?',
    clashDay: 'Le jour {d} n’a aucune plage libre assez longue pour {name} : il prendrait la place de {old} à {time}. Le mettre au jour {d2} à {time2} à la place?', clashDayPlain: 'Le jour {d} n’a aucune plage libre assez longue pour {name}. Le mettre au jour {d2} à {time2} à la place?',
    noFit: 'Je n’ai pas pu placer {name} dans ce plan sans déplacer d’autres arrêts : rien n’a changé.', short: 'Je peux ajouter un endroit nommé à un plan de journée avec des heures. Rien n’a changé.',
    addIt: 'L’ajouter', addInstead: 'L’ajouter à la place', replace: 'Remplacer cet arrêt', putDay: 'Le mettre au jour {d}', view: 'Voir {name}', kmAbout: ' (environ {km} à vol d’oiseau)', or: 'ou', and: 'et', outside: 'hors de {base}',
  },
};

// An offer the page sends back as it is: "<name> [add <id>]" or "<name> [add <id> <day>-<part>]".
const ADD_TAG_RE = /\[add (\d{1,9})(?: ([1-7])-(morning|midday|afternoon|late|evening|night))?\]\s*$/;
const addTag = (name, id, slot = null) => `${String(name).replace(/[[\]]/g, ' ').replace(/\s+/g, ' ').trim()} [add ${id}${slot ? ` ${slot}` : ''}]`.slice(0, 240);

module.exports = { read, stripKeepRest, locatingTowns, buildIndex, namesIn, townsIn, typedName, whenIn, partsFor, needMinutes, addTag, fold, T, ADD_RE, MOVE_RE, SAID_RE, ADD_TAG_RE, MEAL_TYPES };
