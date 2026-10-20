'use strict';
// Build My Trip, round 15 (2026-10-20): the plan's summary as a local friend would say it -- the places in order, each
// with what you do there, and one plain reason for a key stop -- in English and French, built only from what Okanagan
// Roam stores about each place (its kind, cuisine, badges, lists, activities, town) and each event (name, start time).
// Nothing is claimed that the data does not hold: no "best", no dishes, no prices. Notes about hours, closures and
// timing stay in the plan's own notes.

const BANNED_RE = /\b(?:famous|best|must[- ]see|hidden gems?|world[- ]class|iconic|stunning|amazing)\b/i;

function norm(s) { return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
const has = (text, re) => re.test(norm(text));

// What you do at a stop: { en: [verb, prep], fr: [verb, prep] }, so a second stop of the same kind reads "then at X".
function action(stop, v, ctx) {
  const t = (v && v.type) || (stop.venue && stop.venue.type) || '';
  const name = stop.venue ? stop.venue.name : '';
  const part = stop.daypart || '';
  const label = String(stop.label || '');
  const kinds = (v && v.plannerKinds) || [];
  const acts = (v && v.activities) || [];
  const evening = part === 'evening' || part === 'night';
  if (stop.skiDay || (t === 'outdoor' && has(name, /\bski\b/))) return { en: ['ski at', ''], fr: ['skiez à', ''] };
  if (t === 'restaurant' || (t === 'cafe' && /\b(?:lunch|brunch|breakfast)\b/i.test(label)) || stop.wineryLunch) {
    if (/\bbrunch\b/i.test(label)) return { en: ['have brunch at', ''], fr: ['prenez le brunch à', ''] };
    if (/\bbreakfast\b/i.test(label)) return { en: ['have breakfast at', ''], fr: ['déjeunez à', ''] };
    if (evening) return { en: ['have dinner at', ''], fr: ['soupez à', ''], dinner: true };
    return { en: ['have lunch at', ''], fr: ['dînez à', ''] };
  }
  if (t === 'cafe') return has(`${name} ${(v && v.textDesc) || ''}`, /\b(?:gelato|ice cream|dessert|desserts|chocolate|bubble tea)\b/)
    ? { en: ['stop for a treat at', ''], fr: ['offrez-vous une gâterie à', ''] } : { en: ['stop for coffee at', ''], fr: ['prenez un café à', ''] };
  if (t === 'winery') return { en: ['taste wine at', ''], fr: ['dégustez du vin à', ''] };
  if (t === 'brewery') return has(name, /\bcider|cidery\b/) ? { en: ['try the cider at', ''], fr: ['goûtez le cidre à', ''] } : { en: ['try the beer at', ''], fr: ['goûtez la bière à', ''] };
  if (t === 'distillery') return { en: ['try the spirits at', ''], fr: ['goûtez les spiritueux à', ''] };
  if (t === 'pub') return { en: ['stop for a drink at', ''], fr: ['prenez un verre à', ''], drink: true };
  if (t === 'cocktail') return { en: [evening ? 'have a cocktail at' : 'have a drink at', ''], fr: ['prenez un cocktail à', ''], drink: true };
  if (t === 'beach') return { en: ['spend time by the water at', ''], fr: ['profitez du bord de l’eau à', ''] };
  if (t === 'golf') return v && v.indoorGolf ? { en: ['play indoor golf at', ''], fr: ['jouez au golf intérieur à', ''] } : { en: ['play a round at', ''], fr: ['jouez une partie à', ''] };
  if (t === 'tour') return { en: ['join a tour with', ''], fr: ['faites une visite avec', ''] };
  if (t === 'sport') return { en: ['play at', ''], fr: ['jouez à', ''] };
  if (t === 'indoor') {
    if (kinds.includes('bowling') || has(name, /\bbowl|lanes\b/)) return { en: ['go bowling at', ''], fr: ['jouez aux quilles à', ''] };
    if (kinds.includes('escape') || has(name, /\bescape\b/)) return { en: ['try an escape room at', ''], fr: ['tentez un jeu d’évasion à', ''] };
    if (has(name, /\bspa|sauna|wellness\b/)) return { en: ['relax at', ''], fr: ['détendez-vous à', ''] };
    return { en: ['visit', ''], fr: ['visitez', ''] };
  }
  if (t === 'outdoor') {
    if (acts.includes('hiking') || has(name, /\btrail|trails\b/)) return { en: ['walk the trails at', ''], fr: ['marchez les sentiers de', ''], outdoors: true };
    if (acts.includes('viewpoints') || has(name, /\blookout|viewpoint\b/)) return { en: ['take in the view from', ''], fr: ['profitez de la vue depuis', ''], outdoors: true, view: true };
    return { en: ['spend time outside at', ''], fr: ['profitez du plein air à', ''], outdoors: true };
  }
  return { en: ['visit', ''], fr: ['visitez', ''] };
}

// One plain reason, from the place's own data, in English and French, or null.
const LAKE = [{ en: 'which looks out over the lake', fr: 'avec vue sur le lac' }, { en: 'with views over the lake', fr: 'qui donne sur le lac' }, { en: 'with a lake view', fr: 'avec vue sur le lac' }];
function reason(stop, v, ctx, a) {
  if (!v) return null;
  const f = v.features || {}, c = v.collections || [];
  const name = norm(v.name);
  if (ctx.dog && (f.dog_friendly || c.includes('dog_friendly'))) return { en: 'where dogs are welcome', fr: 'où les chiens sont acceptés' };
  if (ctx.kids && f.kid_friendly) return { en: 'listed as kid-friendly', fr: 'indiqué comme adapté aux enfants' };
  if (f.lake_view && !(a && a.view)) return LAKE[v.id % LAKE.length];
  if (f.live_music) return { en: 'which has live music', fr: 'avec musique en direct' };
  if (f.patio && ['restaurant', 'pub', 'brewery', 'winery', 'cocktail', 'cafe'].includes(v.type)) return { en: 'which has a patio', fr: 'qui a une terrasse' };
  if (f.free_entry) return { en: 'free to visit', fr: 'à entrée gratuite' };
  const cuisine = String(v.cuisineLabel || '').trim();
  if (v.type === 'restaurant' && /^[A-Za-z][A-Za-z ]{2,18}$/.test(cuisine) && !/\b(?:canadian|restaurant|food|other|fusion|west coast)\b/i.test(cuisine) && !name.includes(norm(cuisine))) return { en: `for ${cuisine} food`, fr: `pour la cuisine ${CUISINE_FR[cuisine.toLowerCase()] || cuisine.toLowerCase()}` };
  if (c.includes('local_favorite')) return { en: 'a local favourite', fr: 'un coup de cœur local' };
  return null;
}
const CUISINE_FR = { italian: 'italienne', thai: 'thaïe', mexican: 'mexicaine', japanese: 'japonaise', chinese: 'chinoise', indian: 'indienne', greek: 'grecque', vietnamese: 'vietnamienne', korean: 'coréenne', french: 'française', sushi: 'japonaise', pizza: 'italienne', burgers: 'de burgers', bbq: 'barbecue', seafood: 'de la mer', steakhouse: 'de grillades', mediterranean: 'méditerranéenne', lebanese: 'libanaise', spanish: 'espagnole', german: 'allemande', ukrainian: 'ukrainienne', filipino: 'philippine', ethiopian: 'éthiopienne', taiwanese: 'taïwanaise', vegan: 'végane', vegetarian: 'végétarienne' };

function clockEn(m) { const h = Math.floor(m / 60) % 24, mm = m % 60; return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`; }
function clockFr(m) { const h = Math.floor(m / 60) % 24, mm = m % 60; if (!mm && h === 0) return 'minuit'; if (!mm && h === 12) return 'midi'; return `${h} h${mm ? ` ${String(mm).padStart(2, '0')}` : ''}`; }
function eventStart(e) {
  if (e && /^\d{2}:\d{2}$/.test(e.startTime || '')) return Number(e.startTime.slice(0, 2)) * 60 + Number(e.startTime.slice(3, 5));
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(String((e && e.time) || '').trim());
  return m ? (Number(m[1]) % 12 + (m[3].toLowerCase() === 'pm' ? 12 : 0)) * 60 + Number(m[2] || 0) : null;
}

// The phrases of one day: [{ en, fr, verbEn, verbFr, name, part }].
function dayPhrases(stops, byId, ctx, maxReasons, rows) {
  let reasons = 0, prevTown = null;
  const out = [];
  stops.forEach((s, i) => {
    if (s.event) {
      const listed = eventStart(s.event), row = (rows || []).find((x) => x.eventId === s.event.id);
      // A drop-in event (open 10 to 4) visited later in the day is not "at 10 AM".
      const start = listed != null && (!row || !Number.isFinite(row.startMinutes) || row.startMinutes === listed) ? listed : null;
      const town = s.event.regionLabel || null;
      const moved = town && prevTown && town !== prevTown ? town : null;
      out.push({ part: s.daypart, name: s.event.name, verbEn: 'go to', verbFr: 'assistez à',
        en: `go to ${s.event.name}${start != null ? ` at ${clockEn(start)}` : ''}${moved ? ` in ${moved}` : ''}`,
        fr: `assistez à « ${s.event.name} »${start != null ? ` à ${clockFr(start)}` : ''}${moved ? ` à ${moved}` : ''}` });
      if (town) prevTown = town;
      return;
    }
    if (!s.venue) return;
    const v = byId.get(s.venue.id) || null;
    const row = (rows || []).find((x) => x.venueId === s.venue.id && Number.isFinite(x.startMinutes));
    const when = row ? (row.startMinutes < 690 ? 'morning' : row.startMinutes < 1020 ? 'afternoon' : 'evening') : s.daypart;
    const a = action(s, v, ctx);
    const town = s.venue.regionLabel || null;
    const moved = town && prevTown && town !== prevTown ? town : null;
    // One reason for a key stop: the first thing to do that isn't a meal, and dinner.
    const mealish = /^(?:have lunch|have brunch|have breakfast|stop for coffee)/.test(a.en[0]);
    const key = a.dinner || (!mealish && !out.some((o) => o.keyed));
    const r = key && reasons < maxReasons ? reason(s, v, ctx, a) : null;
    if (r) reasons++;
    const last = i === stops.length - 1 || !stops.slice(i + 1).some((x) => x.venue || x.event);
    let verbEn = a.en[0], verbFr = a.fr[0];
    if (last && a.dinner && out.length) { verbEn = 'finish with dinner at'; verbFr = 'terminez par un souper à'; }
    else if (last && a.drink && out.length && (s.daypart === 'evening' || s.daypart === 'night')) { verbEn = 'end with a drink at'; verbFr = 'terminez par un dernier verre à'; }
    const prev = out[out.length - 1];
    const same = prev && prev.verbEn === verbEn && !moved;
    const name = s.venue.name;
    out.push({ part: when, name, verbEn, verbFr, keyed: !!r,
      en: `${same ? 'then at' : verbEn} ${name}${moved ? ` in ${moved}` : ''}${r ? `, ${r.en}` : ''}`,
      fr: `${same ? 'puis à' : verbFr} ${name}${moved ? ` à ${moved}` : ''}${r ? `, ${r.fr}` : ''}`,
      fullEn: `${verbEn} ${name}${moved ? ` in ${moved}` : ''}${r ? `, ${r.en}` : ''}`,
      fullFr: `${verbFr} ${name}${moved ? ` à ${moved}` : ''}${r ? `, ${r.fr}` : ''}`,
      sameAsPrev: same });
    if (town) prevTown = town;
  });
  return out;
}
const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const CONNECT = {
  en: { morning: 'Next, ', midday: 'Next, ', afternoon: 'In the afternoon, ', late: 'Later, ', evening: 'In the evening, ', night: 'Later, ' },
  fr: { morning: 'Ensuite, ', midday: 'Ensuite, ', afternoon: 'L’après-midi, ', late: 'Plus tard, ', evening: 'En soirée, ', night: 'Plus tard, ' },
};
// Two phrases a sentence: "Walk the trails at Knox Mountain Park, which looks out over the lake, then have lunch at JOEY."
function sentences(phrases, lang) {
  const out = [];
  for (let i = 0; i < phrases.length; i += 2) {
    const a = phrases[i], b = phrases[i + 1];
    const textA = a.sameAsPrev ? (lang === 'en' ? a.fullEn : a.fullFr) : a[lang];
    const lunch = /^have lunch/.test(a.verbEn || '');
    const lead = i === 0 ? '' : lunch ? (lang === 'en' ? 'Next, ' : 'Ensuite, ') : (CONNECT[lang][a.part] || (lang === 'en' ? 'Then ' : 'Puis '));
    let s = lead ? `${lead}${textA}` : capFirst(textA);
    if (b) s += lang === 'en' ? (b.sameAsPrev ? `, ${b.en}` : `, then ${b.en}`) : (b.sameAsPrev ? `, ${b.fr}` : `, puis ${b.fr}`);
    out.push(`${s}.`);
  }
  return out.join(' ').replace(/([.!?])\.(?=\s|$)/g, '$1');
}

function buildStory(result, facts, ctx = {}) {
  if (!result || typeof result !== 'object') return null;
  const byId = new Map((facts || []).map((v) => [v.id, v]));
  const days = (result.days || []).length
    ? result.days.map((d) => ({ day: d.day, stops: (d.stops || []).filter((s) => s.venue || s.event) }))
    : [{ day: 1, stops: (((result.itinerary || {}).stops) || ((result.outing || {}).stops) || []).filter((s) => s.venue || s.event) }];
  const shown = days.filter((d) => d.stops.length);
  if (!shown.length) return null;
  const multi = (result.days || []).length > 1;
  const per = shown.map((d) => {
    const phrases = dayPhrases(d.stops, byId, ctx, multi ? 1 : 2, (result.schedule || []).filter((r) => (r.day || 1) === d.day));
    return { day: d.day, text: sentences(phrases, 'en'), textFr: sentences(phrases, 'fr'), names: d.stops.map((s) => (s.venue || s.event).name) };
  });
  const crawl = !multi && shown[0].stops.filter((s) => s.venue).length >= 2 && shown[0].stops.filter((s) => s.venue && ['brewery', 'pub', 'distillery', 'cocktail'].includes(s.venue.type)).length >= 2;
  const safe = crawl ? { en: ' Plan a safe ride home.', fr: ' Prévoyez un retour sécuritaire.' } : { en: '', fr: '' };
  const text = multi ? per.map((d) => `Day ${d.day}: ${d.text}`).join(' ') : per[0].text + safe.en;
  const textFr = multi ? per.map((d) => `Jour ${d.day} : ${d.textFr}`).join(' ') : per[0].textFr + safe.fr;
  return { text, textFr, days: per.map(({ day, text: t, textFr: f }) => ({ day, text: t, textFr: f })) };
}

module.exports = { buildStory, BANNED_RE };
