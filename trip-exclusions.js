'use strict';
// Build My Trip: explicit exclusions and "at a winery" (2026-11-24).
//
// Dayton's report (Peachland, 390px): "…One of us is vegetarian and we would like to avoid wineries." The plan chose a
// winery's restaurant, its summary said "focused on … wineries, “avoid”", and the chat, asked to "replace the winery
// restaurant with a lake-view dinner that is not at a winery", went looking for a winery.
//
// This file is the same on okanaganroam.com and whistlerroam.com. It holds:
//   readExclusions(text)   the kinds of place a traveller rules out in plain words, English and French ("avoid
//                          wineries", "no breweries", "not at a winery", "skip the distilleries", « sans vignobles »,
//                          "we don't want pubs"). Only kinds the site lists; never a positive wish ("we love wineries").
//   markAtPlaces(facts)    which food and drink listings are AT a winery, brewery or distillery, from stored data only.
//   atIndex(rows)          the same test for plain listing rows (the chat's stops, a shared copy).
//   labels                 the short words for the summary chip, the Details line and the shared copy.
//
// "At a winery" is evidence, never a guess. A restaurant, café, pub or lounge is at a winery when ONE of these holds:
//   same_place  it is within 400 m of a stored winery listing AND shares that listing's website host (not a social or
//               booking host) or its street number and street, or its own name or description names that winery;
//   own_words   its own name or description says it is at / inside / part of a named winery or vineyard, or calls
//               itself a winery restaurant.
// A listing with none of these is NOT known to be away from a winery: nothing here ever says "not at a winery".

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, "'");
const flat = (s) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim();

// kind -> its words in a request (folded, punctuation as spaces), the chip, and the Details words.
const TYPES = {
  winery: { re: 'winer(?:y|ies)|vineyards?|vignobles?|domaines? viticoles?', en: 'No wineries', fr: 'Sans vignobles', one: 'winery', oneFr: 'vignoble', many: 'wineries', manyFr: 'vignobles' },
  brewery: { re: 'brewer(?:y|ies)|brew ?pubs?|microbrasseries?|brasseries?', en: 'No breweries', fr: 'Sans microbrasseries', one: 'brewery', oneFr: 'microbrasserie', many: 'breweries', manyFr: 'microbrasseries' },
  distillery: { re: 'distiller(?:y|ies)|distilleries?', en: 'No distilleries', fr: 'Sans distilleries', one: 'distillery', oneFr: 'distillerie', many: 'distilleries', manyFr: 'distilleries' },
  pub: { re: 'pubs?', en: 'No pubs', fr: 'Sans pubs', one: 'pub', oneFr: 'pub', many: 'pubs', manyFr: 'pubs' },
  golf: { re: 'golf(?: courses?)?|golfing', en: 'No golf', fr: 'Sans golf', one: 'golf course', oneFr: 'terrain de golf', many: 'golf courses', manyFr: 'terrains de golf' },
  beach: { re: 'beach(?:es)?|plages?', en: 'No beaches', fr: 'Sans plages', one: 'beach', oneFr: 'plage', many: 'beaches', manyFr: 'plages' },
};
// The kinds of place a restaurant can be "at".
const HOST_TYPES = ['winery', 'brewery', 'distillery'];
const AT_TYPES = ['restaurant', 'cafe', 'pub', 'cocktail'];

// What rules a kind out. Between it and the kind only small words and other things ruled out ("no alcohol or
// wineries", "avoid crowds and wineries"); never a wish ("we don't hike but love wineries").
const NEG = "(?:no|not|non|never|without|avoid(?:ing|s)?|skip(?:ping|s)?|exclud(?:e|es|ing)|stay(?:ing)? away from|steer(?:ing)? clear of|keep(?:ing)? away from|(?:do not|don t|dont|does not|doesn t|would rather not|rather not|prefer not to|not interested in|no interest in)(?: (?:want|wish|plan|care|need)(?: to)?)?(?: (?:go to|visit|see|do|stop at))?|sans|pas de|pas d|aucune?|eviter|evitons|evitez|evite)";
// What ends it: a wish ("…but we love breweries"), or "and" with a new verb ("skip the wineries and do breweries").
const STOP_BETWEEN = '(?:but|include|includes|including|with|love|loves|like|likes|enjoy|enjoys|prefer|add|plus|only|just|instead|rather|mais|avec|aime|aimons|adore|adorons|plutot|(?:and|then|so|et|puis|donc) (?:do|go|visit|see|try|have|get|take|find|book|plan|we|i|let|maybe|also|faire|aller|voir|on|nous))';
function readExclusions(text) {
  const out = [];
  // One clause at a time: a full stop, a semicolon or a comma ends what "no" rules out ("no kids, wineries all day"),
  // except a comma inside a list that ends in "or" ("no breweries, pubs or wineries").
  const clauses = fold(text).split(/[.;:!?()\n]+/).flatMap((c) => { const parts = c.split(','); const o = []; for (let i = 0; i < parts.length; i++) { if (o.length && /\b(?:or|nor|ou|ni)\b/.test(parts.slice(i).join(' ')) && !new RegExp(`\\b${NEG}\\b`).test(flat(parts[i]))) o[o.length - 1] += ` ${parts[i]}`; else o.push(parts[i]); } return o; });
  for (const c of clauses) {
    const t = ` ${flat(c)} `;
    for (const [type, w] of Object.entries(TYPES)) {
      if (out.includes(type)) continue;
      const m = new RegExp(`\\b${NEG}\\b(?:(?!\\b${STOP_BETWEEN}\\b)[a-z0-9 ]){0,40}?\\b(?:${w.re})\\b`).exec(t);
      // "not only wineries", "not just the wineries": a wish for more, never a refusal.
      if (!m || /\bnot (?:only|just)\b/.test(m[0])) continue;
      out.push(type);
    }
  }
  return out;
}
const label = (type, fr) => (TYPES[type] ? TYPES[type][fr ? 'fr' : 'en'] : null);

// ---------- at a winery / brewery / distillery ----------
const GENERIC_HOST = /(?:^|\.)(?:facebook|instagram|google|linktr|tripadvisor|yelp|opentable|squarespace|wixsite|wix|business\.site|hellobc|exploretock|tock|resy|shopify|myshopify|square\.site|godaddysites|weebly|linkedin|youtube|tiktok|x|twitter)\.[a-z.]+$/;
const hostOf = (u) => { try { const h = new URL(String(u || '').trim()).hostname.toLowerCase().replace(/^www\./, ''); return h && !GENERIC_HOST.test(h) ? h : ''; } catch (e) { return ''; } };
const streetOf = (a) => { const m = /^\s*(?:(?:unit|suite|#)?\s*[a-z0-9]+\s*[-–]\s*)?(\d{2,6})\s+([a-z0-9]+)/i.exec(String(a || '')); return m ? `${m[1]} ${m[2].toLowerCase()}` : ''; };
const coords = (v) => { const lat = Number(v.lat != null ? v.lat : v.latitude), lng = Number(v.lng != null ? v.lng : v.longitude); return Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { lat, lng } : null; };
function km(a, b) {
  const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const HOST_WORDS = { winery: '(?:estate winery|winery|wineries|vineyards?|wines|wine co|wine company|cellars|vignobles?)', brewery: '(?:brewing company|brewing co|brewery|brewing|brew ?pub|brewhouse|beer co|microbrasserie|brasserie)', distillery: '(?:distillery|distilling|distillers|spirits|distillerie)' };
const GENERIC_NAME = { winery: /\b(?:estate winery|winery|wineries|vineyards?|wines|wine|cellars|estate|family|tasting room|and|the|co|company|ltd|inc)\b/g, brewery: /\b(?:brewing company|brewing co|brewery|brewing|brewpub|brew pub|brewhouse|beer|company|co|and|the|ltd|inc|taproom|tasting room)\b/g, distillery: /\b(?:distillery|distilling|distillers|spirits|craft|company|co|and|the|ltd|inc|tasting room)\b/g };
// The distinctive part of a host listing's name ("Quails' Gate Winery" -> "quails gate"; "Fitzpatrick Family Vineyards
// at Greata Ranch" -> "fitzpatrick").
function nameCore(name, type) { return flat(String(name || '').replace(/\s[-–—@|]\s.*$/, '').replace(/\s+at\s+.*$/i, '')).replace(GENERIC_NAME[type], ' ').replace(/\s+/g, ' ').trim(); }
// Its own words name that host: the core, as a whole phrase; a one-word core only with a winery word right after it
// ("fairview" in "Fairview Mountain Golf Club" does not name Fairview Cellars).
function namesHost(text, core, type) {
  if (!core || core.length < 4) return false;
  const c = core.replace(/[^a-z0-9 ]/g, '');
  if (!c) return false;
  if (c.includes(' ')) return new RegExp(`\\b${c}\\b`).test(text);
  return new RegExp(`\\b${c}(?: (?:family|estate|pyramid|creek|ranch))?(?: ${HOST_WORDS[type]})\\b`).test(text);
}
// Its own words say it is at one, whether or not that place is listed: "the fine-dining room at Quails' Gate Winery",
// "a winery restaurant", "inside the brewery". Never "near", "beside", "next to", or a tasting or a tour at one.
const OWN_WORDS = {
  winery: /\b(?:winery restaurants?|winery s (?:own )?(?:restaurant|bistro|kitchen|patio|dining room)|(?:at|inside|within|part of|on the grounds of) (?:the |this |a |an )?(?:[a-z0-9]+ ){0,5}(?:estate winery|winery|vineyards?|wine estate))\b/,
  brewery: /\b(?:brewery restaurants?|brewery s (?:own )?(?:restaurant|kitchen|taproom|patio)|(?:at|inside|within|part of) (?:the |this |a |an )?(?:[a-z0-9]+ ){0,5}(?:brewery|brewing company|brewing co|brewing))\b/,
  distillery: /\b(?:distillery restaurants?|distillery s (?:own )?(?:restaurant|kitchen|lounge|patio)|(?:at|inside|within|part of) (?:the |this |a |an )?(?:[a-z0-9]+ ){0,5}(?:distillery|distilling))\b/,
};
const NOT_AT_BEFORE = /\b(?:tastings?|tours?|stops?|visits?|flights?|lunch(?:es)?|dinners?|near|nearby|beside|next to|across from|close to|minutes from|drive from|walk from|views? of|overlook\w*|pair\w* (?:with|it with)) (?:a |an |the )?$/;
function ownWordsAt(text, type) {
  const re = new RegExp(OWN_WORDS[type].source, 'g');
  let m;
  while ((m = re.exec(text))) {
    if (!NOT_AT_BEFORE.test(`${text.slice(0, m.index).trim()} `)) return m[0];
  }
  return null;
}
// rows: listings with { id, name, type, address, website, lat|latitude, lng|longitude, description|plannerDescription }.
// -> Map(id -> { winery: { id, name, how }, ... }) for the food and drink listings that are at one.
function atIndex(rows) {
  const list = (rows || []).filter((v) => v && v.id != null && !v.redirect_to);
  const hosts = {};
  for (const t of HOST_TYPES) hosts[t] = list.filter((v) => v.type === t).map((v) => ({ id: v.id, name: v.name, at: coords(v), host: hostOf(v.website), street: streetOf(v.address), core: nameCore(v.name, t) }));
  const out = new Map();
  for (const v of list) {
    if (!AT_TYPES.includes(v.type)) continue;
    const text = flat(`${v.name || ''}. ${v.plannerDescription || v.description || ''}`), at = coords(v), host = hostOf(v.website), street = streetOf(v.address);
    const found = {};
    for (const t of HOST_TYPES) {
      let hit = null;
      if (at) {
        for (const h of hosts[t]) {
          if (!h.at) continue;
          const d = km(at, h.at);
          if (d > 0.4) continue;
          if ((host && host === h.host) || (street && street === h.street) || namesHost(text, h.core, t)) { if (!hit || d < hit.d) hit = { id: h.id, name: h.name, how: 'same_place', d }; }
        }
      }
      if (hit) { found[t] = { id: hit.id, name: hit.name, how: hit.how }; continue; }
      const own = ownWordsAt(text, t);
      if (own) found[t] = { id: null, name: null, how: 'own_words', says: own };
    }
    if (Object.keys(found).length) out.set(v.id, found);
  }
  return out;
}
// The planner's facts, marked in place: f.atTypes = ['winery'], f.atPlace = { winery: { id, name, how } }.
function markAtPlaces(facts) {
  const ix = atIndex(facts);
  for (const f of facts || []) { const a = ix.get(f.id); if (a) { f.atTypes = Object.keys(a); f.atPlace = a; } }
  return facts;
}
// A listing ruled out by "no <type>": that type itself, a place at one, or (wineries) a wine tour.
function ruledOut(v, type) {
  if (!v || !TYPES[type]) return false;
  if (v.type === type || (v.fdTypes || []).includes(type) || (v.atTypes || []).includes(type)) return true;
  if (type === 'winery' && (v.plannerKinds || []).includes('wine_tour')) return true;
  return false;
}

// ---------- the chat: a stop named by what it is at, a kind ruled out of a replacement, a rule lifted ----------
const HOST_WORD = { winery: 'winer(?:y|ies)|vineyards?|vignobles?', brewery: 'brewer(?:y|ies)|brew ?pubs?|microbrasseries?|brasseries?', distillery: 'distiller(?:y|ies)|distilleries?' };
const MEAL_WORD = 'restaurants?|restos?|bistros?|kitchens?|cafes?|pubs?|lunch|dinner|supper|brunch|souper|diner|dejeuner|place|spot|stop|one|arret|endroit';
// "the winery restaurant", "the restaurant at the winery", "the brewery's pub", « le restaurant du vignoble »: the kind
// of place the stop is at. t: the folded message. -> 'winery' | 'brewery' | 'distillery' | null
function atPhraseIn(t) {
  const x = ` ${String(t || '').replace(/'s\b/g, '').replace(/[^a-z0-9]+/g, ' ')} `;
  for (const type of HOST_TYPES) {
    if (new RegExp(`\\b(?:${HOST_WORD[type]}) (?:${MEAL_WORD})\\b`).test(x)) return type;
    if (new RegExp(`\\b(?:${MEAL_WORD}) (?:that is |that s |which is |qui est )?(?:at|in|inside|of|du|au|dans|de|d) (?:the |a |an |that |la |le |l |un |une )?(?:${HOST_WORD[type]})\\b`).test(x)) return type;
  }
  return null;
}
// What a replacement must NOT be: "…with a lake-view dinner that is not at a winery", "…for one that isn't a brewery",
// « … qui n'est pas dans un vignoble ». -> { text (the message without those words), types }
function stripNegated(t) {
  let text = String(t || '');
  const types = [];
  for (const [type, w] of Object.entries(TYPES)) {
    const re = new RegExp(`,?\\s*(?:\\b(?:that|which|qui)\\s+)?(?:\\b(?:is|are|s|was|be|est|soit|n'est|ne soit)\\s*)?(?:\\b(?:not|isn'?t|aren'?t|no|non|without|sans|pas|never)\\b|n't\\b)(?:\\s+(?:at|in|inside|part of|on|a|an|the|any|another|one of|dans|un|une|de|d'|du|au|situe|situee|located))*\\s*(?:${w.re})\\b`, 'g');
    if (re.test(text)) { types.push(type); text = text.replace(re, ' '); }
  }
  return { text: text.replace(/\s+/g, ' ').trim(), types };
}
// A rule lifted in plain words ("wineries are fine now", "allow wineries", "you can include breweries again", « les
// vignobles sont permis »). -> the kinds lifted.
function readAllowed(t) {
  const x = ` ${flat(t)} `, out = [];
  for (const [type, w] of Object.entries(TYPES)) {
    if (new RegExp(`\\b(?:allow|allowing|permit|lift|include|bring back|ok with|okay with|fine with|permettre|permettez|inclure)\\b[a-z0-9 ]{0,24}?\\b(?:${w.re})\\b(?: [a-z]+){0,2} ?(?:again|after all|now|rule|de nouveau|finalement)?`).test(x) && /\b(?:allow|allowing|permit|lift|again|after all|bring back|ok with|okay with|fine with|permettre|permettez|de nouveau|finalement)\b/.test(x) && !readExclusions(t).includes(type)) out.push(type);
    else if (new RegExp(`\\b(?:${w.re}) (?:are|is|sont|est) (?:fine|ok|okay|allowed|welcome|permis|permises|correct|corrects)\\b`).test(x)) out.push(type);
    else if (new RegExp(`\\b(?:lift|drop|remove|forget|cancel|ignore|oublie[rz]?|annule[rz]?)\\b[a-z ]{0,14}\\b(?:no|sans|pas de) (?:${w.re})\\b`).test(x)) out.push(type);
  }
  return out;
}
// The request without the words that ruled a kind out ("…vegetarian and we would like to avoid wineries." -> "…vegetarian.").
// null when the words cannot be taken out cleanly (the rule then stays, and the chat says so).
function stripExclusion(text, type) {
  const w = TYPES[type];
  if (!w) return null;
  const lead = "(?:[,;]?\\s*(?:and|et|but|mais)?\\s*(?:(?:we|i|on|nous)(?:'d| would| want| wish| prefer| need| aimerions| voulons| veux)?(?: like| prefer| rather| love)?(?: to)?\\s+)?)";
  const neg = "(?:no|not|without|avoid(?:ing)?|skip(?:ping)?|exclud(?:e|ing)|stay(?:ing)? away from|steer(?:ing)? clear of|keep(?:ing)? away from|(?:do not|don[’']?t|would rather not|rather not|prefer not to)(?: want| like| visit| go to)?|sans|pas de|pas d[’']|aucune?|[ée]viter)";
  const re = new RegExp(`${lead}\\b${neg}\\b(?:\\s+(?:any|the|a|an|at|to|visit(?:ing)?|more|des|les|de|aux?))*\\s*(?:${w.re.replace(/\(\?:/g, '(?:')})\\b(?:\\s+(?:please|at all|svp))?`, 'i');
  if (!re.test(String(text || ''))) return null;
  const out = String(text).replace(re, '').replace(/\s+([.,;!?])/g, '$1').replace(/([.,;])\s*\1+/g, '$1').replace(/\s{2,}/g, ' ').replace(/\.\s*\./g, '.').trim();
  return out && !readExclusions(out).includes(type) ? out : null;
}

module.exports = { TYPES, HOST_TYPES, AT_TYPES, atPhraseIn, stripNegated, readAllowed, stripExclusion, readExclusions, label, atIndex, markAtPlaces, ruledOut, nameCore, namesHost, ownWordsAt, hostOf, streetOf, fold, flat };
