'use strict';
// Build My Trip chat: "only the beach, lunch and splash park" on one day (2026-11-24, Dayton's report at 390px).
//
// The request was a 3-day family trip with no car. The message:
//   "Please make day 1 slower for the kids, with only the beach, lunch and splash park. Keep the hotel and the other
//    days the same."
// was read as "make day 1 lighter" (the word "slower" beside "day 1"): one activity came off, the dinner stayed as a
// fourth stop (a lighter day never takes a meal), and the reply said "Done."
//
// Here the list is read as what it is: the stops that day KEEPS. Everything else on that day comes off, a meal that is
// not on the list too (the reply then says the day has no dinner and offers it back in one tap). Nothing else changes:
// no other day, no place to stay, no date, no detail of the party, and the trip is never planned again for it. Words
// in the same sentence about the pace ("slower for the kids") are explained by the list and are not a second request;
// "keep the hotel and the other days the same" restates what this change already does.
//
//   - Each thing listed is a meal (lunch, dinner), a kind of place (a beach, a winery, a splash park) or a stop's own
//     name. A kind keeps EVERY stop of that kind on that day (two beaches: both stay, and the reply names them).
//   - A thing listed that is not on that day changes nothing: the reply says which one, and asks once.
//   - No day said, on a trip of several days: asked once ("Which day…?").
//   - The reply names what the day keeps and what came off. It never says only "Done."
// English and French. Fixed rules: the AI reader's reading never stands in for them (the result is marked access).

const MARK_RE = /\b(?:only|just|nothing but|nothing except|seulement|uniquement|juste|rien que)\b/;
const LEAD_RE = /^(?:(?:to|a|de)\s+)?(?:keep(?:ing)?|have|having|want(?: to)?|do|doing|include|leave|see|visit|with|garde[rz]?|avoir|faire|veux|voulons|veut|laisse[rz]?|voir|visiter|avec)\s+/;
const DET_RE = /^(?:(?:the|a|an|our|my|that|this|those|these|some|le|la|les|un|une|des|notre|nos|mon|ma|mes|du|de la|au|aux|ce|cette|ces)\s+|l'|d')/;
const DEF_RE = /^(?:(?:the|our|my|that|this|those|these|le|la|les|notre|nos|mon|ma|mes|ce|cette|ces)\s+|l')/;
// Words that make the list something else: an edit of its own, a number of things, a need, a condition.
const NOT_ITEM_RE = /\b(?:add|remove|swap|replace|move|change|take|drop|skip|delete|cut|book|find|make|want|need|go|going|have|keep|get|one|two|three|four|five|more|less|fewer|another|other|vegan|vegetarian|gluten|cheap\w*|free|open|person|people|us|if|is|are|was|does|do|can|could|would|should|will|ajoute\w*|enleve\w*|retire\w*|remplace\w*|deplace\w*|supprime\w*|garde\w*|autres?|si)\b|\d/;
const SPLIT_RE = /\s*(?:,|&|\+|\band\b|\bet\b|\bplus\b|\bthen\b|\bpuis\b|\bas well as\b|\bainsi que\b)\s*/;
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7 };
const PREP = '(?:(?:on|for|of|during|in|le|du|pour(?: le)?|de la|au)\\s+)?';
const DAY_NUM_RE = new RegExp(`(?:,\\s*)?\\b${PREP}(?:the\\s+|la\\s+|le\\s+)?(?:day|jour|journee)\\s*([1-7]|one|two|three|four|five|six|seven|un|une|deux|trois|quatre|cinq|sept)\\b`, 'g');
const DAY_ORD_RE = new RegExp(`(?:,\\s*)?\\b${PREP}(?:the\\s+|la\\s+|le\\s+)?(first|1st|second|2nd|third|3rd|last|premier|premiere|deuxieme|troisieme|dernier|derniere)\\s+(?:day|jour|journee)\\b`, 'g');
const ORD = (w, days) => (/^(?:first|1st|premier|premiere)$/.test(w) ? 1 : /^(?:second|2nd|deuxieme)$/.test(w) ? 2 : /^(?:third|3rd|troisieme)$/.test(w) ? 3 : days);
const LUNCH_RE = /^(?:lunch|diner|dejeuner)$/, DINNER_RE = /^(?:dinner|supper|souper)$/, MEALS_RE = /^(?:meals?|repas)$/;
const NAME_SKIP = new Set(['the', 'and', 'of', 'at', 'a', 'an', 'de', 'du', 'la', 'le', 'les', 'et']);
// "Keep the hotel and the other days the same", "leave everything else as it is", « ne change pas l’hôtel »: what a
// keep-only change already does. Never a sentence that itself says "only".
const SAME_RE = /^(?:(?:and|but|also|please|et|mais|svp)\s+)*(?:keep|leave|don'?t (?:change|touch|move)|do not (?:change|touch|move)|garde[rz]?|laisse[rz]?|ne (?:change[rz]?|touche[rz]?) pas)\b(?=.*\b(?:hotel|motel|stay|resort|dates?|days?|rest|everything else|all else|others?|kids|children|party|jours?|journees?|hebergement|reste|autres?|enfants)\b)(?!.*\b(?:only|just|seulement|uniquement|juste)\b)[^.!?;]*$/;
const PUTBACK_RE = /\[putback ((?:[1-7]-[a-z]{3,12}:\d{1,9})(?:,[1-7]-[a-z]{3,12}:\d{1,9}){0,3})\]\s*$/;

const TX = {
  en: {
    which: 'Which day should have only {items}?', dayBtn: 'Day {d}',
    none: 'I don’t see {x} on day {d}, so I haven’t changed it.', noneAsk: 'Keep only {names}?', noneTell: 'Tell me which stops day {d} should keep.', noneBtn: 'Yes, keep those',
    same: 'Day {d} already has only {names}. Nothing changed.',
    done: 'Day {d} now has only {kept}. Took out {gone}.',
    noMeal: 'That leaves day {d} with no {meal}. Want it back?', noMeals: 'That leaves day {d} with no lunch or dinner. Want them back?',
    backBtn: 'Put {meal} back', backBtns: 'Put the meals back', backSay: 'Put {meal} back on day {d}', backSays: 'Put the meals back on day {d}',
    back: '{names} is back on day {d}.', backs: '{names} are back on day {d}.', backGone: 'Nothing to put back: the plan has changed since.',
    lunch: 'lunch', dinner: 'dinner', aLunch: 'a lunch stop', aDinner: 'a dinner stop', aMeal: 'a meal stop', water: 'a splash park', or: 'or', and: 'and', q: (x) => `“${x}”`,
    offer: 'only {items} on day {d}',
  },
  fr: {
    which: 'Quel jour doit garder seulement {items}?', dayBtn: 'Jour {d}',
    none: 'Je ne vois pas {x} au jour {d} : je n’ai rien changé.', noneAsk: 'Garder seulement {names}?', noneTell: 'Dites-moi quels arrêts garder au jour {d}.', noneBtn: 'Oui, garder ceux-là',
    same: 'Le jour {d} n’a déjà que {names}. Rien n’a changé.',
    done: 'Le jour {d} n’a plus que {kept}. J’ai retiré {gone}.',
    noMeal: 'Le jour {d} n’a donc plus de {meal}. Voulez-vous le remettre?', noMeals: 'Le jour {d} n’a donc plus de dîner ni de souper. Voulez-vous les remettre?',
    backBtn: 'Remettre le {meal}', backBtns: 'Remettre les repas', backSay: 'Remettre le {meal} au jour {d}', backSays: 'Remettre les repas au jour {d}',
    back: '{names} est de retour au jour {d}.', backs: '{names} sont de retour au jour {d}.', backGone: 'Rien à remettre : le plan a changé depuis.',
    lunch: 'dîner', dinner: 'souper', aLunch: 'de dîner', aDinner: 'de souper', aMeal: 'de repas', water: 'de jeux d’eau', or: 'ou', and: 'et', q: (x) => `« ${x} »`,
    offer: 'seulement {items} le jour {d}',
  },
};
// « pas de plage », « pas d’activité ».
const de = (n) => (/^[aeiouyhéèêâî]/i.test(n) ? `d’${n}` : `de ${n}`);
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? String(v[k]) : m));
// Every name, in full (a reply that says what a day keeps never says "and 2 more").
const join = (list, word) => { const a = list.filter(Boolean); return a.length <= 1 ? (a[0] || '') : `${a.slice(0, -1).join(', ')} ${word} ${a[a.length - 1]}`; };

// The day a sentence names, and the sentence without those words. -> { days: [n], text }
function dayOf(f, opts) {
  const days = new Set();
  let text = f.replace(DAY_NUM_RE, (m, n) => { days.add(Number(n) || NUM[n]); return ' '; });
  text = text.replace(DAY_ORD_RE, (m, w) => { days.add(ORD(w, opts.days || 1)); return ' '; });
  const wd = Object.keys(opts.weekdays || {});
  if (wd.length) text = text.replace(new RegExp(`(?:,\\s*)?\\b(?:(?:on|for|le|du|pour)\\s+)?(${wd.join('|')})s?\\b`, 'g'), (m, w) => { days.add(opts.weekdays[w]); return ' '; });
  return { days: [...days].filter((n) => n >= 1), text: text.replace(/\s+/g, ' ').trim() };
}

// One sentence (folded) that lists what a day keeps. -> { day | null, items: [said], definite, after } or null.
function parseSentence(f, opts) {
  const m = MARK_RE.exec(f);
  if (!m) return null;
  const head = f.slice(0, m.index);
  if (/\b(?:not|pas|if|si|unless|sauf)\s*$/.test(head)) return null;
  const d = dayOf(f, opts);
  if (d.days.length > 1) return null;
  const t = d.text, m2 = MARK_RE.exec(t);
  if (!m2) return null;
  let tail = t.slice(m2.index + m2[0].length).trim();
  for (let i = 0; i < 2; i++) tail = tail.replace(LEAD_RE, '');
  // What follows the list in the same sentence ("…and add a winery", "…so the kids can nap") is not part of it.
  let after = '';
  const cut = /\s+(?:and|et|,)\s+(?=(?:please\s+)?(?:keep|leave|remove|add|make|swap|replace|move|don'?t|do not|garde|laisse|enleve|ajoute|remplace)\b)/.exec(tail);
  if (cut) { after = tail.slice(cut.index + cut[0].length); tail = tail.slice(0, cut.index); }
  tail = tail.replace(/\s*(?:\b(?:so that|so|because|since|please|thanks?|thank you|merci|svp|s'il vous plait|car|parce que|but|mais|that day|ce jour-la|for the kids|pour les enfants)\b|[:(]).*$/, '').replace(/[\s,.!?;]+$/, '').trim();
  if (!tail) return null;
  const raw = tail.split(SPLIT_RE).map((x) => x.trim()).filter(Boolean);
  if (!raw.length || raw.length > 8) return null;
  const definite = raw.some((x) => DEF_RE.test(x));
  const items = raw.map((x) => x.replace(DET_RE, '').replace(DET_RE, '').replace(/\s+(?:stops?|visits?|arrets?|there|too|aussi)$/, '').trim());
  if (items.some((x) => !x || x.split(' ').length > 5 || !/^[a-z][a-z' -]*$/.test(x) || NOT_ITEM_RE.test(x))) return null;
  return { day: d.days[0] || null, items, raw, definite, after };
}

// What one listed thing is, on a day's stops. h: the chat's own helpers (trip-chat.js).
// -> { said, stops: [stop], label: { en, fr } , known: boolean }
function resolve(x, dayStops, all, h, raw) {
  const nameWords = (s) => h.fold(s.name).split(/[^a-z0-9']+/).filter(Boolean);
  const words = x.split(/[^a-z0-9']+/).filter((w) => w && !NAME_SKIP.has(w));
  const kinds = h.kindsNamed(x);
  // The words are a kind only when they are nothing else ("beach", "splash park"; never "beach day").
  const kindOnly = kinds.length > 0 && kinds.reduce((rest, k) => { const re = h.kindRe(k); return re ? rest.replace(new RegExp(re.source, 'g'), ' ') : rest; }, x).replace(/[\s'-]+/g, '') === '';
  const water = h.WATER_PLAY_RE.test(x) && x.replace(new RegExp(h.WATER_PLAY_RE.source, 'g'), '').trim() === '';
  const meal = LUNCH_RE.test(x) ? 'lunch' : DINNER_RE.test(x) ? 'dinner' : MEALS_RE.test(x) ? 'meals' : null;
  const plain = !!meal || water || kindOnly;
  const named = (s) => { const nw = nameWords(s); return words.length > 0 && words.every((w) => nw.includes(w) || nw.includes(w.replace(/s$/, ''))); };
  // A stop's own name: two words of it or more, or one word that is not itself a meal or a kind of place.
  if (words.length >= 2 || (!plain && words.length === 1 && words[0].length >= 4)) {
    const on = dayStops.filter(named);
    if (on.length) return { said: raw || x, stops: on, known: true, label: { en: TX.en.q(x), fr: TX.fr.q(x) } };
    if (!plain && all.some(named)) return { said: raw || x, stops: [], known: true, label: { en: all.find(named).name, fr: all.find(named).name } };
  }
  if (meal) return { said: raw || x, stops: dayStops.filter((s) => (meal === 'meals' ? !!s.role : s.role === meal)), known: true, label: meal === 'lunch' ? { en: TX.en.aLunch, fr: TX.fr.aLunch } : meal === 'dinner' ? { en: TX.en.aDinner, fr: TX.fr.aDinner } : { en: TX.en.aMeal, fr: TX.fr.aMeal } };
  if (water) return { said: raw || x, stops: dayStops.filter((s) => h.WATER_PLAY_RE.test(h.fold(s.name))), known: true, label: { en: TX.en.water, fr: TX.fr.water } };
  if (kindOnly) return { said: raw || x, stops: dayStops.filter((s) => kinds.some((k) => h.kindMatches(k, s))), known: true, label: { en: h.KINDS[kinds[0]].en, fr: de(String(h.KINDS[kinds[0]].fr).replace(/^(?:une?|du|de la|de l’|des|le|la|les)\s*/i, '')) } };
  return { said: raw || x, stops: [], known: false, label: { en: TX.en.q(x), fr: TX.fr.q(x) } };
}

// message: as typed. stops: the stops on screen (removed ones are not among them). opts: { days, weekdays }.
// -> null (not such a message), or
//    { ops: [remove op with keepOnly], rest }                 the day keeps exactly those stops
//    { ops: [], cant: 'keep_only', keepOnly: { reply: { en, fr }, offer: [say], choices: { en, fr } }, rest }   asked / nothing to do
function read(message, stops, h, opts = {}) {
  const sentences = String(message || '').split(/(?<=[.!?;])\s+/).map((x) => x.trim()).filter(Boolean);
  let hit = null, at = -1;
  for (let i = 0; i < sentences.length && !hit; i++) {
    const f = h.fold(sentences[i]).replace(/\s+/g, ' ').replace(/[.!?;]+$/, '').trim();
    if (!MARK_RE.test(f)) continue;
    const p = parseSentence(f, opts);
    if (p) { hit = p; at = i; }
  }
  if (!hit) return null;
  const days = opts.days || 1;
  if (hit.day && hit.day > days) return null;
  // Without a day, only a list of the plan's own things ("just THE beach and lunch") is one.
  if (!hit.day && !hit.definite) return null;
  const all = (stops || []).filter((s) => s && s.key);
  const rest = [...sentences.filter((s, i) => i !== at && !SAME_RE.test(h.fold(s).replace(/\s+/g, ' ').replace(/[.!?;]+$/, '').trim())), hit.after].filter(Boolean).join(' ').trim();
  const forDay = (d) => { const on = all.filter((s) => s.day === d); return { d, on, got: hit.items.map((x, i) => resolve(x, on, all, h, hit.raw[i])) }; };
  const itemsText = (L) => join(hit.raw, TX[L].and);
  const ask = (reply, offer, choices) => ({ ops: [], cant: 'keep_only', keepOnly: { reply, offer: offer || [], choices: choices || null }, rest: '' });
  const day = hit.day || (days === 1 ? 1 : null);
  if (!day) {
    // Which day? Each day that has at least one of the things listed is a one-tap answer.
    const fits = Array.from({ length: days }, (_, i) => forDay(i + 1)).filter((x) => x.got.some((g) => g.stops.length));
    if (!fits.length) return null;
    const say = (L, d) => fill(TX.en.offer, { items: join(hit.raw, 'and'), d });
    return ask({ en: fill(TX.en.which, { items: itemsText('en') }), fr: fill(TX.fr.which, { items: itemsText('fr') }) }, fits.slice(0, 3).map((x) => say('en', x.d)),
      { en: fits.slice(0, 2).map((x) => ({ kind: 'say', label: fill(TX.en.dayBtn, { d: x.d }), say: say('en', x.d) })), fr: fits.slice(0, 2).map((x) => ({ kind: 'say', label: fill(TX.fr.dayBtn, { d: x.d }), say: say('en', x.d) })) });
  }
  const { on, got } = forDay(day);
  if (!on.length || !got.some((g) => g.known)) return null;
  const keep = on.filter((s) => got.some((g) => g.stops.includes(s)));
  const miss = got.filter((g) => !g.stops.length);
  if (miss.length) {
    const found = got.filter((g) => g.stops.length);
    const reply = (L) => [fill(TX[L].none, { x: join(miss.map((g) => g.label[L]), TX[L].or), d: day }), keep.length ? fill(TX[L].noneAsk, { names: join(keep.map((s) => s.name), TX[L].and) }) : fill(TX[L].noneTell, { d: day })].join(' ');
    const say = keep.length ? fill(TX.en.offer, { items: join(found.map((g) => g.said), 'and'), d: day }) : null;
    return ask({ en: reply('en'), fr: reply('fr') }, say ? [say] : [], say ? { en: [{ kind: 'say', label: TX.en.noneBtn, say }], fr: [{ kind: 'say', label: TX.fr.noneBtn, say }] } : null);
  }
  const gone = on.filter((s) => !keep.includes(s));
  if (!gone.length) return ask({ en: fill(TX.en.same, { d: day, names: join(keep.map((s) => s.name), TX.en.and) }), fr: fill(TX.fr.same, { d: day, names: join(keep.map((s) => s.name), TX.fr.and) }) });
  // A meal that is not on the list comes off with the rest, and is said (with the way back).
  const meals = gone.filter((s) => s.role === 'lunch' || s.role === 'dinner').filter((s) => !keep.some((k) => k.role === s.role));
  return { ops: [{ stops: gone, kind: null, time: null, day, value: null, n: null, ages: [], region: null, date: null, o: 'remove', keepOnly: { day, kept: keep, gone, meals } }], cant: null, rest };
}

// The reply for a keep-only removal that was made (trip-chat.js buildReply), and its one offer (server.js).
function doneLine(k, lang) {
  const L = lang === 'fr' ? 'fr' : 'en', t = TX[L];
  const parts = [fill(t.done, { d: k.day, kept: join(k.kept.map((s) => s.name), t.and), gone: join(k.gone.map((s) => s.name), t.and) })];
  const roles = [...new Set((k.meals || []).map((s) => s.role))];
  if (roles.length === 1) parts.push(fill(t.noMeal, { d: k.day, meal: t[roles[0]] }));
  else if (roles.length > 1) parts.push(fill(t.noMeals, { d: k.day }));
  return parts.join(' ');
}
function backOffer(k, lang) {
  const L = lang === 'fr' ? 'fr' : 'en', t = TX[L], ms = (k && k.meals) || [];
  if (!ms.length) return null;
  const roles = [...new Set(ms.map((s) => s.role))];
  const tag = `[putback ${ms.slice(0, 4).map((s) => `${s.key}:${s.id}`).join(',')}]`;
  const say = `${roles.length === 1 ? fill(t.backSay, { meal: t[roles[0]], d: k.day }) : fill(t.backSays, { d: k.day })} ${tag}`;
  return { say, label: roles.length === 1 ? fill(t.backBtn, { meal: t[roles[0]] }) : t.backBtns };
}
// The offer as the page sends it back (body.offer). -> [{ key, id, day }] or null.
function backTag(offers) {
  const hit = (offers || []).find((o) => typeof o === 'string' && PUTBACK_RE.test(o));
  const m = hit ? PUTBACK_RE.exec(hit) : null;
  return m ? { say: hit, stops: m[1].split(',').map((x) => { const [key, id] = x.split(':'); return { key, id: Number(id), day: Number(key[0]) }; }) } : null;
}
// Whether a short message takes that offer ("yes", "put dinner back", « remets le souper », the button itself).
function takesBack(message, say, fold) {
  const raw = String(message || '').replace(/\s+/g, ' ').trim();
  if (raw === say) return true;
  const t = fold(raw);
  if (!t || t.length > 80 || /\b(?:remove|swap|replace|move|enleve[rz]?|remplace[rz]?|deplace[rz]?)\b/.test(t)) return false;
  return /^(?:yes|yep|yeah|yup|sure|ok|okay|please|do it|go ahead|oui|ouais|d'accord|vas-y|allez-y)\b/.test(t) || /\b(?:put|bring|want|add)\b.*\bback\b|\bremet\w*\b|\bde retour\b/.test(t);
}
function backReply(names, day, lang) {
  const t = TX[lang === 'fr' ? 'fr' : 'en'];
  return names.length ? fill(names.length > 1 ? t.backs : t.back, { names: join(names, t.and), d: day }) : t.backGone;
}

module.exports = { read, parseSentence, doneLine, backOffer, backTag, takesBack, backReply, PUTBACK_RE, SAME_RE, MARK_RE, TX };
