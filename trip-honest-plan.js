'use strict';
// Build My Trip: an honest plan (2026-11-22).
//
// The owner's report: "Plan a 3-day Kelowna weekend for 6 friends: two wineries, gluten-free dining, easy walks, a
// hotel with a pool, and live music. One person does not drink." Every restaurant had the Gluten-Free-Friendly badge,
// yet the plan said it could not fit gluten free (a night-out pub was counted as a meal); no dates were chosen, yet
// "day 3" carried an event dated Tuesday, Nov 24.
//
// This module is the one place that says what the plan can and cannot show for each thing the request asked for:
//
//   plan.evidence = [{ ask, label, labelFr, status, text, textFr, stops: [{ id, name, has }], line? }]
//     status  'verified'  every relevant stop has it (from the listing's own badge or fact)
//             'partial'   some do; the ones that do not are named
//             'unknown'   the listing data cannot tell (no dates chosen for an event, no badge data)
//             'unmet'     asked for and absent, with the true reason when it is known
//     has     true (the listing has the badge), false (a listing of a kind that carries the badge does not have it),
//             null (the listing cannot say)
//     line    true when the page prints this entry as its one short line under the title (a partial, unknown or unmet
//             ask that plan.notIncluded or plan.partyNote does not already say)
//
// Built ONLY from the listings' own badges and facts on the plan's stops: never a menu item, never a promise about a
// kitchen. It also keeps the other lines in step with it (plan.requirementResults, plan.warnings, plan.partyNote), so
// the itinerary, the lines under the title and the evidence never contradict each other.
//
// Events and dates: an event is part of the dated plan only when the visitor chose dates. With no dates,
// takeUndatedEvents() takes event stops out of the days and offers them as plan.dateSuggestions, each labelled with its
// own real date ("Suggestion · Tue Nov 24 only"); they are never a timed stop, never a booking step.

const DIET = ['vegetarian', 'vegan', 'gluten_free'];
const MEAL_TYPES = ['restaurant', 'cafe'];
const FOOD_DRINK_TYPES = ['restaurant', 'cafe', 'pub', 'cocktail', 'brewery'];
const DRINK_TYPES = ['winery', 'brewery', 'cidery', 'distillery', 'pub', 'cocktail'];
const BADGE_TYPES = ['restaurant', 'cafe', 'pub', 'cocktail', 'brewery', 'distillery', 'winery'];
// A badge every stop should have (a dog comes to every stop); the others are met by one stop that has it.
const EVERY_STOP = ['dog_friendly', 'kid_friendly'];
const FEATURES = {
  gluten_free: { en: 'Gluten-free', fr: 'Sans gluten', has: 'list gluten-free options', has1: 'lists gluten-free options', hasFr: 'indiquent des options sans gluten', has1Fr: 'indique des options sans gluten' },
  vegan: { en: 'Vegan', fr: 'Végane', has: 'list vegan options', has1: 'lists vegan options', hasFr: 'indiquent des options véganes', has1Fr: 'indique des options véganes' },
  vegetarian: { en: 'Vegetarian', fr: 'Végétarien', has: 'list vegetarian options', has1: 'lists vegetarian options', hasFr: 'indiquent des options végétariennes', has1Fr: 'indique des options végétariennes' },
  dog_friendly: { en: 'Dog-friendly', fr: 'Chiens admis' },
  kid_friendly: { en: 'Kid-friendly', fr: 'Adapté aux enfants' },
  patio: { en: 'Patio', fr: 'Terrasse' },
  lake_view: { en: 'Lake view', fr: 'Vue sur le lac' },
  live_music: { en: 'Live music', fr: 'Musique en direct' },
  sports_tv: { en: 'Sports on TV', fr: 'Sports à la télé' },
  happy_hour: { en: 'Happy hour', fr: '5 à 7' },
  great_groups: { en: 'Good for groups', fr: 'Idéal pour les groupes' },
  nonalcoholic: { en: 'Non-alcoholic options', fr: 'Options sans alcool' },
  free_entry: { en: 'Free to visit', fr: 'Gratuit' },
  arts_culture: { en: 'Arts & culture', fr: 'Arts et culture' },
};
const TYPE_WORDS = {
  winery: ['winery', 'wineries', 'vignoble', 'vignobles'], brewery: ['brewery', 'breweries', 'brasserie', 'brasseries'], cidery: ['cidery', 'cideries', 'cidrerie', 'cidreries'],
  distillery: ['distillery', 'distilleries', 'distillerie', 'distilleries'], restaurant: ['restaurant', 'restaurants', 'restaurant', 'restaurants'], cafe: ['café', 'cafés', 'café', 'cafés'],
  pub: ['pub', 'pubs', 'pub', 'pubs'], cocktail: ['cocktail bar', 'cocktail bars', 'bar à cocktails', 'bars à cocktails'], beach: ['beach', 'beaches', 'plage', 'plages'],
  golf: ['golf course', 'golf courses', 'terrain de golf', 'terrains de golf'], outdoor: ['outdoor stop', 'outdoor stops', 'arrêt en plein air', 'arrêts en plein air'],
  indoor: ['indoor stop', 'indoor stops', 'activité intérieure', 'activités intérieures'], tour: ['tour', 'tours', 'visite guidée', 'visites guidées'], breakfast: ['breakfast spot', 'breakfast spots', 'déjeuner', 'déjeuners'],
};
const STAY_AMENITY = { pool: ['Pool', 'Piscine', 'a pool', 'une piscine'], hot_tub: ['Hot tub', 'Spa', 'a hot tub', 'un spa'], kitchen: ['Kitchen', 'Cuisine', 'a kitchen', 'une cuisine'] };

const cap = (t) => String(t || '').replace(/^./, (c) => c.toUpperCase());
const listEn = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a[0] || '');
const listFr = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} et ${a[a.length - 1]}` : a[0] || '');
const names = (rows) => rows.map((r) => r.name);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Every stop of the plan that is a listed place: [{ s, v, day }].
function venueStops(plan) {
  const out = [];
  for (const d of (plan && plan.days) || []) for (const s of (d && d.stops) || []) if (s && s.venue && s.venue.id != null && !s.event) out.push({ s, v: s.venue, day: d.day || 0 });
  if (!out.length) for (const s of ((plan && plan.itinerary && plan.itinerary.stops) || (plan && plan.outing && plan.outing.stops) || [])) if (s && s.venue && s.venue.id != null) out.push({ s, v: s.venue, day: 0 });
  return out;
}
function eventStops(plan) {
  const out = [];
  for (const d of (plan && plan.days) || []) for (const s of (d && d.stops) || []) if (s && s.kind === 'event' && s.event) out.push({ s, e: s.event, day: d.day || 0 });
  for (const s of ((plan && plan.itinerary && plan.itinerary.stops) || (plan && plan.outing && plan.outing.stops) || [])) if (s && s.kind === 'event' && s.event) out.push({ s, e: s.event, day: 0 });
  return out;
}
// A stop where the group eats: a restaurant or a café at any time; a pub, brewery or bar at lunch or dinner (or when the
// planner placed it as the meal); a winery lunch. A pub after dinner is a night out, not a meal.
function isMealStop(s) {
  const v = s && s.venue;
  if (!v) return false;
  if (s.wineryLunch) return true;
  if (MEAL_TYPES.includes(v.type)) return true;
  if (!FOOD_DRINK_TYPES.includes(v.type)) return false;
  if ((s.reasons || []).some((r) => r && r.code === 'meal')) return true;
  if ((s.reasons || []).some((r) => r && r.code === 'night')) return false;
  return ['midday', 'evening'].includes(s.daypart) || /lunch|dinner|supper|brunch|breakfast/i.test(String(s.label || ''));
}
// true / false / null: what the listing's own badges say (stop.venue.badges, the badges the site shows for the place).
function badgeOf(v, key, flags) {
  if (Array.isArray(v.badges)) { if (v.badges.some((b) => b && (b.key === key || b === key))) return true; }
  else if (v.features && typeof v.features === 'object' && !Array.isArray(v.features)) { if (v.features[key]) return true; }
  // A curated list the listing is on (the site's dog-friendly places) counts like its badge.
  if (Array.isArray(v.collections) && v.collections.includes(key)) return true;
  const f = flags ? flags(v.id) : null;
  if (f && f[key]) return true;
  return BADGE_TYPES.includes(v.type) ? false : null;
}
function datesGiven(plan) {
  if (plan && typeof plan.datesGiven === 'boolean') return plan.datesGiven;
  if (((plan && plan.days) || []).some((d) => d && isDate(d.date))) return true;
  return !!(plan && plan.intent && plan.intent.when);
}

// No dates chosen: event stops leave the days and become dated suggestions. Returns the plan (changed in place).
function takeUndatedEvents(plan) {
  if (!plan || datesGiven(plan)) return plan;
  const taken = [];
  const strip = (list, day) => (list || []).filter((s) => {
    if (!(s && s.kind === 'event' && s.event)) return true;
    taken.push({ e: s.event, day });
    return false;
  });
  for (const d of plan.days || []) if (d && Array.isArray(d.stops)) d.stops = strip(d.stops, d.day);
  for (const k of ['itinerary', 'outing']) if (plan[k] && Array.isArray(plan[k].stops)) plan[k].stops = strip(plan[k].stops, 0);
  if (!taken.length) return plan;
  const ids = new Set(taken.map((x) => x.e.id));
  for (const k of ['schedule', 'suggestedTimes']) if (Array.isArray(plan[k])) plan[k] = plan[k].filter((r) => !(r && r.eventId != null && ids.has(r.eventId)));
  const have = new Set((plan.dateSuggestions || []).map((x) => x.id));
  plan.dateSuggestions = (plan.dateSuggestions || []).concat(taken.filter((x) => !have.has(x.e.id)).map((x) => suggestionOf(x.e)));
  // The headline and summary never name an event that is no longer a stop.
  for (const x of taken) {
    const n = String(x.e.name || '');
    if (!n) continue;
    for (const k of ['summary', 'headline', 'story']) if (typeof plan[k] === 'string' && plan[k].includes(n)) plan[k] = plan[k].replace(new RegExp(`,? (?:with|and|plus|avec|et) ${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '').replace(n, '').replace(/\s{2,}/g, ' ');
  }
  return plan;
}
// An event as a date-dependent suggestion, labelled with its own real date.
function suggestionOf(e) {
  const out = {
    kind: 'event', id: e.id, name: e.name, venueName: e.venueName || null, region: e.region || null, regionLabel: e.regionLabel || null,
    url: e.url || null, ...(e.urlFr ? { urlFr: e.urlFr } : {}), startDate: e.startDate || null, endDate: e.endDate || null,
    dateLabel: e.dateLabel || e.startDate || '', ...(e.dateLabelFr ? { dateLabelFr: e.dateLabelFr } : {}), time: e.time || null, ...(e.timeFr ? { timeFr: e.timeFr } : {}),
    categories: e.categories || [], ...(e.photo ? { photo: e.photo } : {}), ...(e.otherDates ? { otherDates: true } : {}),
  };
  return labelSuggestion(out);
}
// "Suggestion · Tue Nov 24 only": the event's own date, never a day of the plan.
function labelSuggestion(x) {
  const dl = x.dateLabel || x.startDate || '', dlFr = x.dateLabelFr || dl;
  // "only" is said of an event with one date; one that repeats says so (otherDates).
  x.label = dl ? `Suggestion · ${dl}${x.otherDates ? ' and other dates' : ' only'}` : 'Suggestion · check the date';
  x.labelFr = dlFr ? `Suggestion · ${dlFr}${x.otherDates ? ' et d’autres dates' : ' seulement'}` : 'Suggestion · vérifiez la date';
  return x;
}

// ---- the evidence ----
function dietEntry(key, stops, ctx, plan) {
  const F = FEATURES[key];
  const meals = stops.filter((x) => isMealStop(x.s));
  const rows = meals.map((x) => ({ id: x.v.id, name: x.v.name, has: badgeOf(x.v, key, ctx.flags) === true }));
  const yes = rows.filter((r) => r.has), no = rows.filter((r) => !r.has);
  const careEn = key === 'gluten_free' ? ' A badge means the place lists gluten-free options, not a guarantee against cross-contamination: tell the kitchen.' : '';
  const careFr = key === 'gluten_free' ? ' Le badge signifie que l’endroit indique des options sans gluten, pas une garantie contre la contamination croisée : avisez la cuisine.' : '';
  const base = { ask: key, label: F.en, labelFr: F.fr, stops: rows };
  if (!rows.length) return { ...base, status: 'unknown', text: `${F.en}: this plan has no meal stops to check.`, textFr: `${F.fr} : ce plan n’a aucun arrêt repas à vérifier.` };
  if (!no.length) return { ...base, status: 'verified', text: `${F.en}: ${rows.length === 1 ? `the meal stop ${F.has1}` : `all ${rows.length} meal stops ${F.has}`}.${careEn}`, textFr: `${F.fr} : ${rows.length === 1 ? `l’arrêt repas ${F.has1Fr}` : `les ${rows.length} arrêts repas ${F.hasFr}`}.${careFr}` };
  const tried = !!(plan && plan.dietRetried);
  if (yes.length) {
    return { ...base, status: 'partial',
      text: `${F.en}: ${yes.length} of ${rows.length} meal stops ${F.has}; ${listEn(names(no))} ${no.length > 1 ? 'don’t' : 'doesn’t'}${tried ? ' (nothing with the badge fit there)' : ''}.${careEn}`,
      textFr: `${F.fr} : ${yes.length} des ${rows.length} arrêts repas ${F.hasFr}; pas ${listFr(names(no))}${tried ? ' (aucun endroit avec le badge ne convenait)' : ''}.${careFr}` };
  }
  const town = ctx.town || null;
  const listed = typeof ctx.countDining === 'function' ? ctx.countDining(key) : null;
  const why = listed === 0 && town ? [` No place to eat listed in ${town} has that badge.`, ` Aucun endroit où manger répertorié à ${town} n’a ce badge.`] : [' The reason isn’t known from the listings.', ' La raison n’est pas connue d’après les fiches.'];
  return { ...base, status: 'unmet', text: `${F.en}: none of the meal stops ${F.has.replace(/^list /, 'lists ')}.${why[0]}`, textFr: `${F.fr} : aucun arrêt repas n’${F.has1Fr}.${why[1]}` };
}
function featureEntry(key, stops, ctx) {
  const F = FEATURES[key] || { en: cap(String(key).replace(/_/g, ' ')), fr: cap(String(key).replace(/_/g, ' ')) };
  const all = stops.map((x) => ({ id: x.v.id, name: x.v.name, has: badgeOf(x.v, key, ctx.flags) }));
  const yes = all.filter((r) => r.has === true), no = all.filter((r) => r.has === false), unk = all.filter((r) => r.has === null);
  const base = { ask: key, label: F.en, labelFr: F.fr };
  if (EVERY_STOP.includes(key)) {
    const rows = all;
    if (!yes.length && !no.length) return { ...base, stops: rows, status: 'unknown', text: `${F.en}: the listings of these stops don’t say.`, textFr: `${F.fr} : les fiches de ces arrêts ne le précisent pas.` };
    const tail = unk.length ? [` ${unk.length === 1 ? `${unk[0].name}’s listing doesn’t` : `${unk.length} other listings don’t`} say.`, ` ${unk.length === 1 ? `La fiche de ${unk[0].name} ne le précise pas` : `${unk.length} autres fiches ne le précisent pas`}.`] : ['', ''];
    if (!no.length) return { ...base, stops: rows, status: unk.length ? 'partial' : 'verified', text: `${F.en}: ${yes.length === 1 ? `${yes[0].name} has the badge` : `${yes.length} stops have the badge`}.${tail[0]}`, textFr: `${F.fr} : ${yes.length === 1 ? `${yes[0].name} a le badge` : `${yes.length} arrêts ont le badge`}.${tail[1]}` };
    if (!yes.length) return { ...base, stops: rows, status: 'unmet', text: `${F.en}: no stop in this plan has that badge. The reason isn’t known from the listings.`, textFr: `${F.fr} : aucun arrêt de ce plan n’a ce badge. La raison n’est pas connue d’après les fiches.` };
    return { ...base, stops: rows, status: 'partial', text: `${F.en}: ${yes.length} of ${yes.length + no.length} stops have the badge; ${listEn(names(no))} ${no.length > 1 ? 'don’t' : 'doesn’t'}.${tail[0]}`, textFr: `${F.fr} : ${yes.length} des ${yes.length + no.length} arrêts ont le badge; pas ${listFr(names(no))}.${tail[1]}` };
  }
  if (yes.length) return { ...base, stops: yes, status: 'verified', text: `${F.en}: ${listEn(names(yes))} ${yes.length > 1 ? 'have' : 'has'} the badge.`, textFr: `${F.fr} : ${listFr(names(yes))} ${yes.length > 1 ? 'ont' : 'a'} le badge.` };
  return { ...base, stops: [], status: 'unmet', text: `${F.en}: no stop in this plan has that badge. The reason isn’t known from the listings.`, textFr: `${F.fr} : aucun arrêt de ce plan n’a ce badge. La raison n’est pas connue d’après les fiches.` };
}
function eventEntry(req, plan, stops, ctx) {
  const music = req.value === 'live-music' || req.eventKind === 'live-music';
  const label = music ? 'Live music' : 'Events', labelFr = music ? 'Musique en direct' : 'Événements';
  const what = music ? 'live music event' : 'matching event', whatFr = music ? 'événement de musique en direct' : 'événement correspondant';
  const dated = datesGiven(plan);
  const evs = dated ? eventStops(plan).filter((x) => !music || !(x.e.categories || []).length || (x.e.categories || []).includes('live-music')) : [];
  const badge = music ? stops.filter((x) => badgeOf(x.v, 'live_music', ctx.flags) === true).map((x) => ({ id: x.v.id, name: x.v.name, has: true })) : [];
  const base = { ask: music ? 'live_music' : 'event', label, labelFr };
  const badgeEn = badge.length ? ` ${listEn(names(badge))} ${badge.length > 1 ? 'list' : 'lists'} live music; the ${badge.length > 1 ? 'listings don’t' : 'listing doesn’t'} say which nights.` : '';
  const badgeFr = badge.length ? ` ${listFr(names(badge))} ${badge.length > 1 ? 'indiquent' : 'indique'} de la musique en direct; ${badge.length > 1 ? 'les fiches ne précisent' : 'la fiche ne précise'} pas quels soirs.` : '';
  if (evs.length) {
    const e = evs[0].e;
    return { ...base, status: 'verified', stops: badge, event: { id: e.id, name: e.name, date: e.startDate || null },
      text: `${label}: ${e.name} is on ${e.dateLabel || e.startDate}${e.time ? ` at ${e.time}` : ''}${evs[0].day ? ` (day ${evs[0].day})` : ''}.`,
      textFr: `${labelFr} : ${e.name}, ${e.dateLabelFr || e.dateLabel || e.startDate}${e.timeFr || e.time ? ` à ${e.timeFr || e.time}` : ''}${evs[0].day ? ` (jour ${evs[0].day})` : ''}.` };
  }
  if (!dated) {
    return { ...base, status: 'unknown', stops: badge, needsDates: true,
      text: `${label} depends on the night: pick your dates and I’ll add what’s on.${badgeEn}`,
      textFr: `${labelFr} : cela dépend du soir. Choisissez vos dates et j’ajouterai ce qui est à l’affiche.${badgeFr}` };
  }
  const town = ctx.town ? [` in ${ctx.town}`, ` à ${ctx.town}`] : ['', ''];
  return { ...base, status: badge.length ? 'unknown' : 'unmet', stops: badge,
    text: `${label}: no ${what} is listed${town[0]} on your dates.${badgeEn}`,
    textFr: `${labelFr} : aucun ${whatFr} n’est répertorié${town[1]} à vos dates.${badgeFr}` };
}
function typeWords(t) { return TYPE_WORDS[t] || [String(t).replace(/_/g, ' '), `${String(t).replace(/_/g, ' ')}s`, String(t).replace(/_/g, ' '), `${String(t).replace(/_/g, ' ')}s`]; }
function ofType(x, t) { return x.v.type === t && !x.s.tourStop; }
function countEntry(req, stops) {
  const w = typeWords(req.value), rows = stops.filter((x) => ofType(x, req.value)).map((x) => ({ id: x.v.id, name: x.v.name, has: true }));
  const n = rows.length, want = req.count, base = { ask: `count:${req.value}`, label: cap(w[1]), labelFr: cap(w[3]), stops: rows, count: n, asked: want };
  if (n === want) return { ...base, status: 'verified', text: `${cap(w[1])}: ${n}, as asked (${listEn(names(rows))}).`, textFr: `${cap(w[3])} : ${n}, comme demandé (${listFr(names(rows))}).` };
  if (!n) return { ...base, status: 'unmet', text: `${cap(w[1])}: you asked for ${want}; none is in this plan. The reason isn’t known from the listings.`, textFr: `${cap(w[3])} : vous en avez demandé ${want}; aucun n’est dans ce plan. La raison n’est pas connue d’après les fiches.` };
  return { ...base, status: 'partial', text: n < want ? `${cap(w[1])}: ${n} of the ${want} you asked for (${listEn(names(rows))}).` : `${cap(w[1])}: ${n} in this plan; you asked for ${want}.`,
    textFr: n < want ? `${cap(w[3])} : ${n} des ${want} demandés (${listFr(names(rows))}).` : `${cap(w[3])} : ${n} dans ce plan; vous en avez demandé ${want}.` };
}
function kindEntry(req, plan, stops, ctx) {
  const isType = req.kind === 'type';
  const w = isType ? typeWords(req.value) : null;
  const label = isType ? cap(w[1]) : cap((ctx.kindLabel && ctx.kindLabel(req.value)) || String(req.value).replace(/_/g, ' '));
  const labelFr = isType ? cap(w[3]) : cap((ctx.kindLabelFr && ctx.kindLabelFr(req.value)) || label);
  const rows = (isType ? stops.filter((x) => x.v.type === req.value) : stops.filter((x) => typeof ctx.kindsOf === 'function' && (ctx.kindsOf(x.v.id) || []).includes(req.value))).map((x) => ({ id: x.v.id, name: x.v.name, has: true }));
  const base = { ask: `${isType ? 'type' : 'kind'}:${req.value}`, label, labelFr, stops: rows };
  if (req.status === 'unmet') {
    const ni = ((plan.notIncluded || []).find((x) => x && x.kind === req.value)) || null;
    return { ...base, stops: [], status: 'unmet', text: ni ? ni.text : `${label}: not in this plan. The reason isn’t known from the listings.`, textFr: ni ? (ni.textFr || ni.text) : `${labelFr} : pas dans ce plan. La raison n’est pas connue d’après les fiches.` };
  }
  if (req.status !== 'satisfied') return null;
  return { ...base, status: 'verified', text: rows.length ? `${label}: ${rows.length > 4 ? `${names(rows.slice(0, 4)).join(', ')} and ${rows.length - 4} more` : listEn(names(rows))}.` : `${label}: in this plan.`, textFr: rows.length ? `${labelFr} : ${rows.length > 4 ? `${names(rows.slice(0, 4)).join(', ')} et ${rows.length - 4} ${rows.length - 4 > 1 ? 'autres' : 'autre'}` : listFr(names(rows))}.` : `${labelFr} : dans ce plan.` };
}
function stayEntries(plan) {
  const w = plan.whereToStay, out = [];
  const keys = (w && w.amenity && w.amenity.keys) || (w && w.pref && w.pref.amenities) || [];
  if (!w || !keys.length) return out;
  const pick = w.pick || null;
  for (const k of keys) {
    const A = STAY_AMENITY[k] || [cap(String(k).replace(/_/g, ' ')), cap(String(k).replace(/_/g, ' ')), String(k).replace(/_/g, ' '), String(k).replace(/_/g, ' ')];
    const has = !!(pick && (pick.has || []).includes(k));
    const base = { ask: `stay:${k}`, label: A[0], labelFr: A[1], stops: pick ? [{ id: pick.id, name: pick.name, has: has ? true : null }] : [] };
    if (has) {
      const winter = k === 'pool' && w.amenity && w.amenity.winterCheck;
      const away = w.amenity && w.amenity.elsewhere && pick.regionLabel ? [` It is in ${pick.regionLabel}.`, ` Il se trouve à ${pick.regionLabel}.`] : ['', ''];
      out.push({ ...base, status: 'verified', text: `${A[0]}: ${pick.name}’s listing says it has ${A[2]}.${away[0]}${winter ? ' The listing doesn’t say if it is open in winter: check when you book.' : ''}`,
        textFr: `${A[1]} : la fiche de ${pick.name} indique ${A[3]}.${away[1]}${winter ? ' La fiche ne dit pas si elle est ouverte l’hiver : vérifiez en réservant.' : ''}` });
    } else if (pick) {
      out.push({ ...base, status: 'unmet', text: `${A[0]}: no place to stay listed near these stops says it has ${A[2]}; ${pick.name}’s listing doesn’t say.`, textFr: `${A[1]} : aucun hébergement répertorié près de ces arrêts n’indique ${A[3]}; la fiche de ${pick.name} ne le précise pas.` });
    } else out.push({ ...base, status: 'unknown', text: `${A[0]}: no place to stay is suggested for this plan.`, textFr: `${A[1]} : aucun hébergement n’est suggéré pour ce plan.` });
  }
  return out;
}
// One person does not drink: which of the plan's wineries, breweries and bars list non-alcoholic options.
function nonDrinkerEntry(stops, ctx) {
  const rows = stops.filter((x) => DRINK_TYPES.includes(x.v.type)).map((x) => ({ id: x.v.id, name: x.v.name, has: badgeOf(x.v, 'nonalcoholic', ctx.flags) === true ? true : null }));
  const yes = rows.filter((r) => r.has), no = rows.filter((r) => !r.has);
  const base = { ask: 'nonalcoholic', label: 'Non-drinker', labelFr: 'Personne qui ne boit pas', stops: rows, who: 'one' };
  if (!rows.length) return { ...base, status: 'verified', text: 'For your non-drinker: this plan has no winery, brewery or bar stops.', textFr: 'Pour la personne qui ne boit pas : ce plan n’a aucun arrêt dans un vignoble, une brasserie ou un bar.' };
  if (!yes.length) return { ...base, status: 'unknown', text: 'One of you doesn’t drink: none of these tasting stops lists non-alcoholic options on its listing, so ask when you book.', textFr: 'Une personne ne boit pas : aucun de ces arrêts n’indique d’options sans alcool; demandez en réservant.' };
  const en = `For your non-drinker: ${listEn(names(yes))} ${yes.length > 1 ? 'list' : 'lists'} non-alcoholic options`;
  const fr = `Pour la personne qui ne boit pas : ${listFr(names(yes))} ${yes.length > 1 ? 'proposent' : 'propose'} des options sans alcool`;
  if (!no.length) return { ...base, status: 'verified', text: `${en}.`, textFr: `${fr}.` };
  return { ...base, status: 'partial', text: `${en}; ${listEn(names(no))} ${no.length > 1 ? 'don’t' : 'doesn’t'} say, so ask there.`, textFr: `${fr}; ${listFr(names(no))} ne le ${no.length > 1 ? 'précisent' : 'précise'} pas : demandez sur place.` };
}
// Nobody drinks: no winery, brewery, distillery, pub or bar is planned.
function noAlcoholEntry(stops) {
  const rows = stops.filter((x) => DRINK_TYPES.includes(x.v.type)).map((x) => ({ id: x.v.id, name: x.v.name, has: false }));
  const base = { ask: 'no_alcohol', label: 'No alcohol', labelFr: 'Sans alcool', stops: rows, who: 'all' };
  if (!rows.length) return { ...base, status: 'verified', text: 'No alcohol: no wineries, breweries, distilleries, pubs or bars are in this plan.', textFr: 'Sans alcool : aucun vignoble, brasserie, distillerie, pub ou bar n’est dans ce plan.' };
  return { ...base, status: 'unmet', text: `No alcohol: ${listEn(names(rows))} ${rows.length > 1 ? 'are' : 'is'} still in this plan; remove ${rows.length > 1 ? 'them' : 'it'} or swap ${rows.length > 1 ? 'them' : 'it'}.`, textFr: `Sans alcool : ${listFr(names(rows))} ${rows.length > 1 ? 'sont' : 'est'} encore dans ce plan; retirez ou remplacez ${rows.length > 1 ? 'ces arrêts' : 'cet arrêt'}.` };
}

function askedFeatures(plan) {
  const out = [];
  for (const r of plan.requirementResults || []) if (r && r.kind === 'feature' && r.strength !== 'prefer' && !out.includes(r.value)) out.push(r.value);
  for (const f of (plan.intent && plan.intent.features) || []) if (!out.includes(f)) out.push(f);
  return out;
}
function groupNoAlcohol(plan) {
  const ex = plan.intent && plan.intent.excluded;
  return (plan.noAlcohol === true || !!(ex && Array.isArray(ex.concepts) && ex.concepts.includes('alcohol'))) && !((plan.partySome || []).some((x) => x && x.concept === 'alcohol'));
}

// plan.evidence, and the plan's other lines kept in step with it. ctx (all optional):
//   flags(id) -> the listing's stored badge flags; kindsOf(id) -> its planner kinds; kindLabel(kind) / kindLabelFr(kind);
//   countDining(feature) -> how many places to eat in the plan's towns have the badge; town -> the plan's town label.
function applyEvidence(plan, ctx = {}) {
  if (!plan || typeof plan !== 'object' || !['multi_day', 'day_plan', 'itinerary', 'outing'].includes(plan.kind)) return plan;
  const stops = venueStops(plan);
  const reqs = Array.isArray(plan.requirementResults) ? plan.requirementResults : [];
  const ev = [];
  const dated = datesGiven(plan);
  plan.datesGiven = dated;
  // (The French date labels arrive after planning: the suggestion labels follow them.)
  if (Array.isArray(plan.dateSuggestions)) plan.dateSuggestions.forEach(labelSuggestion);
  // Kinds of place and how many.
  const counted = new Set();
  for (const r of reqs) {
    if (!r || r.kind !== 'type_count' || !Number.isInteger(r.count) || r.dayIndex || r.weekday || r.perDay) continue;
    const e = countEntry(r, stops);
    counted.add(r.value);
    ev.push(e);
    r.status = e.status === 'verified' ? 'satisfied' : e.status === 'unmet' ? 'unmet' : 'unverified';
    r.reason = e.status === 'verified' ? `${e.count} planned, as asked.` : `Requested ${r.count} ${r.value} stops; scheduled ${e.count}.`;
    if (Array.isArray(plan.warnings)) plan.warnings = plan.warnings.filter((w) => !new RegExp(`^Requested \\d+ ${r.value} stops?; scheduled \\d+\\.$`).test(String(w))).concat(e.status === 'verified' ? [] : [r.reason]);
  }
  for (const r of reqs) {
    if (!r || r.strength !== 'must' || r.dayIndex || r.silent || !['type', 'venue_kind'].includes(r.kind) || (r.kind === 'type' && counted.has(r.value))) continue;
    if (r.kind === 'type' && ['restaurant', 'outdoor', 'indoor'].includes(r.value) && r.status === 'satisfied') continue;
    const e = kindEntry(r, plan, stops, ctx);
    if (e && !ev.some((x) => x.ask === e.ask)) ev.push(e);
  }
  // Dietary badges on the meal stops, then the other badges asked for.
  for (const f of askedFeatures(plan)) {
    if (f === 'live_music' && reqs.some((r) => r && r.kind === 'event')) continue;
    if (f === 'nonalcoholic' && (plan.partySome || []).some((x) => x && x.concept === 'alcohol')) continue;
    const e = DIET.includes(f) ? dietEntry(f, stops, ctx, plan) : featureEntry(f, stops, ctx);
    ev.push(e);
    for (const r of reqs) {
      if (!r || r.kind !== 'feature' || r.value !== f) continue;
      if (DIET.includes(f)) {
        r.status = e.status === 'verified' ? 'satisfied' : e.status === 'unknown' ? 'unverified' : 'unmet';
        r.reason = e.status === 'verified' ? 'Every meal stop has the listing’s badge.' : e.text;
      }
    }
    if (DIET.includes(f) && e.status === 'verified' && Array.isArray(plan.warnings)) plan.warnings = plan.warnings.filter((w) => !/^Not every stop is listed as (?:gluten-free|vegan|vegetarian) friendly\.$/.test(String(w)));
  }
  ev.push(...stayEntries(plan));
  // Events: dated or not.
  const seenEvent = new Set();
  for (const r of reqs) {
    if (!r || r.kind !== 'event' || r.strength === 'prefer') continue;
    const e = eventEntry(r, plan, stops, ctx);
    if (!dated) { r.status = 'unverified'; r.reason = 'Depends on the dates: none are chosen yet.'; }
    else if (e.status === 'verified') { r.status = 'satisfied'; }
    if (seenEvent.has(e.ask)) continue;
    seenEvent.add(e.ask);
    ev.push(e);
  }
  if (!dated && Array.isArray(plan.warnings)) plan.warnings = plan.warnings.filter((w) => !/\bevents? (?:is|are|was|were) (?:listed|found)|No (?:matching |listed )?(?:live music|events?|concerts?)\b/i.test(String(w)));
  // Who drinks.
  if ((plan.partySome || []).some((x) => x && x.concept === 'alcohol')) {
    const e = nonDrinkerEntry(stops, ctx);
    ev.push(e);
    if (stops.some((x) => DRINK_TYPES.includes(x.v.type))) plan.partyNote = { concept: 'alcohol', venueIds: e.stops.filter((s) => s.has).map((s) => s.id), text: e.text, textFr: e.textFr };
    else delete plan.partyNote;
  } else if (groupNoAlcohol(plan)) ev.push(noAlcoholEntry(stops));
  // The one short line per ask the page prints: partial, unknown and unmet asks that no other line already says.
  const said = new Set((plan.notIncluded || []).map((x) => x && x.text).concat(plan.partyNote ? [plan.partyNote.text] : []));
  let lines = 0;
  for (const e of ev) {
    delete e.line;
    if (e.status === 'verified' || said.has(e.text) || lines >= 3) continue;
    e.line = true; lines++;
  }
  plan.evidence = ev;
  return plan;
}

// ---- booking links: each one belongs to the stop it is shown for ----
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; } };
const urlKey = (u) => String(u || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#]+$/, '');
// The destination of an affiliate wrapper (Stay22's ?link=, a ?url= / ?u= redirect), else the link itself.
function innerUrl(u) {
  try {
    const x = new URL(u);
    for (const k of ['link', 'url', 'u', 'target', 'murl']) { const v = x.searchParams.get(k); if (v && /^https:\/\//i.test(v)) return v; }
  } catch (e) { /* not a URL */ }
  return u;
}
const DATE_PARAM_RE = /(?:^|[?&;])(?:checkin|checkout|check_in|check_out|check-in|check-out|chkin|chkout|startdate|enddate|start_date|end_date|datefrom|dateto|d1|d2|arrival|departure|arrive|depart|pickup_date|dropoff_date|pick_up_date|drop_off_date|from_date|to_date|date)=/i;
// true when a link carries a travel date (a date parameter, or any YYYY-MM-DD value), also inside an affiliate wrapper.
function linkHasDate(u) {
  let s = String(u || '');
  try { s = `${s} ${decodeURIComponent(s)} ${decodeURIComponent(decodeURIComponent(s))}`; } catch (e) { /* as is */ }
  return DATE_PARAM_RE.test(s) || /[=:/]20\d{2}-\d{2}-\d{2}\b/.test(s) || /[=]\d{2}\/\d{2}\/20\d{2}\b/.test(s);
}
// Every booking link the plan shows, with the listing it is shown for:
//   [{ kind: 'stay' | 'venue' | 'tour' | 'event' | 'transport' | 'viator', id, name, url, affiliate, where }]
function planBookingLinks(plan) {
  const out = [];
  const add = (kind, id, name, l, where) => { if (l && typeof l.url === 'string' && l.url) out.push({ kind, id, name, url: l.url, affiliate: !!l.affiliate, link: l.key || l.link || l.kind || null, where }); };
  const w = plan && plan.whereToStay;
  for (const card of w ? [w.pick, ...(w.alternatives || [])].filter(Boolean) : []) {
    for (const l of card.bookingLinks || []) add('stay', card.id, card.name, l, 'stay.bookingLinks');
    if (card.livePrices && card.livePrices.url) add('stay', card.id, card.name, { url: card.livePrices.url, affiliate: true, key: 'live_prices' }, 'stay.livePrices');
    for (const st of card.bookingSteps || []) add(st.kind === 'venue' ? 'venue' : st.kind, st.kind === 'event' ? st.eventId : st.id, st.name, st, 'stay.bookingSteps');
  }
  for (const st of (w && w.bookingSteps) || []) add(st.kind === 'venue' ? 'venue' : st.kind, st.kind === 'event' ? st.eventId : st.id, st.name, st, 'bookingSteps');
  for (const st of (plan && plan.v4Booking && plan.v4Booking.steps) || []) add(st.kind === 'venue' ? 'venue' : st.kind, st.kind === 'event' ? st.eventId : st.id, st.name, st, 'v4Booking.steps');
  for (const c of (w && w.checklist) || []) add('venue', c.venueId, c.name, c, 'checklist');
  for (const x of venueStops(plan || {})) if (x.s.bookingLink) add('tour', x.v.id, x.v.name, x.s.bookingLink, 'stop.bookingLink');
  const gh = plan && plan.gettingHere;
  if (gh && gh.car) add('transport', 'car', (gh.carLabel && gh.carLabel.en) || 'Rent a car', { url: gh.car, affiliate: true, key: 'discovercars' }, 'gettingHere.car');
  return out;
}
// The check. stored(kind, id) -> { urls: [the listing's stored booking / website / provider links], names: [slugs or
// names the provider's page for it carries] } from the site's own data; no live fetch. Returns the problems found:
//   [{ code: 'not_this_listing' | 'reused' | 'date_without_dates' | 'not_https', link }]
function checkBookingLinks(plan, stored) {
  const problems = [];
  const links = planBookingLinks(plan);
  const dated = datesGiven(plan) || !!(plan && plan.whereToStay && plan.whereToStay.trip && plan.whereToStay.trip.datesGiven);
  const owner = new Map();
  for (const l of links) {
    if (!/^https:\/\//i.test(l.url)) { problems.push({ code: 'not_https', link: l }); continue; }
    if (!dated && linkHasDate(l.url)) problems.push({ code: 'date_without_dates', link: l });
    if (l.kind === 'transport' || l.kind === 'viator') continue;
    // No link reused across listings (the same page for two different places).
    const key = urlKey(innerUrl(l.url)).replace(/[?&](?:group_adults|group_children|no_rooms|adults|children|age|rm1)=[^&]*/g, '');
    const who = `${l.kind === 'tour' ? 'venue' : l.kind}:${l.id}`;
    if (owner.has(key) && owner.get(key) !== who) problems.push({ code: 'reused', link: l, other: owner.get(key) });
    else owner.set(key, who);
    const rec = typeof stored === 'function' ? stored(l.kind === 'tour' ? 'venue' : l.kind, l.id) : null;
    if (!rec) { problems.push({ code: 'not_this_listing', link: l, why: 'no stored record' }); continue; }
    const target = innerUrl(l.url), tKey = urlKey(target), tHost = hostOf(target), path = (() => { try { return decodeURIComponent(new URL(target).pathname + new URL(target).search).toLowerCase(); } catch (e) { return ''; } })();
    const okUrl = (rec.urls || []).some((u) => { const k = urlKey(innerUrl(u)); return k && (tKey === k || tKey.startsWith(`${k}/`) || tKey.startsWith(`${k}?`) || urlKey(target.split('?')[0]) === urlKey(String(innerUrl(u)).split('?')[0])); });
    const okName = (rec.names || []).some((n) => n && path.includes(String(n).toLowerCase()));
    const okHost = (rec.hosts || []).some((h) => h && (tHost === h || tHost.endsWith(`.${h}`)));
    if (!(okUrl || okName || okHost)) { problems.push({ code: 'not_this_listing', link: l, why: 'target does not match the stored link' }); continue; }
    // A warning, not a failure: a provider page (Booking.com, Expedia) whose address shares no word with the listing's
    // name. The stored link may be right (a hotel that changed its name), but a person should look at it.
    if (l.name && /(^|\.)(?:booking\.com|expedia\.(?:ca|com))$/.test(tHost)) {
      const words = String(l.name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC_NAME_WORDS.has(w));
      if (words.length && !words.some((w) => path.replace(/[^a-z0-9]+/g, ' ').includes(w))) problems.push({ code: 'name_differs', link: l, why: 'the provider page’s address shares no word with the listing’s name', warning: true });
    }
  }
  return problems;
}
const GENERIC_NAME_WORDS = new Set(['hotel', 'hotels', 'motel', 'inn', 'inns', 'suites', 'suite', 'resort', 'resorts', 'lodge', 'lodging', 'guest', 'house', 'cabins', 'cottages', 'the', 'and', 'with', 'kelowna', 'penticton', 'vernon', 'osoyoos', 'oliver', 'summerland', 'peachland', 'naramata', 'whistler', 'squamish', 'pemberton', 'okanagan', 'west', 'lake', 'country', 'british', 'columbia', 'canada', 'wyndham', 'radisson', 'marriott', 'hilton', 'best', 'western', 'plus']);

// ---- the shared trip link ----
// The link is the trip ("/my-trip?stops=venue:1,event:2&days=1,1": nothing is stored). Older links carry only stops and
// days and keep working as they are. A link made from a plan may also carry, all optional:
//   start=YYYY-MM-DD   day 1's date, only when the visitor chose dates
//   t=615,690,,1080    each stop's start time (minutes after midnight), in the stops' order
//   stay=1970          the place to stay (a listing id)      nights=2
//   ad=6  aa=1  kids=2 the party as given; aa=1 marks an assumed number of adults
//   sug=event:213      date-dependent suggestions (never stops)
//   asks=count:winery:2,kind:easy_walk,gluten_free,stay:pool,live_music,nonalcoholic   what the request asked for;
//                      the page works the evidence out again from the listings as they are now
const ASK_RE = /^(?:count:[a-z_]{2,20}:\d{1,2}|type:[a-z_]{2,20}|kind:[a-z_]{2,30}|stay:[a-z_]{2,20}|[a-z_]{2,20})$/;
function parseShareContext(query) {
  const q = query || {};
  const int = (v, lo, hi) => { const n = /^\d{1,4}$/.test(String(v || '')) ? Number(v) : NaN; return n >= lo && n <= hi ? n : null; };
  const out = {};
  if (isDate(q.start)) out.start = q.start;
  if (typeof q.t === 'string' && q.t) { const tt = q.t.split(',').slice(0, 60).map((x) => int(x, 0, 1439)); if (tt.some((x) => x != null)) out.times = tt; }
  const stay = int(q.stay, 1, 9999); if (stay) out.stayId = stay;
  const nights = int(q.nights, 1, 30); if (nights) out.nights = nights;
  const ad = int(q.ad, 1, 16); if (ad) out.adults = ad;
  if (q.aa === '1' && ad) out.adultsAssumed = true;
  const kids = int(q.kids, 1, 12); if (kids) out.kids = kids;
  if (typeof q.sug === 'string' && q.sug) { const g = q.sug.split(',').filter((r) => /^event:[1-9][0-9]*$/.test(r)).slice(0, 3); if (g.length) out.suggestions = g; }
  if (typeof q.asks === 'string' && q.asks) { const k = [...new Set(q.asks.split(',').filter((a) => ASK_RE.test(a)))].slice(0, 12); if (k.length) out.asks = k; }
  return Object.keys(out).length ? out : null;
}
// The same parameters back as a query string (validated values only), for the EN / FR switch and the canonical link.
function shareContextQuery(c) {
  if (!c) return '';
  const p = [];
  if (c.start) p.push(`start=${c.start}`);
  if (c.times) p.push(`t=${c.times.map((x) => (x == null ? '' : x)).join(',')}`);
  if (c.stayId) p.push(`stay=${c.stayId}`);
  if (c.nights) p.push(`nights=${c.nights}`);
  if (c.adults) p.push(`ad=${c.adults}`);
  if (c.adultsAssumed) p.push('aa=1');
  if (c.kids) p.push(`kids=${c.kids}`);
  if (c.suggestions && c.suggestions.length) p.push(`sug=${c.suggestions.join(',')}`);
  if (c.asks && c.asks.length) p.push(`asks=${c.asks.join(',')}`);
  return p.join('&');
}
// The asks a plan's evidence carries, as the link's asks= list.
function shareAsks(plan) {
  return ((plan && plan.evidence) || []).map((e) => (e && /^count:/.test(e.ask || '') && Number.isInteger(e.asked) ? `${e.ask}:${e.asked}` : e && e.ask)).filter((a) => a && ASK_RE.test(a)).slice(0, 12);
}
// A plan-shaped object from a shared link's stops, so the evidence is worked out the same way as on the plan.
//   stops: [{ id, name, type, badges?, day, start }]   events: [{ id, name, day, startDate, dateLabel }]
//   stay: { id, name, regionLabel, has: [amenity keys] } or null
function sharedPlan(c, stops, events, stay) {
  const part = (m) => (m == null ? 'midday' : m < 660 ? 'morning' : m < 900 ? 'midday' : m < 1020 ? 'late' : m < 1185 ? 'evening' : 'night');
  const days = new Map();
  for (const x of stops) { const d = x.day || 0; if (!days.has(d)) days.set(d, { day: d, stops: [] }); days.get(d).stops.push({ daypart: part(x.start), reasons: x.start != null && x.start >= 1185 && x.type !== 'restaurant' ? [{ code: 'night' }] : [], venue: { id: x.id, name: x.name, type: x.type, region: x.region, ...(x.badges ? { badges: x.badges } : {}) } }); }
  for (const e of events || []) { const d = e.day || 0; if (!days.has(d)) days.set(d, { day: d, stops: [] }); days.get(d).stops.push({ kind: 'event', daypart: 'night', event: { id: e.id, name: e.name, startDate: e.startDate || null, dateLabel: e.dateLabel || e.startDate || '', dateLabelFr: e.dateLabelFr, time: e.time || null, categories: e.categories || [] } }); }
  const reqs = [], asks = (c && c.asks) || [];
  let stayKeys = [], some = false, none = false;
  for (const a of asks) {
    const m = a.split(':');
    if (m[0] === 'count') reqs.push({ kind: 'type_count', value: m[1], count: Number(m[2]), strength: 'must' });
    else if (m[0] === 'type') reqs.push({ kind: 'type', value: m[1], strength: 'must', status: stops.some((x) => x.type === m[1]) ? 'satisfied' : 'unmet' });
    else if (m[0] === 'kind') reqs.push({ kind: 'venue_kind', value: m[1], strength: 'must', status: stops.some((x) => (x.kinds || []).includes(m[1])) ? 'satisfied' : 'unmet' });
    else if (m[0] === 'stay') stayKeys.push(m[1]);
    else if (a === 'live_music') reqs.push({ kind: 'event', value: 'live-music', strength: 'must' });
    else if (a === 'event') reqs.push({ kind: 'event', value: 'any', strength: 'must' });
    else if (a === 'nonalcoholic') some = true;
    else if (a === 'no_alcohol') none = true;
    else if (FEATURES[a]) reqs.push({ kind: 'feature', value: a, strength: 'must' });
  }
  const plan = { kind: 'multi_day', days: [...days.values()].sort((a, b) => a.day - b.day), requirementResults: reqs, datesGiven: !!(c && c.start), warnings: [] };
  if (some) plan.partySome = [{ concept: 'alcohol' }];
  if (none) plan.noAlcohol = true;
  if (stayKeys.length) plan.whereToStay = { pick: stay ? { id: stay.id, name: stay.name, regionLabel: stay.regionLabel, has: stay.has || [] } : null, amenity: { keys: stayKeys, ...(stay && stay.winterCheck ? { winterCheck: true } : {}) } };
  return plan;
}

module.exports = {
  parseShareContext, shareContextQuery, shareAsks, sharedPlan,
  DIET, DRINK_TYPES, FEATURES, venueStops, eventStops, isMealStop, badgeOf, datesGiven, takeUndatedEvents, suggestionOf,
  applyEvidence, planBookingLinks, checkBookingLinks, linkHasDate, innerUrl,
};
