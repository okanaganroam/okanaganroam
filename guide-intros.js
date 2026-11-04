'use strict';

// Badge guide intros (2026-10-27): the opening paragraph and meta description of each town + badge guide
// (/guide/<town>/<badge>, e.g. /guide/kelowna/patio), written from that page's own list of places instead of one
// sentence per badge with the town swapped in. After the Sept 2026 spam update ("scaled content") the thin pages were
// made noindex; this makes the indexable ones say something only that page can say.
//
// Two pure steps, no database and no clock of their own (server.js gathers the data, see guideIntroContext):
//   computeGuideFacts(badge, venues, ctx)   -> the facts for this slice (counts, mix, badge facts, standouts)
//   renderGuideIntro(facts, { lang, town }) -> { text, html, meta } in English or Canadian French
// Only facts that are notable for the slice become sentences (a 0, an "all of them" or a tiny share is skipped), the
// order follows the data (the strongest fact leads) and each fact has a few phrasings chosen by the town, so two pages
// for the same badge don't read as one template. Stable stored facts only: never an "open now" or "on now" count,
// since a page is crawled at one moment and read at another.

const DOG_OUTDOOR_TYPES = new Set(['outdoor', 'beach', 'sport', 'golf', 'tour']);
const FOOD_TYPES = new Set(['restaurant', 'cafe', 'pub', 'brewery', 'cocktail', 'distillery', 'winery']);
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Lower-case nouns for the mix ("9 restaurants, 4 breweries and 2 wineries").
const NOUNS = {
  en: {
    restaurant: ['restaurant', 'restaurants'], winery: ['winery', 'wineries'], cafe: ['café', 'cafés'], brewery: ['brewery', 'breweries'],
    pub: ['pub', 'pubs'], cocktail: ['cocktail lounge', 'cocktail lounges'], distillery: ['distillery', 'distilleries'], golf: ['golf course', 'golf courses'],
    beach: ['beach', 'beaches'], outdoor: ['park or trail', 'parks and trails'], indoor: ['indoor attraction', 'indoor attractions'],
    tour: ['tour', 'tours and experiences'], sport: ['sports and recreation spot', 'sports and recreation spots'], shop: ['shop', 'shops'],
  },
  fr: {
    restaurant: ['restaurant', 'restaurants'], winery: ['vignoble', 'vignobles'], cafe: ['café', 'cafés'], brewery: ['brasserie', 'brasseries'],
    pub: ['pub', 'pubs'], cocktail: ['bar à cocktails', 'bars à cocktails'], distillery: ['distillerie', 'distilleries'], golf: ['terrain de golf', 'terrains de golf'],
    beach: ['plage', 'plages'], outdoor: ['parc ou sentier', 'parcs et sentiers'], indoor: ['activité intérieure', 'activités intérieures'],
    tour: ['visite', 'visites et expériences'], sport: ['lieu de sport et loisirs', 'lieux de sport et loisirs'], shop: ['boutique', 'boutiques'],
  },
};

// The other badges worth mentioning on each badge's page ("12 of these patios also look out on the lake").
const OVERLAPS = {
  patio: ['lake_view', 'dog_friendly', 'live_music'], dog_friendly: ['patio', 'kid_friendly'], happy_hour: ['patio', 'sports_tv'],
  kid_friendly: ['patio', 'great_groups'], vegan: ['gluten_free'], vegetarian: ['vegan', 'gluten_free'], gluten_free: ['vegan'],
  lake_view: ['patio', 'dog_friendly'], live_music: ['patio', 'happy_hour'], sports_tv: ['happy_hour', 'great_groups'],
  great_groups: ['patio', 'kid_friendly'], nonalcoholic: ['kid_friendly', 'patio'], free_entry: ['dog_friendly', 'kid_friendly'],
  arts_culture: ['free_entry', 'kid_friendly'], open_early: ['patio', 'dog_friendly'], open_late: ['live_music', 'happy_hour'],
};
const OVERLAP_TEXT = {
  en: { lake_view: 'have a lake view', dog_friendly: 'welcome dogs', live_music: 'put on live music', patio: 'have a patio', kid_friendly: 'are kid-friendly',
    great_groups: 'work well for groups', gluten_free: 'have gluten-free options', vegan: 'have vegan options', sports_tv: 'show the game', happy_hour: 'have a happy hour',
    free_entry: 'are free to visit' },
  fr: { lake_view: 'ont une vue sur le lac', dog_friendly: 'acceptent les chiens', live_music: 'présentent de la musique live', patio: 'ont une terrasse',
    kid_friendly: 'accueillent bien les enfants', great_groups: 'conviennent aux groupes', gluten_free: 'offrent des options sans gluten', vegan: 'offrent des options véganes',
    sports_tv: 'diffusent les matchs', happy_hour: 'ont un happy hour', free_entry: 'sont gratuites' },
};

// One place and this page's badge, for a favourite already the standout of another guide in town.
const BADGE_PRED = {
  en: { patio: 'has a patio', dog_friendly: 'welcomes dogs', vegan: 'has vegan options', vegetarian: 'has vegetarian options', gluten_free: 'has gluten-free options',
    kid_friendly: 'is kid-friendly', lake_view: 'has a lake view', nonalcoholic: 'has alcohol-free drinks', sports_tv: 'shows the game', live_music: 'puts on live music',
    great_groups: 'works well for groups', happy_hour: 'has a happy hour', free_entry: 'is free to visit', arts_culture: 'is an arts and culture stop', open_early: 'opens early', open_late: 'stays open late' },
  fr: { patio: 'a une terrasse', dog_friendly: 'accepte les chiens', vegan: 'offre des options véganes', vegetarian: 'offre des options végétariennes', gluten_free: 'offre des options sans gluten',
    kid_friendly: 'accueille bien les enfants', lake_view: 'a une vue sur le lac', nonalcoholic: 'sert des boissons sans alcool', sports_tv: 'diffuse les matchs', live_music: 'présente de la musique live',
    great_groups: 'convient aux groupes', happy_hour: 'a un happy hour', free_entry: 'est gratuit', arts_culture: 'est un lieu d’art et de culture', open_early: 'ouvre tôt', open_late: 'ferme tard' },
};

// ---------- small helpers ----------
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function num(n, lang) { return Number(n).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA'); }
function joinList(items, lang) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${lang === 'fr' ? 'et' : 'and'} ${items[items.length - 1]}`;
}
function noun(type, n, lang) { const t = (NOUNS[lang] || NOUNS.en)[type]; return t ? t[n === 1 ? 0 : 1] : null; }
function money(x, lang) {
  const s = Number.isInteger(x) ? String(x) : x.toFixed(2);
  return lang === 'fr' ? `${s.replace('.', ',')} $` : `$${s}`;
}
function capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
// The first sentence of a stored note or description, when it is short enough to quote.
function shortLine(text, max = 130) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const m = /^(.{25,}?[.!?])(?:\s|$)/.exec(t);
  const first = (m ? m[1] : t).trim();
  if (first.length > max || first.length < 25) return '';
  return first.replace(/[.!?]$/, '');
}

// A stored note or description as a short clause after a name: the first sentence, the name dropped when it opens
// it ("Sushi Kojo is a Japanese restaurant..." -> "a Japanese restaurant..."), '' when too long or too short. French
// descriptions are used only in that "<name> est ..." form, so the clause always reads as French.
const NOTE_LOWER = new Set(['a', 'an', 'the', 'voted', 'owned', 'gold', 'silver', 'bronze', 'named', 'one', 'family', 'home', 'run', 'built', 'opened', 'winner', 'local', 'locals', 'small', 'big', 'beloved', 'repeat', 'readers', 'second', 'third', 'first', 'best']);
function noteText(raw, name, lang) {
  let t = shortLine(raw, 160);
  if (!t) return '';
  const nm = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lead = new RegExp(`^${nm}(?:,[^,]{1,60},)?\\s+(?:${lang === 'fr' ? 'est|sont' : 'is|are|has been'})\\s+`, 'i');
  if (lead.test(t)) t = t.replace(lead, '');
  else if (lang === 'fr') return '';
  if (t.length > 120 || t.length < 20) return '';
  const first = (/^[A-Za-zÀ-ÿ']+/.exec(t) || [''])[0];
  if (NOTE_LOWER.has(first.toLowerCase()) || lang === 'fr') t = t.charAt(0).toLowerCase() + t.slice(1);
  return t;
}
// Words that make a favourite a fitting standout for a badge's page (in its note or description).
const STANDOUT_WORDS = {
  patio: /\b(?:patios?|terraces?|decks?|rooftop|courtyard|outdoor seating|garden)\b/i, dog_friendly: /\bdogs?\b|\bleash/i,
  vegan: /\b(?:vegan|plant[- ]based)\b/i, vegetarian: /\b(?:vegetarian|vegan|veggie|plant[- ]based)\b/i, gluten_free: /\bgluten|celiac\b/i,
  kid_friendly: /\b(?:kids?|famil(?:y|ies)|children|playground)\b/i, lake_view: /\b(?:lake|lakeside|lakefront|waterfront|views?)\b/i,
  live_music: /\b(?:live music|bands?|musicians?|open mic|concerts?|stage)\b/i, sports_tv: /\b(?:games?|hockey|sports?|screens?|tvs?)\b/i,
  great_groups: /\b(?:groups?|parties|party|banquets?|large tables?|private rooms?)\b/i, happy_hour: /\bhappy hours?\b/i,
  open_early: /\b(?:breakfast|brunch|coffee|bakery|morning)\b/i, open_late: /\b(?:late|nights?|cocktails?|bar)\b/i,
  nonalcoholic: /\b(?:non-alcoholic|alcohol-free|zero[- ]proof|mocktails?|kombucha)\b/i, free_entry: /\b(?:free|trails?|parks?|beach)\b/i,
  arts_culture: /\b(?:art|arts|gallery|museum|theatre|heritage|history)\b/i,
};
// -> { kind: 'collection' | 'rated' | null, ranked: [venue] }: the slice's Local Favourites and Hidden Gems, those whose
// note or description fits the badge first; or, when it has none, the best rated with at least 20 reviews.
function standoutCandidates(badge, list, ctx = {}) {
  const lf = ctx.localFavourites || new Set(), hg = ctx.hiddenGems || new Set(), notes = ctx.notes || new Map();
  const words = STANDOUT_WORDS[badge];
  const score = (v) => (words && words.test(`${notes.get(v.id) || ''} ${v.description || ''}`) ? 2 : 0) + (lf.has(v.id) ? 0.5 : 0) + (Number(v.rating) || 0) / 10;
  const members = list.filter((v) => lf.has(v.id) || hg.has(v.id));
  if (members.length) {
    return { kind: 'collection', ranked: members.map((v) => [score(v), v]).sort((a, b) => b[0] - a[0] || (Number(b[1].reviews) || 0) - (Number(a[1].reviews) || 0) || String(a[1].name).localeCompare(String(b[1].name))).map((x) => x[1]) };
  }
  const top = list.filter((v) => Number(v.rating) > 0 && Number(v.reviews) >= 20)
    .sort((a, b) => Number(b.rating) - Number(a.rating) || Number(b.reviews) - Number(a.reviews) || String(a.name).localeCompare(String(b.name)));
  return { kind: top.length >= 2 ? 'rated' : null, ranked: top };
}
// Spreads standouts over one town's guide pages: pages: [{ badge, cand: standoutCandidates() }] -> Map(badge -> [id]).
// The page with the fewest choices picks first; each takes up to two places no other page in town has used, and only
// when every choice is taken does it repeat one (a single name), so the same favourite isn't on every guide.
// -> Map(badge -> { ids, reused, top }): reused when the page could only repeat a favourite used elsewhere (it is
// then worded around this page's badge, without its note); top when rated standouts are the slice's real top two.
// Rated standouts are never repeated: a page whose best-rated places are all taken shows the next ones, and none
// when there are none left.
function allocateStandouts(pages) {
  const used = new Set();
  const out = new Map();
  const order = pages.slice().sort((a, b) => a.cand.ranked.length - b.cand.ranked.length || a.badge.localeCompare(b.badge));
  for (const p of order) {
    const free = p.cand.ranked.filter((v) => !used.has(v.id)).slice(0, 2);
    let ids = free.map((v) => v.id), reused = false;
    if (p.cand.kind === 'collection' && !ids.length && p.cand.ranked.length) { ids = [p.cand.ranked[0].id]; reused = true; }
    const top = p.cand.kind === 'rated' && ids.length === 2 && p.cand.ranked.slice(0, 2).every((v) => ids.includes(v.id));
    for (const id of ids) used.add(id);
    out.set(p.badge, { ids, reused, top });
  }
  return out;
}

// ---------- facts ----------
// venues: the page's list (rowToVenue shape: booleans for badges). ctx (all optional):
//   hoursModule            hours.js (parseHours)
//   rows: Map(id -> { hours, happy_hour_times })          raw stored hours
//   deals: Map(id -> [{ text, price }])                   happy hour deals the site shows (fresh, with the badge)
//   specials: Map(id -> n), nights: Map(id -> [kind])     weekly specials / weekly nights the site shows
//   localFavourites: Set(id), hiddenGems: Set(id), notes: Map(id -> note), dogPolicy: Map(id -> note)
//   menus: Set(id), seasonal: Set(id), dietTier: (venue) -> 0 | 1 | 2
function computeGuideFacts(badge, venues, ctx = {}) {
  const list = (venues || []).filter((v) => v && !v.redirect_to);
  const n = list.length;
  const has = (v, b) => v[b] === true || Number(v[b]) === 1;
  const ids = (pred) => list.filter(pred).length;
  const tally = {};
  for (const v of list) tally[v.type] = (tally[v.type] || 0) + 1;
  const mix = Object.entries(tally).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  const facts = { badge, n, mix, overlaps: [], special: {}, extras: {}, standouts: [] };

  for (const b of OVERLAPS[badge] || []) {
    const c = ids((v) => has(v, b));
    if (c >= 2 && c < n) facts.overlaps.push({ badge: b, count: c });
  }
  facts.overlaps.sort((a, b) => b.count - a.count);

  const H = ctx.hoursModule;
  const rows = ctx.rows || new Map();
  const parse = (json) => { try { const p = H ? H.parseHours(json) : null; return p && p.known ? p : null; } catch (e) { return null; } };
  const sp = facts.special;

  if (badge === 'happy_hour' && H) {
    const windows = new Map(); let withTimes = 0, everyDay = 0, late = 0, earliest = null, latest = null, earliestBy = new Set(), latestBy = new Set();
    for (const v of list) {
      const p = parse((rows.get(v.id) || {}).happy_hour_times);
      if (!p) continue;
      withTimes++;
      const mine = new Set(); let days = 0, lateHere = false;
      for (const d of WEEK) {
        const day = p.days[d];
        if (!day || day.status !== 'open' || !day.ranges.length) continue;
        days++;
        for (const [a, b] of day.ranges) {
          mine.add(`${a}-${b}`);
          if (a >= 20 * 60) lateHere = true;
          if (earliest == null || a < earliest) { earliest = a; earliestBy = new Set([v.name]); } else if (a === earliest) earliestBy.add(v.name);
          if (latest == null || b > latest) { latest = b; latestBy = new Set([v.name]); } else if (b === latest) latestBy.add(v.name);
        }
      }
      if (days === 7) everyDay++;
      if (lateHere) late++;
      for (const w of mine) windows.set(w, (windows.get(w) || 0) + 1);
    }
    const top = [...windows.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    sp.withTimes = withTimes;
    sp.everyDay = everyDay;
    sp.late = late;
    if (top && top[1] >= 2) { const [a, b] = top[0].split('-').map(Number); sp.commonWindow = { from: a, to: b, count: top[1] }; }
    if (withTimes >= 2) { sp.earliest = earliest; sp.latest = latest; sp.earliestBy = [...earliestBy]; sp.latestBy = [...latestBy]; }
    const prices = { pint: [], wine: [], food: [] };
    let withDeals = 0;
    for (const v of list) {
      const ds = (ctx.deals || new Map()).get(v.id);
      if (!ds || !ds.length) continue;
      withDeals++;
      for (const d of ds) {
        const pm = /^\s*\$\s?(\d+(?:\.\d{1,2})?)\b(?![^]*\boff\b)/i.exec(String(d.price || ''));
        if (!pm) continue;
        const x = Number(pm[1]);
        if (!(x > 0 && x < 100)) continue;
        const t = String(d.text || '');
        if (/\b(?:pints?|beers?|draft|draught|sleeves?|lagers?|ipas?|sleeve)\b/i.test(t)) prices.pint.push(x);
        else if (/\bwines?\b|\bprosecco\b|\bbubbles\b/i.test(t)) prices.wine.push(x);
        else if (/\b(?:appies|appy|appetizers?|wings|tacos?|oysters|fries|nachos|sliders|plates?|bites|pizza|flatbreads?)\b/i.test(t)) prices.food.push(x);
      }
    }
    sp.withDeals = withDeals;
    for (const k of Object.keys(prices)) if (prices[k].length) sp[`${k}From`] = Math.min(...prices[k]);
  }

  if (badge === 'dog_friendly') {
    sp.withRule = ids((v) => (ctx.dogPolicy || new Map()).has(v.id));
    sp.outdoor = ids((v) => DOG_OUTDOOR_TYPES.has(v.type));
    sp.beaches = ids((v) => v.type === 'beach');
    sp.food = ids((v) => FOOD_TYPES.has(v.type));
  }

  if ((badge === 'open_early' || badge === 'open_late') && H) {
    let best = null, count = 0, every = 0;
    for (const v of list) {
      const p = parse((rows.get(v.id) || v).hours);
      if (!p) continue;
      let mine = null, flag = false, allDays = 0;
      for (const d of WEEK) {
        const day = p.days[d];
        if (!day || day.status !== 'open' || !day.ranges.length) continue;
        // A day open around the clock (or a night carried past midnight) says nothing about opening early or closing late.
        const ranges = day.ranges.filter(([a, b]) => !(a === 0 && b >= 24 * 60) && (badge === 'open_late' || a >= 5 * 60));
        if (!ranges.length) continue;
        if (badge === 'open_early') {
          const a = Math.min(...ranges.map((r) => r[0]));
          if (mine == null || a < mine) mine = a;
          if ((d === 'sat' || d === 'sun') && a <= 7 * 60) flag = true;
          if (a <= 8 * 60) allDays++;
        } else {
          const b = Math.max(...ranges.map((r) => r[1]));
          if (mine == null || b > mine) mine = b;
          if (b > 24 * 60) flag = true;
          if (b > 22 * 60) allDays++;
        }
      }
      if (mine == null) continue;
      if (flag) count++;
      if (allDays === 7) every++;
      const better = !best || (badge === 'open_early' ? mine < best.at : mine > best.at);
      if (better) best = { at: mine, names: [v.name], tie: 1 };
      else if (best.at === mine) { best.tie++; best.names.push(v.name); }
    }
    if (best) sp.extreme = best;
    sp.flagged = count; // open_early: open by 7 am on a weekend day; open_late: open past midnight on some night
    sp.everyDay = every; // open_early: by 8 am all week; open_late: past 10 pm all week
  }

  if (['vegan', 'vegetarian', 'gluten_free'].includes(badge) && ctx.dietTier) {
    sp.dedicated = list.filter((v) => ctx.dietTier(v) === 0).map((v) => ({ id: v.id, name: v.name }));
    sp.mentions = ids((v) => ctx.dietTier(v) === 1);
  }

  if (badge === 'live_music' || badge === 'sports_tv') {
    const nights = ctx.nights || new Map();
    const kinds = {};
    let hosts = 0;
    for (const v of list) {
      const k = nights.get(v.id);
      if (!k || !k.length) continue;
      hosts++;
      for (const kind of new Set(k)) kinds[kind] = (kinds[kind] || 0) + 1;
    }
    sp.nightHosts = hosts;
    sp.nightKinds = Object.entries(kinds).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3);
  }

  if (badge === 'free_entry' || badge === 'arts_culture' || badge === 'kid_friendly') {
    sp.outdoor = ids((v) => ['outdoor', 'beach'].includes(v.type));
    sp.indoor = ids((v) => v.type === 'indoor');
    sp.food = ids((v) => FOOD_TYPES.has(v.type));
  }

  // Extras every page can use (only counted from what the site shows).
  facts.extras.specials = ids((v) => (ctx.specials || new Map()).get(v.id) > 0);
  facts.extras.nights = badge === 'live_music' || badge === 'sports_tv' ? 0 : ids((v) => ((ctx.nights || new Map()).get(v.id) || []).length > 0);
  facts.extras.menus = ids((v) => (ctx.menus || new Set()).has(v.id));
  facts.extras.seasonal = ids((v) => (ctx.seasonal || new Set()).has(v.id));

  // Standouts: the slice's Local Favourites and Hidden Gems, with their own short note (or description) when there is
  // one; the top two by rating only when the slice has none. ctx.standoutIds (allocateStandouts) spreads them over a
  // town's pages, so one favourite isn't the standout of every guide in town.
  const cand = standoutCandidates(badge, list, ctx);
  const byId = new Map(list.map((v) => [v.id, v]));
  const plan = ctx.standoutPlan && Array.isArray(ctx.standoutPlan.ids) ? ctx.standoutPlan : null;
  const chosen = plan ? plan.ids.map((id) => byId.get(id)).filter(Boolean) : cand.ranked.slice(0, 2);
  const lf = ctx.localFavourites || new Set();
  facts.standoutReused = !!(plan && plan.reused);
  facts.standoutTop = plan ? !!plan.top : cand.kind === 'rated';
  if (cand.kind === 'collection' && chosen.length) {
    facts.standouts = chosen.slice(0, 2).map((v) => ({
      id: v.id, name: v.name, venue: v, kind: lf.has(v.id) ? 'local_favourite' : 'hidden_gem',
      note: { en: noteText((ctx.notes || new Map()).get(v.id), v.name, 'en') || noteText(v.description, v.name, 'en'), fr: noteText(v.description_fr, v.name, 'fr') },
    }));
    facts.standoutKind = 'collection';
  } else if (cand.kind === 'rated' && chosen.length) {
    facts.standouts = chosen.map((v) => ({ id: v.id, name: v.name, venue: v, kind: 'rated', rating: Number(v.rating), reviews: Number(v.reviews) }));
    facts.standoutKind = 'rated';
  }
  return facts;
}

// ---------- sentences ----------
// Each candidate: { key, w (how notable), en, fr }. w decides which make the cut (at most 4) and the order; a fact's
// phrasing is one of a few, chosen by the town and badge, with the same choice in both languages.
const DIET_WORDS = {
  vegan: { en: 'vegan', f: 'végane', fp: 'véganes', mp: 'véganes' },
  vegetarian: { en: 'vegetarian', f: 'végétarienne', fp: 'végétariennes', mp: 'végétariens' },
  gluten_free: { en: 'gluten-free', f: 'sans gluten', fp: 'sans gluten', mp: 'sans gluten' },
};
function candidates(f, o) {
  const { town: T, seed } = o;
  // French "de" before a town: « d’Osoyoos », « de Kelowna ».
  const deT = /^[AEIOUYÉÈ]/i.test(T) ? `d’${T}` : `de ${T}`;
  const N = f.n;
  const out = [];
  // V(key, weight, [[en, fr], ...]): one phrasing per page, the same index in both languages.
  // needs: another fact this sentence follows on from ("Another 28 mention...") -- kept out of the meta without it.
  const V = (key, w, variants, needs = null) => { const [en, fr] = variants[hash(`${seed}|${key}`) % variants.length]; out.push({ key, w, en, fr, needs }); };
  const e = (x) => num(x, 'en'), r = (x) => num(x, 'fr');
  const tt = o.timeText || ((m) => String(m));
  const rt = o.rangeText || ((a, b) => `${tt(a)}–${tt(b)}`);
  const one = (x) => x === 1;

  // The mix of places.
  const mixTop = f.mix.filter((m) => noun(m.type, m.count, 'en'));
  if (mixTop.length >= 2) {
    const shown = mixTop.slice(0, 3);
    const rest = N - shown.reduce((s, m) => s + m.count, 0);
    const items = (lang, from = 0) => {
      const list = shown.slice(from).map((m) => `${num(m.count, lang)} ${noun(m.type, m.count, lang)}`);
      if (rest > 0) list.push(lang === 'fr' ? `${r(rest)} ${one(rest) ? 'autre adresse' : 'autres adresses'}` : `${e(rest)} ${one(rest) ? 'other' : 'others'}`);
      return joinList(list, lang);
    };
    const lead = shown[0];
    const w = f.special.dedicated ? 1.6 : 1.8;
    if (lead.count / N >= 0.6) {
      const pe = noun(lead.type, 2, 'en'), pf = noun(lead.type, 2, 'fr');
      V('mix', w + 0.2, [
        [`${capFirst(pe)} make up ${e(lead.count)} of the ${e(N)} places on this ${T} list, alongside ${items('en', 1)}.`, `Les ${pf} forment ${r(lead.count)} des ${r(N)} adresses de cette liste à ${T}, avec ${items('fr', 1)}.`],
        [`Most of the ${e(N)} places here are ${pe} (${e(lead.count)}); the rest are ${items('en', 1)}.`, `La plupart des ${r(N)} adresses sont des ${pf} (${r(lead.count)}); les autres sont ${items('fr', 1)}.`],
        [`In ${T}, ${e(lead.count)} of the ${e(N)} are ${pe}, plus ${items('en', 1)}.`, `À ${T}, ${r(lead.count)} des ${r(N)} adresses sont des ${pf}, plus ${items('fr', 1)}.`],
      ]);
    } else {
      V('mix', w, [
        [`This ${T} list has ${e(N)} places: ${items('en')}.`, `Cette liste ${deT} compte ${r(N)} adresses : ${items('fr')}.`],
        [`In ${T} that comes to ${items('en')}, ${e(N)} in all.`, `À ${T}, cela donne ${items('fr')}, soit ${r(N)} adresses en tout.`],
        [`The ${e(N)} places in ${T} break down into ${items('en')}.`, `Les ${r(N)} adresses ${deT} se répartissent ainsi : ${items('fr')}.`],
      ]);
    }
  } else if (mixTop.length === 1) {
    V('mix', 1.2, [[`All ${e(N)} places on this ${T} list are ${noun(mixTop[0].type, 2, 'en')}.`, `Les ${r(N)} adresses de cette liste à ${T} sont toutes des ${noun(mixTop[0].type, 2, 'fr')}.`]]);
  }

  const sp = f.special;
  // Happy hour.
  if (f.badge === 'happy_hour') {
    const t = sp.withTimes || 0;
    if (t >= 2) {
      const win = sp.commonWindow;
      if (win) {
        const we = rt(win.from, win.to, false), wf = rt(win.from, win.to, true);
        V('hh-times', 3, [
          [`Of the ${e(N)}, ${e(t)} publish their happy hour times, and the most common window is ${we} (${e(win.count)} places).`, `Sur ${r(N)} adresses, ${r(t)} publient leurs heures de happy hour; la plage la plus courante est ${wf} (${r(win.count)} adresses).`],
          [`The usual window in ${T} is ${we}, shared by ${e(win.count)} of the ${e(t)} places with times on file.`, `À ${T}, la plage habituelle est ${wf}, commune à ${r(win.count)} des ${r(t)} adresses dont nous avons les heures.`],
          [`We have times for ${e(t)} of these ${T} happy hours, and ${e(win.count)} of them cover ${we}.`, `Nous avons les heures de ${r(t)} de ces happy hours à ${T}, et ${r(win.count)} d’entre eux couvrent la plage ${wf}.`],
        ]);
      } else {
        V('hh-times', 2.6, [[`We have happy hour times for ${e(t)} of them, and no two share the same window.`, `Nous avons les heures de happy hour de ${r(t)} adresses, et aucune plage ne revient deux fois.`]]);
      }
      if (sp.earliest != null && sp.latest != null && (sp.earliest <= 14 * 60 || sp.latest >= 21 * 60)) {
        const ea = sp.earliestBy && sp.earliestBy.length === 1 ? sp.earliestBy[0] : null, la = sp.latestBy && sp.latestBy.length === 1 ? sp.latestBy[0] : null;
        const en = `${ea ? `${ea} starts earliest, at ${tt(sp.earliest, false)}` : `The earliest start is ${tt(sp.earliest, false)}`}; ${la ? `${la} runs latest, until ${tt(sp.latest, false)}` : `the latest ends at ${tt(sp.latest, false)}`}.`;
        const fr = `${ea ? `${ea} commence le plus tôt, à ${tt(sp.earliest, true)}` : `Le plus hâtif commence à ${tt(sp.earliest, true)}`}; ${la ? `${la} finit le plus tard, à ${tt(sp.latest, true)}` : `le plus tardif finit à ${tt(sp.latest, true)}`}.`;
        V('hh-span', 2.2, [[en, fr], [`In ${T}, ${en.charAt(0).toLowerCase() === en.charAt(0) ? en : (ea ? en : en.charAt(0).toLowerCase() + en.slice(1))}`, `À ${T}, ${ea ? fr : fr.charAt(0).toLowerCase() + fr.slice(1)}`]]);
      }
      if (sp.late >= 2) V('hh-late', 1.9, [[`A late happy hour, from 8 PM or later, runs at ${e(sp.late)} places.`, `Un happy hour en soirée, à partir de 20 h, a lieu à ${r(sp.late)} adresses.`]]);
      if (sp.everyDay >= 2 && sp.everyDay < t) V('hh-every', 1.4, [[`Happy hour runs seven days a week at ${e(sp.everyDay)} of them.`, `Le happy hour a lieu sept jours sur sept à ${r(sp.everyDay)} d’entre elles.`]]);
    }
    const pe = [], pf = [];
    if (sp.pintFrom) { pe.push(`pints from ${money(sp.pintFrom, 'en')}`); pf.push(`la bière à partir de ${money(sp.pintFrom, 'fr')}`); }
    if (sp.wineFrom) { pe.push(`wine from ${money(sp.wineFrom, 'en')}`); pf.push(`le vin à partir de ${money(sp.wineFrom, 'fr')}`); }
    if (sp.foodFrom) { pe.push(`appies from ${money(sp.foodFrom, 'en')}`); pf.push(`les bouchées à partir de ${money(sp.foodFrom, 'fr')}`); }
    if (sp.withDeals >= 2 && pe.length) {
      V('hh-deals', 2.6, [
        [`Among the ${e(sp.withDeals)} places with deals listed, the lowest prices are ${joinList(pe, 'en')}.`, `Parmi les ${r(sp.withDeals)} adresses dont les spéciaux sont affichés, les prix les plus bas : ${joinList(pf, 'fr')}.`],
        [`Deals are listed for ${e(sp.withDeals)} of them, with ${joinList(pe, 'en')}.`, `Les spéciaux de ${r(sp.withDeals)} adresses sont affichés, avec ${joinList(pf, 'fr')}.`],
      ]);
    }
  }
  // Dogs.
  if (f.badge === 'dog_friendly') {
    if (sp.withRule >= 2) {
      V('dog-rule', 2.4, [
        [`We list the dog rule for ${e(sp.withRule)} of these ${T} places, so check the card before you bring yours.`, `Pour ${r(sp.withRule)} de ces adresses ${deT}, la fiche indique la règle pour les chiens; consultez-la avant d’y aller.`],
        [`For ${e(sp.withRule)} places in ${T}, the card says where dogs are allowed.`, `Pour ${r(sp.withRule)} adresses ${deT}, la fiche précise où les chiens sont admis.`],
      ]);
    }
    if (sp.outdoor >= 2 && sp.food >= 2) {
      const be = sp.beaches >= 2 ? `, including ${e(sp.beaches)} beaches,` : sp.beaches === 1 ? ', including a beach,' : '';
      const bf = sp.beaches >= 2 ? `, dont ${r(sp.beaches)} plages,` : sp.beaches === 1 ? ', dont une plage,' : '';
      V('dog-split', 2.5, [
        [`Of the ${e(N)}, ${e(sp.outdoor)} are outdoor spots${be} and ${e(sp.food)} are places to eat or drink.`, `Sur ${r(N)} adresses, ${r(sp.outdoor)} sont des lieux de plein air${bf} et ${r(sp.food)} sont des endroits pour manger ou boire.`],
        [`${T} has ${e(sp.outdoor)} outdoor spots on this list${be}, and ${e(sp.food)} places to eat or drink.`, `À ${T}, la liste compte ${r(sp.outdoor)} lieux de plein air${bf} et ${r(sp.food)} endroits pour manger ou boire.`],
      ]);
    }
  }
  // Early and late.
  if ((f.badge === 'open_early' || f.badge === 'open_late') && sp.extreme) {
    const x = sp.extreme;
    const te = tt(x.at, false), tf = tt(x.at, true);
    const early = f.badge === 'open_early';
    if (x.tie === 1) {
      V(early ? 'early' : 'late', 2.6, early
        ? [[`${x.names[0]} opens earliest, at ${te}.`, `${x.names[0]} ouvre le plus tôt, à ${tf}.`], [`First to open is ${x.names[0]}, at ${te}.`, `La première adresse à ouvrir est ${x.names[0]}, à ${tf}.`]]
        : [[`${x.names[0]} stays open latest, until ${te}.`, `${x.names[0]} ferme le plus tard, à ${tf}.`], [`Last to close is ${x.names[0]}, at ${te}.`, `La dernière adresse à fermer est ${x.names[0]}, à ${tf}.`]]);
    } else if (x.tie === 2) {
      V(early ? 'early' : 'late', 2.6, [early
        ? [`${x.names[0]} and ${x.names[1]} open earliest, at ${te}.`, `${x.names[0]} et ${x.names[1]} ouvrent le plus tôt, à ${tf}.`]
        : [`${x.names[0]} and ${x.names[1]} stay open latest, until ${te}.`, `${x.names[0]} et ${x.names[1]} ferment le plus tard, à ${tf}.`]]);
    } else {
      V(early ? 'early' : 'late', 2.3, [early
        ? [`The earliest opening is ${te}, at ${e(x.tie)} places.`, `La première ouverture est à ${tf}, pour ${r(x.tie)} adresses.`]
        : [`The latest close is ${te}, at ${e(x.tie)} places.`, `La fermeture la plus tardive est à ${tf}, pour ${r(x.tie)} adresses.`]]);
    }
    if (sp.flagged >= 2) {
      V(early ? 'early-wknd' : 'late-midnight', 2, early
        ? [[`On weekends, ${e(sp.flagged)} are open by 7 AM.`, `La fin de semaine, ${r(sp.flagged)} sont ouvertes dès 7 h.`], [`By 7 AM on Saturday or Sunday, ${e(sp.flagged)} are already open.`, `Dès 7 h le samedi ou le dimanche, ${r(sp.flagged)} sont déjà ouvertes.`]]
        : [[`Past midnight, ${e(sp.flagged)} are still open on at least one night.`, `Après minuit, ${r(sp.flagged)} sont encore ouvertes au moins un soir.`], [`${T} has ${e(sp.flagged)} places on this list that stay open after midnight at least one night.`, `À ${T}, ${r(sp.flagged)} adresses de la liste restent ouvertes après minuit au moins un soir.`]]);
    }
    if (sp.everyDay >= 2) {
      V(early ? 'early-all' : 'late-all', 1.7, [early
        ? [`Every day of the week, ${e(sp.everyDay)} open by 8 AM.`, `Tous les jours, ${r(sp.everyDay)} ouvrent à 8 h ou avant.`]
        : [`Every night of the week, ${e(sp.everyDay)} stay open past 10 PM.`, `Tous les soirs, ${r(sp.everyDay)} restent ouvertes après 22 h.`]]);
    }
  }
  // Dietary.
  if (sp.dedicated) {
    const W = DIET_WORDS[f.badge];
    const d = sp.dedicated;
    if (d.length === 1) {
      V('diet', 2.6, [
        [`${d[0].name} is the only fully ${W.en} kitchen of the ${e(N)}; the others have ${W.en} dishes on a wider menu.`, `${d[0].name} est la seule cuisine entièrement ${W.f} des ${r(N)} adresses; les autres ont des plats ${W.mp} à leur menu.`],
        [`Of the ${e(N)} places, only ${d[0].name} is fully ${W.en}; the rest offer ${W.en} choices alongside other dishes.`, `Sur ${r(N)} adresses, seule l’adresse ${d[0].name} est entièrement ${W.f}; les autres proposent des choix ${W.mp} parmi d’autres plats.`],
      ]);
    } else if (d.length >= 2) {
      V('diet', 2.8, [
        [`Of the ${e(N)}, ${e(d.length)} are fully ${W.en}, among them ${d[0].name} and ${d[1].name}, and they come first in the list.`, `Sur ${r(N)} adresses, ${r(d.length)} sont entièrement ${W.fp}, dont ${d[0].name} et ${d[1].name}; elles ouvrent la liste.`],
        [`The list opens with its ${e(d.length)} fully ${W.en} places, such as ${d[0].name} and ${d[1].name}.`, `La liste commence par ses ${r(d.length)} adresses entièrement ${W.fp}, comme ${d[0].name} et ${d[1].name}.`],
      ]);
    }
    if (sp.mentions >= 3) {
      V('diet-mentions', 1.6, d.length
        ? [[`In ${T}, another ${e(sp.mentions)} mention ${W.en} options in their own description.`, `À ${T}, ${r(sp.mentions)} autres adresses mentionnent des options ${W.fp} dans leur description.`], [`Beyond those, ${e(sp.mentions)} describe their ${W.en} options themselves.`, `En plus de celles-ci, ${r(sp.mentions)} décrivent elles-mêmes leurs options ${W.fp}.`]]
        : [[`In ${T}, ${e(sp.mentions)} of the ${e(N)} mention ${W.en} options in their own description.`, `À ${T}, ${r(sp.mentions)} des ${r(N)} adresses mentionnent des options ${W.fp} dans leur description.`]], d.length ? 'diet' : null);
    }
    if (f.badge === 'gluten_free') {
      V('diet-celiac', 1.5, [d.length
        ? [`Outside the ${d.length === 1 ? 'one dedicated kitchen' : `${e(d.length)} dedicated kitchens`}, ask about cross-contact if you have celiac disease.`, `En dehors ${d.length === 1 ? 'de la cuisine entièrement sans gluten' : `des ${r(d.length)} cuisines entièrement sans gluten`}, renseignez-vous sur la contamination croisée si vous êtes cœliaque.`]
        : [`None of the ${e(N)} is a dedicated gluten-free kitchen, so ask about cross-contact if you have celiac disease.`, `Aucune des ${r(N)} adresses n’est une cuisine entièrement sans gluten; renseignez-vous sur la contamination croisée si vous êtes cœliaque.`]]);
    }
  }
  // Weekly nights on the live music and game-day pages.
  if ((f.badge === 'live_music' || f.badge === 'sports_tv') && sp.nightHosts >= 2) {
    const K = o.nightLabels || { en: {}, fr: {} };
    const kinds = (lang) => joinList(sp.nightKinds.map(([k, c]) => `${String((K[lang] || {})[k] || k).toLowerCase()} (${num(c, lang)})`), lang);
    V('nights', 2.7, [
      [`Of these ${e(N)}, ${e(sp.nightHosts)} host a regular weekly night: ${kinds('en')}.`, `Sur ces ${r(N)} adresses, ${r(sp.nightHosts)} organisent une soirée chaque semaine : ${kinds('fr')}.`],
      [`Weekly nights are on at ${e(sp.nightHosts)} of these places: ${kinds('en')}.`, `Des soirées hebdomadaires ont lieu à ${r(sp.nightHosts)} de ces adresses : ${kinds('fr')}.`],
    ]);
  }
  // Outdoors and indoors.
  if (['free_entry', 'arts_culture', 'kid_friendly'].includes(f.badge) && sp.outdoor >= 2 && (sp.indoor >= 2 || sp.food >= 2)) {
    if (sp.indoor >= 2 && sp.indoor >= sp.food) {
      V('in-out', 2.1, [
        [`Of the ${e(N)}, ${e(sp.outdoor)} are parks, trails or beaches and ${e(sp.indoor)} are indoors, handy on a wet day.`, `Sur ${r(N)} adresses, ${r(sp.outdoor)} sont des parcs, sentiers ou plages et ${r(sp.indoor)} sont à l’intérieur, pratique quand il pleut.`],
        [`${T} splits this list between ${e(sp.outdoor)} parks, trails or beaches and ${e(sp.indoor)} indoor places.`, `À ${T}, la liste se partage entre ${r(sp.outdoor)} parcs, sentiers ou plages et ${r(sp.indoor)} lieux intérieurs.`],
      ]);
    } else {
      V('in-out', 2.1, [
        [`Of the ${e(N)}, ${e(sp.outdoor)} are parks, trails or beaches and ${e(sp.food)} are places to eat or drink.`, `Sur ${r(N)} adresses, ${r(sp.outdoor)} sont des parcs, sentiers ou plages et ${r(sp.food)} sont des endroits pour manger ou boire.`],
        [`${T} splits this list between ${e(sp.outdoor)} parks, trails or beaches and ${e(sp.food)} places to eat or drink.`, `À ${T}, la liste se partage entre ${r(sp.outdoor)} parcs, sentiers ou plages et ${r(sp.food)} endroits pour manger ou boire.`],
      ]);
    }
  }
  // Other badges these places share: the two strongest, when each is at least 15% of the list.
  const ov = f.overlaps.filter((x) => x.count / N >= 0.15).slice(0, 2);
  if (ov.length) {
    const le = joinList(ov.map((x) => `${e(x.count)} ${OVERLAP_TEXT.en[x.badge]}`), 'en'), lf = joinList(ov.map((x) => `${r(x.count)} ${OVERLAP_TEXT.fr[x.badge]}`), 'fr');
    V('overlap', 1.2 + Math.min(ov[0].count / N, 0.6) / 2, [
      [`Of these ${e(N)}, ${le}.`, `Sur ces ${r(N)} adresses, ${lf}.`],
      [`Among them, ${le}.`, `Parmi elles, ${lf}.`],
      [`Some overlap with other ${T} guides: ${le}.`, `Certaines figurent aussi dans d’autres guides ${deT} : ${lf}.`],
    ]);
  }
  // What the cards add: weekly specials, weekly nights, menus (3 or more each).
  const ex = f.extras, xe = [], xf = [];
  if (ex.specials >= 3) { xe.push(`${e(ex.specials)} list weekly specials`); xf.push(`${r(ex.specials)} affichent des spéciaux de la semaine`); }
  if (ex.nights >= 3) { xe.push(`${e(ex.nights)} host a weekly night such as trivia or open mic`); xf.push(`${r(ex.nights)} tiennent une soirée hebdomadaire (quiz, scène ouverte ou autre)`); }
  if (ex.menus >= 3) { xe.push(`${e(ex.menus)} link a menu`); xf.push(`${r(ex.menus)} ont un lien vers leur menu`); }
  if (xe.length >= 2 || ex.specials >= 5 || ex.menus >= 5) {
    V('extras', 1.2 + xe.length * 0.15, [
      [`On the ${e(N)} ${T} cards, ${joinList(xe, 'en')}.`, `Sur les ${r(N)} fiches ${deT}, ${joinList(xf, 'fr')}.`],
      [`In ${T}, of these ${e(N)}, ${joinList(xe, 'en')}.`, `À ${T}, sur ces ${r(N)} adresses, ${joinList(xf, 'fr')}.`],
      [`Of the ${e(N)} on this ${T} list, ${joinList(xe, 'en')}.`, `Sur les ${r(N)} adresses de cette liste, ${joinList(xf, 'fr')}.`],
    ]);
  }
  if (ex.seasonal >= 2 && ex.seasonal < N) {
    V('seasonal', 1.45, [
      [`Of the ${e(N)}, ${e(ex.seasonal)} are seasonal and close for part of the year.`, `Sur ${r(N)} adresses, ${r(ex.seasonal)} sont saisonnières et ferment une partie de l’année.`],
      [`Keep in mind that ${e(ex.seasonal)} close for part of the year.`, `À noter : ${r(ex.seasonal)} ferment une partie de l’année.`],
    ]);
  }

  // One sentence on what kind of places these are: when the mix of types reads, the dog or outdoor / indoor split
  // would say it twice, so the split is only used without a mix.
  if (out.some((c) => c.key === 'mix')) for (const k of ['dog-split', 'in-out']) { const i = out.findIndex((c) => c.key === k); if (i >= 0) out.splice(i, 1); }

  // Standouts (always last).
  const s = f.standouts;
  if (s.length) {
    let en, fr;
    if (f.standoutKind === 'collection' && f.standoutReused) {
      const x = s[0];
      const le = x.kind === 'local_favourite' ? 'one of our Local Favourites' : 'one of our Hidden Gems';
      const lf = x.kind === 'local_favourite' ? 'l’un de nos coups de cœur locaux' : 'l’une de nos perles cachées';
      [en, fr] = [`${x.name}, ${le}, ${BADGE_PRED.en[f.badge] || 'is on this list'} too.`, `On retrouve aussi ${x.name}, ${lf}, qui ${BADGE_PRED.fr[f.badge] || 'figure dans cette liste'}.`];
    } else if (f.standoutKind === 'collection') {
      const pe = (x) => `${x.name}, one of our ${x.kind === 'local_favourite' ? 'Local Favourites' : 'Hidden Gems'}${x.note.en ? `: ${x.note.en}` : ''}`;
      const pf = (x) => `${x.name}, ${x.kind === 'local_favourite' ? 'l’un de nos coups de cœur locaux' : 'l’une de nos perles cachées'}${x.note.fr ? ` : ${x.note.fr}` : ''}`;
      const be = s.length === 1 ? pe(s[0]) : `${pe(s[0])}; and ${pe(s[1])}`;
      const bf = s.length === 1 ? pf(s[0]) : `${pf(s[0])}; et ${pf(s[1])}`;
      [en, fr] = [[`From our own picks: ${be}.`, `Dans notre sélection : ${bf}.`], [`Look for ${be}.`, `À surveiller : ${bf}.`], [`Our picks here include ${be}.`, `Parmi nos choix : ${bf}.`]][hash(`${seed}|standouts`) % 3];
    } else {
      const ae = (x) => `${x.name} (${x.rating.toFixed(1)} from ${e(x.reviews)} reviews)`, af = (x) => `${x.name} (${x.rating.toFixed(1).replace('.', ',')} sur 5, ${r(x.reviews)} avis)`;
      const le = joinList(s.map(ae), 'en'), lf = joinList(s.map(af), 'fr');
      // "Best rated" only when they really are this list's top two; otherwise just "well rated".
      [en, fr] = (f.standoutTop && s.length === 2 ? [
        [`The best rated with at least 20 reviews are ${le}.`, `Les mieux notées, avec au moins 20 avis, sont ${lf}.`],
        [`By visitor ratings (20 reviews or more), ${le} come out on top.`, `Selon les avis (20 ou plus), ${lf} arrivent en tête.`],
        [`Top rated here, with 20 or more reviews: ${le}.`, `En tête des notes, avec 20 avis ou plus : ${lf}.`],
      ] : [
        [`Well rated in ${T}: ${le}.`, `Bien notées à ${T} : ${lf}.`],
        [`Also well reviewed on this list: ${le}.`, `Aussi bien notées dans cette liste : ${lf}.`],
      ])[hash(`${seed}|standouts`) % (f.standoutTop && s.length === 2 ? 3 : 2)];
    }
    out.push({ key: 'standouts', w: 99, last: true, names: s.map((x) => x.venue), en, fr });
  }
  return out;
}

// -> { text, html, meta, keys } for one language. opts: { lang, town, region, timeText(m, fr), rangeText(a, b, fr),
// nightLabels, pathFor(venue), escape(str), noun (the badge's noun, for the meta) }
function renderGuideIntro(facts, opts = {}) {
  const lang = opts.lang === 'fr' ? 'fr' : 'en';
  const seed = `${opts.region || opts.town}|${facts.badge}`;
  const all = candidates(facts, { ...opts, seed });
  const standout = all.find((c) => c.last);
  const body = all.filter((c) => !c.last).sort((a, b) => b.w - a.w || a.key.localeCompare(b.key)).slice(0, standout ? 3 : 4);
  // The strongest sentence that doesn't open with a number leads; the rest follow by weight.
  const li = body.findIndex((c) => !/^\d/.test(c.en));
  if (li > 0) body.unshift(body.splice(li, 1)[0]);
  const sentences = [...body, ...(standout ? [standout] : [])];
  const esc = opts.escape || ((x) => x);
  const text = sentences.map((c) => c[lang]).join(' ');
  // HTML: the standouts' names link to their pages.
  const html = sentences.map((c) => {
    let h = esc(c[lang]);
    if (c.names && opts.pathFor) {
      for (const v of c.names) {
        const nm = esc(v.name);
        const at = h.indexOf(nm);
        if (at >= 0) h = `${h.slice(0, at)}<a href="${esc(opts.pathFor(v))}">${nm}</a>${h.slice(at + nm.length)}`;
      }
    }
    return h;
  }).join(' ');
  return { text, html, meta: guideMeta(facts, sentences, opts, lang), keys: sentences.map((c) => c.key) };
}

// Meta description: "<n> <noun> in <Town>, BC." then the page's own facts that still fit in 155 characters -- the
// badge's facts first, then the standouts and the mix -- whole sentences only (a too-long text ends at a word).
const META_MAX = 155;
const META_LATER = ['overlap', 'extras', 'seasonal'];
function guideMeta(facts, sentences, opts, lang) {
  const town = opts.town;
  let out = lang === 'fr' ? `${num(facts.n, 'fr')} adresses à ${town}, en C.-B.` : `${num(facts.n, 'en')} ${opts.noun || 'places'} in ${town}, BC.`;
  const rank = (c) => (c.key === 'mix' ? 2 : c.key === 'standouts' ? 1 : META_LATER.includes(c.key) ? 3 : 0);
  const ranked = sentences.map((c, i) => [rank(c), i, c]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
  const used = new Set();
  for (const c of ranked) {
    if (c.needs && !used.has(c.needs)) continue;
    if (`${out} ${c[lang]}`.length <= META_MAX) { out = `${out} ${c[lang]}`; used.add(c.key); }
  }
  if (out.length > META_MAX) {
    const cut = out.slice(0, META_MAX);
    out = cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:]+$/, '');
  }
  return out;
}

module.exports = { computeGuideFacts, renderGuideIntro, guideMeta, META_MAX, NOUNS, OVERLAPS, shortLine, noteText, standoutCandidates, allocateStandouts };
