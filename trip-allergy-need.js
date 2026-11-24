'use strict';
// Build My Trip: a food allergy, read as a need of the trip (2026-11-23).
//
// The owner's report: "Plan a 2-day trip in Kelowna for 3 adults … One person has a severe peanut allergy, so all meals
// must be peanut-free." The plan suggested restaurants and said nothing of the allergy (its words were searched for in
// descriptions: a diner was picked because its description "mentions allergy"). Asked, the chat said it could not
// confirm allergens; the plan, the Book my trip sheet and the shared copy never did.
//
// The site holds NO allergen or cross-contact data for any listing. So this module only ever does two things:
//   1. reads the allergy from the visitor's own words (English and French), and takes those words out of what the
//      planner searches for, so no restaurant is picked, ranked, kept out or ticked because of them;
//   2. words the one honest answer for every surface: not confirmed for any meal stop, ask the restaurant.
// Nothing here looks at a badge (vegan, gluten-free…), a cuisine, a menu or a description, and no wording says a place
// fits, is fine for, or is free of anything. Celiac / gluten-free stays with the Gluten-Free-Friendly badge and its own
// caveat (trip-honest-plan.js); "gluten allergy" is read here.
//
// This file is the same on okanaganroam.com and whistlerroam.com.
//
//   need = { key: 'allergy', kind: 'allergy' | 'avoid', allergens: [keys], severe: boolean, phrase: '' }
//     kind 'allergy'  the visitor said allergy, allergic, anaphylactic or EpiPen ("Peanut allergy")
//     kind 'avoid'    only "peanut-free", "no nuts", "lactose intolerant" ("No peanuts"): handled the same cautious way,
//                     never called an allergy the visitor did not name
//   plan.evidence entry: { ask: 'allergy', status: 'unknown' (always), stops: [every food stop, has: null], short, text… }

// Lower case, no accents, straight quotes; the same length as the text (so a match can be cut out of the original).
function foldKeep(s) {
  const raw = String(s || '').normalize('NFC');
  let out = '';
  for (const ch of raw) {
    if (ch.length !== 1) { out += ' '.repeat(ch.length); continue; }
    if (ch === '’' || ch === '‘' || ch === '`') { out += "'"; continue; }
    if (ch === '‑' || ch === '–' || ch === '—') { out += '-'; continue; }
    const f = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    out += f.length === 1 ? f : ch.toLowerCase().length === 1 ? ch.toLowerCase() : ' ';
  }
  return { raw, t: out };
}

// The allergens read. en: ['Peanut' (… allergy), 'peanuts' (No …)]; fr: ['aux arachides' (Allergie …), 'arachides' (Sans …)].
// word: the word the stored request gains when the chat records it (read back by the rules below).
const ALLERGENS = {
  peanut: { re: 'pea ?nuts?|arachides?|cacah(?:u|ou)etes?', en: ['Peanut', 'peanuts'], fr: ['aux arachides', 'arachides'], word: 'peanut' },
  tree_nut: { re: 'tree[- ]?nuts?|almonds?|cashews?|walnuts?|pecans?|hazelnuts?|pistachios?|noix de (?:grenoble|cajou)|amandes?|noisettes?|pistaches?', en: ['Tree nut', 'tree nuts'], fr: ['aux noix', 'noix'], word: 'tree nut' },
  nut: { re: 'nuts?|noix', en: ['Nut', 'nuts'], fr: ['aux noix', 'noix'], word: 'nut' },
  shellfish: { re: 'shell ?fish|crustaceans?|shrimps?|prawns?|lobsters?|crabs?|mollus[ck]s?|oysters?|mussels?|clams?|scallops?|fruits de mer|crustaces?|crevettes?|mollusques?|homards?|huitres?', en: ['Shellfish', 'shellfish'], fr: ['aux fruits de mer', 'fruits de mer'], word: 'shellfish' },
  seafood: { re: 'sea ?food', en: ['Seafood', 'seafood'], fr: ['aux poissons et fruits de mer', 'poissons et fruits de mer'], word: 'seafood' },
  fish: { re: 'fish|poissons?', en: ['Fish', 'fish'], fr: ['au poisson', 'poisson'], word: 'fish' },
  egg: { re: 'eggs?|(?:oe|œ)ufs?', en: ['Egg', 'eggs'], fr: ['aux œufs', 'œufs'], word: 'egg' },
  dairy: { re: 'dairy|milk|lactose|casein|produits laitiers|lait', en: ['Dairy', 'dairy'], fr: ['aux produits laitiers', 'produits laitiers'], word: 'dairy' },
  soy: { re: 'soya?|soybeans?|soja', en: ['Soy', 'soy'], fr: ['au soya', 'soya'], word: 'soy' },
  sesame: { re: 'sesame', en: ['Sesame', 'sesame'], fr: ['au sésame', 'sésame'], word: 'sesame' },
  wheat: { re: 'wheat|ble', en: ['Wheat', 'wheat'], fr: ['au blé', 'blé'], word: 'wheat' },
  gluten: { re: 'gluten', en: ['Gluten', 'gluten'], fr: ['au gluten', 'gluten'], word: 'gluten' },
  mustard: { re: 'mustard|moutarde', en: ['Mustard', 'mustard'], fr: ['à la moutarde', 'moutarde'], word: 'mustard' },
  sulphite: { re: 'sul(?:ph|f)ites?', en: ['Sulphite', 'sulphites'], fr: ['aux sulfites', 'sulfites'], word: 'sulphite' },
};
const KEYS = Object.keys(ALLERGENS);
const keyOfWord = (w) => KEYS.find((k) => new RegExp(`^(?:${ALLERGENS[k].re})$`).test(w)) || null;
const AW = `(?:${KEYS.map((k) => ALLERGENS[k].re).join('|')})`;
const SEP = `(?:\\s*,\\s*(?:and\\s+|or\\s+|et\\s+|ou\\s+)?|\\s+(?:and|or|et|ou|ni|&|\\+)\\s+|\\s*\\/\\s*)(?:(?:the|any|all|les|des|aux|au|a la|de|du|d')\\s*)?`;
const LIST = `${AW}(?:${SEP}${AW})*`;
// "No nuts", "without dairy": only for words that are not also a cuisine or a thing to do ("no seafood restaurants"
// and "no fishing" stay with the planner's own reader).
const NO_WORDS = '(?:pea ?nuts?|tree[- ]?nuts?|nuts?|shell ?fish|eggs?|dairy|lactose|soya?|sesame|arachides?|noix|fruits de mer|produits laitiers|(?:oe|œ)ufs?|soja)';
const NO_LIST = `${NO_WORDS}(?:${SEP}${NO_WORDS})*`;
const ALLERGY_WORD = 'allerg(?:y|ies|ic|ie|ique|iques)';
const PATTERNS = [
  // "peanut allergy", "nut and shellfish allergies", "peanut-allergic"
  { re: new RegExp(`\\b(${LIST})[\\s-]+(?:food\\s+)?${ALLERGY_WORD}\\b`, 'g'), kind: 'allergy', list: 1 },
  // "allergic to peanuts and shellfish", "allergy to nuts", "allergie aux arachides", "allergies: eggs, dairy"
  { re: new RegExp(`\\b${ALLERGY_WORD}\\b(?:\\s+(?:reactions?|graves?|severes?|serieuses?|mortelles?|fortes?|legeres?|importantes?))?(?:\\s+(?:is|are|include|includes))?\\s*(?:to|aux|au|a la|a l'|a|:|-|against|of|envers)?\\s*(?:(?:the|all|any|les|des|tous les|toutes les)\\s+)?(${LIST})\\b`, 'g'), kind: 'allergy', list: 1 },
  // "anaphylactic to peanuts", "carries an EpiPen for tree nuts"
  { re: new RegExp(`\\b(?:anaphyla\\w+|epi[- ]?pens?)\\b[^.;!?\\n]{0,30}?\\b(?:to|for|with|aux|au|a la|pour)\\s+(${LIST})\\b`, 'g'), kind: 'allergy', list: 1 },
  // "lactose intolerant", "intolerant to dairy"
  { re: new RegExp(`\\b(${LIST})[\\s-]+intoleran\\w+|\\bintoleran\\w+\\s+(?:to|aux|au|a la|a)\\s+(${LIST})\\b`, 'g'), kind: 'avoid', list: [1, 2] },
  // "peanut-free", "nut free", "peanut-safe", "nut-aware" (never "gluten-free": that is the badge's own ask)
  { re: new RegExp(`\\b(${LIST})[\\s-]+(?:free|safe|aware)\\b`, 'g'), kind: 'avoid', list: 1, notGluten: true },
  { re: new RegExp(`\\bfree (?:of|from)\\s+(?:any\\s+|all\\s+)?(${LIST})\\b`, 'g'), kind: 'avoid', list: 1, notGluten: true },
  { re: new RegExp(`\\bsans\\s+(?:aucune?\\s+|aucuns?\\s+|de\\s+|d')?(${LIST})\\b`, 'g'), kind: 'avoid', list: 1, notGluten: true },
  // "no peanuts", "without nuts", "can't eat shellfish", "ne mange pas de noix"
  { re: new RegExp(`\\b(?:no|without|avoid(?:ing|s)?|can'?t (?:eat|have|do)|cannot (?:eat|have)|(?:doesn'?t|don'?t|does not|do not) eat|must (?:not|avoid)(?: have| eat)?|ne (?:mange|mangeons|peut|peux|pouvons) pas (?:manger )?(?:de |d'|du |des )?|pas (?:de |d'))\\s*(?:any\\s+|the\\s+)?(${NO_LIST})\\b`, 'g'), kind: 'avoid', list: 1 },
  // An allergy with no allergen this file knows ("severe food allergies", "allergy-friendly", "an EpiPen").
  { re: new RegExp(`\\b(?:food\\s+)?(?:${ALLERGY_WORD}|allergens?|allergenes?)(?:[\\s-]+(?:free|safe|aware|friendly))?\\b|\\banaphyla\\w+|\\bepi[- ]?pens?\\b`, 'g'), kind: 'allergy', list: 0, generic: true },
];
// An allergy that is not about food.
const NOT_FOOD_RE = /\b(?:pollens?|cats?|dogs?|pets?|dust|hay ?fever|bees?|wasps?|stings?|penicillin|latex|smoke|perfumes?|scents?|fragrances?|feathers?|mou?ld|grass|ragweed|seasonal|animals?|horses?|chats?|chiens?|poussiere|abeilles?|guepes?|animaux|saisonni\w+|rhume des foins|parfums?|plumes?|medications?|medicaments?)\b/;
const NEG_RE = /\b(?:no|not|none|nobody|no one|without|aucune?|pas|sans|n'a|n'avons|n'ai|n'ont|don'?t have|doesn'?t have|do not have|does not have|any)\b[^.;!?,]{0,24}$/;
const SEVERE_RE = /\b(?:severe|severely|serious|life[- ]threatening|deadly|anaphyla\w+|epi[- ]?pens?|airborne|graves?|severes?|mortel(?:le)?s?)\b/;

function sentenceAt(t, at) {
  let a = at, b = at;
  while (a > 0 && !/[.;!?\n]/.test(t[a - 1])) a--;
  while (b < t.length && !/[.;!?\n]/.test(t[b])) b++;
  return [a, b];
}
function listKeys(str) {
  const out = [];
  const re = new RegExp(AW, 'g');
  let m;
  while ((m = re.exec(str))) { const k = keyOfWord(m[0]); if (k && !out.includes(k)) out.push(k); }
  return out;
}
// Every mention of an allergy or a food to keep out, in the text's own order.
// -> [{ start, end, kind, allergens: [keys], generic }] (positions in the folded text, the same as in the original)
function mentions(text) {
  const { t } = foldKeep(text);
  const found = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(t))) {
      if (!m[0]) { p.re.lastIndex++; continue; }
      const start = m.index, end = m.index + m[0].length;
      if (found.some((f) => start < f.end && end > f.start)) continue;
      const lists = (Array.isArray(p.list) ? p.list : p.list ? [p.list] : []).map((i) => m[i]).filter(Boolean);
      const allergens = listKeys(lists.join(' , '));
      if (p.notGluten && allergens.length && allergens.every((k) => k === 'gluten')) continue;
      const [sa, sb] = sentenceAt(t, start);
      if (p.kind === 'allergy') {
        // "no allergies", "nobody has a nut allergy": not a need. An allergy to cats or pollen is not about food.
        if (NEG_RE.test(t.slice(sa, start))) continue;
        if (p.generic && NOT_FOOD_RE.test(t.slice(Math.max(sa, start - 30), Math.min(sb, end + 30)))) continue;
      }
      found.push({ start, end, kind: p.kind, allergens, generic: !!p.generic });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}
const ordered = (keys) => { const k = KEYS.filter((x) => keys.includes(x)); return k.includes('tree_nut') ? k.filter((x) => x !== 'nut') : k; };
// -> the need, or null. Part of the request's own words, so every re-plan of the request reads it again.
function readAllergy(text) {
  const raw = String(text || '');
  if (!raw.trim()) return null;
  const ms = mentions(raw);
  if (!ms.length) return null;
  const { t } = foldKeep(raw);
  const allergens = ordered(ms.flatMap((m) => m.allergens));
  const severe = ms.some((m) => { const [a, b] = sentenceAt(t, m.start); return SEVERE_RE.test(t.slice(a, b)); });
  return { key: 'allergy', kind: ms.some((m) => m.kind === 'allergy') ? 'allergy' : 'avoid', allergens, severe, phrase: '' };
}

// ---- the words taken out of what the planner searches for ----
const BOUND_RE = /[.;!?\n,:()]|\s-\s|\b(?:and|but|so|because|since|et|mais|car|donc|alors|puisque)\b/g;
const LEAD_RE = new RegExp([
  "\\b(?:(?:for|with|as|pour|avec)\\s+)?(?:one of us|one of (?:my|our|the) \\w+|one person|one adult|one guest|one friend|one kid|one child|two of us|someone|somebody|some of us|a friend|my \\w+|our \\w+|we|i|she|he|they|everyone|l'une? de nous|l'une? d'entre nous|une personne|une amie?|un ami|quelqu'un|nous|je|j'|on|il|elle|ma \\w+|mon \\w+|notre \\w+)(?:\\s+(?:also|both|all|each))?\\s*(?:has|have|had|is|are|am|'s|'m|'re|with|who|carries|carry|needs?|must|can'?t|cannot|suffers?|a|as|ont|avons|ai|est|suis|sont|sommes|doit|devons|ne|qui)\\b",
  '\\b(?:all|every|each|any|our|the|tous les|toutes les|chaque|nos|les)\\s+(?:of (?:the|our) )?(?:meals?|food|dishes|restaurants?|dinners?|lunch(?:es)?|breakfasts?|places?|stops?|repas|plats?|restos?|soupers?|diners?|dejeuners?)\\b',
  '\\b(?:everything|everywhere|it all|tout)\\s+(?:must|needs?|has|should|doit)\\b',
  '\\b(?:must|need(?:s)? to|has to|have to|should|doit|doivent|devons)\\s+(?:all\\s+)?(?:be|have|etre|avoir)\\b',
  "\\b(?:due to|because of|on account of|a cause d'|a cause de|en raison d'|en raison de)",
  '\\b(?:please\\s+)?(?:make sure|ensure|strictly|assurez-vous)\\b',
].join('|'));
const MOD_RE = /(?:(?:\b(?:a|an|the|my|our|his|her|their|with|for|has|have|having|is|are|am|une?|son|sa|mon|ma|notre|avec|pour|severe|severely|serious|bad|mild|life[- ]threatening|deadly|strict|strictly|graves?|severes?|forte?|legere?|that is|which is|that are|qui est|qui soit|to be|only|carries|carry|carrying|needs?|porte)\b|\bthat's)\s+)+$/;
const TAIL_RE = /^(?:\s*,?\s*(?:meals?|food|options?|dishes|restaurants?|dining|places?|spots?|only|please|diet|kitchens?|menus?|choices|friendly|too|as well|in (?:the|our) (?:group|party|family)|repas|plats?|restos?|svp|seulement)\b)+/;
const CONJ_RE = /(?:\s*[,;:])?\s*\b(?:so|and|but|because|since|as|with|for|et|donc|mais|car|alors|puisque|avec|pour)\s*$/;
// The spans of the text that are about the allergy (each mention with its lead-in: "one person has a severe …",
// "so all meals must be …"). -> [[start, end]] in the original text, merged.
function allergySpans(text) {
  const { raw, t } = foldKeep(text);
  const spans = [];
  for (const m of mentions(raw)) {
    let left = 0;
    BOUND_RE.lastIndex = 0;
    let b;
    while ((b = BOUND_RE.exec(t)) && b.index < m.start) { if (b.index + b[0].length <= m.start) left = b.index + b[0].length; }
    const seg = t.slice(left, m.start);
    const lead = LEAD_RE.exec(seg);
    let start = m.start;
    if (lead) start = left + lead.index;
    else { const mod = MOD_RE.exec(seg); if (mod) start = left + mod.index; }
    const tail = TAIL_RE.exec(t.slice(m.end));
    const end = m.end + (tail ? tail[0].length : 0);
    // A joining word left dangling before the cut ("…, so" + "."): it goes too.
    if (/^\s*(?:[.;!?,]|$)/.test(t.slice(end))) { const c = CONJ_RE.exec(t.slice(0, start)); if (c) start = c.index; }
    spans.push([start, end]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const s of spans) { const last = out[out.length - 1]; if (last && s[0] <= last[1] + 1) last[1] = Math.max(last[1], s[1]); else out.push(s.slice()); }
  return { raw, spans: out };
}
// The request without its allergy words, for the planner's reader only (the request itself is never changed).
function stripAllergy(text) {
  const { raw, spans } = allergySpans(text);
  if (!spans.length) return String(text || '');
  let out = '', at = 0;
  for (const [a, b] of spans) { out += `${raw.slice(at, a)} `; at = b; }
  out += raw.slice(at);
  return out
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/([.;!?,])(?:\s*[.;!?,])+/g, '$1')
    .replace(/^[\s,.;!?]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- the words ----
const joinEn = (a, w = 'and') => (a.length > 1 ? `${a.slice(0, -1).join(', ')} ${w} ${a[a.length - 1]}` : a[0] || '');
// The need's name. anon: the name for a copy the traveller shares without the details ("Allergies").
function label(need, fr, anon) {
  const n = need || {}, keys = Array.isArray(n.allergens) ? n.allergens.filter((k) => ALLERGENS[k]) : [];
  if (anon) return 'Allergies';
  if (n.kind === 'avoid' && keys.length) {
    const names = keys.slice(0, 3).map((k) => ALLERGENS[k][fr ? 'fr' : 'en'][1]);
    return fr ? `Sans ${joinEn(names, 'ni')}` : `No ${joinEn(names, 'or')}`;
  }
  if (!keys.length) return fr ? 'Allergie alimentaire' : 'Food allergy';
  if (keys.length === 1) return fr ? `Allergie ${ALLERGENS[keys[0]].fr[0]}` : `${ALLERGENS[keys[0]].en[0]} allergy`;
  const names = keys.slice(0, 3).map((k) => (fr ? ALLERGENS[k].fr[1] : ALLERGENS[k].en[0].toLowerCase()));
  return `Allergies (${names.join(', ')}${keys.length > 3 ? `, +${keys.length - 3}` : ''})`;
}
// A name short enough for a card's one line.
function cardLabel(need, fr, anon) {
  const l = label(need, fr, anon);
  if (l.length <= 30) return l;
  return need && need.kind === 'avoid' ? (fr ? 'Aliments à éviter' : 'Foods to avoid') : 'Allergies';
}
// Where food or drink is served: every one of these stops gets the note (a pub or a bar serves food too).
const FOOD_TYPES = ['restaurant', 'cafe', 'pub', 'cocktail', 'brewery'];
const isFoodStop = (x) => !!x && (FOOD_TYPES.includes(x.type) || x.meal === true);
const it = (need, fr) => (need && need.kind === 'avoid' ? (fr ? 'ce besoin' : 'this') : (fr ? 'l’allergie' : 'the allergy'));
// Every wording for a need, in one place (the summary, Details, the cards, the sheet, the shared copy, the copied text).
function words(need, fr, anon) {
  const L = label(need, fr, anon), C = cardLabel(need, fr, anon);
  const about = anon ? (fr ? 'des allergies' : 'any allergy') : it(need, fr);
  return fr ? {
    label: L,
    short: `${L} : aucun repas confirmé`,
    shortNone: `${L} : restaurants non vérifiés`,
    text: `${L} : nous n’avons aucune information sur les allergènes ni sur la contamination croisée dans les restaurants; rien n’est donc confirmé pour aucun repas. Parlez ${anon ? about : `de ${about}`} et de la préparation des aliments avec chaque restaurant avant d’y aller.`,
    note: `${C} : demandez au restaurant`,
    noteOther: `${C} : demandez avant de commander`,
    more: `${L} : nous n’avons aucune information sur les allergènes ni sur la contamination croisée pour cet endroit. Parlez-leur ${anon ? about : `de ${about}`} et de la préparation des aliments avant d’y aller.`,
    sheet: `${L} : dites-le à chaque restaurant en réservant. Les liens de réservation ne le transmettent pas.`,
    ask: 'Demandez à chaque restaurant avant d’y aller.',
  } : {
    label: L,
    short: `${L}: not confirmed for any meal stop`,
    shortNone: `${L}: restaurants aren’t checked`,
    text: `${L}: we don’t have allergen or cross-contact information for restaurants, so nothing is confirmed for any meal stop. Talk to each restaurant about ${about} and how food is prepared before you go.`,
    note: `${C}: ask the restaurant`,
    noteOther: `${C}: ask before you order`,
    more: `${L}: we don’t have allergen or cross-contact information for this place. Talk to them about ${about} and how food is prepared before you go.`,
    sheet: `${L}: tell each restaurant when you book. Booking links don’t pass it on.`,
    ask: 'Ask each restaurant before you go.',
  };
}
// The plan.evidence entry. stops: [{ id, name, type, meal? }] (every stop of the plan); only the food stops get a row.
// Always 'unknown': there is no data that could make it anything else. need.anon (a shared copy without the details):
// the entry names no allergen.
function entry(stops, need) {
  const anon = !!(need && need.anon);
  const en = words(need, false, anon), fr = words(need, true, anon), ge = words(need, false, true), gf = words(need, true, true);
  const seen = new Set(), rows = [];
  for (const x of stops || []) {
    if (!isFoodStop(x) || x.id == null || seen.has(x.id)) continue;
    seen.add(x.id);
    const rest = x.type === 'restaurant';
    rows.push({ id: x.id, name: x.name || '', has: null, check: true, note: rest ? en.note : en.noteOther, noteFr: rest ? fr.note : fr.noteOther, more: en.more, moreFr: fr.more, noteAnon: rest ? ge.note : ge.noteOther, noteAnonFr: rest ? gf.note : gf.noteOther });
  }
  const some = rows.length > 0;
  return {
    ask: 'allergy', label: en.label, labelFr: fr.label, status: 'unknown', stops: rows,
    kind: anon ? 'allergy' : (need && need.kind) || 'allergy', allergens: anon ? [] : ((need && need.allergens) || []).slice(),
    short: some ? en.short : en.shortNone, shortFr: some ? fr.short : fr.shortNone, text: en.text, textFr: fr.text, sheet: en.sheet, sheetFr: fr.sheet,
    // The card's words for any stop that serves food (a place swapped in on the page has no row of its own yet).
    noteRest: en.note, noteRestFr: fr.note, noteOther: en.noteOther, noteOtherFr: fr.noteOther, more: en.more, moreFr: fr.more, foodTypes: FOOD_TYPES.slice(),
    copy: `${some ? en.short : en.shortNone}. ${en.ask}`, copyFr: `${some ? fr.short : fr.shortNone}. ${fr.ask}`,
    // The link's al= value, used only when the traveller ticks "Include allergy details" ('' when no allergen is named).
    share: anon ? '' : toShare(need),
    // The same lines without the allergen, for a copy shared without the details.
    anon: { label: ge.label, labelFr: gf.label, short: some ? ge.short : ge.shortNone, shortFr: some ? gf.short : gf.shortNone, text: ge.text, textFr: gf.text, noteRest: ge.note, noteRestFr: gf.note, noteOther: ge.noteOther, noteOtherFr: gf.noteOther, copy: `${some ? ge.short : ge.shortNone}. ${ge.ask}`, copyFr: `${some ? gf.short : gf.shortNone}. ${gf.ask}` },
  };
}
// One stop's note from a plan's evidence. -> { note, more } or null
function stopNote(plan, id, fr) {
  const e = ((plan && plan.evidence) || []).find((x) => x && x.ask === 'allergy' && Array.isArray(x.stops));
  const r = e && e.stops.find((x) => x && x.id === id);
  return r ? { note: (fr && r.noteFr) || r.note, more: (fr && r.moreFr) || r.more } : null;
}

// ---- the shared link ----
// al=peanut,shellfish  the allergens, only when the traveller chose to include them (the share box's tick);
// al=x.peanut          the same for a food to keep out that was never called an allergy ("No peanuts").
// Without al, a link whose asks carry `allergy` says only that allergies are not checked: no allergen is in the link.
const SHARE_RE = /^(x\.)?([a-z_]{2,10}(?:,[a-z_]{2,10}){0,7})$/;
function fromShare(v) {
  const m = typeof v === 'string' ? SHARE_RE.exec(v) : null;
  if (!m) return null;
  const allergens = ordered(m[2].split(',').filter((k) => ALLERGENS[k]));
  return allergens.length ? { kind: m[1] ? 'avoid' : 'allergy', allergens } : null;
}
function toShare(need) {
  const keys = need && Array.isArray(need.allergens) ? need.allergens.filter((k) => ALLERGENS[k]) : [];
  return keys.length ? `${need.kind === 'avoid' ? 'x.' : ''}${keys.join(',')}` : '';
}

// ---- the chat ----
const fold = (s) => foldKeep(s).t;
// The words the stored request gains when the chat records a need (read back by readAllergy; cut out by stripAllergy).
function requestWords(need) {
  const keys = (need && need.allergens) || [];
  if (!keys.length) return 'food allergy';
  const names = keys.map((k) => ALLERGENS[k].word);
  return need.kind === 'avoid' ? `${names.join(' and ')}-free food` : `${names.join(' and ')} allergy`;
}
// Two needs as one (the request's and the one a chat message adds).
function merge(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return { key: 'allergy', kind: a.kind === 'allergy' || b.kind === 'allergy' ? 'allergy' : 'avoid', allergens: ordered([...(a.allergens || []), ...(b.allergens || [])]), severe: !!(a.severe || b.severe), phrase: '' };
}
const covers = (a, b) => !!a && !!b && (b.allergens || []).every((k) => (a.allergens || []).includes(k)) && !(b.kind === 'allergy' && a.kind !== 'allergy') && !(!(b.allergens || []).length && (a.allergens || []).length && b.kind !== 'allergy');
const Q_START_RE = /^(?:is|are|was|were|does|do|did|can|could|would|will|what|what's|when|why|how|where|which|who|est-ce|c'est|pourquoi|comment|combien|quand|quels?|quelles?|lesquels|lesquelles|que|qu'est-ce|y a-t-il|peut-on|pouvons-nous)\b/;
const CAN_YOU_RE = /^(?:can|could|would|will) you\b|^(?:peux-tu|pouvez-vous|pourriez-vous|pourrais-tu)\b/;
const EDIT_RE = /\b(?:swap|replace|switch|change|add|find|book|include|instead|another|a different|somewhere else|remove|drop|remplace[rz]?|change[rz]?|echange[rz]?|ajoute[rz]?|trouve[rz]?|enleve[rz]?|retire[rz]?|un autre|une autre|plutot|ailleurs)\b/;
const SAFE_Q_RE = /\b(?:safe|safer|allerg\w+|cross[- ]contact|cross[- ]contaminat\w+|contamination croisee|securitaires?|sans danger)\b/;
const OTHER_SAFE_RE = /\b(?:walk\w*|trails?|hik\w+|driv\w+|swim\w*|night|dark|kids?|children|toddlers?|dogs?|water|lake|ski\w*|roads?|bears?|bik\w+|cycl\w+|neighbou?rhood|downtown|parking|alone|solo|march\w*|sentiers?|enfants?|chiens?|nuit|baignade|velo)\b/;
const FORGET_RE = /\b(?:remove|forget|ignore|delete|cancel|take off|take away|no longer|not anymore|never mind|enleve[rz]?|retire[rz]?|oublie[rz]?|supprime[rz]?|annule[rz]?)\b/;
const PARTS_RE = /(?<=[.;!?\n])\s+|\s+(?:and|et)\s+(?=(?:then\s+|also\s+|aussi\s+)?(?:add|remove|swap|replace|make|move|change|book|find|ajoute|enleve|remplace|deplace|change)\b)/;
const dayIn = (t) => { const m = /\b(?:day|jour)\s*(\d)\b/.exec(t); return m ? Number(m[1]) : null; };
const partIn = (t) => (/\b(?:dinner|supper|souper)\b/.test(t) ? 'evening' : /\b(?:lunch|diner)\b/.test(t) ? 'midday' : /\b(?:breakfast|brunch|dejeuner)\b/.test(t) ? 'morning' : null);
// The message without its allergy words, when what is left still reads as a request ("Swap the day 1 dinner").
function restOf(part) {
  const s = stripAllergy(part).replace(/\s+(?:that(?:'s|’s| is| are)?|which (?:is|are)|qui (?:est|soit|sont))?\s*(?:safe|safer|ok|okay|fine|good|suitable|securitaire|sécuritaire|sans danger)\s*$/i, '').replace(/\s+(?:for|with|to|by|at|pour|par|contre|avec|a)\s+(?:(?:somewhere|something|someplace|a|an|another|one|some|un|une|un autre|une autre|quelque part)\s*)?(?:that(?:'s| is| has)?|which is|qui (?:est|soit|a))?\s*$/i, '').replace(/\s+(?:that(?:'s| is| has)?|which is|qui (?:est|soit|a))\s*$/i, '').replace(/[\s,;:]+$/, '').trim();
  return s;
}
// A chat message about an allergy. h: { op(o, extra), stopsNamed(t, stops) }; ctx: { request } (the stored request).
// -> { ops, cant: null, exact: true, access: true, explain?, rest? } or null (nothing here is about an allergy).
//   ask q_allergy       a question ("are these safe for a peanut allergy?"): the honest answer, nothing changes
//   ask q_allergy_swap  a swap, an add or a search that asks for a place free of the allergen: explained, never done
//                       as asked; what could be done instead (the same change without that promise) is offered
//   allergy             the need is said ("one of us is allergic to shellfish"): recorded on the plan, nothing swapped
function chatRead(message, stops, h, ctx = {}) {
  const raw = String(message || '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const known = readAllergy(ctx.request || '');
  const parts = raw.split(PARTS_RE).filter((p) => p && p.trim());
  const ops = [], rest = [];
  for (const part of parts) {
    const t = fold(part).replace(/\s+/g, ' ').trim();
    const said = readAllergy(part);
    const isQ = (Q_START_RE.test(t) && !CAN_YOU_RE.test(t)) || (/\?\s*$/.test(t) && !CAN_YOU_RE.test(t) && !EDIT_RE.test(t));
    if (!said) {
      // With an allergy on the plan: "are these safe?", "swap dinner for somewhere safer".
      // (Never a question about something else: "is the trail safe for kids?")
      if (known && SAFE_Q_RE.test(t) && isQ && !OTHER_SAFE_RE.test(t)) { ops.push(h.op('ask', { value: 'q_allergy', al: known })); continue; }
      if (known && /\b(?:safe|safer|securitaires?)\b/.test(t) && EDIT_RE.test(t) && !OTHER_SAFE_RE.test(t)) { ops.push(swapOp(part, t, stops, h, known)); continue; }
      rest.push(part);
      continue;
    }
    const need = merge(known, said);
    if (isQ) { ops.push(h.op('ask', { value: 'q_allergy', al: said.allergens.length || !known ? said : known })); continue; }
    // "remove the peanut allergy", "forget the allergy": the note cannot be taken off a plan here; said, nothing changes.
    if (FORGET_RE.test(t) && said.kind === 'allergy') { ops.push(h.op('ask', { value: 'q_allergy', al: need, keep: true })); continue; }
    if (!covers(known, said)) ops.push(h.op('allergy', { al: said, ...(EDIT_RE.test(t) ? { quiet: true } : {}) }));
    if (EDIT_RE.test(t)) ops.push(swapOp(part, t, stops, h, need));
    else if (covers(known, said)) ops.push(h.op('ask', { value: 'q_allergy', al: need }));
  }
  if (!ops.length) return null;
  const out = { ops, cant: null, exact: true, access: true, allergy: true };
  if (ops.every((o) => o.o === 'ask') && !rest.length) out.explain = true;
  if (rest.length) out.rest = rest.join(' ');
  return out;
}
function swapOp(part, t, stops, h, need) {
  let target = null;
  try { const n = typeof h.stopsNamed === 'function' ? h.stopsNamed(t, stops || []) : null; target = n && n.byName && n.byName.length ? n.byName[0] : null; } catch (e) { target = null; }
  if (!target && !/\b(?:add|ajoute[rz]?)\b/.test(t)) {
    const day = dayIn(t), dp = partIn(t);
    const food = (stops || []).filter((s) => s && isFoodStop(s));
    const fit = food.filter((s) => (!day || s.day === day) && (!dp || new RegExp(`-${dp}$`).test(String(s.key || ''))));
    if (dp && fit.length === 1) target = fit[0];
  }
  const say = restOf(part);
  const stillEdit = say && EDIT_RE.test(fold(say)) && fold(say) !== t && !readAllergy(say);
  return h.op('ask', { value: 'q_allergy_swap', al: need, stops: target ? [target] : [], ...(stillEdit ? { say: say.slice(0, 300) } : {}) });
}
const CHAT = {
  en: {
    q: '{label}: I can’t confirm that for any meal stop. Listings don’t list allergens or how food is prepared, so talk to each restaurant about {it} before you go.',
    swap: '{label}: I can’t check any restaurant for it (listings don’t list allergens or how food is prepared), so I’ve kept {name}.',
    swapAny: '{label}: I can’t check any place for it (listings don’t list allergens or how food is prepared), so nothing has changed.',
    offer: 'I can make the change anyway; the new place would be just as unconfirmed. Want that?',
    noted: 'Noted: {labelLower}. I can’t confirm it for any meal stop: listings don’t list allergens or how food is prepared. Talk to each restaurant about {it} before you go.',
    onCards: 'It’s now on your plan and each meal card.',
    fresh: '{label}: not confirmed for {names} either. Ask before you go.',
    keep: 'I’ve kept the note ({labelLower}): I can’t take it off this plan. To plan without it, start a new request.',
  },
  fr: {
    q: '{label} : je ne peux le confirmer pour aucun repas. Les fiches n’indiquent ni les allergènes ni la préparation des aliments; parlez de {it} avec chaque restaurant avant d’y aller.',
    swap: '{label} : je ne peux le vérifier pour aucun restaurant (les fiches n’indiquent ni les allergènes ni la préparation des aliments), alors j’ai gardé {name}.',
    swapAny: '{label} : je ne peux le vérifier pour aucun endroit (les fiches n’indiquent ni les allergènes ni la préparation des aliments), alors rien n’a changé.',
    offer: 'Je peux quand même faire le changement; le nouvel endroit serait tout aussi non confirmé. Voulez-vous?',
    noted: 'C’est noté : {labelLower}. Je ne peux le confirmer pour aucun repas : les fiches n’indiquent ni les allergènes ni la préparation des aliments. Parlez de {it} avec chaque restaurant avant d’y aller.',
    onCards: 'C’est maintenant indiqué sur votre plan et sur chaque repas.',
    fresh: '{label} : non confirmé pour {names} non plus. Demandez avant d’y aller.',
    keep: 'J’ai gardé la note ({labelLower}) : je ne peux pas la retirer de ce plan. Pour planifier sans elle, faites une nouvelle demande.',
  },
};
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
// The chat's words. what: 'q' | 'swap' | 'noted' | 'fresh'; x: { name, names, recorded, offer }.
function chatReply(what, need, lang, x = {}) {
  const fr = lang === 'fr', T = CHAT[fr ? 'fr' : 'en'], L = label(need, fr);
  const vars = { label: L, labelLower: L.charAt(0).toLowerCase() + L.slice(1), it: it(need, fr), name: x.name || '', names: x.names || '' };
  if (what === 'swap') return [fill(x.name ? T.swap : T.swapAny, vars), x.offer ? T.offer : ''].filter(Boolean).join(' ');
  if (what === 'noted') return [fill(T.noted, vars), x.recorded ? T.onCards : ''].filter(Boolean).join(' ');
  if (what === 'fresh') return fill(T.fresh, vars);
  if (what === 'keep') return fill(T.keep, vars);
  return fill(T.q, vars);
}

module.exports = { ALLERGENS, FOOD_TYPES, isFoodStop, mentions, readAllergy, stripAllergy, allergySpans, label, cardLabel, words, entry, stopNote, fromShare, toShare, requestWords, merge, covers, chatRead, chatReply, restOf, fold };
