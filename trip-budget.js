'use strict';
// Build My Trip: the traveller's own budget, read as a preference of the trip (2026-11-23).
//
// Dayton's report: "…We need a hotel for two nights and our total budget is $600 for both of us", then in the chat
// "Does this stay within our total $600 budget including two hotel nights, meals and activities? Please replace the
// splash park with a cycling activity…". The chat changed the hotel (nobody asked), did not answer the question and left
// the splash park. The Book my trip sheet showed an estimate, but the $600 was nowhere on the plan or its shared copy.
//
// This file is the same on okanaganroam.com and whistlerroam.com. It holds:
//   readBudget(text)      the limit in the request's own words ($600 total / per person / a night), English and French;
//   isBudgetQuestion(t)   a chat message that asks what the trip costs or whether it fits the budget (never an edit);
//   facts(estimate, b)    the limit beside the SAME estimate "Book my trip" shows (trip-booking.js tripEstimate): what
//                         is counted, what has no price, and whether the evidence says over, maybe over or under;
//   lines(facts, lang)    the fixed wording for the summary, the sheet, the chat, the shared copy and the copied text;
//   toShare / fromShare   the values a share link carries (bg=, be=); the wording is rebuilt on the server.
// Rules: every figure is an estimate from listing data ("from" prices, price bands, $ levels). Never "within budget":
// "under" is said only of what is priced, and unpriced items are counted beside it. Nothing here changes a plan.

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`]/g, "'");
const int = (v) => (Number.isInteger(v) ? v : null);

// ---------- Reading the limit ----------
const AMOUNT_RE = /(?:\$\s?(\d{1,3}(?:[ ,]\d{3})+|\d{2,6})(?:\.\d{1,2})?(?:\s?(k))?(?![\d$])|(?<![\d$.,])(\d{1,3}(?:[ ,]\d{3})+|\d{2,6})(?:[.,]\d{1,2})?\s?(k)?\s?(?:\$|dollars?\b|bucks\b|cad\b|piastres?\b))/g;
const TOTAL_RE = /\b(?:budget|total|in all|all in|all-in|altogether|all together|whole trip|entire trip|for the trip|for everything|everything included|spend(?:ing)?|afford|en tout|au total|tout compris|tout inclus|pour le voyage|pour tout|depenser)\b/;
const LIMIT_RE = /\b(?:under|below|less than|no more than|not more than|at most|up to|max(?:imum)?|within|limit(?:ed)?|cap(?:ped)?|moins de|maximum|au plus|pas plus de|jusqu'a|ne pas depasser|limite)\b/;
const ITEM_RE = /\b(?:dinners?|lunch(?:es)?|breakfasts?|brunch|meals?|mains?|entrees?|tastings?|tickets?|lift tickets?|passes|rentals?|tours?|green fees?|rounds?|massages?|treatments?|lessons?|soupers?|diners?|dejeuners?|repas|degustations?|billets?|locations?|visites?)\b/;
const STAY_RE = /\b(?:hotels?|motels?|rooms?|stay|lodging|accommodations?|airbnb|cabins?|condos?|suites?|chambres?|hebergement|logement)\b/;
const PER_NIGHT_RE = /\b(?:per night|a night|each night|every night|nightly|\/ ?night|par nuit|la nuit|chaque nuit|\/ ?nuit)\b/;
const PER_PERSON_RE = /\b(?:per person|a person|each|a head|per head|pp|per adult|per guest|\/ ?person|par personne|chacun|chacune|par tete|\/ ?personne)\b/;
const PER_DAY_RE = /\b(?:per day|a day|each day|daily|\/ ?day|par jour|chaque jour|\/ ?jour)\b/;
const WHOLE_RE = /\b(?:total|in all|all in|all-in|altogether|all together|for (?:both|all|the (?:two|three|four|five|six)|everyone|everybody|our (?:family|group))|(?:both|all|two|three|four|five|six) of us|between us|combined|en tout|au total|tout compris|pour nous (?:deux|trois|quatre|tous)|pour (?:tout le monde|la famille|le groupe)|a (?:deux|trois|quatre))\b/;
const NOT_BUDGET_RE = /\b(?:budget is(?:n'?t| not) (?:an? )?(?:issue|concern|problem|object)|no budget|money is no object|sans limite de budget)\b/;

function clauseOf(t, at) {
  let a = at, b = at;
  while (a > 0 && !/[;!?\n]/.test(t[a - 1]) && !(t[a - 1] === '.' && !/\d/.test(t[a] || ''))) a--;
  while (b < t.length && !/[;!?\n]/.test(t[b]) && !(t[b] === '.' && !/\d/.test(t[b + 1] || ''))) b++;
  return { text: t.slice(a, b), from: a };
}
// -> { amount, scope: 'total' | 'per_person' | 'per_night', phrase } or null. The LAST amount of the text that is a
// limit on the trip's cost (a budget said later, in the chat, replaces the first one); a price for one thing ("dinner
// under $50"), a per-day figure and "no budget" are not read.
function readBudget(text) {
  const raw = String(text || ''), t = fold(raw);
  if (!t || NOT_BUDGET_RE.test(t)) return null;
  AMOUNT_RE.lastIndex = 0;
  let m, found = null;
  while ((m = AMOUNT_RE.exec(t))) {
    const digits = String(m[1] || m[3] || '').replace(/[ ,]/g, '');
    let amount = Number(digits);
    if (m[2] || m[4]) amount *= 1000;
    if (!Number.isInteger(amount) || amount < 20 || amount > 200000) continue;
    const c = clauseOf(t, m.index), after = t.slice(m.index + m[0].length, c.from + c.text.length).slice(0, 40), near = c.text;
    if (PER_DAY_RE.test(after.slice(0, 22))) continue;
    const night = PER_NIGHT_RE.test(after.slice(0, 22)) || (PER_NIGHT_RE.test(near) && STAY_RE.test(near) && !TOTAL_RE.test(near.replace(/\bbudget\b/g, '')));
    if (night) { found = { amount, scope: 'per_night', phrase: raw.slice(c.from, c.from + c.text.length).replace(/\s+/g, ' ').trim().slice(0, 140) }; continue; }
    const tripWords = TOTAL_RE.test(near), limitWords = LIMIT_RE.test(near);
    if (!tripWords && !limitWords) continue;
    // A price for one kind of thing ("dinner under $50", "a $200 hotel") is not the trip's budget.
    if (!tripWords && (ITEM_RE.test(near) || STAY_RE.test(near))) continue;
    if (!/\bbudget\b/.test(near) && !WHOLE_RE.test(near) && ITEM_RE.test(near) && !/\b(?:trip|voyage|sejour|weekend|fin de semaine|getaway|vacation|vacances)\b/.test(near)) continue;
    const each = PER_PERSON_RE.test(after.slice(0, 24)) && !WHOLE_RE.test(after.slice(0, 30).replace(/\beach\b/, ''));
    found = { amount, scope: each ? 'per_person' : 'total', phrase: raw.slice(c.from, c.from + c.text.length).replace(/\s+/g, ' ').trim().slice(0, 140) };
  }
  return found;
}

// The few words added to the request when the budget is said (or changed) in the chat; readBudget reads them back.
function phraseFor(b, lang) {
  if (!b || !Number.isInteger(b.amount)) return '';
  const fr = lang === 'fr', a = fr ? `${b.amount} $` : `$${b.amount}`;
  if (b.scope === 'per_night') return fr ? `budget hôtel ${a} par nuit` : `hotel budget ${a} a night`;
  if (b.scope === 'per_person') return fr ? `budget ${a} par personne` : `budget ${a} per person`;
  return fr ? `budget total ${a}` : `total budget ${a}`;
}
const sameBudget = (a, b) => !!a && !!b && a.amount === b.amount && a.scope === b.scope;

// ---------- A chat message that asks about the cost ----------
const Q_FORM_RE = /^(?:(?:and|also|so|ok|okay|et|aussi|alors)[ ,]+)?(?:is|are|does|do|did|will|would|can|could|what|what's|how|which|est-ce|c'est|combien|quel|quelle|peut-on|sommes-nous|reste-t-on|ca)\b/;
const COST_Q_RE = /\b(?:budget|afford)\b|(?:\$\s?\d|\b\d{2,6}\s?(?:\$|dollars?\b))[^?]*\b(?:cover|enough|total|all in|altogether|suffi\w*|en tout|au total)\b|\b(?:within|under|over|below|above|exceed\w*|cover\w*|fit|stay|keep|come in|moins de|sous|depasse\w*|respecte\w*|suffi\w*)\b[^?]*(?:\$\s?\d|\b\d{2,6}\s?(?:\$|dollars?\b))|\bhow much (?:is|does|will|would|do|are|did)\b[^?]*\b(?:trip|plan|itinerary|weekend|getaway|vacation|all(?: of)? (?:this|that|it)|everything|whole thing|this|it|we|total)\b|\b(?:total|overall|estimated?) (?:cost|price|estimate|spend)\b|\bcost (?:in total|altogether|all in|overall)\b|\bwhat(?:'s| is| will| would)? (?:the |our |this |it )?(?:total|estimate|cost|price)\b|\bcombien (?:coute|coutera|couterait|ca coute|va couter)\b[^?]*\b(?:voyage|sejour|plan|tout|fin de semaine|ca|cela)\b|\bcout total\b|\bprix total\b|\bestimation\b/;
const ADJ_BUDGET_RE = /\b(?:a|an|any|some|more|un|une|des) (?:budget|budget-friendly|petit budget)\b|\bbudget[- ](?:friendly|hotels?|motels?|options?|places?|stays?|restaurants?|eats|meals?|rooms?|picks?)\b/;
const EDIT_START_RE = /^(?:please |can you |could you |svp |pouvez-vous |peux-tu )?(?:remove|drop|skip|delete|cut|take (?:out|off)|add|include|find|get|book|reserve|swap|replace|switch|change|move|put|make|keep|lower|reduce|trim|enleve[rz]?|retire[rz]?|supprime[rz]?|ajoute[rz]?|trouve[rz]?|reserve[rz]?|remplace[rz]?|change[rz]?|deplace[rz]?|mets|garde[rz]?|reduis|reduisez|baisse[rz]?)\b/;
// t: the folded message (one ask). A question about what the trip costs or whether it fits the budget.
function isBudgetQuestion(t) {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  if (!s || EDIT_START_RE.test(s)) return false;
  if (!(Q_FORM_RE.test(s) || /\?\s*$/.test(s))) return false;
  if (!COST_Q_RE.test(s)) return false;
  // "is there a budget hotel?" asks for a kind of place; "how much is dinner at X?" is about one stop.
  if (ADJ_BUDGET_RE.test(s) && !/\$\s?\d|\b(?:our|my|the|notre|mon|le) budget\b/.test(s)) return false;
  if (!/\bbudget\b|\bafford\b|\$\s?\d|\btotal\b|\bestimat/.test(s) && !/\b(?:trip|plan|itinerary|weekend|getaway|vacation|everything|whole thing|all (?:of )?(?:this|that|it)|voyage|sejour|tout)\b|\b(?:this|it all|that) (?:all )?(?:cost|be|come to|run|add up to)\b|\b(?:ca|cela) (?:coute|coutera|va couter)\b/.test(s)) return false;
  return true;
}

// ---------- The limit beside the estimate ----------
const partOf = (e, key) => ((e && e.parts) || []).find((p) => p && p.key === key) || null;
// estimate: trip-booking.js tripEstimate (or null). budget: readBudget's result. opts: { stayName, hasStay }.
// -> { limit, scope, each, people, peopleAssumed, low, high, status, overLow, overHigh, nights, stops, unpriced,
//      unpricedNames, stayMissing, parts }
//   status: 'over' (even the low end is above the limit), 'maybe' (the limit is inside the range, or an end is open),
//           'under' (the high end is at or below the limit and nothing is unpriced), 'under_priced' (the high end is at
//           or below the limit but some items have no price), 'unknown' (too little is priced to compare).
function facts(estimate, budget, opts = {}) {
  // No limit given (a chat question about the cost on a trip with no budget): the estimate alone (opts.estimateOnly).
  if (!budget && opts.estimateOnly) budget = { amount: null, scope: 'total' };
  else if (!budget || !Number.isInteger(budget.amount)) return null;
  const e = estimate || {};
  const people = int(e.people) || null;
  const stay = partOf(e, 'stay');
  const others = ((e.parts) || []).filter((p) => p && p.key !== 'stay');
  const unpricedNames = (Array.isArray(e.unknown) ? e.unknown : []).filter((n) => typeof n === 'string' && n);
  const stayMissing = !!opts.hasStay && !stay;
  const out = {
    limit: budget.amount, scope: budget.scope, people, peopleAssumed: !!e.peopleAssumed,
    nights: stay ? int(stay.nights) || 0 : 0, stops: others.reduce((n, p) => n + (int(p.count) || 0), 0),
    unpriced: unpricedNames.length, unpricedNames: unpricedNames.slice(0, 12), stayMissing, ...(stayMissing && opts.stayName ? { stayName: String(opts.stayName) } : {}),
    parts: ((e.parts) || []).map((p) => ({ key: p.key, label: p.label, labelFr: p.labelFr, low: p.low, high: p.high, count: int(p.count) || 0, ...(p.fromPriceLevel ? { fromPriceLevel: p.fromPriceLevel } : {}), ...(p.nights ? { nights: p.nights } : {}) })),
  };
  let low = null, high = null, any = false;
  if (budget.scope === 'per_night') {
    // The stay's own nightly band (one room or unit), never the meals or activities.
    const div = stay ? Math.max(1, (int(stay.nights) || 1) * (int(stay.rooms) || 1)) : 1;
    if (stay) { any = true; low = stay.low === null ? null : Math.round(stay.low / div); high = stay.high === null ? null : Math.round(stay.high / div); }
    out.limitTotal = budget.amount;
  } else {
    any = ((e.parts) || []).length > 0;
    low = any && !e.openLow && Number.isFinite(e.low) ? e.low : null;
    high = any && !e.openHigh && Number.isFinite(e.high) ? e.high : null;
    if (budget.scope === 'per_person') { out.each = budget.amount; out.limitTotal = people ? budget.amount * people : null; }
    else out.limitTotal = budget.amount;
  }
  out.low = low; out.high = high;
  const lim = out.limitTotal;
  const missing = budget.scope === 'per_night' ? 0 : out.unpriced + (stayMissing ? 1 : 0);
  out.missing = missing;
  if (budget.amount === null) out.status = !any || (low === null && high === null) ? 'unknown' : 'none';
  else if (!any || lim === null || (low === null && high === null)) out.status = 'unknown';
  else if (high !== null && high <= lim) out.status = missing ? 'under_priced' : 'under';
  else if (low !== null && low > lim) { out.status = 'over'; out.overLow = low - lim; out.overHigh = high === null ? null : high - lim; }
  else { out.status = 'maybe'; out.overHigh = high === null ? null : high - lim; }
  return out;
}

// ---------- Wording ----------
const money = (n, fr) => (fr ? `${Number(n).toLocaleString('fr-CA').replace(/ | /g, ' ')} $` : `$${Number(n).toLocaleString('en-CA')}`);
function range(low, high, fr) {
  if (low !== null && high !== null) return low === high ? money(low, fr) : fr ? `${Number(low).toLocaleString('fr-CA').replace(/ | /g, ' ')}–${money(high, fr)}` : `${money(low, fr)}–${money(high, fr)}`;
  if (high !== null) return fr ? `jusqu’à ${money(high, fr)}` : `up to ${money(high, fr)}`;
  if (low !== null) return fr ? `à partir de ${money(low, fr)}` : `from ${money(low, fr)}`;
  return '';
}
const plural = (n, one, many) => (n === 1 ? one : many);
function limitText(f, fr) {
  if (f.scope === 'per_night') return fr ? `${money(f.limit, true)} par nuit` : `${money(f.limit, false)} a night`;
  if (f.scope === 'per_person') return fr ? `${money(f.limit, true)} par personne${f.limitTotal ? ` (${money(f.limitTotal, true)} pour ${f.people})` : ''}` : `${money(f.limit, false)} per person${f.limitTotal ? ` (${money(f.limitTotal, false)} for ${f.people})` : ''}`;
  return fr ? `${money(f.limit, true)} au total` : `${money(f.limit, false)} total`;
}
function estText(f, fr) {
  const r = range(f.low, f.high, fr);
  if (!r) return '';
  if (f.scope === 'per_night') return fr ? `${r} par nuit` : `${r} a night`;
  const who = f.people ? (fr ? ` pour ${f.people}${f.peopleAssumed ? ' (supposé)' : ''}` : ` for ${f.people}${f.peopleAssumed ? ' (assumed)' : ''}`) : '';
  return r + who;
}
function verdict(f, fr) {
  const n = f.missing || 0;
  switch (f.status) {
    case 'over':
      if (f.overHigh === null) return fr ? `au moins ${money(f.overLow, true)} de plus` : `at least ${money(f.overLow, false)} over`;
      return fr ? `environ ${range(f.overLow, f.overHigh, true)} de plus` : `about ${range(f.overLow, f.overHigh, false)} over`;
    case 'maybe':
      if (f.overHigh === null) return fr ? 'pourrait dépasser (une partie n’a pas de prix maximal)' : 'could go over (part of it has no upper price)';
      return fr ? `pourrait dépasser de ${money(f.overHigh, true)} au plus` : `could be up to ${money(f.overHigh, false)} over`;
    case 'under': return fr ? 'en dessous, selon les prix affichés' : 'under, on listed prices';
    case 'under_priced': return fr ? `en dessous pour ce qui a un prix, mais ${n} ${plural(n, 'élément n’a', 'éléments n’ont')} pas de prix` : `under on what’s priced, but ${n} ${plural(n, 'item has', 'items have')} no price`;
    default: return fr ? 'trop peu de prix en dossier pour comparer' : 'too few prices on file to compare';
  }
}
// "2 hotel nights + 12 stops"
function countedShort(f, fr) {
  if (f.scope === 'per_night') return '';
  const bits = [];
  if (f.nights) bits.push(fr ? `${f.nights} ${plural(f.nights, 'nuit', 'nuits')} d’hébergement` : `${f.nights} hotel ${plural(f.nights, 'night', 'nights')}`);
  if (f.stops) bits.push(fr ? `${f.stops} ${plural(f.stops, 'arrêt', 'arrêts')}` : `${f.stops} ${plural(f.stops, 'stop', 'stops')}`);
  return bits.join(' + ');
}
// "2 hotel nights ($300–$500), meals ($270–$420), activities (free)"
function countedFull(f, fr) {
  if (f.scope === 'per_night') return '';
  return (f.parts || []).map((p) => {
    const r = p.low === 0 && p.high === 0 ? (fr ? 'gratuit' : 'free') : range(p.low, p.high, fr);
    if (p.key === 'stay') return fr ? `${f.nights} ${plural(f.nights, 'nuit', 'nuits')} d’hébergement (${r})` : `${f.nights} hotel ${plural(f.nights, 'night', 'nights')} (${r})`;
    const lvl = p.key === 'meals' && p.fromPriceLevel && p.fromPriceLevel === p.count ? (fr ? ' selon le niveau de prix' : ' by price level') : '';
    return `${String((fr && p.labelFr) || p.label || p.key).toLowerCase()} (${r}${lvl})`;
  }).join(', ');
}
function missingText(f, fr, max = 3) {
  if (f.scope === 'per_night') return '';
  const names = (f.unpricedNames || []).slice(0, max), more = (f.unpriced || 0) - names.length;
  const bits = [];
  if (f.stayMissing) bits.push(fr ? `l’hébergement${f.stayName ? ` (${f.stayName})` : ''}` : `the stay${f.stayName ? ` (${f.stayName})` : ''}`);
  if (names.length) bits.push(names.join(', ') + (more > 0 ? (fr ? ` et ${more} de plus` : ` +${more} more`) : ''));
  return bits.join(', ');
}
const EXCLUDED = { en: 'taxes, tips, fees, getting around', fr: 'taxes, pourboires, frais, déplacements' };
const HONEST = { en: 'Estimates from listings, not final prices.', fr: 'Estimations d’après les fiches, pas des prix finaux.' };
// -> { summary, sheet, chat, share: [line, line], copy: [line, line] }
function lines(f, lang) {
  if (!f) return null;
  const fr = lang === 'fr';
  if (f.limit === null) {
    // No budget on the trip: the estimate and what it leaves out; nothing is compared.
    const e0 = estText(f, fr), c0 = countedFull(f, fr), m0 = missingText(f, fr);
    const bits = [e0 ? (fr ? `Estimation : ${e0}.` : `Estimate: ${e0}.`) : (fr ? 'Trop peu de prix en dossier pour estimer ce voyage.' : 'Too few prices on file to estimate this trip.')];
    if (e0 && c0) bits.push(fr ? `Compté : ${c0}.` : `Counted: ${c0}.`);
    if (m0) bits.push(fr ? `Sans prix : ${m0}.` : `No price: ${m0}.`);
    bits.push(fr ? `Non compté : ${EXCLUDED.fr}.` : `Not counted: ${EXCLUDED.en}.`);
    return { summary: '', sheet: '', chat: bits.join(' '), share: [], copy: [], tag: '' };
  }
  const lim = limitText(f, fr), est = estText(f, fr), v = verdict(f, fr), cs = countedShort(f, fr), cf = countedFull(f, fr), miss = missingText(f, fr);
  const n = f.missing || 0;
  const noPrice = n ? (fr ? `${n} ${plural(n, 'élément n’a', 'éléments n’ont')} pas de prix` : `${n} ${plural(n, 'item has', 'items have')} no price`) : '';
  const tag = { over: fr ? 'au-dessus' : 'over', maybe: fr ? 'pourrait dépasser' : 'may go over', under: fr ? 'en dessous jusqu’ici' : 'under so far', under_priced: fr ? `en dessous jusqu’ici; ${n} sans prix` : `under so far; ${n} unpriced`, unknown: fr ? 'trop peu de prix' : 'too few prices' }[f.status];
  // The summary line is one short fact: "Budget $600 · est. $570–$920 (may go over)".
  const limShort = money(f.limit, fr) + (f.scope === 'per_night' ? (fr ? '/nuit' : '/night') : f.scope === 'per_person' ? (fr ? '/pers.' : ' pp') : '');
  const estShort = range(f.low, f.high, fr) + (est && f.scope === 'per_night' ? (fr ? '/nuit' : '/night') : '');
  const summary = `Budget ${limShort}` + (est ? ` · est. ${estShort}` : '') + ` (${tag})`;
  const head = est
    ? (fr ? `Estimation : ${est}, pour un budget de ${lim} : ${v}.` : `Estimate: ${est} vs your ${lim}: ${v}.`)
    : (fr ? `Votre budget : ${lim}. Il y a ${v}.` : `Your budget: ${lim}. There are ${v}.`);
  const sheet = (fr ? `Votre budget : ${lim}. ` : `Your budget: ${lim}. `) + (est ? (fr ? `Estimation ${est} : ${v}.` : `Estimate ${est}: ${v}.`) : (fr ? `Il y a ${v}.` : `There are ${v}.`)) + (noPrice && f.status !== 'under_priced' ? ` ${noPrice.charAt(0).toUpperCase()}${noPrice.slice(1)}.` : '');
  const chat = [head];
  if (cf) chat.push(fr ? `Compté : ${cf}.` : `Counted: ${cf}.`);
  if (miss) chat.push(fr ? `Sans prix : ${miss}.` : `No price: ${miss}.`);
  chat.push(f.scope === 'per_night' ? HONEST[fr ? 'fr' : 'en'] : (fr ? `Non compté : ${EXCLUDED.fr}.` : `Not counted: ${EXCLUDED.en}.`));
  const share1 = (fr ? `Budget : ${lim}. ` : `Budget: ${lim}. `) + (est ? (fr ? `Estimation jusqu’ici : ${est}${cs ? ` (${cs})` : ''} : ${v}.` : `Estimate so far: ${est}${cs ? ` (${cs})` : ''}: ${v}.`) : (fr ? `Il y a ${v}.` : `There are ${v}.`));
  const share2 = f.scope === 'per_night' ? HONEST[fr ? 'fr' : 'en']
    : (fr ? `Non compris : ${EXCLUDED.fr}${noPrice && f.status !== 'under_priced' ? `; ${noPrice}` : ''}. ${HONEST.fr}` : `Not included: ${EXCLUDED.en}${noPrice && f.status !== 'under_priced' ? `; ${noPrice}` : ''}. ${HONEST.en}`);
  return { summary, sheet, chat: chat.join(' '), share: [share1, share2], copy: [share1, share2], tag };
}
// Both languages at once, for the page (it prints what the server worded).
function worded(f) {
  if (!f) return null;
  const en = lines(f, 'en'), fr = lines(f, 'fr');
  return { ...f, text: { summary: en.summary, sheet: en.sheet, copy: en.copy }, textFr: { summary: fr.summary, sheet: fr.sheet, copy: fr.copy } };
}

// ---------- The share link ----------
// bg=600t (t total, p per person, n a night); be=570.920.2.0.2.12.0.0 (low.high.people.assumed.nights.stops.unpriced.
// stayMissing; x = no figure). Values only: the wording is rebuilt on the server (fromShare + lines).
const SCOPE_KEY = { total: 't', per_person: 'p', per_night: 'n' };
const KEY_SCOPE = { t: 'total', p: 'per_person', n: 'per_night' };
function toShare(f) {
  if (!f || !Number.isInteger(f.limit) || !SCOPE_KEY[f.scope]) return '';
  const x = (v) => (Number.isInteger(v) ? String(v) : 'x');
  return `&bg=${f.limit}${SCOPE_KEY[f.scope]}&be=${[x(f.low), x(f.high), x(f.people), f.peopleAssumed ? 1 : 0, x(f.nights), x(f.stops), x(f.unpriced), f.stayMissing ? 1 : 0].join('.')}`;
}
function fromShare(query) {
  const q = query || {};
  const g = /^([1-9]\d{1,5})([tpn])$/.exec(String(q.bg || ''));
  if (!g) return null;
  const amount = Number(g[1]);
  if (amount < 20 || amount > 200000) return null;
  const v = String(q.be || '').split('.');
  const num = (s, max) => (/^\d{1,7}$/.test(s || '') && Number(s) <= max ? Number(s) : null);
  const low = num(v[0], 5000000), high = num(v[1], 5000000), people = num(v[2], 40), nights = num(v[4], 60) || 0, stops = num(v[5], 80) || 0, unpriced = num(v[6], 80) || 0;
  const scope = KEY_SCOPE[g[2]];
  const f = { limit: amount, scope, people: people || null, peopleAssumed: v[3] === '1', nights, stops, unpriced, unpricedNames: [], stayMissing: v[7] === '1', parts: [], low: v.length >= 2 ? low : null, high: v.length >= 2 ? high : null };
  f.limitTotal = scope === 'per_person' ? (people ? amount * people : null) : amount;
  if (scope === 'per_person') f.each = amount;
  f.missing = scope === 'per_night' ? 0 : unpriced + (f.stayMissing ? 1 : 0);
  const lim = f.limitTotal;
  if (lim === null || (f.low === null && f.high === null)) f.status = 'unknown';
  else if (f.high !== null && f.high <= lim) f.status = f.missing ? 'under_priced' : 'under';
  else if (f.low !== null && f.low > lim) { f.status = 'over'; f.overLow = f.low - lim; f.overHigh = f.high === null ? null : f.high - lim; }
  else { f.status = 'maybe'; f.overHigh = f.high === null ? null : f.high - lim; }
  return f;
}

module.exports = { readBudget, phraseFor, sameBudget, isBudgetQuestion, facts, lines, worded, toShare, fromShare, money, range, limitText, estText, verdict, EXCLUDED, HONEST };
