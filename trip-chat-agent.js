'use strict';
// Build My Trip chat, "travel agent abilities" (2026-11-22, Dayton: "be able to remove something and add accommodation
// if they never asked for accommodation. Add a wine tour if they ask in the chat even if they didn't ask for a wine tour
// to start with. [...] as if they were actually sitting down with a travel agent").
//
// This file is the same on okanaganroam.com and whistlerroam.com. It holds what the chat needs to build up and take
// apart every part of a trip by conversation: tours as kinds of stop, several asks in one message, questions answered
// from a listing's own stored facts, a place to stay on any plan, getting there, and moving stops. The one rule stays:
// AI and word rules only READ; every place comes from the site's own listings through the planner; replies are fixed
// templates.

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, "'");

// ---------- Tours and bookable activities, as kinds of stop ----------
// types / words: what the planner's Swap checks on the listing (its kind, and a word of its name, activity or first
// sentence). covers: the kinds of stop on that day the tour stands in for. minutes: the usual length (for the planner's
// tourStops hook). A site with no listing of a kind answers "not listed" and offers the nearest thing.
const TOUR_TYPES = ['tour', 'outdoor', 'sport'];
const TOUR_KINDS = {
  wine_tour: { en: 'a wine tour', fr: 'un tour des vignobles', types: ['tour'], words: ['wine tour', 'wine tours', 'winery tour', 'wine country tour'], covers: ['winery'], minutes: 240, re: /\b(?:wine|winery|vineyard) tours?\b|\b(?:tours?|tournees?|visites?) (?:de|des|du) (?:vignobles?|vins?)\b/ },
  brewery_tour: { en: 'a brewery tour', fr: 'un tour des microbrasseries', types: ['tour'], words: ['brewery tour', 'craft tour', 'beer tour', 'craft beer'], covers: ['brewery'], minutes: 210, re: /\b(?:brewery|beer|craft beer) tours?\b|\btours? (?:de|des) (?:microbrasseries|bieres?)\b/ },
  food_tour: { en: 'a food tour', fr: 'un tour gourmand', types: ['tour'], words: ['food tour', 'tasting tour', 'culinary'], minutes: 180, re: /\b(?:food|foodie|culinary|tasting) tours?\b|\btours? (?:gourmands?|culinaires?)\b/ },
  boat_tour: { en: 'a boat cruise', fr: 'une croisière', types: ['tour'], words: ['cruise', 'boat', 'charter', 'pontoon', 'yacht'], minutes: 120, re: /\bboat (?:cruises?|tours?|rides?|rentals?|charters?|trips?)\b|\b(?:lake )?cruises?\b|\bcroisieres?\b|\bpontoons?\b|\btours? (?:de|en) bateau\b/ },
  kayak: { en: 'kayaking or paddling', fr: 'du kayak ou de la planche à pagaie', types: TOUR_TYPES, words: ['kayak', 'paddle', 'canoe'], minutes: 120, re: /\b(?:kayak\w*|paddle ?board\w*|canoe\w*|canot)\b/ },
  snowmobile: { en: 'a snowmobile tour', fr: 'une excursion en motoneige', types: TOUR_TYPES, words: ['snowmobil', 'motoneige'], minutes: 180, re: /\b(?:snowmobil\w*|sledding tours?|motoneiges?)\b/ },
  zipline: { en: 'ziplining', fr: 'de la tyrolienne', types: TOUR_TYPES, words: ['zip'], minutes: 150, re: /\b(?:zip ?lin\w*|zip tours?|tyroliennes?)\b/ },
  snowshoe: { en: 'a snowshoe tour', fr: 'une sortie en raquettes', types: TOUR_TYPES, words: ['snowshoe', 'raquette'], minutes: 150, re: /\b(?:snowshoe\w*|raquettes?)\b/ },
  dog_sled: { en: 'dog sledding', fr: 'du traîneau à chiens', types: TOUR_TYPES, words: ['dog sled', 'dogsled', 'sled dog', 'traineau a chiens'], minutes: 150, re: /\b(?:dog ?sled\w*|sled dogs?|traineaux? a chiens)\b/ },
  sleigh: { en: 'a sleigh ride', fr: 'une balade en traîneau', types: TOUR_TYPES, words: ['sleigh'], minutes: 90, re: /\b(?:sleigh rides?|balades? en traineau)\b/ },
  heli: { en: 'a helicopter tour', fr: 'un tour d’hélicoptère', types: ['tour'], words: ['helicopter', 'heli'], minutes: 90, re: /\b(?:helicopter\w*|heli ?tours?|helicopteres?)\b/ },
  bobsleigh: { en: 'the bobsleigh', fr: 'du bobsleigh', types: TOUR_TYPES, words: ['bobsleigh', 'bobsled', 'sliding centre', 'skeleton'], minutes: 120, re: /\b(?:bobsleigh|bobsled\w*|skeleton)\b/ },
  bear_tour: { en: 'a bear viewing tour', fr: 'une excursion d’observation des ours', types: ['tour'], words: ['bear'], minutes: 180, re: /\bbears? (?:viewing|watching|tours?|safari)\b|\b(?:observation|tour) des ours\b/ },
  atv: { en: 'an off-road tour', fr: 'une excursion hors route', types: TOUR_TYPES, words: ['atv', 'rzr', 'side-by-side', 'off-road', 'buggy', '4x4'], minutes: 150, re: /\b(?:atv|rzr|side[- ]by[- ]sides?|off[- ]road(?:ing)?|4x4|buggy|vtt motorise)\b/ },
  rafting: { en: 'rafting', fr: 'du rafting', types: TOUR_TYPES, words: ['raft'], minutes: 180, re: /\b(?:rafting|raft tours?)\b/ },
  horse: { en: 'horseback riding', fr: 'une randonnée à cheval', types: TOUR_TYPES, words: ['horse', 'riding stable', 'trail ride', 'equestrian'], minutes: 120, re: /\b(?:horse(?:back)?(?: riding)?|trail rides?|a cheval|equitation)\b/ },
  bike_tour: { en: 'a bike tour', fr: 'un tour à vélo', types: ['tour'], words: ['cycle', 'cycling', 'bike', 'ebike', 'e-bike'], minutes: 180, re: /\b(?:bike|e-?bike|cycling|bicycle) (?:tours?|rentals?)\b|\btours? (?:a|en) velo\b/ },
  cat_ski: { en: 'cat skiing', fr: 'du catski', types: TOUR_TYPES, words: ['cat ski', 'catski', 'snowcat', 'heli-ski', 'heliski'], minutes: 420, re: /\b(?:cat[- ]?ski\w*|snowcats?|heli[- ]?ski\w*)\b/ },
  ghost_tour: { en: 'a ghost tour', fr: 'une visite hantée', types: ['tour'], words: ['ghost'], minutes: 90, re: /\bghost (?:tours?|walks?)\b|\bvisites? hantees?\b/ },
};
const tourKindOf = (k) => TOUR_KINDS[k] || null;

// ---------- Several asks in one message ----------
// "drop the museum, add a wine tour Saturday and find us a hotel with a hot tub": cut at a comma, "and", "then", "also"
// (et, puis, aussi) only where the next part starts a new ask (its own verb), so "wineries and a brewery" stays whole.
const ASK_START = "(?:please |can you |could you |svp |s'il vous plait |pouvez-vous |peux-tu )?(?:remove|drop|skip|delete|cut|take (?:out|off)|get rid of|add|include|find|get|book|reserve|swap|replace|switch|change|move|put|make|keep|we need|we want|we'd like|we would like|i need|i want|i'd like|we are|we're|we have|we don't|we do not|no more|is |are |does |do |what |when |why |how |where |enleve[rz]?|retire[rz]?|supprime[rz]?|ajoute[rz]?|trouve[rz]?|reserve[rz]?|remplace[rz]?|change[rz]?|deplace[rz]?|mets|garde[rz]?|on a besoin|on veut|nous voulons|il nous faut|on arrive|nous arrivons|est-ce|pourquoi|combien)\\b";
const SPLIT_RE = new RegExp(`\\s*(?:[,;]\\s*(?:and then|and also|and|then|also|plus|et aussi|et puis|et|puis|aussi)?|\\.\\s+|\\s(?:and then|and also|and|then|also|plus|et aussi|et puis|et|puis)\\s)\\s*(?=${ASK_START})`, 'g');
function splitAsks(message) {
  const m = String(message || '').replace(/\s+/g, ' ').trim();
  // Folded only to find the cut points; the parts keep the visitor's own letters.
  const f = fold(m);
  if (f.length !== m.length) return [m];
  const parts = [];
  let last = 0, hit;
  SPLIT_RE.lastIndex = 0;
  while ((hit = SPLIT_RE.exec(f))) {
    if (hit.index === last && !hit[0]) { SPLIT_RE.lastIndex += 1; continue; }
    if (hit.index > last) parts.push(m.slice(last, hit.index));
    last = hit.index + hit[0].length;
  }
  parts.push(m.slice(last));
  return parts.map((p) => p.replace(/^[\s,;.]+|[\s,;.]+$/g, '')).filter((p) => /[a-zA-Z]{2}/.test(fold(p))).slice(0, 5);
}
// read: (message) -> { ops, cant, ... } (the word rules for one ask). -> the whole message's reading; with two or more
// asks that were each read, their operations in order ({ multi: n }).
const opSig = (o) => JSON.stringify([o.o, (o.stops || []).map((s) => s.id), o.kind, o.value, o.day, o.time, o.n, o.region]);
function readAll(message, read) {
  const whole = read(message);
  const parts = splitAsks(message);
  if (parts.length < 2) return whole;
  const reads = parts.map((p) => read(p));
  if (!reads.every((r) => (r.ops || []).length && !(r.ops || []).some((o) => o.o === 'refine'))) {
    // One part is a clear "can't" or was not read: the whole message's reading stands, unless it read less.
    const some = reads.filter((r) => (r.ops || []).length && !(r.ops || []).some((o) => o.o === 'refine'));
    const missed = reads.filter((r) => !(r.ops || []).length && ['not_found', 'booking', 'ask_which', 'time_at', 'weather', 'days_max', 'days_min'].includes(r.cant)).map((r) => ({ cant: r.cant, what: r.what || null }));
    // Every part read (some as a plain "can't"): the parts stand. A part not read at all: the whole message's reading, unless the parts read more.
    const allRead = some.length + missed.length === reads.length;
    if (!some.length || (some.length + missed.length < 2) || (!allRead && (whole.ops || []).length >= some.reduce((n, r) => n + r.ops.length, 0))) return whole;
    const ops2 = [];
    for (const r of some) for (const o of r.ops) if (!ops2.some((x) => opSig(x) === opSig(o))) ops2.push(o);
    // Every part was read (some as a plain "can't", said in the reply): the rules stand. A part not read at all: the AI may know better.
    return { ops: ops2.slice(0, 8), cant: null, multi: some.length + missed.length, missed, ...(some.length + missed.length < reads.length ? { partial: true } : {}) };
  }
  const ops = [];
  for (const r of reads) for (const o of r.ops) if (!ops.some((x) => opSig(x) === opSig(o))) ops.push(o);
  return { ops: ops.slice(0, 8), cant: null, multi: reads.length, exact: reads.some((r) => r.exact) };
}

// ---------- Word rules for the new abilities (English and French; t is the folded message) ----------
const WD_KEYS = { sunday: 'sun', dimanche: 'sun', monday: 'mon', lundi: 'mon', tuesday: 'tue', mardi: 'tue', wednesday: 'wed', mercredi: 'wed', thursday: 'thu', jeudi: 'thu', friday: 'fri', vendredi: 'fri', saturday: 'sat', samedi: 'sat' };
const WD_RE = new RegExp(`\\b(${Object.keys(WD_KEYS).join('|')})s?\\b`);
function weekdayIn(message) { const m = WD_RE.exec(fold(message)); return m ? WD_KEYS[m[1]] : null; }
const NUMS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8 };
const numOf = (w) => (w === undefined || w === null ? null : (Number(w) || NUMS[w] || null));

const STAY_NOUN = "(?:place to stay|places to stay|somewhere to (?:stay|sleep)|hotels?|motels?|accommodations?|lodging|airbnb|cabin|condo|b&b|hotel rooms?|rooms? for the night|logement|hebergement|chambre d.hotel|endroit ou (?:dormir|loger)|ou dormir|ou loger)";
const STAY_ADD_RE = new RegExp(`\\b(?:find|add|need|get|want|book|suggest|recommend|pick|choose|looking for|look for|trouve[rz]?|ajoute[rz]?|besoin|cherch\\w+|il nous faut|reserve[rz]?)\\b[^.]*\\b${STAY_NOUN}\\b|\\bsomewhere (?:for )?(?:the |\\w+ )?night\\b|\\bwhere (?:should|can|could|do) we (?:stay|sleep)\\b|\\b(?:stay|spend|sleep) (?:the |over ?)night\\b|\\bstay over\\b|\\bpasser la nuit\\b|\\bquelque part (?:pour la nuit|ou dormir)\\b|\\bou (?:peut-on|pouvons-nous) (?:dormir|loger)\\b`);
const STAY_REMOVE_RE = new RegExp(`\\b(?:remove|drop|cancel|delete|skip|take (?:out|off)|no need for|don'?t need|do not need|won'?t need|no more|without|forget|enleve[rz]?|retire[rz]?|supprime[rz]?|annule[rz]?|pas besoin d[e']|plus besoin d[e']|sans)\\b[^.]{0,30}\\b${STAY_NOUN}\\b|^no (?:hotel|motel|place to stay|accommodations?)\\b|\\b(?:staying|stay|sleeping|sleep|crashing) (?:with|at) (?:friends|family|my|our|a friend)\\b|\\b(?:driving|heading|going) (?:back )?home (?:that|the same|after|tonight|at)\\b|\\bon (?:dort|loge) chez\\b|\\bon rentre (?:a la maison|chez nous)\\b`);
const NIGHT_ADD_RE = /\b(?:add|one more|another|an extra|extra|stay) (?:a |one |an? extra |another )?night\b|\bune nuit de plus\b|\bajoute[rz]? une nuit\b|\bune autre nuit\b/;
const NIGHT_LESS_RE = /\b(?:remove|drop|cut|lose|one less|one fewer|skip|take (?:out|off)) (?:a |one |the (?:last |extra )?)?(?:night|day)\b|\b(?:one|a) (?:night|day) (?:less|shorter)\b|\bune (?:nuit|journee) de moins\b|\bun jour de moins\b|\benleve[rz]? (?:un jour|une nuit|une journee|le dernier jour)\b/;
const FLY_RE = /\b(?:fly(?:ing)? (?:in|into|to)|flight (?:lands|arrives|gets in|is)|landing (?:at|in)|land(?:s)? (?:at|in)|arriv\w+ (?:at|by|into) (?:the )?(?:\w+ )?(?:airport|plane)|coming by (?:plane|air)|on arrive (?:a l'aeroport|en avion|par avion)|nous arrivons (?:a l'aeroport|en avion|par avion)|par avion|en avion|ylw|yvr|yyf|ykf|ykx)\b/;
const SHUTTLE_RE = /\b(?:need|add|book|find|get|want|is there|are there|take|y a-t-il|besoin|ajoute[rz]?|trouve[rz]?)\b[^.]*\b(?:airport )?(?:shuttles?|transfers?|navettes?|bus from the airport)\b|\bairport (?:shuttle|transfer)\b|\bnavette (?:de|depuis) l'aeroport\b/;
const NO_RENTAL_RE = /\b(?:no (?:rental )?car after all|no rental|(?:don'?t|do not|won'?t) need (?:a|the|that) (?:rental )?(?:car|rental)|(?:cancel|remove|drop|skip|forget|take off) (?:the |that |our )?(?:rental(?: car)?|car(?: rental)?)|no need for (?:a|the) (?:rental )?car|pas besoin d[e'](?: une| la)? ?(?:voiture|location)|(?:enleve[rz]?|annule[rz]?) la (?:voiture|location)|finalement pas de voiture)\b/;
const RENTAL_RE = /\b(?:rent(?:al)? (?:a )?cars?|rent(?:ing)? a (?:car|vehicle|suv|van)|car rentals?|rental car|need (?:a|the) (?:car|vehicle)|add (?:a|the) (?:rental )?car|louer une (?:voiture|auto)|location de voiture|besoin d'une (?:voiture|auto))\b/;
const MOVE_VERB_RE = /\b(?:move|put|shift|push|do|have|bring|deplace[rz]?|mets|mettre|faire|fais|faisons)\b/;
const EDIT_VERB_RE = /\b(?:add|swap|replace|remove|drop|skip|delete|instead|ajoute[rz]?|remplace[rz]?|enleve[rz]?|retire[rz]?)\b/;
const QUESTION_START_RE = /^(?:is|are|does|do|what|what's|when|why|how|where|which|who|est-ce|c'est|pourquoi|comment|combien|a quelle|quand|ou est|quel|quelle|y a-t-il|peut-on)\b/;
const Q_TOPICS = [
  ['q_why', /\bwhy\b|\bpourquoi\b|\bwhat(?:'s| is) (?:special|good|so good|great) about\b|\bwhat makes\b/],
  ['q_far', /\bhow far\b|\bdistance\b|\bhow long (?:is|does|to)[^?]*\b(?:drive|walk|get|take)\b|\bfar from\b|\bclose to\b|\ba quelle distance\b|\bc'est loin\b|\bloin d[eu]\b|\bcombien de temps pour\b/],
  ['q_open', /\bopen(?:s|ing)?\b|\bclosed?\b|\bcloses?\b|\bhours\b|\bwhat time\b|\bouvert\w*\b|\bouvre\w*\b|\bferme\w*\b|\ba quelle heure\b|\bheures\b|\bhoraires?\b/],
  ['q_book', /\b(?:need|have|should) (?:to |we )?(?:book|reserve)\b|\breservations?\b|\bbook ahead\b|\bfaut-il reserver\b|\bdoit-on reserver\b/],
  ['q_price', /\bhow much\b|\bcosts?\b|\bprices?\b|\bexpensive\b|\bcombien\b|\bprix\b|\bcher\b|\bchere\b/],
  ['q_dog', /\b(?:dogs?|pets?|chiens?|pup)\b/],
  ['q_kids', /\b(?:kids?|children|child|toddlers?|famil\w+|enfants?|bebes?|bab(?:y|ies)|strollers?)\b/],
  ['q_patio', /\b(?:patio|terrasse|outdoor seating)\b/],
  ['q_vegan', /\b(?:vegan|vegetalien\w*|vegetarian|vegetarien\w*|gluten)\b/],
  ['q_view', /\b(?:lake ?view|view|vue)\b/],
];
const Q_VALUES = Q_TOPICS.map(([k]) => k);
const SKI_ASK_RE = /\b(?:lifts?|gondolas?|chairlifts?|ski hill|remontees?|telecabines?)\b/;
const SKI_NAME_RE = /\b(?:ski|resort|blackcomb|big white|silverstar|silver star|apex mountain|baldy|gondola|sun peaks)\b/;

// The asks only this file reads. h: helpers from trip-chat.js { op, stopsNamed, ordinalPick, kindsNamed, stayAmenitiesIn }.
// -> { ops, cant } or null (the older rules read the message).
function agentRules(t, stops, ctx, h) {
  const { regions = [], regionLabels = {}, days = 1, weekdays = {} } = ctx;
  const op = h.op;
  const wdM = Object.keys(weekdays).length ? new RegExp(`\\b(${Object.keys(weekdays).join('|')})s?\\b`).exec(t) : null;
  const dayM = /\b(?:day|jour)\s*(\d)\b/.exec(t);
  const day = dayM ? Number(dayM[1]) : wdM ? weekdays[wdM[1]] : null;
  const regionIn = (s) => regions.find((x) => new RegExp(`\\b${fold(regionLabels[x] || x).replace(/[^a-z0-9 ]/g, '.')}\\b`).test(s)) || null;
  const editVerb = EDIT_VERB_RE.test(t);

  // 0. "add a spa on Saturday afternoon instead of the park": the stop named after "instead of" is the one replaced.
  const inst = /\b(?:instead of|in place of|rather than|au lieu d[eu]|a la place d[eu])\s+(?:the\s+|our\s+|that\s+|la\s+|le\s+|l')?([a-z' -]+?)(?:\s+(?:on|le|du)\s+.*)?[.!]*$/.exec(t);
  if (inst) {
    let target = h.stopsNamed(inst[1], stops);
    // A plain word of the stop's name ("the park", "the gallery") names it here.
    if (!target.length) { const ws = inst[1].split(/[^a-z0-9']+/).filter((w) => w.length >= 4); target = stops.filter((s) => ws.some((w) => fold(s.name).split(/[^a-z0-9']+/).includes(w))); }
    if (day && target.some((s) => s.day === day)) target = target.filter((s) => s.day === day);
    const kind = h.kindsNamed(t.slice(0, inst.index))[0] || null;
    if (target.length && kind) return { ops: [op('replace', { stops: [target[0]], kind })], cant: null, exact: true };
    if (!target.length && kind) return { ops: [], cant: 'not_found', what: null };
  }
  // 0b. "we like to sleep in, start the days at 10:30": every day starts then.
  const startAt = /\b(?:start|begin|commence[rz]?|debute[rz]?)\b[^.]*\b(?:days?|mornings?|journees?|jours?)\b[^.]*\b(?:at|a|vers)\s+(\d{1,2})(?:[:h](\d{2}))?\s*(am|pm|h)?(?![\w-])/.exec(t);
  if (startAt && !/\b(?:day|jour)\s*\d\b/.test(t)) {
    let hh = Number(startAt[1]); const mm = Number(startAt[2] || 0);
    if (startAt[3] === 'pm' && hh < 12) hh += 12;
    if (hh >= 6 && hh <= 15 && mm < 60) return { ops: Array.from({ length: days }, (_, i) => op('time', { value: 'later', day: i + 1, n: hh * 60 + mm })), cant: null, exact: true };
  }
  // 1. A question about a stop, answered from its listing's stored facts (never a guess).
  const asksQ = (/\?\s*$/.test(t) || QUESTION_START_RE.test(t)) && !editVerb && !(/^(?:can|could|would|will|may|peux|pouvez|peut-on|pourrait-on)\b/.test(t) && !/\b(?:bring|allowed|welcome|go in|amener|acceptes?)\b/.test(t));
  if (asksQ) {
    const topic = (Q_TOPICS.find(([, re]) => re.test(t)) || [])[0] || null;
    if (topic) {
      let named = h.stopsNamed(t, stops);
      const by = named.byName || [];
      if (by.length) named = by; else if (day && named.some((s) => s.day === day)) named = named.filter((s) => s.day === day);
      named = h.ordinalPick(t, named);
      // "the lifts", "the mountain": the ski hill on the plan.
      if (!named.length && SKI_ASK_RE.test(t)) named = stops.filter((s) => SKI_NAME_RE.test(fold(s.name)));
      // "is it open Sunday?" with one stop that day, or a plan with one stop.
      if (!named.length && /\b(?:it|this|that|they|c'est|il|elle)\b/.test(t)) { const pool = day ? stops.filter((s) => s.day === day) : stops; if (pool.length === 1) named = pool; }
      const far = topic === 'q_far';
      // "how far is it from the hotel": without a stop named, every stop is too vague; the first stop of the day is not a guess we make.
      if (!named.length) return { ops: [], cant: far && /\b(?:hotel|stay|motel|logement|hebergement)\b/.test(t) && stops.length ? 'ask_which' : 'ask_which' };
      return { ops: [op('ask', { value: topic, stops: named.slice(0, far ? 2 : 1), day, wd: wdM ? WD_KEYS[wdM[1]] : null })], cant: null };
    }
  }

  // 2. Getting there and around.
  if (NO_RENTAL_RE.test(t)) return { ops: [op('transport', { value: 'no_rental' })], cant: null };
  if (FLY_RE.test(t) && !/\b(?:book|find|cheap|price of|cost of)\b[^.]*\bflights?\b/.test(t)) {
    const ops = [op('transport', { value: 'fly_in' })];
    if (RENTAL_RE.test(t)) ops.push(op('transport', { value: 'rental', day }));
    return { ops, cant: null };
  }
  if (SHUTTLE_RE.test(t) && !/\b(?:taking|take) the (?:bus|shuttle)\b/.test(t)) return { ops: [op('transport', { value: 'shuttle' })], cant: null };
  if (RENTAL_RE.test(t) && day) return { ops: [op('transport', { value: 'rental', day })], cant: null };

  // 3. The place to stay: taken off, or asked for on any plan (the older stay rules read the price, amenities and town).
  const amenities = h.stayAmenitiesIn(t, true);
  if (STAY_REMOVE_RE.test(t) && !amenities.length && !/\b(?:cheaper|nicer|different|another|autre)\b/.test(t)) return { ops: [op('stay', { value: 'have_place' })], cant: null };
  const nightAdd = NIGHT_ADD_RE.test(t);
  if (nightAdd && !/\b(?:day|jour)\s*\d\b/.test(t)) {
    const r = regionIn(t);
    // "add a night": one more day and night on a trip of two or more days; on a day plan, a place to stay for the night.
    if (days > 1 || r) return { ops: [op('days', { n: Math.min(7, days + 1), ...(r ? { region: r } : {}) })], cant: days >= 7 ? 'days_max' : null };
    return { ops: [op('stay', { value: 'add' })], cant: null };
  }
  if (NIGHT_LESS_RE.test(t) && !h.stopsNamed(t, stops).length) return days > 1 ? { ops: [op('days', { n: days - 1 })], cant: null } : { ops: [], cant: 'days_min' };
  if (STAY_ADD_RE.test(t) || (/\b(?:somewhere|someplace|a place|quelque part|un endroit)\b/.test(t) && amenities.length && !/\b(?:eat|dinner|lunch|drink|manger|souper|diner)\b/.test(t))) {
    const price = /\b(?:cheaper|cheap|budget|less expensive|affordable|moins chere?|pas chere?)\b/.test(t) ? 'budget' : /\b(?:nicer|nice|fancier|fancy|luxur\w*|upscale|plus chic|chic|haut de gamme)\b/.test(t) ? 'upscale' : null;
    const stayIn = /\b(?:in|at|near|a|en|pres de)\s+([a-z' -]+)$/.exec(t.replace(/[?.!]+$/, ''));
    const r = regionIn(t.replace(/^.*?\b(?:in|at|near|a|en|pres de)\b/, ' ')) || (stayIn ? regionIn(stayIn[1]) : null);
    const vals = [price, ...amenities, /\bhotels?\b/.test(t) && !/\bmotels?\b/.test(t) ? 'hotel' : null].filter(Boolean);
    const ops = (vals.length ? vals : ['add']).map((v, i) => op('stay', { value: v, region: i === 0 ? r : null }));
    return { ops, cant: null };
  }

  // 4. Who is coming: the number of adults.
  const ad = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|un|une|deux|trois|quatre|cinq|six|sept|huit)\s+(?:adults?|adultes?|grown[- ]?ups)\b/.exec(t) || /\b(?:we are|we're|there are|there will be|nous sommes|on est|on sera)\s+(\d{1,2}|two|three|four|five|six|seven|eight|deux|trois|quatre|cinq|six|sept|huit)(?:\s+(?:people|of us|personnes|now|maintenant))?\b(?!\s*(?:days?|jours?|nights?|nuits?|kids?|enfants?|year|ans))/.exec(t);
  if (ad && numOf(ad[1]) && !editVerb) {
    const ops = [op('party', { value: 'adults', n: Math.min(12, numOf(ad[1])) })];
    return { ops, cant: null, more: true };
  }

  // 5. One stop's own time ("move dinner to 6:30"): the planner's stopStarts hook; said plainly without it.
  const clockM = /\b(?:to|at|for|vers|a)\s+(\d{1,2})(?:[:h](\d{2}))?\s*(am|pm|h)?(?![\w-])/.exec(t) || /\b(?:make it|it)\s+(\d{1,2})(?:[:h](\d{2}))\s*(am|pm|h)?(?![\w-])/.exec(t);
  if (clockM && /\b(?:move|change|make|set|shift|push|have|deplace[rz]?|mets|mettre)\b/.test(t) && !/\b\d+\s*(?:days?|jours?|nights?|people|adults?|kids?|stops?)\b/.test(t) && !/\b(?:day|jour)\s*\d\b/.test(t) && (clockM[2] || clockM[3] || /\b(?:lunch|dinner|supper|souper|breakfast|brunch|it)\b/.test(t))) {
    let named = h.ordinalPick(t, h.stopsNamed(t, stops));
    if (day && named.some((s) => s.day === day)) named = named.filter((s) => s.day === day);
    const s = named[0] || null;
    if (!s) return { ops: [], cant: 'time_at' };
    let hh = Number(clockM[1]);
    const mm = Number(clockM[2] || 0);
    if (hh > 23 || mm > 59) return { ops: [], cant: 'time_at' };
    if (clockM[3] === 'pm' && hh < 12) hh += 12;
    else if (clockM[3] === 'am' && hh === 12) hh = 0;
    else if (!clockM[3] && hh < 12 && hh >= 1 && (s.role === 'dinner' || (Number.isInteger(s.start) && s.start >= 780) || hh <= 7)) hh += 12;
    return { ops: [op('set_time', { stops: [s], n: hh * 60 + mm })], cant: null };
  }

  // 6. A stop moved to another day, another part of the day, or before / after another stop.
  if (MOVE_VERB_RE.test(t) && !editVerb && !/\b(?:later|earlier|plus tard|plus tot)\b/.test(t)) {
    const rel = /\b(before|after|avant|apres)\s+(?:the\s+|our\s+|le\s+|la\s+|l')?([a-z' -]+)$/.exec(t.replace(/[?.!]+$/, '').replace(new RegExp(`\\s+(?:on |le |du |au )?(?:(?:day|jour)\\s*\\d|${Object.keys(WD_KEYS).join('|')})$`), ''));
    const head = rel ? t.slice(0, rel.index) : t;
    let named = h.stopsNamed(head, stops);
    const by = named.byName || [];
    // The stop must be one on the plan, named by its name or as "the winery" (not "a winery", which is an add).
    const definite = by.length > 0 || /\b(?:the|our|that|this|le|la|les|notre|ce|cette)\s+(?:\w+\s+)?(?:\w+)\b/.test(head) || /\b(?:lunch|dinner|supper|souper|diner|dejeuner)\b/.test(head);
    if (by.length) named = by;
    named = h.ordinalPick(head, named);
    const time = /\bmorning|matin\b/.test(t) ? 'morning' : /\bafternoon|apres-midi\b/.test(t) ? 'afternoon' : /\bevening|tonight|soir\b/.test(t) ? 'evening' : null;
    const anchor = rel ? h.stopsNamed(rel[2], stops).filter((s) => !named.includes(s)) : [];
    const s = named.find((x) => !day || x.day !== day || anchor.length || time) || null;
    const toDay = day && s && s.day !== day ? day : null;
    if (s && definite && (toDay || anchor.length || time)) {
      const a = anchor.find((x) => x.day === (toDay || s.day)) || anchor[0] || null;
      return { ops: [op('move', { stops: a ? [s, a] : [s], day: toDay || (a ? a.day : null), time: a ? null : time, value: rel && /^(?:before|avant)$/.test(rel[1]) ? 'earlier' : null })], cant: null };
    }
  }
  return null;
}

// ---------- Moving a stop, and one stop's own time (day plans) ----------
const DAYPARTS = ['morning', 'midday', 'afternoon', 'late', 'evening', 'night'];
const partOf = (key) => String(key).split('-')[1];
// A re-run that must give back the same plan: the stops' own times are sent as stopStarts, and a place the planner adds
// to a free part of a day is kept out and the run tried again (up to three times). -> { plan, nw, args } or {}.
const startsOf = (stops, freeKeys = []) => Object.fromEntries(stops.filter((x) => /^\d-/.test(x.key) && Number.isInteger(x.start) && !freeKeys.includes(x.key)).map((x) => [x.key, x.start]));
function runSteady(ctx, args, known) {
  let plan = null;
  try { plan = ctx.run(args); } catch (e) { plan = null; }
  if (!plan || !ctx.isDayPlan(plan)) return {};
  stripExtras(plan, new Set(known.map((x) => x.id)));
  return { plan, nw: ctx.planStops(plan), args: { ...args } };
}
// A pinned re-run fills a free part of a day with a place nobody asked for: those stops (not in keepIds, on days up to
// maxDay) are taken out of the plan that goes back, with their rows of the schedule. -> how many.
function stripExtras(plan, keepIds, maxDay = 99) {
  const gone = [];
  for (const d of (plan && plan.days) || []) {
    if (d.day > maxDay) continue;
    d.stops = (d.stops || []).filter((s) => { if (s && s.venue && Number.isInteger(s.venue.id) && !keepIds.has(s.venue.id)) { gone.push([d.day, s.venue.id]); return false; } return true; });
  }
  if (gone.length && Array.isArray(plan.schedule)) plan.schedule = plan.schedule.filter((r) => !gone.some(([d, id]) => r.day === d && r.venueId === id));
  return gone.length;
}
// state: { stops, args, locks (the visitor's own kept stops) }. ctx: { run, hooks, planStops, isDayPlan }.
// -> { plan, nw, args, result } (result.ok false with a why when it could not be done; the plan is then untouched).
function moveStop(op, state, ctx) {
  const r = { op: op.o, ok: false, local: true };
  const now = (x) => (x ? state.stops.find((y) => y.id === x.id) || null : null);
  const s = now(op.stops[0]);
  r.stop = s || op.stops[0];
  if (!s || !/^\d-/.test(s.key)) { r.why = 'no_fit'; return { result: r }; }
  if (op.o === 'set_time') {
    r.minutes = op.n;
    if (!(ctx.hooks && ctx.hooks.stopStarts)) { r.why = 'no_hook'; return { result: r }; }
    const pinned = {};
    for (const x of state.stops) if (/^\d-/.test(x.key)) pinned[x.key] = x.id;
    const explicit = { ...((state.args.overrides || {}).stopStarts || {}), [s.key]: op.n };
    const args = { ...state.args, pinned, trustedPins: Object.keys(pinned), swap: null, overrides: { ...(state.args.overrides || {}), stopStarts: { ...startsOf(state.stops, [s.key]), ...explicit } } };
    const ran = runSteady(ctx, args, state.stops);
    const plan = ran.plan, nw = ran.nw || null;
    if (plan) ran.args.overrides = { ...ran.args.overrides, stopStarts: explicit };
    const at = nw && nw.find((x) => x.key === s.key && x.id === s.id);
    // The planner says why it refused (closed then, or no room): stopStartRefused [{ key, reason, opensMinutes, closesMinutes }].
    const refused = plan && Array.isArray(plan.stopStartRefused) ? plan.stopStartRefused.find((x) => x.key === s.key) : null;
    if (refused) { r.why = 'refused'; r.refused = refused; return { result: r }; }
    if (!at || at.start !== op.n || !state.stops.every((x) => nw.some((y) => y.id === x.id)) || !nw.every((y) => state.stops.some((x) => x.id === y.id))) { r.why = 'no_fit'; return { result: r }; }
    r.ok = true; r.fresh = at;
    return { plan, nw, args: ran.args, result: r };
  }
  const anchor = now(op.stops[1]);
  const day = op.day || (anchor && anchor.day) || s.day;
  const occ = new Map(state.stops.filter((x) => x.day === day && x.id !== s.id).map((x) => [partOf(x.key), x]));
  const mealPart = s.role === 'lunch' ? 'midday' : s.role === 'dinner' ? 'evening' : null;
  let order;
  if (anchor) {
    const i = DAYPARTS.indexOf(partOf(anchor.key));
    const before = op.value === 'earlier';
    // Right next to it first, then further the same way.
    order = before ? DAYPARTS.slice(0, i).reverse() : DAYPARTS.slice(i + 1);
    r.anchor = anchor; r.before = before;
  } else if (op.time) order = { morning: ['morning'], midday: ['midday', 'afternoon'], afternoon: ['afternoon', 'late'], evening: ['late', 'evening', 'night'] }[op.time] || [];
  else order = [partOf(s.key), 'afternoon', 'late', 'morning'];
  if (mealPart) order = order.filter((p) => p === mealPart || (mealPart === 'evening' && p === 'night'));
  else order = order.filter((p) => p !== 'midday' && p !== 'evening');
  order = [...new Set(order)].filter((p) => !(day === s.day && p === partOf(s.key)));
  // A free part of the day first; else the stop there trades places (never a meal with a non-meal, or a stop the visitor kept).
  let to = null, other = null;
  for (const p of order) {
    const x = occ.get(p);
    if (!x) { to = p; break; }
    if (!!x.role === !!s.role && (state.locks || {})[x.key] !== x.id) { to = p; other = x; break; }
  }
  if (!to) { r.why = 'no_room'; r.day = day; return { result: r }; }
  const toKey = `${day}-${to}`;
  // The planner's moves hook (a stop in the target slot trades places); without it, the same by pins.
  const useHook = !!(ctx.hooks && ctx.hooks.moves);
  const pinned = {};
  for (const x of state.stops) { if (!/^\d-/.test(x.key)) continue; pinned[useHook ? x.key : x.id === s.id ? toKey : other && x.id === other.id ? s.key : x.key] = x.id; }
  // The stop moved (and the one that trades places with it) is free to take its new time; every other stop keeps its own.
  const free = [s.key, toKey];
  const kept = { ...((state.args.overrides || {}).stopStarts || {}) };
  for (const k of free) delete kept[k];
  const args = { ...state.args, pinned, swap: null, ...(useHook ? { trustedPins: Object.keys(pinned).filter((k) => !free.includes(k)), moves: [{ from: s.key, to: toKey }], overrides: { ...(state.args.overrides || {}), stopStarts: { ...startsOf(state.stops, free), ...kept } } } : {}) };
  const ran = useHook ? runSteady(ctx, args, state.stops) : (() => { try { const p = ctx.run(args); return p && ctx.isDayPlan(p) ? { plan: p, nw: ctx.planStops(p), args } : {}; } catch (e) { return {}; } })();
  const plan = ran.plan || null, nw = ran.nw || null;
  if (plan && useHook) { ran.args.overrides = { ...ran.args.overrides, stopStarts: kept }; if (!Object.keys(kept).length) delete ran.args.overrides.stopStarts; }
  const at = nw && nw.find((x) => x.key === toKey && x.id === s.id);
  const conflict = plan && Array.isArray(plan.moveConflicts) ? plan.moveConflicts.find((x) => x.from === s.key) : null;
  if (conflict) r.conflict = conflict.reason;
  // Every other stop is still on the plan (a move never drops one).
  if (!at || !state.stops.every((x) => nw.some((y) => y.id === x.id)) || !nw.every((y) => state.stops.some((x) => x.id === y.id))) { r.why = 'no_fit'; r.day = day; return { result: r }; }
  // "before lunch" really is before it.
  if (anchor) { const a2 = nw.find((x) => x.id === anchor.id); if (a2 && Number.isInteger(a2.start) && Number.isInteger(at.start) && (r.before ? at.start >= a2.start : at.start <= a2.start)) { r.why = 'no_fit'; return { result: r }; } }
  r.ok = true; r.fresh = at; r.toDay = day !== s.day ? day : null;
  r.other = other ? nw.find((x) => x.id === other.id) || null : null;
  return { plan, nw, args: ran.args, result: r };
}

// ---------- Questions, answered from the listing's own stored facts ----------
const WD_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WD_NAME = { en: { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }, fr: { mon: 'lundi', tue: 'mardi', wed: 'mercredi', thu: 'jeudi', fri: 'vendredi', sat: 'samedi', sun: 'dimanche' } };
function wdOfDate(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${iso}T12:00:00Z`).getUTCDay()] : null; }
function hm(s, L) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const h = Number(m[1]) % 24, mm = Number(m[2]);
  if (L === 'fr') return h === 12 && !mm ? 'midi' : `${h} h${mm ? ` ${String(mm).padStart(2, '0')}` : ''}`;
  if (h === 0 && !mm) return 'midnight';
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}
function parseWeek(hours) {
  let o = hours;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { o = null; } }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const out = {};
  let any = false;
  for (const d of WD_ORDER) {
    const v = o[d];
    if (Array.isArray(v) && v.length && v.every((p) => Array.isArray(p) && p.length === 2)) { out[d] = v; any = true; } else if (v === null || (Array.isArray(v) && !v.length) || v === 'closed') out[d] = [];
  }
  return any ? out : null;
}
const firstSentence = (s) => { const m = /^(.{20,220}?[.!?])(?:\s|$)/.exec(String(s || '').replace(/\s+/g, ' ').trim()); return m ? m[1] : (String(s || '').trim().length <= 220 ? String(s || '').trim() : ''); };
function km(a, b) {
  if (![a, b].every((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng))) return null;
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m)).replace(/\.\./g, '.');
// op: { value: 'q_open'..., wd }. fact: the stop's row from our database { name, type, hours, description,
// description_fr, price, lat, lng, booking, seasonal, and the badge columns as 1 / 0 / null }. extra: { stay: { name,
// lat, lng } | null, other: fact | null, planWd: the weekday of the stop's day on the plan, reason: the planner's own
// "why" line for the stop }. -> one line. A fact the listing does not hold is said so, with where to look.
function answerQuestion(op, fact, extra = {}, lang = 'en') {
  const L = lang === 'fr' ? 'fr' : 'en';
  const t = AGENT_T[L];
  const name = fact.name;
  const details = fill(t.qDetails, { name });
  const yesNo = (col, yes, unknown) => (fact[col] === 1 ? fill(yes, { name }) : fill(unknown, { name }) + ' ' + details);
  switch (op.value) {
    case 'q_open': {
      const week = parseWeek(fact.hours);
      const wd = op.wd || extra.planWd || null;
      if (!week) return fill(t.qNoHours, { name }) + ' ' + details;
      if (!wd) {
        const open = WD_ORDER.filter((d) => (week[d] || []).length);
        const same = open.every((d) => JSON.stringify(week[d]) === JSON.stringify(week[open[0]]));
        return same && open.length === 7 ? fill(t.qOpenDaily, { name, from: hm(week[open[0]][0][0], L), to: hm(week[open[0]][week[open[0]].length - 1][1], L) }) + t.qCheck : fill(t.qOpenDays, { name, days: open.map((d) => WD_NAME[L][d]).join(', ') }) + t.qCheck;
      }
      const slots = week[wd];
      const dayName = WD_NAME[L][wd];
      if (!slots || !slots.length) return fill(t.qClosedDay, { name, day: dayName }) + t.qCheck;
      return fill(t.qOpenDay, { name, day: dayName, from: hm(slots[0][0], L), to: hm(slots[slots.length - 1][1], L) }) + (fact.seasonal ? t.qSeason : t.qCheck);
    }
    case 'q_why': {
      const line = extra.reason || firstSentence(L === 'fr' ? (fact.description_fr || '') : (fact.description || ''));
      return line ? fill(t.qWhy, { name, line: line.replace(/[.!?]+$/, '') }) : fill(t.qNoWhy, { name }) + ' ' + details;
    }
    case 'q_far': {
      const to = extra.other || extra.stay || null;
      if (!to) return fill(t.qFarNoStay, { name });
      const d = km({ lat: fact.lat, lng: fact.lng }, { lat: to.lat, lng: to.lng });
      if (d === null) return fill(t.qFarUnknown, { name, to: to.name }) + ' ' + details;
      const shown = d < 1 ? (L === 'fr' ? 'moins de 1' : 'under 1') : d < 10 ? (Math.round(d * 2) / 2).toString().replace('.', L === 'fr' ? ',' : '.') : String(Math.round(d));
      return fill(t.qFar, { name, to: to.name, km: shown });
    }
    case 'q_kids': return yesNo('kid_friendly', t.qKidsYes, t.qKidsUnknown);
    case 'q_dog': return yesNo('dog_friendly', t.qDogYes, t.qDogUnknown);
    case 'q_patio': return yesNo('patio', t.qPatioYes, t.qPatioUnknown);
    case 'q_view': return yesNo('lake_view', t.qViewYes, t.qViewUnknown);
    case 'q_vegan': {
      const has = [fact.vegan === 1 ? t.wVegan : null, fact.vegetarian === 1 ? t.wVegetarian : null, fact.gluten_free === 1 ? t.wGluten : null].filter(Boolean);
      return has.length ? fill(t.qDiet, { name, what: has.join(', ') }) : fill(t.qDietUnknown, { name }) + ' ' + details;
    }
    case 'q_price': {
      const p = Number(fact.price);
      return p >= 1 && p <= 4 && !['outdoor', 'beach'].includes(fact.type) ? fill(t.qPrice, { name, band: '$'.repeat(p), words: t.priceWords[p - 1] }) + ' ' + details : fill(t.qNoPrice, { name }) + ' ' + details;
    }
    case 'q_book': return fact.booking ? fill(t.qBookYes, { name }) : fill(t.qBookUnknown, { name }) + ' ' + details;
    default: return details;
  }
}

// ---------- Reply templates (merged into trip-chat.js T) ----------
const AGENT_T = {
  en: {
    stayAdded: 'Added a place to stay for {night}: {name} ({facts}){has}.', stayAddedDays: 'Added a place to stay: {name} ({facts}){has}.', nightOf: 'the night of {date}', oneNight: 'one night',
    stayHave: 'You’re staying at {name} ({facts}){has}.', stayRemoved: 'Took the place to stay off the plan.', stayNoneAlready: 'There’s no place to stay on this plan.',
    stayNoListing: 'I couldn’t find a place to stay near these stops in our list.',
    tourAdded: 'Added {new}{at}.', tourFor: 'Added {new}{at} in place of {old}.', tourCovers: 'It covers that day’s {what}, so I took out {names}.', tourCoversW: { winery: 'wineries', brewery: 'breweries' },
    tourNone: 'We don’t list {kind} that fits there.', tourNoneOffer: 'We don’t list {kind} that fits there. The nearest thing we list is {near}: say “add {nearShort}”.', tourNoneCard: 'We don’t list {kind} that fits into the plan there, but here’s one to book for {town}, under “Getting here & tours”.',
    tourNoWine: 'We don’t list wine tours here. I can add a snowmobile tour, ziplining, the bobsleigh or a bear viewing tour.',
    ask_which: 'Which stop do you mean? Ask with its name, like “is {name} open Sunday?”', ask_whichNone: 'Which stop do you mean? Ask with its name.',
    qDetails: 'Tap {name} for its details.', qCheck: ' Check before you go.', qSeason: ' It is seasonal, so check before you go.',
    qNoHours: 'We don’t have hours on file for {name}.', qOpenDay: '{name} is listed as open {day}, {from} to {to}.', qClosedDay: '{name} is listed as closed on {day}.', qOpenDaily: '{name} is listed as open every day, {from} to {to}.', qOpenDays: '{name} is listed as open {days}.',
    qWhy: 'I picked {name} because it fits what you asked for: {line}.', qNoWhy: 'I picked {name} because it fits what you asked for and is near your other stops.',
    qFar: '{name} is about {km} km from {to} in a straight line; the drive is a little longer.', qFarNoStay: 'There’s no place to stay on this plan to measure from. Ask “how far is {name} from” another stop.', qFarUnknown: 'I don’t have a map point for both {name} and {to}.',
    qKidsYes: '{name} is listed as kid-friendly.', qKidsUnknown: 'The listing for {name} doesn’t say if it suits kids.', qDogYes: '{name} is listed as dog-friendly.', qDogUnknown: 'The listing for {name} doesn’t say if dogs are welcome.',
    qPatioYes: '{name} is listed with a patio.', qPatioUnknown: 'The listing for {name} doesn’t mention a patio.', qViewYes: '{name} is listed with a lake view.', qViewUnknown: 'The listing for {name} doesn’t mention a lake view.',
    qDiet: '{name} is listed with {what} options.', qDietUnknown: 'The listing for {name} doesn’t say.', wVegan: 'vegan', wVegetarian: 'vegetarian', wGluten: 'gluten-free',
    qPrice: '{name} is listed at {band} ({words}).', qNoPrice: 'We don’t have a price on file for {name}.', priceWords: ['budget', 'moderate', 'pricier', 'high-end'],
    qBookYes: '{name} has a booking link: its Book button opens it.', qBookUnknown: 'The listing for {name} doesn’t say if you need to book.',
    flyIn: 'Got it, you’re flying into {airport}. The Getting here card has rental cars{shuttle}.', flyInShuttle: ' and an airport shuttle', flyInNoCard: 'Got it, you’re flying into {airport}. It has rental desks; most stops here need a car or a taxi.',
    shuttleYes: 'The Getting here card has an airport shuttle from {airport}.', shuttleNo: 'We don’t list an airport shuttle for this trip. {airport} has taxis and rental desks.',
    noRental: 'Done. I took the rental car off.', carDay: 'Rental cars at {airport}: tap See cars on the Getting here card and set {day} for pick-up and drop-off.', carDayNo: 'I can’t book rental cars here yet. {airport} has rental desks; ask for {day} only.',
    adults: 'Set for {n} adults.', adult1: 'Set for 1 adult.',
    days_max: 'A plan can be 7 days at most.', days_min: 'This plan is already a single day.', nightIn: 'Added a night: day {d} is in {town}.', nightInMiss: 'Added a day, but I couldn’t base it in {town}.',
    movedTo: 'Moved {name} to {when}.', movedDay: 'day {d}', movedSwap: '{other} takes its place{at}.', moveNoRoom: 'There’s no free spot for {name} there. Remove or swap a stop first.', moveFail: 'I couldn’t move {name} there: it isn’t open then or doesn’t fit.',
    setTimeClosed: '{name} isn’t open at {time} (its listed hours are {from} to {to}), so it stays where it is.', setTimeNoRoom: 'There’s no room to put {name} at {time} without moving another stop.', moveClosed: '{name} isn’t open then, so it stays where it is.',
    setTime: '{name} is now at {time}.', setTimeFail: 'I couldn’t put {name} at {time}: it isn’t open then or it clashes with another stop.',
  },
  fr: {
    stayAdded: 'J’ai ajouté un logement pour {night} : {name} ({facts}){has}.', stayAddedDays: 'J’ai ajouté un logement : {name} ({facts}){has}.', nightOf: 'la nuit du {date}', oneNight: 'une nuit',
    stayHave: 'Vous logez à {name} ({facts}){has}.', stayRemoved: 'J’ai retiré le logement du plan.', stayNoneAlready: 'Il n’y a pas de logement dans ce plan.',
    stayNoListing: 'Je n’ai pas trouvé de logement près de ces arrêts dans notre liste.',
    tourAdded: 'J’ai ajouté {new}{at}.', tourFor: 'J’ai ajouté {new}{at} à la place de {old}.', tourCovers: 'Il couvre les {what} de cette journée, donc j’ai retiré {names}.', tourCoversW: { winery: 'vignobles', brewery: 'microbrasseries' },
    tourNone: 'Nous n’avons pas {kind} qui convienne à ce moment dans notre liste.', tourNoneOffer: 'Nous n’avons pas {kind} qui convienne à ce moment. Le plus proche dans notre liste : {near}. Dites « ajoute {nearShort} ».', tourNoneCard: 'Nous n’avons pas {kind} qui s’insère dans le plan à ce moment, mais en voici un à réserver pour {town}, sous « Pour venir et excursions ».',
    tourNoWine: 'Nous n’avons pas de tours des vignobles ici. Je peux ajouter une excursion en motoneige, de la tyrolienne, du bobsleigh ou une observation des ours.',
    ask_which: 'De quel arrêt parlez-vous? Demandez avec son nom, par exemple « est-ce que {name} est ouvert dimanche? »', ask_whichNone: 'De quel arrêt parlez-vous? Demandez avec son nom.',
    qDetails: 'Touchez {name} pour ses détails.', qCheck: ' Vérifiez avant d’y aller.', qSeason: ' C’est saisonnier : vérifiez avant d’y aller.',
    qNoHours: 'Nous n’avons pas les heures de {name}.', qOpenDay: 'Selon sa fiche, {name} est ouvert {day}, de {from} à {to}.', qClosedDay: 'Selon sa fiche, {name} est fermé le {day}.', qOpenDaily: 'Selon sa fiche, {name} est ouvert tous les jours, de {from} à {to}.', qOpenDays: 'Selon sa fiche, {name} est ouvert : {days}.',
    qWhy: 'J’ai choisi {name} parce qu’il correspond à votre demande : {line}.', qNoWhy: 'J’ai choisi {name} parce qu’il correspond à votre demande et qu’il est près de vos autres arrêts.',
    qFar: '{name} est à environ {km} km de {to} à vol d’oiseau; la route est un peu plus longue.', qFarNoStay: 'Il n’y a pas de logement dans ce plan pour mesurer. Demandez « à quelle distance est {name} de » un autre arrêt.', qFarUnknown: 'Je n’ai pas de point sur la carte pour {name} et {to}.',
    qKidsYes: 'Selon sa fiche, {name} convient aux enfants.', qKidsUnknown: 'La fiche de {name} ne dit pas si ça convient aux enfants.', qDogYes: 'Selon sa fiche, {name} accepte les chiens.', qDogUnknown: 'La fiche de {name} ne dit pas si les chiens sont acceptés.',
    qPatioYes: 'Selon sa fiche, {name} a une terrasse.', qPatioUnknown: 'La fiche de {name} ne mentionne pas de terrasse.', qViewYes: 'Selon sa fiche, {name} a une vue sur le lac.', qViewUnknown: 'La fiche de {name} ne mentionne pas de vue sur le lac.',
    qDiet: 'Selon sa fiche, {name} a des options : {what}.', qDietUnknown: 'La fiche de {name} ne le dit pas.', wVegan: 'végétaliennes', wVegetarian: 'végétariennes', wGluten: 'sans gluten',
    qPrice: 'Selon sa fiche, {name} est à {band} ({words}).', qNoPrice: 'Nous n’avons pas de prix pour {name}.', priceWords: ['économique', 'modéré', 'plus cher', 'haut de gamme'],
    qBookYes: '{name} a un lien de réservation : son bouton Réserver l’ouvre.', qBookUnknown: 'La fiche de {name} ne dit pas s’il faut réserver.',
    flyIn: 'Parfait, vous arrivez à {airport}. La carte Pour venir propose des voitures de location{shuttle}.', flyInShuttle: ' et une navette depuis l’aéroport', flyInNoCard: 'Parfait, vous arrivez à {airport}. Il y a des comptoirs de location; la plupart des arrêts demandent une voiture ou un taxi.',
    shuttleYes: 'La carte Pour venir propose une navette depuis {airport}.', shuttleNo: 'Nous n’avons pas de navette d’aéroport pour ce voyage. {airport} a des taxis et des comptoirs de location.',
    noRental: 'C’est fait. J’ai retiré la voiture de location.', carDay: 'Location de voitures à {airport} : touchez Voir les voitures dans la carte Pour venir et choisissez {day} pour la prise et le retour.', carDayNo: 'Je ne peux pas encore réserver de voiture ici. {airport} a des comptoirs de location; demandez {day} seulement.',
    adults: 'Prévu pour {n} adultes.', adult1: 'Prévu pour 1 adulte.',
    days_max: 'Un plan peut compter 7 jours au plus.', days_min: 'Ce plan tient déjà en une journée.', nightIn: 'J’ai ajouté une nuit : le jour {d} est à {town}.', nightInMiss: 'J’ai ajouté un jour, mais je n’ai pas pu le baser à {town}.',
    movedTo: 'J’ai déplacé {name} : {when}.', movedDay: 'jour {d}', movedSwap: '{other} prend sa place{at}.', moveNoRoom: 'Pas de place libre pour {name} à ce moment. Retirez ou remplacez un arrêt d’abord.', moveFail: 'Je n’ai pas pu déplacer {name} à ce moment : ce n’est pas ouvert ou ça ne s’insère pas.',
    setTimeClosed: '{name} n’est pas ouvert à {time} (ses heures : de {from} à {to}), donc il reste où il est.', setTimeNoRoom: 'Pas de place pour mettre {name} à {time} sans déplacer un autre arrêt.', moveClosed: '{name} n’est pas ouvert à ce moment, donc il reste où il est.',
    setTime: '{name} est maintenant à {time}.', setTimeFail: 'Je n’ai pas pu mettre {name} à {time} : ce n’est pas ouvert à cette heure ou ça chevauche un autre arrêt.',
  },
};

// ---------- For the model: the new operations ----------
const PROMPT_LINES = [
  'Travel agent abilities (the trip can be built up and taken apart whatever the first request said):',
  '- stay also ADDS a place to stay to a plan that has none: "find us a place to stay", "add a hotel", "we need somewhere Saturday night" -> stay v add (or the amenity / price asked: "somewhere with a hot tub" -> stay v hot_tub). "remove the hotel", "we don\'t need a place to stay", "we\'re staying with friends" -> stay v have_place.',
  '- add with a tour kind puts a bookable tour or activity INTO the plan as a stop: "add a wine tour", "book us a snowmobile tour", "a boat cruise on Saturday", "ziplining" -> add, k wine_tour / snowmobile / boat_tour / zipline (d = the day). Tour kinds: ' + Object.keys(TOUR_KINDS).join(', ') + '. Never transport or cant booking for these. transport v wine_tour is only for "no driving" / "a designated driver".',
  '- ask: a QUESTION about a stop on the plan (nothing changes). s = that stop; v = q_open ("is it open Sunday?", "what time do the lifts open?"), q_why ("why this place?"), q_far ("how far is it from the hotel?"; a second stop id when it asks the distance between two stops), q_kids ("is it good for kids?"), q_dog, q_price ("how much is it?"), q_book ("do we need to book?"), q_patio, q_vegan, q_view. With no stop you can tell, s [] and v the topic.',
  '- move: put a stop somewhere else in the plan. s = [the stop, then the stop it goes before / after if one is named]; d = the day it moves to (0 = same day); t = the part of the day; v earlier when it goes BEFORE the second stop. "move the winery to day 2" -> move s [winery] d 2. "do the winery before lunch" -> move s [winery, lunch] v earlier. "move lunch later" stays time.',
  '- transport: v fly_in ("we\'re flying into YLW", "our flight lands at 2"), shuttle ("we need an airport shuttle"), no_rental ("no car after all", "cancel the rental car"), rental with d = the day when it is for one day ("a car for Saturday only").',
  '- party v adults with n = how many adults ("we are 4 adults", "there will be six of us").',
  '- days: "add a night" = the current number of days + 1; "add a night in Penticton" -> days n and r penticton.',
  'Several asks in one message are several ops, in the order asked: "drop the museum, add a wine tour Saturday and find us a hotel with a hot tub" -> remove s [museum], add k wine_tour d (Saturday\'s day), stay v hot_tub, stay v hotel.',
];

module.exports = {
  TOUR_KINDS, TOUR_TYPES, tourKindOf, runSteady, startsOf, stripExtras, splitAsks, readAll, agentRules, weekdayIn, wdOfDate, moveStop, answerQuestion, parseWeek, AGENT_T, PROMPT_LINES, Q_VALUES,
  STAY_REMOVE_RE, STAY_ADD_RE, NIGHT_ADD_RE, fold, km,
};
