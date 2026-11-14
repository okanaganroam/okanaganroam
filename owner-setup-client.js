// Full easy setup (2026-11-09): the page script, served inline on /owner/<link>/setup (restaurants). Plain ES5.
// One question per screen. Every save uses the same server paths as the edit page (POST <base>/changes with
// from_setup, <base>/photos, <base>/menu/pages + /menu/help, <base>/arrival) and is recorded in <base>/setup/progress
// so the setup can say "Welcome back". The owner only ever sees "Saved ✓" and whether it's on the page now or
// within a day. Words: owner-setup-text.js. Approved mockup: drafts/easy-setup-mockup-2026-11-09/full-setup.html (v5).
(function(){
  var C = window.SETUP_CFG, T = C.t, CUR = C.cur;
  var STEPS = C.steps, P1 = C.part1, P2 = C.part2;
  // Cafés and wineries: holidays and closures end the Hours step; Instagram and Facebook are one screen ('social').
  var COMBO = !!(C.combo || C.cafe);
  // Wineries (2026-11-12): the tasting price's quick buttons, and where each of their checklist items is answered.
  var QUICK_FEES = [0, 5, 10, 15, 20, 25];
  var WINERY_ITEM_STEP = { winery_kind: 'winery', food_here: 'winery', tasting_price: 'tastings', visit_how: 'visit', booking_link: 'visit', winery_groups: 'visit', access: 'offer', dogs_kids: 'offer', pyv_known: 'story', arrival: 'door' };
  // Breweries (2026-11-12): the flight price's quick buttons, the to-go chips, the group sizes, the quick opening and
  // closing times, and where each of their checklist items is answered.
  var QUICK_FLIGHTS = [8, 10, 12, 15], TOGO = ['cans', 'bottles', 'growler', 'crowler'], GROUP_SIZES = [6, 8, 10, 12, 15, 20];
  // Distilleries (Decided 2, 2026-11-13): $10 · $15 · $20 · Other · Free tastings, and Bottles · Canned or bottled
  // cocktails (stored as 'cans') · Nothing to go. No growlers or crowlers.
  if (C.distillery) { QUICK_FLIGHTS = [10, 15, 20]; TOGO = ['bottles', 'cans']; }
  // Brewery test 2 (2026-11-13): 3 PM opens and 6 PM closes too (a small taproom's afternoon hours).
  var BQ_OPEN = ['11:00', '12:00', '14:00', '15:00'], BQ_CLOSE = ['18:00', '20:00', '21:00', '22:00'];
  var BREWERY_ITEM_STEP = { brewery_kind: 'taproom', food_here: 'taproom', flight_price: 'flights', to_go: 'flights', happy_hour: 'happy', dogs_kids: 'offer:minors', access: 'offer', entertainment: 'music', pyv_groups: 'groups', pyv_known: 'story', arrival: 'door', menu: 'menu' };
  // Cocktail lounges (2026-11-13): the pub screens folded like breweries (FOLD: Groups and booking on one screen, the
  // story screen with Known for), the cocktail price on 'spend', and where each checklist item is answered.
  var CK = !!C.cocktail, FOLD = !!(C.brewery || C.cocktail);
  var COCKTAIL_ITEM_STEP = { cocktail_price: 'spend', kitchen: 'hours:kitchen', minors: 'offer:minors', entertainment: 'music', pyv_groups: 'groups', pyv_known: 'story', arrival: 'door', menu: 'menu', happy_hour: 'happy' };
  // The checklist item -> the screen that answers it, for this type.
  function itemStep(k){ return (C.winery && WINERY_ITEM_STEP[k]) || (C.brewery && BREWERY_ITEM_STEP[k]) || (CK && COCKTAIL_ITEM_STEP[k]) || ''; }
  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var el = function(id){ return document.getElementById(id); };
  var screen = el('suScreen');
  var started = Date.now();
  // A value ending in a dot ("sept.") before the sentence's own dot gives one dot, not two.
  function fill(s, o){ return String(s).replace(/\{(\w+)\}/g, function(m, k, at, all){ if (!(o && o[k] != null)) return m; var v = String(o[k]); return /\.$/.test(v) && all.charAt(at + m.length) === '.' ? v.slice(0, -1) : v; }); }
  function h(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function dayName(d){ return C.dayNames[d]; }
  function monthName(i){ return C.monthNames[i]; }
  // "Noël : …" in French, "Christmas Day: …" in English (café test 6: the French space before a colon).
  function cl(a){ return a + (C.lang === 'fr' ? '\u00a0: ' : ': '); }
  // "Midnight", never "12 AM" (pub fresh-eyes, 2026-11-10). Brewery test 1 (2026-11-12): noon is "12 PM" (« 12 h »), as
  // the public page's hours and open-now line say it; the setup said "Noon" while the page said "12 PM".
  function t12(v){ var m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); if (!m) return v || ''; var hh = +m[1], mi = m[2]; if ((hh === 0 || hh === 24) && mi === '00') return C.lang === 'fr' ? 'minuit' : 'Midnight'; if (C.lang === 'fr') return hh + ' h' + (mi === '00' ? '' : ' ' + mi); var ap = hh >= 12 && hh < 24 ? 'PM' : 'AM'; hh = hh % 12 || 12; return hh + (mi === '00' ? '' : ':' + mi) + ' ' + ap; }
  // A happy hour's "until close" windows (pub test 9): { sun: ['21:00'] } from the stored week's "_close", or {}.
  function happyCloseOf(w){ try { var o = typeof w === 'string' ? JSON.parse(w) : w; return o && o._close && typeof o._close === 'object' ? o._close : {}; } catch (e) { return {}; } }
  // Distillery test 3 (2026-11-13): a kitchen-close or kids-until time starts an hour before the earliest closing time of
  // the week (so never after closing on any day; a close after midnight counts as late), or blank with no hours yet.
  function beforeClose(){
    var w = (typeof S !== 'undefined' && S && S.week) || parseWeek(CUR.hours), best = null;
    var mins = function(v){ var m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
    if (!w) return '';
    DAYS.forEach(function(d){ var r = w[d]; if (!r || !r.length) return; var last = r[r.length - 1], o = mins(last[0]), c = mins(last[1]); if (o === null || c === null) return; if (c <= o) c += 1440; if (best === null || c < best) best = c; });
    if (best === null) return '';
    var m = Math.max(best - 60, 0) % 1440;
    return (m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60);
  }
  function parseWeek(w){ try { var o = typeof w === 'string' ? JSON.parse(w) : w; var out = {}; DAYS.forEach(function(d){ out[d] = o && o[d] && o[d].length ? o[d].map(function(x){ return [x[0], x[1]]; }) : null; }); return out; } catch (e) { return null; } }

  // ---------- Seasons (pub test 7, 2026-11-10) ----------
  // A season as the screens hold it: { on, months: { 6: true, ... }, exact: { from: 'MM-DD', to: 'MM-DD' } | null }.
  var MLAST = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function pad2(n){ return ('0' + n).slice(-2); }
  function seaFrom(from, to){
    var o = { on: false, months: {}, exact: null };
    if (!/^\d{2}-\d{2}$/.test(from || '') || !/^\d{2}-\d{2}$/.test(to || '')) return o;
    o.on = true; var a = +from.slice(0, 2), b = +to.slice(0, 2), da = +from.slice(3), db = +to.slice(3);
    if (!(da === 1 && (db === MLAST[b - 1] || (b === 2 && db === 28)))) o.exact = { from: from, to: to };
    var i = a; for (var n = 0; n < 12; n++) { o.months[i] = true; if (i === b) break; i = i % 12 + 1; }
    return o;
  }
  // -> { ok, from, to } (from/to null for all year) | { ok: false, why }
  function seaOut(o){
    if (!o || !o.on) return { ok: true, from: null, to: null };
    if (o.exact) return o.exact.from && o.exact.to && o.exact.from !== o.exact.to ? { ok: true, from: o.exact.from, to: o.exact.to } : { ok: false, why: T.seasonNeedDates };
    var r = monthRun(o.months);
    if (r.none) return { ok: false, why: T.seasonNeedMonths };
    if (r.bad) return { ok: false, why: T.monthsInRow };
    if (r.all) return { ok: true, from: null, to: null };
    return { ok: true, from: pad2(r.a) + '-01', to: pad2(r.b) + '-' + MLAST[r.b - 1] };
  }
  function seaKey(o){ var r = seaOut(o); return r.ok ? (r.from || '') + '>' + (r.to || '') : 'x'; }
  // The months a season touches (all 12 for all year).
  function seaMonths(o){
    var r = o && o.on ? seaOut(o) : null, out = {};
    if (!r || !r.ok || !r.from) { for (var i = 1; i <= 12; i++) out[i] = true; return out; }
    var a = +r.from.slice(0, 2), b = +r.to.slice(0, 2), j = a; for (var n = 0; n < 12; n++) { out[j] = true; if (j === b) break; j = j % 12 + 1; }
    return out;
  }
  // The season box on a screen: "All year" / "Only some months", the month chips, and "Starts or ends mid-month? Pick the
  // exact dates" (two date boxes; the year is only there for the date picker).
  function seaObj(id){ var q2 = String(id).split('.'); if (q2[0] === 'happy') return S.happySea; if (q2[0] === 'hours') return S.sea; var e = S[q2[0]] && S[q2[0]][+q2[1]]; if (!e) return null; return e.sea || (e.sea = seaFrom()); }
  // Café test 2 (2026-11-11): a month and a day, no year ("the picker opened on Jun 1 2026, already past"). The dates repeat
  // every year, and the screen says so. French reads day then month.
  function mdPick(id, md, label){
    var mm = /^\d{2}-\d{2}$/.test(md || '') ? +md.slice(0, 2) : 0, dd = mm ? +md.slice(3) : 0, names = C.monthLong || C.monthNames, ms = '', ds = '';
    for (var i = 1; i <= 12; i++) ms += '<option value="' + i + '"' + (i === mm ? ' selected' : '') + '>' + h(names[i - 1]) + '</option>';
    for (var j = 1; j <= 31; j++) ds += '<option value="' + j + '"' + (j === dd ? ' selected' : '') + '>' + j + '</option>';
    var m = '<select class="su-field su-mdm" id="' + id + 'M" aria-label="' + h(label + ': ' + T.mdMonth) + '"><option value="">' + h(T.mdMonth) + '</option>' + ms + '</select>';
    var d = '<select class="su-field su-mdd" id="' + id + 'D" aria-label="' + h(label + ': ' + T.mdDay) + '"><option value="">' + h(T.mdDay) + '</option>' + ds + '</select>';
    return '<span class="su-md" id="' + id + '">' + (C.lang === 'fr' ? d + m : m + d) + '</span>';
  }
  function mdRead(id){ var m = el(id + 'M'), d = el(id + 'D'); if (!m || !d || !m.value || !d.value) return ''; var mm = +m.value; return pad2(mm) + '-' + pad2(Math.min(+d.value, MLAST[mm - 1])); }
  // "Apr 25" / « 25 avr ».
  function mdLabel(md){ if (!/^\d{2}-\d{2}$/.test(md || '')) return md || ''; var n = monthName(+md.slice(0, 2) - 1), d = +md.slice(3); return C.lang === 'fr' ? (d === 1 ? '1er' : d) + ' ' + n : n + ' ' + d; }
  function seaExactHtml(id, o){
    return '<p class="su-hint" style="margin:10px 0 6px">' + h(T.seasonExactLead) + '</p><div class="su-seadates"><p class="su-q">' + h(T.seasonFrom) + '</p><span data-sexact="' + id + ':from" data-mdid="sxf' + id + '">' + mdPick('sxf' + id, o.exact.from, T.seasonFrom) + '</span>'
      + '<p class="su-q">' + h(T.seasonTo) + '</p><span data-sexact="' + id + ':to" data-mdid="sxt' + id + '">' + mdPick('sxt' + id, o.exact.to, T.seasonTo) + '</span></div><p class="su-hint su-repeats">' + h(T.repeatsYearly) + '</p>'
      + '<p class="su-hint"><button type="button" class="su-link" data-sea="' + id + ':months">' + h(T.seasonExactMonths) + '</button></p>';
  }
  function seasonBox(id, o, title){
    var l = []; for (var i = 1; i <= 12; i++) l.push({ k: i, t: monthName(i - 1) });
    return '<div class="su-season" id="suSea' + id.replace('.', '_') + '"><p class="su-q">' + h(title || T.seasonQ2) + '</p><div class="su-samerow" role="group" aria-label="' + h(title || T.seasonQ2) + '">'
      + '<button type="button" class="su-toggle su-seabtn" aria-pressed="' + (o.on ? 'false' : 'true') + '" data-sea="' + id + ':all">' + h(T.seasonAll) + '</button>'
      + '<button type="button" class="su-toggle su-seabtn" aria-pressed="' + (o.on ? 'true' : 'false') + '" data-sea="' + id + ':some">' + h(T.seasonSome) + '</button></div>'
      + (o.on ? (o.exact ? seaExactHtml(id, o) : '<p class="su-hint" style="margin:10px 0 6px">' + h(T.seasonHint) + '</p><div class="su-chips" role="group" aria-label="' + h(T.whichMonths) + '">' + l.map(function(m){ return '<button type="button" class="su-chip" aria-pressed="' + (o.months[m.k] ? 'true' : 'false') + '" data-smon="' + id + ':' + m.k + '">' + h(m.t) + '</button>'; }).join('') + '</div>'
        + '<p class="su-hint"><button type="button" class="su-link" data-sea="' + id + ':exact">' + h(T.seasonExactLink) + '</button></p>') : '') + '</div>';
  }
  function readSeasons(){
    Array.prototype.forEach.call(screen.querySelectorAll('[data-sexact]'), function(inp){ var q2 = inp.getAttribute('data-sexact').split(':'), o = seaObj(q2[0]); if (!o || !o.exact) return; o.exact[q2[1]] = mdRead(inp.getAttribute('data-mdid')); });
  }
  // "Heads up: you're closed on Tue (in your usual hours)." under a special or event on a weekday the place is closed in
  // the months it runs (pub test 7). Only with hours on file.
  function closedWarn(days, sea){
    if (!S.week || !DAYS.some(function(d){ return S.week[d]; })) return '';
    var M = seaMonths(sea), hasSea = !!(S.sea.on && S.sea.week), usual = false, seas = false;
    for (var i = 1; i <= 12; i++) if (M[i]) { if (hasSea && S.sea.months[i]) seas = true; else usual = true; }
    if (!usual && !seas) return '';
    // Bug-check (2026-11-12): a day open in any of the special's seasons is not "closed" (Sun closed in the usual week but
    // open in summer, for a special that runs all year).
    var all = DAYS.filter(function(d){ return days[d] && (!usual || !S.week[d]) && (!seas || !S.sea.week[d]); });
    if (!all.length) return '';
    var when = hasSea ? (seas && !usual ? fill(T.closedWarnSeason, { kind: T.seasonWord[S.sea.kind] || T.seasonWord.summer }) : usual && !seas ? T.closedWarnUsual : '') : '';
    return fill(T.closedWarn, { days: daysInFull(all), when: when });
  }
  // Brewery test 4 (2026-11-13): happy hour too (its season is the screen's one season box); the page adds "(when open)".
  // Unlike a special (shown only on days it's open), a happy hour's days show all year, so a day closed in either week
  // counts: "you're closed on Mon (in your usual hours)".
  function warnOf(key, e){ return key === 'happy' ? [closedWarnAny(e.days, S.happySea), hoursWarn(e)].filter(Boolean).join(' ') : closedWarn(e.days, e.sea); }
  // Cocktail test 1 (2026-11-13): a new happy hour starts at the usual opening time and lasts 2 hours, never past closing
  // (it was 3–5 PM for a bar that opens at 5). With no hours yet it stays 3–5 PM.
  function hm(v){ var m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); return m ? +m[1] * 60 + +m[2] : null; }
  function hmStr(n){ n = ((n % 1440) + 1440) % 1440; return pad2(Math.floor(n / 60)) + ':' + pad2(n % 60); }
  function happyDefault(){
    var w = S.week, count = {}, best = null;
    DAYS.forEach(function(d){ var r = w && w[d] && w[d][0]; if (r && hm(r[0]) != null) { count[r[0]] = (count[r[0]] || 0) + 1; if (!best || count[r[0]] > count[best[0]]) best = r; } });
    if (!best) return { days: {}, from: '15:00', to: '17:00', what: '' };
    var o = hm(best[0]), c = hm(best[1]); if (c != null && c <= o) c += 1440;
    return { days: {}, from: best[0], to: hmStr(c != null ? Math.min(o + 120, c) : o + 120), what: '' };
  }
  // A happy hour outside the place's hours on a day it's open (a gentle heads-up like the closed-day one).
  // Cocktail test 2 (2026-11-13): checked against the hours that apply in the months it runs: a summer-only happy hour
  // against the summer hours only, an all-year one against both weeks (outside either is a heads-up). A day closed in
  // those months is the closed-day heads-up's (closedWarnAny), not this one's.
  function hoursWarn(e){
    var f = hm(e.from), t = e.close ? null : hm(e.to); if (f == null || !S.week) return '';
    var M = seaMonths(S.happySea), hasSea = !!(S.sea && S.sea.on && S.sea.week), usual = !hasSea, seas = false;
    if (hasSea) for (var i = 1; i <= 12; i++) if (M[i]) { if (S.sea.months[i]) seas = true; else usual = true; }
    var weeks = []; if (usual) weeks.push(S.week); if (seas) weeks.push(S.sea.week);
    var inside = function(w, d){ return w[d].some(function(r){ var o = hm(r[0]), c = hm(r[1]); if (o == null || c == null) return true; if (c <= o) c += 1440;
      var ff = f < o && f + 1440 <= c ? f + 1440 : f, tt = t == null ? ff : t <= ff ? t + 1440 : t; return ff >= o && tt <= c; }); };
    var out = DAYS.filter(function(d){
      if (!e.days[d]) return false;
      return weeks.some(function(w){ return w && w[d] && !inside(w, d); });
    });
    return out.length && T.happyOutside ? fill(T.happyOutside, { days: daysInFull(out) }) : '';
  }
  // Cocktail test 2 (2026-11-13): warnings name the days in full: "Monday and Tuesday"; French « lundi et le mardi » (the
  // sentence already says « le {days} »: « fermé le lundi et le mardi »).
  function daysInFull(list){
    var n = list.map(longDay); if (n.length < 2) return n.join('');
    return C.lang === 'fr' ? n.slice(0, -1).join(', le ') + ' et le ' + n[n.length - 1] : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
  }
  function closedWarnAny(days, sea){
    if (!S.week || !DAYS.some(function(d){ return S.week[d]; })) return '';
    var M = seaMonths(sea), hasSea = !!(S.sea.on && S.sea.week), usual = false, seas = false;
    for (var i = 1; i <= 12; i++) if (M[i]) { if (hasSea && S.sea.months[i]) seas = true; else usual = true; }
    var inUsual = DAYS.filter(function(d){ return days[d] && usual && !S.week[d]; }), inSea = DAYS.filter(function(d){ return days[d] && seas && !S.sea.week[d]; });
    var all = DAYS.filter(function(d){ return inUsual.indexOf(d) >= 0 || inSea.indexOf(d) >= 0; });
    if (!all.length) return '';
    var onlyUsual = all.every(function(d){ return inSea.indexOf(d) < 0; }), onlySea = all.every(function(d){ return inUsual.indexOf(d) < 0; });
    var when = hasSea && seas && usual ? (onlyUsual ? T.closedWarnUsual : onlySea ? fill(T.closedWarnSeason, { kind: T.seasonWord[S.sea.kind] || T.seasonWord.summer }) : '') : '';
    return fill(T.closedWarnHappy, { days: daysInFull(all), when: when });
  }
  function warnHtml(key, i, e){ var t = warnOf(key, e); return '<p class="su-hint su-closedwarn" id="suWarn' + key + i + '" role="status"' + (t ? '' : ' hidden') + '>' + h(t) + '</p>'; }
  function warnRefresh(){
    ['specials', 'nights', 'happy'].forEach(function(key){ (S[key] || []).forEach(function(e, i){ var n = el('suWarn' + key + i); if (!n) return; var t = warnOf(key, e); n.textContent = t; n.hidden = !t; }); });
  }

  // ---------- State ----------
  var GAMES = ['pool', 'darts', 'shuffleboard', 'arcade', 'board_games'];
  // Cocktail test 2 (2026-11-13): a story written in the French setup is the French description (description_fr); the
  // English one is left as it is. The French story box starts from her French text, else the English page text.
  var STORY_FIELD = C.lang === 'fr' ? 'description_fr' : 'description';
  function storyCur(){ return String((C.lang === 'fr' && CUR.description_fr) || CUR.description || ''); }
  function storyOut(t){ var o = {}; o[STORY_FIELD] = t; return o; }
  var S = {
    step: 'start', hist: [], done: clone(C.progress.done || {}), error: '', nudge: '', busy: false, toFinish: false, savedLine: {}, addLen: '1',
    notOffered: (CUR.not_offered || []).slice(),
    week: parseWeek(CUR.hours), photos: [], rights: false, photosSent: 0, menuFiles: [], menuPages: [], sheetFiles: [], webUrl: null,
    spend: CUR.avg_spend && CUR.avg_spend.exact ? CUR.avg_spend.exact : CUR.avg_spend && CUR.avg_spend.amount ? CUR.avg_spend.amount : 25,
    cuis: (CUR.cuisines || []).filter(function(c){ return C.cuisines.indexOf(c) >= 0; }), place: CUR.place_type || '', cuiAll: false, cuiQ: '',
    badges: clone(CUR.badges || {}), dogNote: (CUR.visit_rows || {}).dogs || '',
    months: {}, closures: [], extra: [], sea: { on: false, kind: '', months: {}, week: null, open: {} },
    happy: [], specials: [], nights: [], story: C.storyPending || storyCur(), visit: clone(CUR.visit_rows || {}),
    ig: (CUR.instagram_url || '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '@').replace(/\/$/, ''), fb: CUR.facebook_url || '',
    door: { photo: null, best: null, spot: null, noLoc: false, rights: false }, score: C.progress.score || null,
    fresh: true, dirty: '', exitAfter: false, doneNowSaid: !!C.doneForNow, leaving: false, toList: false, added: '', noDiet: (CUR.not_offered || []).indexOf('dietary') >= 0,
    // "No dogs allowed" (pub test 4, 2026-11-10): the not-offered answer 'dogs'; never together with Dog friendly.
    noDogs: (CUR.not_offered || []).indexOf('dogs') >= 0 && !(CUR.badges || {}).dog_friendly,
    // "No sports / no TVs" (pub test 6): the explicit answer; an unticked Sports on TV tile alone says nothing.
    noSports: (CUR.not_offered || []).indexOf('sports') >= 0 && !(CUR.badges || {}).sports_tv,
    // "No games" (pub test 9, 2026-11-10): the explicit answer, like No sports. Leaving the game tiles unticked says nothing.
    noGames: (CUR.not_offered || []).indexOf('games') >= 0 && !GAMES.some(function(g){ return (CUR.badges || {})[g]; }),
  };
  S.badgesAtStart = clone(CUR.badges || {});
  // What the page holds now (café test 1, 2026-11-11): kept up to date by each save, so a screen never re-sends a value
  // that is already stored (the ordering screen sent "no drive-thru, no walk-up" again, which came back "Nothing has
  // changed yet": harmless, but a refused save in the server log every time).
  S.savedBadges = clone(CUR.badges || {}); S.savedYear = (CUR.cafe_info || {}).year || ''; S.savedOrder = JSON.stringify((CUR.cafe_info || {}).order || null);
  // Pub test 5 (2026-11-10): the words in a description that are about sports on TV. [start, end] of the first, or null.
  var SPORTS_RE = /\b(?:sports?|tvs?|televisions?|big[- ]screens?|the game|game day|game night|hockey night|playoffs?|nhl|nfl|cfl|ufc|pay[- ]per[- ]view)\b/i;
  function sportsAt(){ var t = String(S.story || ''), m = SPORTS_RE.exec(t); return m ? [m.index, m.index + m[0].length] : null; }
  // A short quote around it ("…and the game on"), for the gentle prompt.
  function sportsBit(){
    var at = sportsAt(); if (!at) return ''; var t = String(S.story), a = Math.max(0, at[0] - 24), b = Math.min(t.length, at[1] + 24);
    while (a > 0 && /\S/.test(t.charAt(a - 1))) a--; while (b < t.length && /\S/.test(t.charAt(b))) b++;
    return (a > 0 ? '…' : '') + t.slice(a, b).trim().replace(/[.,;:!]+$/, '') + (b < t.length ? '…' : '');
  }
  function sportsNote(){ var n = el('suSportsNote'); if (n) n.hidden = !(sportsBit() && !S.badges.sports_tv); }
  // Pubs (2026-11-10): the kitchen, who's welcome and the sports, as stored (venue_pub_info); Pub Fare picked to start.
  S.pubInfo = clone(CUR.pub_info || {});
  S.kitchen = { mode: (S.pubInfo.kitchen || {}).mode || '', closes: (S.pubInfo.kitchen || {}).closes || '', note: (S.pubInfo.kitchen || {}).note || '' };
  // Seasonal kitchen time (pub test 7): 'same' (as the rest of the year), 'close' (food until close) or 'time'.
  (function(){ var z = (S.pubInfo.kitchen || {}).season; S.kitchen.sea = z ? (z.closes === 'close' ? { mode: 'close', closes: '' } : { mode: 'time', closes: z.closes }) : { mode: 'same', closes: '' }; })();
  S.minors = { policy: (S.pubInfo.minors || {}).policy || '', until: (S.pubInfo.minors || {}).until || beforeClose(), note: (S.pubInfo.minors || {}).note || '' };
  // Cocktail test 1 (2026-11-13): research's "19+" picks Adults only to start (saved only with the screen).
  if (CK && !S.minors.policy && C.suggestAdults) { S.minors.policy = 'adults'; S.minorsGuessed = true; }
  // Breweries (2026-11-12): "Who's welcome?" is the pub answer, stored with the brewery's own answers.
  if (C.brewery) { var BIm = (CUR.brewery_info || {}).minors || {}; S.minors = { policy: BIm.policy || '', until: BIm.until || beforeClose(), note: BIm.note || '' };
    // Brewery test 4 (2026-11-13): research says "Kids welcome until 8 PM": that answer is picked to start (saved with the screen).
    if (!BIm.policy && C.suggestKidsUntil) { S.minors.policy = 'minors_until'; S.minors.until = C.suggestKidsUntil; }
    // Distillery test 1 (2026-11-13): research's "Minors welcome with an adult" (no time) picks All ages to start.
    else if (!BIm.policy && C.suggestKidsAll) S.minors.policy = 'all_ages'; }
  S.sports = { list: {}, tvs: (S.pubInfo.sports || {}).tvs || '' };
  ((S.pubInfo.sports || {}).list || []).forEach(function(k){ S.sports.list[k] = true; });
  // Cocktail lounges: no Pub Fare to start (their food is picked from small plates, tapas…).
  if (C.pub && !CK && !S.cuis.length && S.kitchen.mode !== 'none') S.cuis = ['Pub Fare'];
  // Cafés (2026-11-10; drafts/cafe-portal-2026-11-10/SPEC-cafes.md): the café's own answers (venue_cafe_info), as stored.
  var CI = clone(CUR.cafe_info || {}), CL = CUR.cafe_links || {}, CIs = CI.stay || {}, CId = CI.diet || {}, CIc = CI.coffee || {}, CIo = CI.order || {};
  S.cafe = {
    serves: {}, stay: { laptops: CIs.laptops || '', seats: CIs.seats || '', outlets: !!CIs.outlets, quiet: !!CIs.quiet },
    diet: { milks: {}, milk_extra: CId.milk_extra || '', gf_kitchen: CId.gf_kitchen || '', vegan_baking: !!CId.vegan_baking, nut_free: !!CId.nut_free, note: CId.note || '' },
    order: { online: !!CL.order_url, url: CL.order_url || '', preorder: !!(CIo.preorder || CL.preorder_url), how: CIo.preorder_how || '', purl: CL.preorder_url || '', counter: (CUR.not_offered || []).indexOf('ordering') >= 0 },
    coffee: { roast_own: !!CIc.roast_own, source: CIc.source || '', beans: !!CIc.beans }, sellout: CI.sellout || ''
  };
  (CI.serves || []).forEach(function(k){ S.cafe.serves[k] = true; });
  // Café test 2 (2026-11-11): ice cream and gelato answers, "No washroom" and the seats answer on "What you offer".
  S.cafe.diet.df_sorbet = !!CId.df_sorbet; S.cafe.diet.vegan_ice = !!CId.vegan_ice; S.cafe.diet.gf_cones = CId.gf_cones || '';
  S.noWash = (CUR.not_offered || []).indexOf('washroom') >= 0 && !(CUR.badges || {}).washroom;
  S.seatsWas = S.cafe.stay.seats; S.cafe.menuDaily = CI.menu_daily || '';
  (CId.milks || []).forEach(function(k){ S.cafe.diet.milks[k] = true; });
  // "Laptop friendly" is a tile on "What you offer" but stored as the three-way laptops answer.
  if (C.cafe) { S.badges.laptop = S.cafe.stay.laptops === 'all_day' || S.cafe.stay.laptops === 'not_busy'; S.badgesAtStart.laptop = S.badges.laptop; }
  S.noWifi = (CUR.not_offered || []).indexOf('wifi') >= 0 && !(CUR.badges || {}).wifi;
  // Decided 6: a kind the name suggests ("… Bakery" → Bakery) is pre-selected only. It is saved when the owner taps Save.
  if (C.cafe && !S.place && C.suggestKind) { S.place = C.suggestKind; S.kindGuessed = C.suggestKind; }
  // Bug-check (2026-11-12): the starting price fits the kind: a single scoop starts at $6 and a bubble tea at $7, not the
  // $9 coffee and pastry. It follows the kind she picks until she changes the price.
  function cafeSpendStart(){ return S.place === 'Ice cream & gelato' ? 6 : S.place === 'Bubble tea' ? 7 : 9; }
  // Review fix (2026-11-12): only until the price step is answered (saved, sent or skipped); after that a change of kind
  // never changes the price shown under "✓ Saved" (spendFollows).
  var spendAuto = C.cafe && !(CUR.avg_spend && CUR.avg_spend.amount);
  if (spendAuto) S.spend = cafeSpendStart();
  if (S.done.spend) spendAuto = false;
  function spendFollows(){ return spendAuto && !S.done.spend && S.spend === cafeSpendStart(); }
  // The social screen (cafés): "not on it" / "not sure" as answered before, and what's saved now.
  S.socNo = { instagram: S.done.instagram === 'no' ? 'no' : S.done.instagram === 'unsure' ? 'unsure' : '', facebook: S.done.facebook === 'no' ? 'no' : S.done.facebook === 'unsure' ? 'unsure' : '' };
  S.socSaved = { instagram: S.ig, facebook: S.fb }; S.socLines = [];
  // Brewery test 2 (2026-11-13): a facebook.com website pre-fills the Facebook box, as a suggestion saved only with the screen.
  if (!S.fb && !S.socNo.facebook && !S.done.facebook && fbFromSite(CUR.website || C.website || '')) { S.fb = fbFromSite(CUR.website || C.website); S.fbFromWebsite = true; }
  // Cocktail test 1 (2026-11-13): an instagram.com website pre-fills the Instagram box the same way (saved only with the screen).
  if (!S.ig && !S.socNo.instagram && !S.done.instagram && igFromSite(CUR.website || C.website || '')) { S.ig = igFromSite(CUR.website || C.website); S.igFromWebsite = true; }
  S.cuiTouched = false;
  // A café's happy hour is allowed only while it serves Beer & wine (outreach rule). 13 screens (2026-11-11): it is no
  // longer a café setup step (the edit page has it), so nothing is added to the list here.
  function cafeHappy(on){ if (!C.cafe) return; C.happyHour = on; }
  // Café test 2 (2026-11-11): words for the café's kind (photos, story example) and what fits it. Kinds that don't serve
  // coffee (gelato, bubble tea, juice, tea, dessert) don't get the "Your coffee" tile unless espresso or drip is ticked.
  var KIND_SERVE = { 'Coffee shop': 'espresso', Bakery: 'baked_here', 'Bakery café': 'baked_here', Roastery: 'espresso', 'Tea house': 'tea', 'Bubble tea': 'bubble_tea', 'Ice cream & gelato': 'ice_cream', 'Dessert & sweets': 'desserts', 'Brunch café': 'breakfast', 'Juice & smoothie bar': 'smoothies', 'Deli & sandwiches': 'lunch' };
  var NO_COFFEE = ['Ice cream & gelato', 'Bubble tea', 'Juice & smoothie bar', 'Tea house', 'Dessert & sweets'];
  var BAKES = ['Bakery', 'Bakery café', 'Coffee shop', 'Roastery', 'Brunch café', 'Deli & sandwiches'];
  // Brewery test 3 (2026-11-13): a cidery reads cider words, and a distillery or a place that hasn't picked its kind yet
  // reads neutral ones (T.kindCidery / T.kindNeutral over the brewery words); a brewery or a taphouse keeps the beer words.
  var T0 = T;
  function kindWords(){
    if (!C.brewery) return;
    var k = S.place || CUR.place_type || '';
    // Distilleries (2026-11-13): spirits words (T.kindDistillery). A brewery whose kind is Distillery keeps the neutral ones.
    var ov = C.distillery && T0.kindDistillery ? T0.kindDistillery : k === 'Cidery' ? T0.kindCidery : (k === 'Brewery' || k === 'Taphouse or beer hall') ? null : T0.kindNeutral;
    if (!ov) { T = T0; return; }
    var t = {};
    Object.keys(T0).forEach(function(key){ t[key] = T0[key]; });
    Object.keys(ov).forEach(function(key){ var a = T0[key], b = ov[key]; t[key] = b && typeof b === 'object' && a && typeof a === 'object' ? Object.assign({}, a, b) : b; });
    T = t;
  }
  function kindText(key){ var k = (T.cafeKinds || {})[S.place]; return k && k[key] ? k[key] : ''; }
  function iceKind(){ return S.place === 'Ice cream & gelato'; }
  function coffeeOn(){ return !S.place || NO_COFFEE.indexOf(S.place) < 0 || !!(S.cafe.serves.espresso || S.cafe.serves.drip); }
  function syncCoffee(){ if (!C.cafe) return; var on = coffeeOn(), i = STEPS.indexOf('coffee'), j = P2.indexOf('coffee'); if (!on && i >= 0) { STEPS.splice(i, 1); if (j >= 0) P2.splice(j, 1); } if (on && i < 0 && (C.allSteps || []).indexOf('coffee') >= 0) { STEPS.push('coffee'); P2.push('coffee'); } }
  // The serve chips for the kind: "Baked fresh here" for bakeries, "Made here" for the rest (a ticked one always shows).
  // Café test 3 (2026-11-11): the gelato-shop chips (sorbet, milkshakes, cones & cups, affogato) only for an ice cream &
  // gelato kind; a bubble tea shop saw them.
  var ICE_ONLY = ['sorbet', 'milkshakes', 'cones', 'affogato'];
  // "Custom cakes and pre-orders" on the ordering screen: bakeries and dessert shops only (or already ticked).
  var CAKE_KINDS = ['Bakery', 'Bakery café', 'Dessert & sweets'];
  function cakesShown(){ return !S.place || CAKE_KINDS.indexOf(S.place) >= 0 || !!S.cafe.order.preorder; }
  // "No dogs allowed": no patio named when the place has none (café test 3).
  // Café test 4 (2026-11-11): the "No Wi-Fi" tile says what the page will show. A takeout-only café's page says a plain
  // "No Wi-Fi" (no "a place to talk": there's nowhere to sit), and the line changes as "No seats inside" is tapped.
  // Café test 4 (2026-11-11): "A bit more would be great" stayed under a 105-character, three-sentence story.
  // Winery test 2 (2026-11-12): "Great length" only where the checklist gives full marks (120 letters, portal-completeness
  // DESCRIPTION_MIN); below it the hint says so, gently ("120 letters for full marks").
  var STORY_OK = 120;
  // Café test 4: no "your seats" for a takeout window (the coffee shop's photo hint).
  function photosHint(){ var t = kindText('photos') || T.photosLead; return C.cafe && S.cafe.stay.seats === 'takeout' && T.photosTakeout && /seats|room|places assises|salle/i.test(t) ? T.photosTakeout : t; }
  function wifiSubText(){ return S.cafe.stay.seats === 'takeout' ? T.noWifiSubTakeout : T.noWifiSub; }
  function dogSubText(){ return S.badges.patio ? T.noDogsSub : T.noDogsSubInside || T.noDogsSub; }
  function servesShown(){ var bake = !S.place || BAKES.indexOf(S.place) >= 0; return C.serves.filter(function(o){ if (S.cafe.serves[o.k]) return true; if (o.k === 'baked_here') return bake; if (o.k === 'made_here') return !bake; if (ICE_ONLY.indexOf(o.k) >= 0) return iceKind(); return true; }); }
  // "5.50" for cents (French "5,50"), "9" for whole dollars.
  function money(n){ var t = Math.round(n * 4) / 4 === Math.round(n) ? String(Math.round(n)) : (Math.round(n * 100) / 100).toFixed(2); return C.lang === 'fr' ? t.replace('.', ',') : t; }
  function cafeWords(){ return (C.priceWords || {})[S.place] || (C.priceWords || {}).default || ''; }
  function cafeStay(){ var st = S.cafe.stay, o = {}; if (st.laptops) o.laptops = st.laptops; if (st.seats) o.seats = st.seats; if (st.outlets) o.outlets = true; if (st.quiet) o.quiet = true; return o; }
  // Reads the café screens' text boxes into S.cafe (before a redraw or a save).
  function readCafe(){
    var v = function(id){ var n = el(id); return n ? n.value : null; }, x;
    if ((x = v('suOurl')) !== null) S.cafe.order.url = x.trim(); if ((x = v('suOhow')) !== null) S.cafe.order.how = x.trim(); if ((x = v('suOpurl')) !== null) S.cafe.order.purl = x.trim();
    if ((x = v('suCsrc')) !== null) S.cafe.coffee.source = x.trim(); if ((x = v('suSell')) !== null) S.cafe.sellout = x.trim();
    if ((x = v('suDnote')) !== null) S.cafe.diet.note = x;
  }
  // ---------- Wineries (2026-11-12; drafts/winery-portal-2026-11-12/SPEC-wineries.md) ----------
  // The winery's own answers (venue_winery_info) and its tasting fee, as stored. A price from our research (the card's
  // "From $X") is offered as a starting point only; nothing is saved until she taps Save.
  var WI = clone(CUR.winery_info || {});
  S.wine = {
    food: WI.food || '', rname: (WI.restaurant || {}).name || '', rwhen: (WI.restaurant || {}).when || '',
    fee: CUR.tasting_fee == null ? null : CUR.tasting_fee, feeOther: false, waived: WI.waived || '',
    visit: WI.visit || '', groups: WI.groups || 0, buses: WI.buses || '', year: WI.year || '', season: WI.season || null,
    exp: (Array.isArray(WI.experiences) ? WI.experiences : (C.extras || [])).slice(0, 2).map(function(e){ return { label: e.label || '', text: e.text || '' }; }),
    known: (CUR.visit_rows || {}).known_for || '', noBook: (CUR.not_offered || []).indexOf('booking_link') >= 0
  };
  while (S.wine.exp.length < 2) S.wine.exp.push({ label: '', text: '' });
  if (C.winery && S.wine.fee == null && typeof C.researchFee === 'number') { S.wine.fee = C.researchFee; S.wine.feeGuessed = true; }
  if (C.winery && S.wine.fee != null && QUICK_FEES.indexOf(S.wine.fee) < 0) S.wine.feeOther = true;
  S.savedWYear = WI.year || ''; S.savedFee = CUR.tasting_fee == null ? null : CUR.tasting_fee;
  // ---------- Breweries (2026-11-12; drafts/brewery-portal-2026-11-12/SPEC-breweries.md) ----------
  // The brewery's own answers (venue_brewery_info) and its flight price, as stored. A kind its name suggests, research's
  // food and research's flight price are offered as a starting point only; nothing is saved until she taps Save.
  var BI = clone(CUR.brewery_info || {});
  S.brew = { food: BI.food || '', trucks: BI.trucks || (BI.food === 'trucks' ? 'most_days' : ''), outside: BI.outside || '', kmode: (BI.kitchen || {}).mode || '', kcloses: (BI.kitchen || {}).closes || beforeClose(),
    fee: CUR.flight_fee == null ? null : CUR.flight_fee, feeOther: false, noFlights: BI.no_flights === true, togo: {}, waived: BI.waived || '',
    known: (CUR.visit_rows || {}).known_for || '', groups: (CUR.visit_rows || {}).groups || '', book: (CUR.visit_rows || {}).reservations || '' };
  (BI.to_go || []).forEach(function(k){ S.brew.togo[k] = true; });
  // Distilleries (Decided 1): the kind is Distillery, never asked (and never sent: it isn't stored).
  if (C.distillery) { S.place = 'Distillery'; CUR.place_type = 'Distillery'; }
  // Distilleries (Decided 5, 2026-11-13): the winery's "By appointment" answers on Hours (no set hours; or walk-ins in a
  // season, by appointment the rest of the year), stored with their brewery answers. AI: the answers it reads.
  var APPT = !!(C.winery || C.distillery), AI = C.distillery ? BI : WI;
  function apptPart(o){ return C.distillery ? { brewery_info: o } : { winery_info: o }; }
  if (C.distillery) { S.wine.visit = BI.visit || ''; S.wine.year = BI.year || ''; S.wine.season = BI.season || null; S.savedWYear = BI.year || ''; }
  if (C.brewery) {
    S.savedYear = BI.year || '';
    if (!S.place && C.suggestKind) { S.place = C.suggestKind; S.kindGuessed = C.suggestKind; }
    if (!S.brew.food && C.suggestFood) { S.brew.food = C.suggestFood; S.foodGuessed = C.suggestFood; }
    // Brewery test 2 (2026-11-13): research's "Food trucks on weekends" pre-picks Weekends only (saved only with the screen).
    if (!BI.trucks && C.suggestTrucks && (!BI.food || BI.food === 'trucks')) { S.brew.trucks = C.suggestTrucks; S.trucksGuessed = C.suggestTrucks; }
    if (S.brew.fee == null && !S.brew.noFlights && typeof C.researchFee === 'number') { S.brew.fee = C.researchFee; S.brew.feeGuessed = true; }
    if (S.brew.fee != null && QUICK_FLIGHTS.indexOf(S.brew.fee) < 0 && !(C.distillery && S.brew.fee === 0)) S.brew.feeOther = true;
    // Brewery test 1 (2026-11-12): research's To go line pre-ticks its chips, as a suggestion saved only with the screen.
    if (!(BI.to_go || []).length && (C.suggestToGo || []).length) { C.suggestToGo.forEach(function(k){ S.brew.togo[k] = true; }); S.togoGuessed = true; }
  }
  S.savedFlight = CUR.flight_fee == null ? null : CUR.flight_fee;
  // Cocktail lounges (Decided 2, 2026-11-13): the cocktail price as stored (a number, 'none' for "We don't serve cocktails",
  // or null). Research's price is offered as a starting point only; nothing is saved until she taps Save.
  var CQ = C.cocktailQuick || [12, 14, 16, 18];
  S.savedCp = CUR.cocktail_price == null ? null : CUR.cocktail_price;
  S.cp = { fee: typeof S.savedCp === 'number' ? S.savedCp : null, none: S.savedCp === 'none', other: false, guessed: false };
  if (CK && S.cp.fee == null && !S.cp.none && typeof C.researchCocktail === 'number') { S.cp.fee = C.researchCocktail; S.cp.guessed = true; }
  if (CK && S.cp.fee != null && CQ.indexOf(S.cp.fee) < 0) S.cp.other = true;
  // "$16" / "16 $".
  function cpText(n){ return C.lang === 'fr' ? money(n) + '\u00a0$' : '$' + money(n); }
  function cpLeadText(){ var n = S.cp.fee; if (S.cp.none || n == null || isNaN(n) || n <= 0 || n > (C.feeLiveMax || 40)) return T.cpriceLead; return fill(T.cpriceLeadPick, { x: fill(T.feeCard, { x: cpText(n) }) }); }
  function readBrew(){
    var v = function(id){ var n = el(id); return n ? n.value : null; }, x;
    if ((x = v('suFee')) !== null && C.brewery) { var f = String(x).trim().replace(/^\$\s*/, '').replace(/\s*\$$/, '').replace(',', '.'); S.brew.fee = f === '' ? null : /^\d{1,3}(\.\d{1,2})?$/.test(f) ? +f : NaN; }
    if ((x = v('suKto')) !== null && C.brewery) S.brew.kcloses = x;
    if ((x = v('suKnown')) !== null && FOLD) S.brew.known = x.trim();
    if ((x = v('suGroupsLine')) !== null) S.brew.groups = x;
    if ((x = v('suBookLine')) !== null && CK) S.brew.book = x;
    if ((x = v('suBookUrl')) !== null && FOLD) S.bookUrl = x;
    if ((x = v('suCfee')) !== null && CK) { var cf = String(x).trim().replace(/^\$\s*/, '').replace(/\s*\$$/, '').replace(',', '.'); S.cp.fee = cf === '' ? null : /^\d{1,3}(\.\d{1,2})?$/.test(cf) ? +cf : NaN; }
  }
  // A brewery's one-of-a-few answers (data-bpick="food:trucks") and on/off chips (data-btogo).
  // `after`: html shown right under one choice (the food-truck chips under "Food trucks").
  function bpicks(key, keys, labels, subs, after){ return '<div class="su-stack" role="group">' + keys.map(function(k){ var on = String(S.brew[key]) === String(k); return '<button type="button" class="su-big' + (on ? '' : ' su-alt') + '" aria-pressed="' + (on ? 'true' : 'false') + '" data-bpick="' + key + ':' + k + '"><span class="su-ico" aria-hidden="true">' + (on ? '✓' : '○') + '</span><span>' + h(labels[k]) + (subs && subs[k] ? '<small>' + h(subs[k]) + '</small>' : '') + '</span></button>' + (after && after[k] ? after[k] : ''); }).join('') + '</div>'; }
  function bchips(key, keys, labels, aria){ return '<div class="su-chips" role="group" aria-label="' + h(aria) + '">' + keys.map(function(k){ var on = String(S.brew[key]) === String(k); return '<button type="button" class="su-chip' + (String(labels[k]).length > 8 ? ' su-chip-wide' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '" data-bpick="' + key + ':' + k + '">' + h(labels[k]) + '</button>'; }).join('') + '</div>'; }
  // "$12" / "12 $".
  function flightText(n){ return C.lang === 'fr' ? money(n) + '\u00a0$' : '$' + money(n); }
  // Brewery test 1 (2026-11-12): the Flights lead names her current pick ("It shows on your card as 'From $14' right
  // away"), redrawn as she taps a price or types one in Other; with no pick (or one checked first) it names no number.
  function flightLeadText(){
    var bf = S.brew, n = bf.fee;
    if (bf.noFlights || n == null || isNaN(n) || n < 0 || n > (C.feeLiveMax || 40)) return T.flightLead;
    return fill(T.flightLeadPick, { x: n === 0 ? T.feeCardFree : fill(T.feeCard, { x: flightText(n) }) });
  }
  // "Your menu" is a step only for a brewery with its own kitchen (Decided 5): added or taken off with the food answer.
  function syncMenu(){ if (!C.brewery) return; var on = BI.food === 'kitchen', i = STEPS.indexOf('menu'), j = P2.indexOf('menu'); if (!on && i >= 0) { STEPS.splice(i, 1); if (j >= 0) P2.splice(j, 1); } if (on && i < 0 && (C.allSteps || []).indexOf('menu') >= 0) { STEPS.push('menu'); P2.push('menu'); } }
  // Tiles shown only with their own kitchen (vegan, vegetarian, takeout); a ticked one always shows.
  function tileShown(k){ return !C.brewery || (C.kitchenOnly || []).indexOf(k) < 0 || BI.food === 'kitchen' || S.brew.food === 'kitchen' || !!S.badgesAtStart[k]; }
  // The quick opening and closing times on a day's card ("Opens: 11 AM · 12 PM · 2 PM", "Closes: 8 PM · 9 PM · 10 PM").
  function brewQuick(d, j, y, last){
    if (!C.brewery) return '';
    var row = function(idx, list, label){ return '<div class="su-samerow su-laterow su-bqrow" role="group" aria-label="' + h(label) + '"><span class="su-latelbl">' + h(label) + '</span>' + list.map(function(t){ return '<button type="button" class="su-toggle su-latebtn" aria-pressed="' + (y[idx] === t ? 'true' : 'false') + '" data-bq="' + d + ':' + j + ':' + idx + ':' + t + '">' + h(t12(t)) + '</button>'; }).join('') + '</div>'; };
    return (j === 0 ? row(0, BQ_OPEN, T.bqOpens) : '') + (j === last ? row(1, BQ_CLOSE, T.bqCloses) : '');
  }
  // Reads the winery screens' text boxes into S.wine (before a redraw or a save).
  function readWine(){
    var v = function(id){ var n = el(id); return n ? n.value : null; }, x;
    if ((x = v('suRname')) !== null) S.wine.rname = x.trim(); if ((x = v('suRwhen')) !== null) S.wine.rwhen = x.trim();
    if ((x = v('suFee')) !== null) { var f = String(x).trim().replace(/^\$\s*/, '').replace(/\s*\$$/, '').replace(',', '.'); S.wine.fee = f === '' ? null : /^\d{1,3}(\.\d{1,2})?$/.test(f) ? +f : NaN; }
    if ((x = v('suKnown')) !== null) S.wine.known = x.trim();
    // Winery test 2 (2026-11-12): a booking link typed before tapping a group size or bus chip survives the redraw.
    if ((x = v('suBookUrl')) !== null) S.bookUrl = x;
    [0, 1].forEach(function(i){ if ((x = v('suXl' + i)) !== null) S.wine.exp[i].label = x.trim(); if ((x = v('suXt' + i)) !== null) S.wine.exp[i].text = x.trim(); });
  }
  // "$15" / "15 $" for a fee, "Free" for 0.
  function feeText(n){ return n === 0 ? T.feeFree : C.lang === 'fr' ? money(n) + ' $' : '$' + money(n); }
  // A winery's one-of-a-few answers (data-wpick="visit:walk_in") and the group sizes.
  function wpicks(key, keys, labels, subs){ return '<div class="su-stack" role="group">' + keys.map(function(k){ var on = String(S.wine[key]) === String(k); return '<button type="button" class="su-big' + (on ? '' : ' su-alt') + '" aria-pressed="' + (on ? 'true' : 'false') + '" data-wpick="' + key + ':' + k + '"><span class="su-ico" aria-hidden="true">' + (on ? '✓' : '○') + '</span><span>' + h(labels[k]) + (subs && subs[k] ? '<small>' + h(subs[k]) + '</small>' : '') + '</span></button>'; }).join('') + '</div>'; }
  function wchips(key, keys, labels, aria){ return '<div class="su-chips" role="group" aria-label="' + h(aria) + '">' + keys.map(function(k){ var on = String(S.wine[key]) === String(k); return '<button type="button" class="su-chip' + (String(labels[k]).length > 8 ? ' su-chip-wide' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '" data-wpick="' + key + ':' + k + '">' + h(labels[k]) + '</button>'; }).join('') + '</div>'; }
  // The off-season answer as one line ("By appointment Nov 1 – Apr 30. Walk-ins Apr 1 – Oct 31.").
  function wSeasonText(se){ return se && se.from && se.to ? fill(T.apptNow, { a: mdLabel(se.from), b: mdLabel(se.to) }) : ''; }
  // Season months from "5-10".
  (function(){ var m = /^(\d+)-(\d+)$/.exec(CUR.open_months || ''); if (!m) return; var a = +m[1], b = +m[2], i = a; for (var n = 0; n < 12; n++) { S.months[i] = true; if (i === b) break; i = i % 12 + 1; } })();
  // "We're closed part of the year" (café test 2, 2026-11-11): the yearly open season with exact days, asked in the Hours
  // step. Stored in open_months as "04-25:10-12"; whole months stay "4-10" exactly as before.
  function openSeaOf(v){
    var m = /^(\d{1,2})-(\d{1,2})$/.exec(v || ''); if (m) return { from: pad2(+m[1]) + '-01', to: pad2(+m[2]) + '-' + MLAST[+m[2] - 1] };
    var x = /^(\d{2}-\d{2}):(\d{2}-\d{2})$/.exec(v || ''); return x ? { from: x[1], to: x[2] } : null;
  }
  function openVal(o){
    if (!o) return '';
    var a = +o.from.slice(0, 2), b = +o.to.slice(0, 2), whole = o.from.slice(3) === '01' && (+o.to.slice(3) === MLAST[b - 1] || (b === 2 && o.to.slice(3) === '28'));
    return whole && a !== b ? a + '-' + b : o.from + ':' + o.to;
  }
  function openText(o){ return o ? fill(T.openNow, { a: mdLabel(o.from), b: mdLabel(o.to) }) : ''; }
  S.openSea = openSeaOf(CUR.open_months); S.openTouched = false;
  // Seasonal hours (pub test 6, 2026-11-10): the first stored set, as its months and its own day-by-day week (it was one
  // time for the days already open in the usual week, so "open daily in summer" kept Mon and Tue closed). Stored the same
  // way as always (hours_seasons: { from, to, label, hours: { mon: [...], ... } }); older sets read back as they are.
  // Summer or winter: from its name, else from its months (July is summer, January winter).
  (function(){
    var s = (CUR.hours_seasons || [])[0]; if (!s) return;
    var a = +s.from.slice(0, 2), b = +s.to.slice(0, 2), i = a; S.sea.on = true;
    for (var n = 0; n < 12; n++) { S.sea.months[i] = true; if (i === b) break; i = i % 12 + 1; }
    S.sea.week = parseWeek(s.hours);
    // Exact days (pub test 7): a season that doesn't start on the 1st or end on a month's last day keeps its dates.
    var sf = seaFrom(s.from, s.to); if (sf.exact) S.sea.exact = sf.exact;
    var lab = String(s.label || '').toLowerCase();
    S.sea.kind = /summer|été|ete\b/.test(lab) ? 'summer' : /winter|hiver/.test(lab) ? 'winter' : S.sea.months[7] ? 'summer' : S.sea.months[1] ? 'winter' : 'summer';
    S.sea.storedKind = S.sea.kind;
  })();
  S.sea.monthsWas = JSON.stringify(S.sea.months); S.seaTouched = false;
  var SEA_MONTHS = { summer: [6, 7, 8], winter: [11, 12, 1, 2, 3, 4] };
  // The week the hours editor works on: the usual week, or the other season's own week on its own screen.
  function W(){ return S.step === 'hours:season' ? S.sea.week : S.week; }
  function HO(){ if (S.step === 'hours:season') { if (!S.sea.open) S.sea.open = {}; return S.sea.open; } return S.hoursOpen || (S.hoursOpen = {}); }
  // Closures: holidays are tiles, the rest are listed.
  var HOL = holidays();
  // A stored closure is a holiday tile only when its note is that holiday's own name (or empty): a note the owner wrote
  // ("Staff party") stays a row of its own, so saving again never rewrites it.
  function holNote(key){ return String(T.holidays[key]).replace(/[()&<>]/g, ''); }
  // Café test 6 (2026-11-12): a holiday's name is saved in English (the page shows it in its own language), so "Noël"
  // tapped on the French screen no longer shows as "Dec 25 (Noël)" on the English page. A note she typed is kept as is.
  function holEn(key){ var a = C.lang === 'fr' && C.holidayAlt && C.holidayAlt[key]; return a ? String(a).replace(/[()&<>]/g, '') : holNote(key); }
  function holKeep(key, n){ return n === holNote(key) ? holEn(key) : n; }
  S.holNotes = {};
  // Recurring holidays (pub fresh-eyes, 2026-11-10): Christmas Day, Boxing Day and New Year's Day are the same date every
  // year. A closure is stored as dates only (no repeat rule), so "This year and next" also saves next year's date; it
  // is on by default for these three. A stored next-year date of a ticked holiday is that choice, not a row of its own.
  S.everyYear = {};
  var holOk = function(key, note){ return !note || note === holNote(key) || note === String((C.holidayAlt || {})[key] || '').replace(/[()&<>]/g, ''); };
  var nextYear = HOL.filter(function(o){ return o.yearly; }).map(function(o){ return { key: o.key, date: o.next }; });
  var seenNext = {};
  (CUR.closures || []).forEach(function(c){ var n = nextYear.filter(function(x){ return x.date === c.from && (c.to || c.from) === c.from && holOk(x.key, c.note || ''); })[0]; if (n) seenNext[n.key] = true; });
  (CUR.closures || []).forEach(function(c){
    var nx = nextYear.filter(function(x){ return x.date === c.from && (c.to || c.from) === c.from && holOk(x.key, c.note || ''); })[0];
    if (nx && (CUR.closures || []).some(function(c2){ var t = HOL.filter(function(o){ return o.key === nx.key; })[0]; return t && c2.from === t.date; })) return;
    var hit = HOL.filter(function(x){ return x.date === c.from && (c.to || c.from) === c.from; })[0], note = c.note || '';
    if (hit && (!note || note === holNote(hit.key) || note === String((C.holidayAlt || {})[hit.key] || '').replace(/[()&<>]/g, ''))) { S.closures.push(hit.key); S.holNotes[hit.key] = note; if (hit.yearly) S.everyYear[hit.key] = !!seenNext[hit.key]; }
    else S.extra.push(c.yearly ? { from: c.from, to: c.to || c.from, note: note, yearly: true } : { from: c.from, to: c.to || c.from, note: note });
  });
  // Café test 4 (2026-11-11): a holiday inside closed dates already added ("Every year: Dec 25 – Jan 1", or a dated
  // range) is covered by them. Its tile shows ticked with "Covered by your closed dates" and no row of its own is saved
  // (the page listed Christmas Day three times). Yearly ranges may wrap over New Year.
  function coveredBy(date){ var md = String(date).slice(5); return S.extra.some(function(c){ var t = c.to || c.from; if (c.yearly) return c.from <= t ? md >= c.from && md <= t : md >= c.from || md <= t; return date >= c.from && date <= t; }); }
  // Bug-check (2026-11-12): a day outside the open season (open Apr 15 – Oct 15: Christmas, New Year's) is covered too.
  // saved (review fix 2026-11-12): the season the page has (CUR), never an unsaved draft one, when saving the holidays.
  function offSeason(date, saved){ var o = saved ? openSeaOf(CUR.open_months) : S.openSea; if (!o || !o.from || !o.to) return false; var md = String(date).slice(5); return o.from <= o.to ? md < o.from || md > o.to : md < o.from && md > o.to; }
  function holCovered(o, saved){ return coveredBy(o.date) || offSeason(o.date, saved); }
  function yearlyOn(key){ var o = HOL.filter(function(x){ return x.key === key; })[0]; return !!(o && o.yearly && S.everyYear[key] !== false); }
  function closuresKey(){ return JSON.stringify([S.closures.slice().sort(), S.closures.filter(yearlyOn).sort(), S.extra, monthRun(S.months)]); }
  // Happy hours. The rows exactly as they were typed here last time (kept by the server while the page still shows
  // what they made); otherwise rebuilt from the page: days with the same times are one happy hour, a deal that starts
  // with a row's days ("Tue, Wed, Thu: …") goes back into that row without the days, and any other deal on the page
  // (ours, with prices) is kept as it is. Nothing is ever cut short or joined together.
  S.happyKeep = [];
  // "Mon–Fri: …" (pub fresh-eyes, 2026-11-10: "Mon, Tue, Wed, Thu, Fri: …" read clunky). Runs of 3+ days become a range.
  // Deals saved before this used the long list; both are recognised, so old ones still come back as typed.
  function dayPrefix(e){
    var on = DAYS.map(function(d){ return !!e.days[d]; }), out = [], i = 0;
    while (i < 7) { if (!on[i]) { i++; continue; } var j = i; while (j + 1 < 7 && on[j + 1]) j++;
      if (j - i >= 2) out.push(dayName(DAYS[i]) + '–' + dayName(DAYS[j])); else for (var k = i; k <= j; k++) out.push(dayName(DAYS[k])); i = j + 1; }
    return out.join(', ') + ': ';
  }
  function oldPrefix(e){ return DAYS.filter(function(d){ return e.days[d]; }).map(dayName).join(', ') + ': '; }
  function prefixOf(e, text){ var a = dayPrefix(e), b = oldPrefix(e); return text.indexOf(a) === 0 ? a : text.indexOf(b) === 0 ? b : null; }
  (function(){
    if (CUR.happy_blocks && CUR.happy_blocks.length) {
      CUR.happy_blocks.forEach(function(b){ var days = {}; b.days.forEach(function(d){ days[d] = true; }); S.happy.push({ days: days, from: b.from, to: b.to, what: b.what, close: !!b.close }); });
      var mine = {}; S.happy.forEach(function(e){ if (e.what) { mine[(S.happy.length > 1 ? dayPrefix(e) : '') + e.what] = true; mine[(S.happy.length > 1 ? oldPrefix(e) : '') + e.what] = true; } });
      S.happyKeep = (CUR.happy_hour_deals && CUR.happy_hour_deals.deals ? CUR.happy_hour_deals.deals : []).filter(function(d){ return d.price || !mine[d.text]; });
      S.happyTyped = true; return;
    }
    var w = parseWeek(CUR.happy_hour); if (!w) return; var groups = {}, cl = happyCloseOf(CUR.happy_hour);
    // Until close (pub test 9): those windows are one row by their start, whatever each day's closing time is.
    DAYS.forEach(function(d){ (w[d] || []).forEach(function(x){ var c = !!(cl[d] && cl[d].indexOf(x[0]) >= 0), k = x[0] + '-' + (c ? 'close' : x[1]); if (!groups[k]) { groups[k] = { days: {}, from: x[0], to: x[1], what: '', close: c }; S.happy.push(groups[k]); } groups[k].days[d] = true; }); });
    var deals = CUR.happy_hour_deals && CUR.happy_hour_deals.deals ? CUR.happy_hour_deals.deals : [];
    deals.forEach(function(d){
      var hit = null;
      if (!d.price) {
        if (S.happy.length > 1) hit = S.happy.filter(function(e){ return !e.what && prefixOf(e, d.text); })[0];
        else if (S.happy.length === 1 && deals.length === 1) hit = S.happy[0];
      }
      if (hit) hit.what = S.happy.length > 1 ? d.text.slice(prefixOf(hit, d.text).length) : d.text; else S.happyKeep.push(d);
    });
  })();
  // Specials and weekly events: each row remembers the stored line it came from. A row the owner doesn't touch is sent
  // back exactly as stored (times, French, season and all); a changed one keeps what it can.
  // A long line cut between words when it was saved (café test 3): the title is 25+ characters without an end mark, and
  // the deal goes on in lower case. It reads back as the one line that was typed.
  function longCut(t, d){ t = String(t || ''); return t.length >= 25 && !/[.,;:!?)]$/.test(t) && /^[a-z0-9(]/.test(String(d || '')); }
  function daysKey(days){ return DAYS.filter(function(d){ return days[d]; }).join(','); }
  // Seasons (pub test 7, 2026-11-10): each special and event, and the happy hour, can run all year or only some months
  // (or exact days, "May 20 to Sep 6"). Stored as 'MM-DD' from/to like the specials' season_from/season_to.
  (CUR.specials || []).forEach(function(x){ var days = {}; (x.days || []).forEach(function(d){ days[d] = true; }); var text = x.deal && x.deal.indexOf(x.title) === 0 ? x.deal : x.title + (x.deal && x.deal !== x.title ? (longCut(x.title, x.deal) ? ' ' : ', ') + x.deal : '');
    // Pub test 8 (2026-11-10): a special's optional times ("Sunday brunch 10 AM to 1 PM"), the start/end it always had.
    var e = { days: days, text: text, price: x.price || '', start: x.start || '', end: x.end && x.end !== 'close' ? x.end : '', endClose: x.end === 'close', orig: x, sea: seaFrom(x.season_from, x.season_to) }; e.was = daysKey(days) + '|' + e.text + '|' + e.price + '|' + seaKey(e.sea) + '|' + e.start + '|' + e.end; S.specials.push(e); });
  (CUR.weekly_nights || []).forEach(function(x){ var days = {}; (x.days || []).forEach(function(d){ days[d] = true; }); var e = { days: days, kind: x.kind, what: x.title, start: x.start || '', orig: x, sea: seaFrom(x.season_from, x.season_to), appt: x.frequency === 'appointment' }; e.was = daysKey(days) + '|' + e.kind + '|' + e.what + '|' + e.start + '|' + seaKey(e.sea) + (e.appt ? '|appt' : ''); S.nights.push(e); });
  S.happySea = (function(){ try { var o = typeof CUR.happy_hour === 'string' ? JSON.parse(CUR.happy_hour) : CUR.happy_hour; var z = o && o._season; return seaFrom(z && z.from, z && z.to); } catch (e) { return seaFrom(); } })();
  S.happySeaWas = seaKey(S.happySea);
  S.closuresWas = closuresKey(); S.closuresSaved = S.closures.slice(); S.savedExtra = S.extra.length;

  // ---------- Holidays (the next date of each, from today) ----------
  function ymd(d){ return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function easter(y){ var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451), mo = Math.floor((hh + l - 7 * m + 114) / 31), da = ((hh + l - 7 * m + 114) % 31) + 1; return new Date(y, mo - 1, da); }
  function thirdMonday(y, mo){ return nthMonday(y, mo, 3); }
  // Every day but `d` is marked Closed (no hours yet): copying may fill them all.
  function othersClosed(d){ var w = W(); return !DAYS.some(function(x){ return x !== d && w && w[x]; }); }
  // Café test 4 (2026-11-11): days the owner marked Closed on this screen. "Every open day" never fills them, even on a
  // new page with no hours yet (where it fills every other day).
  function tapClosed(d, on){ S.closedTap = S.closedTap || {}; if (on) S.closedTap[S.step + d] = true; else delete S.closedTap[S.step + d]; }
  function copyGets(d, x){ var w = W(); return x !== d && (!!w[x] || (othersClosed(d) && !(S.closedTap || {})[S.step + x])); }
  function nthMonday(y, mo, nth){ var d = new Date(y, mo, 1); var n = 0; while (true) { if (d.getDay() === 1 && ++n === nth) return d; d.setDate(d.getDate() + 1); } }
  // Pub test 5 (2026-11-10): every BC stat holiday, not only Dec 24 to Easter Monday (Thanksgiving couldn't be entered).
  // Each one's next date from today, in date order; "This year and next" saves next year's own date (fn(year + 1): the
  // 2nd Monday of October, not the same day of the month). Café test 5 (2026-11-12): every tile has it, the eves (Dec 24,
  // Dec 31) too (Christmas Eve was the only December tile without "This year and next").
  function holidays(){
    var today = new Date(); today.setHours(0, 0, 0, 0); var y = today.getFullYear();
    var make = function(key, fn){ var d = fn(y); if (d < today) d = fn(y + 1); return { key: key, date: ymd(d), d: d, next: ymd(fn(d.getFullYear() + 1)), yearly: true }; };
    var list = [
      make('xmasEve', function(yy){ return new Date(yy, 11, 24); }), make('xmas', function(yy){ return new Date(yy, 11, 25); }), make('boxing', function(yy){ return new Date(yy, 11, 26); }),
      make('nye', function(yy){ return new Date(yy, 11, 31); }), make('nyd', function(yy){ return new Date(yy, 0, 1); }), make('family', function(yy){ return thirdMonday(yy, 1); }),
      make('goodFri', function(yy){ var e = easter(yy); return new Date(e.getFullYear(), e.getMonth(), e.getDate() - 2); }), make('easterMon', function(yy){ var e = easter(yy); return new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1); }),
      // Victoria Day: the Monday before May 25. Canada Day: July 1 (July 2 when the 1st is a Sunday).
      make('victoria', function(yy){ var d = new Date(yy, 4, 24); while (d.getDay() !== 1) d.setDate(d.getDate() - 1); return d; }),
      make('canada', function(yy){ var d = new Date(yy, 6, 1); return d.getDay() === 0 ? new Date(yy, 6, 2) : d; }),
      make('bcDay', function(yy){ return nthMonday(yy, 7, 1); }), make('labour', function(yy){ return nthMonday(yy, 8, 1); }),
      make('truth', function(yy){ return new Date(yy, 8, 30); }), make('thanks', function(yy){ return nthMonday(yy, 9, 2); }),
      make('remembrance', function(yy){ return new Date(yy, 10, 11); }),
    ];
    list.sort(function(a, b){ return a.d - b.d; });
    return list;
  }
  // The holiday tiles shown before "Show all holidays": the next few, plus any already ticked.
  var HOL_FEW = 6;
  // The date box opens on next month (closures are planned ahead; this month's wheel was the fiddly part).
  function nextMonth(){ var d = new Date(); return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 1)); }
  // Café test 1 (2026-11-11): the end date shown before Add ("Closed Tue, Jan 5 to Mon, Jan 18"), and the same date a year on.
  function lenEnd(cf){ if (!cf || S.addLen === 'pick') return ''; var d0 = new Date(cf + 'T12:00:00'); if (isNaN(d0)) return ''; d0.setDate(d0.getDate() + (+S.addLen - 1)); return ymd(d0); }
  function closeEnds(cf){ var e = lenEnd(cf); return !e ? '' : e === cf ? dateLabel(cf) : fill(T.closeEnds, { a: dateLabel(cf), b: dateLabel(e) }); }
  function plusYear(s){ var d = new Date(s + 'T12:00:00'); d.setFullYear(d.getFullYear() + 1); return ymd(d); }
  // A closure row (café test 2): "Every year: Apr 1 – Apr 24" for a yearly rule; a dated row shows its year when it isn't
  // this year ("Thu, Apr 1, 2027"), so two years of the same dates never read as a duplicate.
  function closureLabel(c){
    if (c.yearly) return fill(T.everyYearRow, { a: mdLabel(c.from), b: mdLabel(c.to || c.from) });
    var yr = function(d){ return d.slice(0, 4) !== String(new Date().getFullYear()) ? dateLabelY(d) : dateLabel(d); };
    return yr(c.from) + (c.to && c.to !== c.from ? ' – ' + yr(c.to) : '');
  }
  // « ven. 1er janv. » in French (café test 6), as the rest of the site writes the first of the month.
  function first1(t, s){ return C.lang === 'fr' && /-01$/.test(s) ? String(t).replace(/(^|\s)1(\s)/, '$11er$2') : t; }
  function dateLabelY(s){ var d = new Date(s + 'T12:00:00'); try { return first1(d.toLocaleDateString(C.lang === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }), s); } catch (e) { return s; } }
  function dateLabel(s){ var d = new Date(s + 'T12:00:00'); try { return first1(d.toLocaleDateString(C.lang === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'short', month: 'short', day: 'numeric' }), s); } catch (e) { return s; } }

  // ---------- Talking to the server ----------
  function post(url, body){
    var attempt = function(){
      return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) })
        .then(function(r){ if (r.status === 502 || r.status === 503 || r.status === 504) throw new Error('busy');
          // Bug-check (2026-11-12): too many saves in an hour says so kindly, in her language (nothing typed is lost).
          if (r.status === 429) return { ok: false, error: T.tooFast || T.failed, rateLimited: true };
          return r.json().catch(function(){ return { ok: false }; }); });
    };
    return attempt().catch(function(){ return new Promise(function(ok){ setTimeout(ok, 1500); }).then(attempt); }).catch(function(){ return { ok: false }; });
  }
  function why(j){
    var e = j && j.errors; if (e) { for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k) && typeof e[k] === 'string' && k !== 'visit_rows_key') return e[k]; }
    return (j && j.error) || T.failed;
  }
  function nothingChanged(j){ return !!(j && j.errors && j.errors.form && Object.keys(j.errors).length === 1 && C.nothing.some(function(x){ return j.errors.form.indexOf(x) >= 0; })); }
  // Café test 5 (2026-11-12): what this visit already sent, by field (by part for the fields the server merges), with how it
  // went. A save whose every part was already sent is not sent again (saving holidays re-sent "Yes, all year"; saving
  // unchanged answers came back 400 "nothing new to send"). Anything sent with a "we don't have" answer or the pub's
  // kitchen can change other fields on the server, so those forget what was sent.
  var MERGED = ['badges', 'cafe_info', 'pub_info', 'visit_rows', 'brewery_info'], sentMemo = {};
  function memoParts(changes){ var out = []; Object.keys(changes).forEach(function(k){ var v = changes[k]; if (MERGED.indexOf(k) >= 0 && v && typeof v === 'object' && !Array.isArray(v)) Object.keys(v).forEach(function(j){ out.push([k + '.' + j, JSON.stringify(v[j] === undefined ? null : v[j])]); }); else out.push([k, JSON.stringify(v === undefined ? null : v)]); }); return out; }
  // One save through /changes. -> 'live' | 'day' | null (error shown).
  function change(changes){
    if (changes.not_offered === 'ADD_DIETARY') changes = { not_offered: addNot('dietary') };
    // { add: [...], remove: [...] }: worked out from the list as it is when this save is sent (pubs, 2026-11-10).
    if (changes.not_offered && typeof changes.not_offered === 'object' && !Array.isArray(changes.not_offered)) {
      var ao = changes.not_offered, nl = S.notOffered.filter(function(z){ return (ao.remove || []).indexOf(z) < 0; });
      (ao.add || []).forEach(function(z){ if (nl.indexOf(z) < 0) nl.push(z); });
      if (nl.slice().sort().join() === S.notOffered.slice().sort().join()) return Promise.resolve('live');
      changes = { not_offered: nl };
    }
    var parts = memoParts(changes);
    if (parts.length && parts.every(function(x){ return sentMemo[x[0]] && sentMemo[x[0]].v === x[1]; })) return Promise.resolve(parts.some(function(x){ return sentMemo[x[0]].st === 'day'; }) ? 'day' : 'live');
    var remember = function(st){ if (changes.not_offered || changes.pub_info) sentMemo = {}; else parts.forEach(function(x){ sentMemo[x[0]] = { v: x[1], st: st }; }); return st; };
    return post(C.base + '/changes?from=setup', { changes: changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: started }).then(function(j){
      if (j && j.ok) { if (changes.not_offered) S.notOffered = changes.not_offered.slice(); if (changes.badges) Object.keys(changes.badges).forEach(function(b){ S.savedBadges[b] = !!changes.badges[b]; });
        if (changes.cafe_info && 'order' in changes.cafe_info) S.savedOrder = JSON.stringify(changes.cafe_info.order || null); if (changes.cafe_info && 'year' in changes.cafe_info) S.savedYear = changes.cafe_info.year || ''; if (changes.brewery_info && 'year' in changes.brewery_info) S.savedYear = changes.brewery_info.year || '';
        return remember(j.review && j.review.length ? 'day' : 'live'); }
      if (nothingChanged(j)) return remember('live');
      S.error = why(j); return null;
    });
  }
  // Records one answer. -> true, or false with the reason shown (never "Saved" on a save that didn't happen).
  function happyBlocks(){ return S.happy.map(function(e){ var b = { days: DAYS.filter(function(d){ return e.days[d]; }), from: e.from, to: e.to, what: (e.what || '').trim() }; if (e.close) b.close = true; return b; }); }
  function progress(step, status){ var body = { step: step, status: status }; if (step === 'happy' && status === 'live' && S.happyTyped) body.blocks = happyBlocks();
    return post(C.base + '/setup/progress', body).then(function(j){ if (j && j.ok) { S.done[step] = (j.progress && j.progress.done && j.progress.done[step]) || status; if (j.score) S.score = j.score; if (j.waiting) C.waiting = j.waiting; if (S.dirty === step) S.dirty = ''; drSaved(step); return true; } S.error = why(j); return false; }); }
  function record(step, status, then){ if (S.busy) return; S.busy = true; S.error = ''; render(); return progress(step, status).then(function(ok){ S.busy = false; if (!ok) return render(); if (then) then(); else go('saved:' + step); }); }
  // Help's "did it go through?": what we have right now, read from the server each time it is asked.
  // Brewery test 4 (2026-11-13): a status on its own line starts with a capital ("On your page").
  function capFirst(t){ t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
  function musicOftenWaiting(){ return !!CUR.weekly_nights_waiting && (C.nightsOften || []).some(Boolean) && (!C.waiting || C.waiting.indexOf('*') >= 0 || C.waiting.indexOf('music') >= 0); }
  function stText(step, d){
    // Winery test 1 (2026-11-12): a winery's story screen sends the story for a check but puts Known for on the page at
    // once, and "Booking and groups" puts the answers up at once while a new booking link waits: each row says both.
    if (C.winery && d === 'day' && step === 'story' && S.wine.known && T.stStoryKnown) return T.stStoryKnown;
    if (FOLD && d === 'day' && step === 'story' && S.brew.known && T.stStoryKnown) return T.stStoryKnown;
    if (FOLD && d === 'day' && step === 'groups' && T.stGroupsLink) return T.stGroupsLink;
    if (C.winery && d === 'day' && step === 'visit' && T.stVisitLink) return T.stVisitLink;
    // Cocktail test 3 (2026-11-14): events on the page while a how often sent from the edit page ("every other week") is
    // still waiting for our check. A setup events save puts it live (Dayton), and the row then says "on your page".
    if (step === 'music' && (d === 'live' || d === 'day') && T.stMusicOften && musicOftenWaiting()) return T.stMusicOften;
    if (d === 'day' && step === 'photos' && T.stDayPlural) return T.stDayPlural;
    // Winery test 5 (2026-11-12): "Instagram and Facebook · we’ll add it within a day" while Instagram was already live.
    if (d === 'day' && step === 'social' && S.done.instagram === 'live' && S.done.facebook === 'day' && T.stSocialIgLive) return T.stSocialIgLive;
    if (d === 'day' && step === 'social' && S.done.facebook === 'live' && S.done.instagram === 'day' && T.stSocialFbLive) return T.stSocialFbLive;
    return d === 'no' ? (T.noLabels[step] || T.st.no) : step === 'spend' && d === 'live' && !C.spendPublic && !CK ? T.stSoon : T.st[d]; }
  // Brewery test 1 (2026-11-12): a step answered "within a day" reads "on your page" once nothing it sent is still
  // pending (C.waiting: the server's list of steps with something pending now, refreshed with every save).
  function nowSt(k, d, waiting){ var w = waiting || C.waiting; return d === 'day' && w && w.indexOf('*') < 0 && w.indexOf(k) < 0 && !(k === 'social' && (w.indexOf('instagram') >= 0 || w.indexOf('facebook') >= 0)) ? 'live' : d; }
  function statusHtml(done, waiting){
    var rows = STEPS.filter(function(k){ return done[k] && done[k] !== 'skip'; }).map(function(k){ return '<li>' + h(cl(T.labels[k])) + h(stText(k, nowSt(k, done[k], waiting))) + '</li>'; }).join('');
    return '<p>' + T.helpYes + '</p>' + (rows ? '<ul>' + rows + '</ul>' : '<p>' + h(T.helpNone) + '</p>') + '<p>' + h(T.helpTail) + (done.spend === 'live' && !C.spendPublic && !CK ? ' ' + h(T.helpSpend) : '') + '</p>';
  }
  window.ohbLive = window.ohbLive || {};
  window.ohbLive['setup-status'] = function(lang, update){
    try { fetch(C.base + '/setup/progress', { headers: { 'Accept': 'application/json' }, credentials: 'same-origin', cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(j){ if (j && j.ok && j.progress && j.progress.done) { if (j.waiting) C.waiting = j.waiting; update(statusHtml(j.progress.done, j.waiting)); } }).catch(function(){}); } catch (e) {}
    return statusHtml(S.done);
  };
  // Runs saves one after another; any error stops and shows it.
  function saveAll(step, list, forced, to, onOk){
    if (S.busy) return;
    S.busy = true; S.error = ''; render();
    var statuses = [];
    var next = function(i){
      if (i >= list.length) {
        if (S.exitAfter && HALF.indexOf(step) >= 0 && !answered(step)) { S.busy = false; if (onOk) onOk(); return leave(); }
        // Nothing needed sending (all of it saved already): the step keeps the answer it had ("within a day" stays so).
        var st = forced || (statuses.indexOf('day') >= 0 || (!statuses.length && S.done[step] === 'day') ? 'day' : 'live');
        // Cocktail test 2 (2026-11-13): a step with something still pending (a new booking link) keeps "within a day" after a
        // save of something else on it (the Groups line), so its row keeps « nouveau lien de réservation d’ici un jour ».
        if (st === 'live' && !forced && S.done[step] === 'day' && C.waiting && C.waiting.indexOf(step) >= 0) st = 'day';
        return progress(step, st).then(function(ok){ S.busy = false; if (!ok) return render(); if (onOk) onOk(); go(to || 'saved:' + step); });
      }
      return change(list[i]).then(function(r){ if (!r) { S.busy = false; return render(); } statuses.push(r); return next(i + 1); });
    };
    next(0);
  }
  // "We don't serve food" also clears the food labels (the server does it with the answer); serving food again brings
  // the food question back, with Pub Fare picked to start (Dayton, Nov 10).
  function kitchenSaid(mode){
    var was = S.kitchen.mode; S.kitchen.mode = mode;
    // No food: the food question is answered too ("no food"), so Part 1 doesn't ask it again.
    if (mode === 'none') { S.cuis = []; if (S.done.cuisine !== 'no') progress('cuisine', 'no'); return; }
    if (was === 'none') { if (S.done.cuisine === 'no') delete S.done.cuisine; if (!S.cuis.length && !CK) S.cuis = ['Pub Fare']; }
  }
  // A pub that said "We don't serve food" and now picks its food: that answer goes (the kitchen question is asked again).
  function foodAgain(list){ if (C.pub && S.kitchen.mode === 'none') { list.unshift({ pub_info: { kitchen: null } }); S.kitchen.mode = ''; } return list; }
  function readMinors(){ var mt = el('suMto'), mn = el('suMnote'); if (mt) S.minors.until = mt.value; if (mn) S.minors.note = mn.value.trim(); }
  function addNot(key){ var l = S.notOffered.slice(); if (l.indexOf(key) < 0) l.push(key); return l; }

  // ---------- Navigation ----------
  function base(s){ return String(s).split(':')[0]; }
  // Part 1 (the essentials) is asked in order and ends on 'ess'; Part 2 is a menu ('more') of optional questions.
  function inP2(step){ return P2.indexOf(step) >= 0; }
  // Cafés (13 screens, 2026-11-11): holidays and closures are the second part of the Hours step (no number or row of their
  // own; the 'closures' answer is still recorded). Instagram and Facebook are one screen, 'social'.
  function sub(b){ return COMBO && b === 'closures'; }
  function isStep(b){ return STEPS.indexOf(b) >= 0 || sub(b); }
  function stepOf(b){ return sub(b) ? 'hours' : b; }
  // Café test 6 (2026-11-12): a café's Hours step is two parts (the hours, then holidays and closures). It only counts
  // as done once the closures part is saved or skipped; leaving on the closures screen used to show Hours ✓ and
  // "Carry on" went past the holidays. fin(k) is the step's answer as far as progress goes.
  // (Hours skipped or put off as a whole: nothing half-done, as before.)
  function half(k){ var d = S.done.hours; return COMBO && k === 'hours' && !!d && d !== 'skip' && d !== 'later' && !S.done.closures; }
  function fin(k){ return half(k) ? '' : S.done[k]; }
  function allDone(){ return STEPS.every(function(k){ return fin(k); }); }
  function p1Done(){ return P1.every(function(k){ return fin(k); }); }
  function p2Count(){ return P2.filter(function(k){ return fin(k); }).length; }
  function nextOf(step){ if (COMBO && step === 'hours') return 'closures'; step = stepOf(step); if (inP2(step)) return allDone() ? 'finish' : 'more'; var i = P1.indexOf(step); return P1[i + 1] || 'ess'; }
  // The hours part saved but not the holidays: carry on at the holidays and closures.
  function firstOpen(){ for (var i = 0; i < P1.length; i++) if (!fin(P1[i])) return half(P1[i]) ? 'closures' : P1[i]; return allDone() ? 'finish' : 'more'; }
  // Already ticked "Takes reservations" (or said how to order, or "Great for groups"): straight to "How do people book?".
  function entry(step){
    if (step === 'book' && (S.badges.takes_reservations || S.visit.reservations || CUR.booking_url)) return 'book:yes';
    if (step === 'takeout' && (S.badges.takeout || S.visit.takeout)) return 'takeout:yes';
    if (step === 'groups' && !FOLD && (S.badges.great_groups || S.visit.groups)) return 'groups:yes';
    if (step === 'season') return 'closures';
    return step;
  }
  // Tile and number steps keep their picks in memory, so they can still be saved from another screen ("Save and exit").
  var KEPT = ['offer', 'cuisine', 'closures', 'spend'];
  // Steps with several things on one screen: "Save and exit" keeps the picks but the step isn't done until its own
  // Save is tapped, so "Carry on" comes back to it (fresh-eyes 2026-11-10: a half-done closures step was skipped).
  var HALF = ['offer', 'cuisine', 'closures'];
  function answered(step){ var d = fin(step); return d === 'live' || d === 'day' || d === 'email' || d === 'no' || d === 'unsure'; }
  // Bug-check (2026-11-12): leaving for the other language (after "Save these first?" or photos sent) goes there instead.
  // Review fix (2026-11-12): only while that save-and-go is still on (S.exitAfter), or from the "Save these first?" box
  // itself (how.box); a save that failed or stopped clears S.langGo, so a later "I'm done for now" returns to the portal.
  // "Don't save" (how.drop) doesn't keep the dropped answers as a draft on the way.
  function leave(how){
    how = how || {};
    var lang = S.langGo && (S.exitAfter || how.box); S.langGo = false;
    if (lang && typeof window.suLangGo === 'function') { if (!how.drop) drSave(); navKeep(); S.leaving = true; if (window.suLangGo()) return; S.leaving = false; }
    S.leaving = true; location.href = C.back;
  }
  // Café test 5 (2026-11-12): no "Saved / Sent → Next" screens. A successful save says so in one ✓ line at the top of the
  // next question (role="status", so screen readers hear it) and moves straight on. The only one kept is the pubs'
  // "your description still talks about sports" screen after "What you offer": it carries a real choice.
  function savedKept(step){ return step === 'offer' && !CK && !S.badges.sports_tv && !S.storyFixed && !!sportsBit(); }
  // The text the story box started from: the story she sent (not checked yet), or the page's.
  function storyBase(){ return String(C.storyPending || storyCur()).trim(); }
  function storyWaiting(){ if (S.storySent) C.storyPending = S.storySent; }
  function savedText(step){
    var how = S.done[step], many = step === 'photos' && S.lastBatch > 1;
    var title = how === 'email' ? T.emailTitle2 : how === 'later' ? T.laterTitle : how === 'no' || how === 'unsure' ? T.gotIt : how === 'day' ? T.sentTitle : T.savedTitle;
    var line = S.savedLine[step] || (how === 'day' ? (many ? T.savedDayMany : T.savedDay) : how === 'email' ? T.savedEmail : how === 'later' ? T.savedLater : how === 'no' ? T.savedNo : T.savedLive);
    // The first "Sent" says what it means (pub fresh-eyes 2), once.
    if (how === 'day' && !S.sentExplained && !S.savedLine[step]) { S.sentExplained = step; line = many ? T.sentMeansMany : T.sentMeans; }
    return '✓ ' + String(title).replace(/[\s\u00a0\u202f]*[.!]$/, '') + '. ' + line;
  }
  var toastEl = document.createElement('p'); toastEl.id = 'suToast'; toastEl.className = 'su-toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
  screen.parentNode.insertBefore(toastEl, screen);
  // Shown on the screen it was made for, gone on the next one. Set a moment after the screen is drawn, so it is announced.
  // Brewery test 4 (2026-11-13): after a story is sent, the ✓ line also says "What we'll put on your page:" with her
  // words, on the next screen (no extra screen to tap through).
  function showToast(t){ var st = S.flashStory || ''; S.flashStory = ''; toastEl.textContent = ''; if (!t) return; setTimeout(function(){ toastEl.textContent = t;
    if (st && T.storySentAs) { var sp = document.createElement('span'); sp.className = 'su-toast-story'; sp.id = 'suStorySent'; sp.textContent = T.storySentAs + ' ' + st; toastEl.appendChild(sp); } }, 60); }
  function go(step, replace){
    var sv = /^saved:(.+)$/.exec(step);
    if (sv && !savedKept(sv[1])) { S.flash = savedText(sv[1]); S.flashStory = sv[1] === 'story' ? S.storySent || '' : ''; return after(sv[1]); }
    var fl = S.flash || ''; S.flash = '';
    step = entry(step); S.fresh = false;
    // Review fix (2026-11-12): saved on the way to the other language (photos sent first): she lands where she'd go next,
    // not back on the screen just saved.
    if (S.exitAfter) { if (S.langGo) S.step = step; return leave(); }
    if (S.dirty && base(step) !== S.dirty && KEPT.indexOf(S.dirty) < 0) S.dirty = ''; if (!replace) S.hist.push(S.step); S.step = step; S.error = ''; S.nudge = ''; S.flashOn = fl ? S.step : ''; render(); showToast(fl); window.scrollTo(0, 0); var f = screen.querySelector('h1'); if (f) { f.setAttribute('tabindex', '-1'); try { f.focus({ preventScroll: true }); } catch (e) {} } }
  function filled(step){
    if (step === 'happy' && S.done.happy === 'live' && S.happy.length) return 'happy:type';
    if (step === 'specials' && S.done.specials === 'live' && S.specials.length) return 'specials:type';
    if (step === 'music' && S.done.music === 'live' && S.nights.length) return 'music:yes';
    return step;
  }
  function mark(){ var b = base(S.step); if (isStep(b)) S.dirty = b; }
  function after(step){ if (step === 'story' && S.storyReturn) { var sr = S.storyReturn; S.storyReturn = ''; return after(sr); }
    // A café's hours always go on to its holidays and closures (the same step); where to after that is decided there.
    if (COMBO && step === 'hours') return go('closures'); if (S.toEss) { S.toEss = false; return go('ess'); } if (S.toList) { S.toList = false; S.hist = []; return go('start'); } if (S.toFinish) { S.toFinish = false; return go('finish'); } go(nextOf(step)); }
  // A picker whose picks were already sent: Back goes to the question before it (never "Send these 0 photos").
  function emptyPicker(st){ return (st === 'photos:review' && !S.photos.length) || (st === 'menu:upload' && !S.menuFiles.length && S.done.menu) || (st === 'menu:cam' && !S.menuPages.length && S.done.menu) || (/^(happy|specials):sheet$/.test(st) && !S.sheetFiles.length && S.done[base(st)]); }
  // Back goes to the previous question, never to a "Saved" screen (that question then shows what was sent).
  // Café test 5 (2026-11-12): Back with photos picked but not sent. Box ticked: they're sent first (then back). Not
  // ticked: one gentle line ("tap Back again to leave without them"); a second Back goes.
  el('suBack').onclick = function(){
    if (S.busy) return;
    if (S.step === 'photos:review' && goodPhotos().length) {
      if (S.rights) { S.backAfter = true; return sendPhotos(); }
      if (!S.backWarned) { S.backWarned = true; S.rightsAsk = true; render(); var tb = el('suTickBox'); if (tb) tb.scrollIntoView({ block: 'center' }); return; }
    }
    S.backWarned = false; goBack();
  };
  function goBack(){ var fl = S.flash || ''; S.flash = ''; var b = S.hist.pop(); while (b && (/^saved:/.test(b) || emptyPicker(b))) b = S.hist.pop(); if (!b) return; if (S.dirty && base(b) !== S.dirty && KEPT.indexOf(S.dirty) < 0) S.dirty = ''; S.step = b; S.error = ''; S.nudge = ''; S.flashOn = fl ? S.step : ''; render(); showToast(fl); }
  function bar(){
    var s = S.step, b = stepOf(base(s)), i = P1.indexOf(b), two = inP2(b) || s === 'more';
    // Part 2 is optional: no "0 of 11 done" and no bar (it made the optional part feel like homework).
    el('suProg').hidden = !(i >= 0 || (two && s !== 'more') || s === 'finish' || s === 'ess');
    el('suProgText').textContent = s === 'finish' ? (leftList().length || gapList().length ? T.finishBar : T.allDone) : s === 'ess' ? (P1.some(function(k){ return !answered(k); }) ? T.essBarNearly || T.essBar : T.essBar) : two ? T.moreQ + ' · ' + T.labels[b] : i >= 0 ? fill(T.step, { n: i + 1, total: P1.length }) + ' · ' + T.labels[b] : '';
    el('suProgBar').parentNode.hidden = two;
    el('suProgBar').style.width = (s === 'finish' || s === 'ess' ? 100 : Math.round(((i + 1) / (P1.length + 1)) * 100)) + '%';
    el('suBack').hidden = !S.hist.length || s === 'finish' || s === 'ess' || s === 'start' || S.busy;
  }

  // ---------- Pieces ----------
  function big(icon, text, sub, alt, act, attrs){ return '<button type="button" class="su-big' + (alt ? ' su-alt' : '') + '" data-act="' + act + '"' + (attrs || '') + '><span class="su-ico" aria-hidden="true">' + icon + '</span><span>' + h(text) + (sub ? '<small>' + h(sub) + '</small>' : '') + '</span></button>'; }
  // An answered question never offers "Skip this for now" (it used to turn a sent menu into "skipped"): it offers Next.
  function nextLabel(step){ if (step === 'story' && S.storyReturn) return nextLabel(S.storyReturn); if (COMBO && step === 'hours') return fill(T.nextStep, { step: T.labels.closures }); if (S.toEss) return T.seeFinish; if (S.toList) return T.backToList; var nx = S.toFinish ? 'finish' : nextOf(step); return nx === 'finish' ? T.finish : nx === 'ess' ? T.seeFinish : nx === 'more' ? T.backToMore : fill(T.nextStep, { step: T.labels[nx] }); }
  function skip(step){
    // Bug-check (2026-11-12): a café's hours saved but not its holidays: "Next: Holidays and closures", never "Skip".
    if (half(step)) return '<div class="su-stack" style="margin-top:14px">' + big('➜', nextLabel(step), '', true, 'after:' + step) + '</div>';
    // Unsaved answers brought back on this screen (a reload, a language switch): only the screen's own Save moves on.
    if (answered(step) && pending(step)) return '';
    if (answered(step)) return '<div class="su-stack" style="margin-top:14px">' + big('➜', nextLabel(step), '', true, 'after:' + step) + '</div>';
    return '<div class="su-skip"><button type="button" class="su-link" data-act="skip:' + step + '">' + h(T.skip) + '</button></div>';
  }
  function msgs(){ return (S.nudge ? '<p class="su-error" role="alert">' + h(S.nudge) + '</p>' : '') + (S.error ? '<p class="su-error" role="alert">' + h(S.error) + '</p>' : ''); }
  // Back on a question already answered: say so, and which answer we have.
  function doneLine(step){
    var d = S.done[step]; if (!d || d === 'skip' || d === 'later') return '';
    // Never "Saved" over answers that aren't saved yet (bug-check 2026-11-12: a language switch mid-edit).
    if (pending(step)) return '';
    // Winery test 1 (2026-11-12): a screen reached by moving on after a save already shows that save's "Saved" line, so
    // it never stacks a second "Saved. You can change it here." on top.
    if (S.flashOn && S.flashOn === S.step) return '';
    var yn0 = ['happy', 'specials', 'music', 'book', 'takeout', 'groups'].indexOf(step) >= 0;
    // Winery test 2 (2026-11-12): a screen opened from a list ("Tap any line to change it", the "More" tiles, the edit
    // page) wasn't just saved: no "Saved. You can change it here." on it (a "You said: ..." answer still shows).
    if ((S.toList || S.hist[S.hist.length - 1] === 'more') && d !== 'no' && d !== 'unsure' && !yn0) return '';
    var yn = ['happy', 'specials', 'music', 'book', 'takeout', 'groups'].indexOf(step) >= 0;
    if (d === 'unsure') return '<p class="su-sent">' + h(fill(T.youSaid, { a: T.st.unsure })) + '</p>';
    return '<p class="su-sent">' + h(d === 'no' ? fill(T.youSaid, { a: T.noLabels[step] || T.no }) : yn ? fill(T.youSaid, { a: T.yes }) : T.alreadyDone) + '</p>';
  }
  // Tap-first answers: chips that write the line for her (typing stays possible). A chip is "on" while its words are in the box.
  function has(v, t){ return String(v || '').toLowerCase().indexOf(String(t).toLowerCase()) >= 0; }
  // Winery test 5 (2026-11-12): a chip whose meaning the box already holds ("Patio only" when it says "on the patio")
  // isn't added again. Its telling words, without the ones every dogs line has.
  var QUICK_COMMON = { only: 1, and: 1, the: 1, at: 1, on: 1, to: 1, too: 1, our: 1, us: 1, welcome: 1, dogs: 1, dog: 1, et: 1, seulement: 1, a: 1, l: 1, d: 1, la: 1, le: 1, les: 1, aux: 1, au: 1, chiens: 1, chien: 1, bienvenus: 1 };
  function quickWords(t){ return String(t || '').toLowerCase().replace(/[’']/g, ' ').split(/[^a-z0-9à-ÿ]+/).filter(function(w){ return w && !QUICK_COMMON[w] && w !== 'à'; }); }
  function allIn(w, s){ var b = ' ' + quickWords(s).join(' ') + ' '; return !!w.length && w.every(function(x){ return b.indexOf(' ' + x + ' ') >= 0; }); }
  function rawWords(t){ return String(t || '').toLowerCase().replace(/[’']/g, ' ').split(/[^a-z0-9à-ÿ]+/).filter(Boolean); }
  // Cocktail test 3 (2026-11-14): sibs are the other chips of the same box. "Walk-ins only" and "Walk-ins welcome" share
  // their telling words, so for a sentence both could stand for, a chip counts only when the sentence has its own
  // difference word ("only", "welcome", « seulement »…). "Patio only" still counts for "Dogs welcome on the patio",
  // which no other dogs chip could stand for.
  function saysIt(v, t, sibs){
    if (has(v, t)) return true;
    var w = quickWords(t); if (!w.length) return false;
    var twins = (sibs || []).filter(function(o){ if (o === t) return false; var ow = quickWords(o); return w.every(function(x){ return ow.indexOf(x) >= 0; }) || ow.every(function(x){ return w.indexOf(x) >= 0; }); });
    if (twins.some(function(o){ return has(v, o); })) return false;
    return String(v || '').split(/[.;!?]+/).some(function(sn){
      if (!allIn(w, sn)) return false;
      var rs = rawWords(sn);
      return twins.every(function(o){
        if (!allIn(quickWords(o), sn)) return true;
        var ro = rawWords(o), diff = rawWords(t).filter(function(x){ return ro.indexOf(x) < 0; });
        return diff.every(function(x){ return rs.indexOf(x) >= 0; });
      });
    });
  }
  // Cocktail test 3 (2026-11-14): a Groups line in sentences. A "book ahead from N" sentence (a size), and the sentences
  // that carry a fact a size chip doesn't ("Private room for 20": a room, a capacity) and so are never dropped by a tap.
  function sentencesOf(v){ return String(v || '').split(/[.;!?]+(?:\s+|$)/).map(function(x){ return x.replace(/[\s.;]+$/, '').trim(); }).filter(Boolean); }
  function isSizeLine(x){ return /^(?:groups? of \d+|call ahead for \d+|book ahead for \d+|groupes de \d+|appelez à l’avance pour \d+)/i.test(String(x || '').trim()) || (!!T.groupsLine && new RegExp('^' + T.groupsLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{n\\}', '\\d+')).test(String(x || '').trim())); }
  function groupsFact(x){ return !isSizeLine(x) && (/\d/.test(x) || /\b(?:private|room|rooms|buyouts?|patio|semi|lounge|section|salle|privée?s?|privatis\w*|terrasse|mezzanine|loft)/i.test(x)); }
  // The facts of a line to keep under a new size line or quick answer, without what the chip itself says.
  function groupsKeep(v, t, sibs){ return sentencesOf(v).filter(function(x){ return groupsFact(x) && !(t && (has(x, t) || saysIt(x, t, sibs))); }); }
  // Cocktail test 2 (2026-11-13): in the French setup, a line filled in from the page that is in English ("Groups
  // welcome", "Recommended for dinner") says so, like the story box: « Ce texte est en anglais… ».
  function enLineHint(text, id){
    var t = String(text || '');
    if (C.lang !== 'fr' || !t.trim() || !T.lineEnglishHint) return '';
    var en = (t.match(/\b(?:the|and|with|from|our|its|of|is|for|to|on|at|only|welcome|recommended|ahead|book|booking|call|private|room|groups?|walk-ins?|dinner|lunch|brunch|menu|full|closes|winter|summer|patio|drinks?|kids|dogs|allowed|available|please)\b/gi) || []).length;
    if (!en || /\b(?:le|la|les|et|avec|nos|des|est|pour|du|au|aux|une?|groupes|bienvenus?|réserv\w*|salle|souper|dîner|seulement|terrasse|enfants|chiens)\b/i.test(t)) return '';
    return '<p class="su-hint su-enhint" id="' + id + '">' + h(T.lineEnglishHint) + '</p>';
  }
  function quick(key, boxId, value){
    var l = (T.quick || {})[key]; if (!l) return '';
    // Café test 4 (2026-11-11): only quick answers that fit. A takeout window gets window answers; a café with no patio
    // isn't offered "Patio only".
    if (key === 'dogs' && C.cafe) l = S.cafe.stay.seats === 'takeout' ? T.quickDogsWindow : S.badges.patio ? l : T.quickDogsNoPatio;
    // Breweries (2026-11-12): no "Patio only" for a taproom with no patio ticked.
    if (key === 'dogs' && C.brewery && !S.badges.patio && !S.badges.heated_patio && T.quickDogsNoPatio) l = T.quickDogsNoPatio;
    return '<p class="su-q">' + h(T.quickLead) + '</p><div class="su-chips" role="group" aria-label="' + h(T.quickLead) + '">' + l.map(function(t){ return '<button type="button" class="su-chip su-chip-wide" aria-pressed="' + (saysIt(value, t, l) ? 'true' : 'false') + '" data-quick="' + h(t) + '" data-box="' + boxId + '" data-key="' + key + '" data-sep="' + (key === 'takeout' ? ', ' : '. ') + '">' + h(t) + '</button>'; }).join('') + '</div><p class="su-q">' + h(T.quickOr) + '</p>';
  }
  function ex(x){ return '<p class="su-example">' + h(fill(T.example, { x: x })) + '</p>'; }
  // Café screens (2026-11-10): one-of-a-few answers (data-cpick) and on/off tiles (data-ctog) on S.cafe.
  function cget(path){ var p = path.split('.'); return S.cafe[p[0]][p[1]]; }
  function radios(path, keys, labels, subs){ return '<div class="su-stack" role="group">' + keys.map(function(k){ var on = cget(path) === k; return '<button type="button" class="su-big' + (on ? '' : ' su-alt') + '" aria-pressed="' + (on ? 'true' : 'false') + '" data-cpick="' + path + ':' + k + '"><span class="su-ico" aria-hidden="true">' + (on ? '✓' : '○') + '</span><span>' + h(labels[k]) + (subs && subs[k] ? '<small>' + h(subs[k]) + '</small>' : '') + '</span></button>'; }).join('') + '</div>'; }
  function ctile(path, icon, label){ var on = !!cget(path); return '<button type="button" class="su-tile" aria-pressed="' + (on ? 'true' : 'false') + '" data-ctog="' + path + '"><span class="su-e" aria-hidden="true">' + icon + '</span>' + h(label) + '</button>'; }
  function q(title, lead){ return '<h1>' + h(title) + '</h1>' + (lead ? '<p class="su-lead">' + h(lead) + '</p>' : ''); }
  function yesNo(step, title, lead, yesText, noText){ return doneLine(step) + q(title, lead) + msgs() + '<div class="su-stack">' + big('✓', yesText || T.yes, '', false, 'go:' + step + ':yes') + big('✕', noText || T.no, '', true, 'no:' + step) + '</div>' + skip(step); }
  function chips(obj, key, list, label){ return '<div class="su-chips" role="group" aria-label="' + h(label || '') + '">' + list.map(function(d){ return '<button type="button" class="su-chip" aria-pressed="' + (obj[d.k] ? 'true' : 'false') + '" data-chip="' + key + ':' + d.k + '">' + h(d.t) + '</button>'; }).join('') + '</div>'; }
  // Under a closing time after midnight: "= midnight" or "1 AM (early Saturday morning)" (pub fresh-eyes 2, 2026-11-10).
  function lateNote(d, y){
    var c = y && y[1]; if (!c) return '';
    if (c === '00:00' || c === '24:00') return T.midnightNote;
    if (!y[0] || c >= y[0]) return '';
    var nd = DAYS[(DAYS.indexOf(d) + 1) % 7], dn = (C.longDays || {})[nd] || dayName(nd);
    return fill(T.earlyNote, { t: t12(c), day: C.lang === 'fr' ? dn.toLowerCase() : dn });
  }
  // Folds an open day back into its one-line row (pub test 4).
  // Each day's Done says which day it is (pub test 7: with two days open, two identical "Done ✓" buttons were easy to mix up).
  // Full day names in sentences (pub test 8: "Same as Thu" beside "Same as Monday"); French in lower case ("Comme jeudi").
  function longDay(d){ var n = (C.longDays || {})[d] || dayName(d); return C.lang === 'fr' ? String(n).toLowerCase() : n; }
  function hoffUndo(d){ return !!(S.hoffWas && S.hoffWas[S.step + d]); }
  function hDone(d){ return '<button type="button" class="su-toggle su-hdone" data-hclose="' + d + '" aria-label="' + h(fill(T.hoursDoneDayAria, { day: (C.longDays || {})[d] || dayName(d) })) + '">' + h(T.hoursDoneDay) + '</button>'; }
  // "Closes at midnight or later?" Midnight · 1 AM · 2 AM: one tap sets that day's closing time.
  var LATE = ['00:00', '01:00', '02:00'];
  function lateBtns(d, j, y){
    var c = y[1] === '24:00' ? '00:00' : y[1];
    return '<div class="su-samerow su-laterow" role="group" aria-label="' + h(fill(T.lateQ, { day: dayName(d) })) + '"><span class="su-latelbl">' + h(T.lateLbl) + '</span>' + LATE.map(function(t){ return '<button type="button" class="su-toggle su-latebtn" aria-pressed="' + (c === t ? 'true' : 'false') + '" data-late="' + d + ':' + j + ':' + t + '">' + h(t12(t)) + '</button>'; }).join('') + '</div>';
  }
  function allDays(days){ return DAYS.every(function(d){ return days && days[d]; }); }
  function dayChips(obj, key){ return chips(obj, key, DAYS.map(function(d){ return { k: d, t: dayName(d) }; }), T.whichDays); }
  function monthChips(obj, key){ var l = []; for (var i = 1; i <= 12; i++) l.push({ k: i, t: monthName(i - 1) }); return chips(obj, key, l, T.whichMonths); }
  // Website shown as a plain domain ("tapsidepub.ca"), or "No website yet" / "You don't have a website".
  function siteDomain(u){ return String(u || '').trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, ''); }
  // "https://tapandbarrelkitchen.ca/" from "https://tapandbarrelkitchen.ca/?utm_source=okanaganroam#top" (pub test 9).
  function siteOrigin(u){ var t = String(u || '').trim(); if (!t) return ''; if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) t = 'https://' + t; var m = /^([a-z][a-z0-9+.-]*:\/\/[^\/?#\s]+)/i.exec(t); return m ? m[1] + '/' : ''; }
  // Brewery test 4 (2026-11-13): the website with its path ("https://example.com/lakesidelager/"), so a site under a path
  // keeps it; never a query or #fragment (tracked links). The origin when there's no path.
  function siteUrl(u){ var o = siteOrigin(u); if (!o) return ''; var t = String(u || '').trim(); if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) t = 'https://' + t; var m = /^[a-z][a-z0-9+.-]*:\/\/[^\/?#\s]+(\/[^?#\s]*)?/i.exec(t), path = m && m[1] ? m[1].replace(/^\/+/, '') : ''; if (!path) return o; return o + path + (/\/$/.test(path) || /\.[a-z0-9]{2,5}$/i.test(path) ? '' : '/'); }
  function siteHostOf(u){ return siteOrigin(u).replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, ''); }
  // A web address inside a line of text (pub test 9: "Book on OpenTable: opentable.ca/r/tap-and-barrel"): -> { url, rest } | null.
  function linkIn(t){
    var m = /(?:https?:\/\/|www\.)[^\s<>]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|ca|net|org|io|co|app|me|bar|pub|restaurant|menu|link|ly)\/[^\s<>]*/i.exec(String(t || ''));
    if (!m) return null; var url = m[0].replace(/[.,;:!)]+$/, '');
    var rest = (String(t).slice(0, m.index) + String(t).slice(m.index + url.length)).replace(/\s*[:\-–]\s*$/, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/^[\s,.:;\-–]+|[\s,:;\-–]+$/g, '').trim();
    return { url: url, rest: rest };
  }
  function siteOk(u){ var d = siteDomain(u); return /^[^\s\/]+\.[^\s\/]{2,}(\/\S*)?$/.test(d) && d.length <= 290; }
  // Phone (pub test 3, 2026-11-10): a new number goes on the page straight away; the server checks it is a real North
  // American number and writes it as 250-555-0123. The same digits typed another way are not a change.
  function digitsOf(v){ var d = String(v || '').replace(/\D/g, ''); return d.length === 11 && d.charAt(0) === '1' ? d.slice(1) : d; }
  function phoneChanged(v){ return digitsOf(v) !== digitsOf(CUR.phone) || (!String(v || '').trim()) !== !CUR.phone; }
  // Pub test 3 follow-up (2026-11-10): a new phone goes live straight away, but with a new address or website on the
  // same screen the step still says "Sent". Say which part is already on the page.
  function phoneSaved(ch){ S.savedLine.basics = ''; if (!ch || !ch.phone) return;
    var rest = ch.address != null && ch.website != null ? T.phoneRestBoth : ch.address != null ? T.phoneRestAddr : ch.website != null ? T.phoneRestSite : '';
    if (rest) S.savedLine.basics = T.phoneLiveNow + ' ' + rest;
    var d = digitsOf(ch.phone); CUR.phone = d.length === 10 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6) : ch.phone; S.phone = null; }
  // "facebook.com/gords", "m.facebook.com/gords", "fb.com/gords" (with or without https://) -> https://www.facebook.com/gords.
  // "instagram.com/velvetdoor", "https://www.instagram.com/velvetdoor/?hl=en" -> "@velvetdoor" (a profile, never a post or reel).
  function igFromSite(v){ var m = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\/([A-Za-z0-9._]{2,30})\/?(?:[?#]\S*)?$/i.exec(String(v || '').trim()); return m && !/^(?:p|reel|reels|explore|stories|accounts)$/i.test(m[1]) ? '@' + m[1] : ''; }
  function fbFromSite(v){ var m = /^(?:https?:\/\/)?(?:www\.|m\.|web\.)?(?:facebook|fb)\.com(\/\S*)$/i.exec(String(v || '').trim()); return m && m[1].length > 1 ? 'https://www.facebook.com' + m[1] : ''; }
  function fbKnown(){ return S.fb || CUR.facebook_url || ''; }
  function siteShown(){ return CUR.website ? siteDomain(CUR.website) : (S.notOffered.indexOf('website') >= 0 ? T.noWebsiteSaid : T.noWebsiteYet); }
  // Cocktail test 3 (2026-11-14): opts.sr keeps the label for screen readers only, when the heading just above says the same.
  function field(id, label, value, opts){ opts = opts || {}; return '<label class="' + (opts.sr ? 'su-sr' : 'su-q') + '" for="' + id + '">' + h(label) + '</label><input class="su-field" id="' + id + '" type="' + (opts.type || 'text') + '"' + (opts.mode ? ' inputmode="' + opts.mode + '"' : '') + (opts.max ? ' maxlength="' + opts.max + '"' : '') + ' value="' + h(value) + '" autocomplete="off"' + (opts.data ? ' ' + opts.data : '') + '>'; }
  function list(items){ return '<ul class="su-done-list">' + items + '</ul>'; }
  function statusRows(steps){
    return list(steps.map(function(s){
      var d = half(s) ? 'half' : nowSt(s, fin(s)) || 'none', k = d === 'live' || d === 'day' || d === 'no' || d === 'unsure' ? '✓' : d === 'email' ? '✉' : d === 'later' ? '🕓' : d === 'skip' ? '–' : '○';
      return '<li class="su-li-btn"><button type="button" class="su-rowbtn" data-act="edit:' + s + '"><span class="su-k su-k-' + d + '" aria-hidden="true">' + k + '</span><span>' + h(T.labels[s]) + ' <span class="su-dim">· ' + h(stText(s, d)) + '</span></span><span class="su-chev" aria-hidden="true">›</span></button></li>';
    }).join(''));
  }
  var TOP2 = C.top2 || ['happy', 'specials', 'music', 'story'];
  // After "What you offer": the follow-up screens, in this order (pubs: sports, dogs, then always "Who's welcome?").
  function offerNext(from){
    var seq = []; if (C.pub && !CK && S.badges.sports_tv) seq.push('offer:sports'); if (S.badges.dog_friendly) seq.push('offer:dogs'); if (C.pub || C.brewery) seq.push('offer:minors');
    return seq[(from === 'offer' ? -1 : seq.indexOf(from)) + 1] || null;
  }
  var P2_ICONS = { stay: '💻', order: '🛍️', diet: '🌱', coffee: '🫘', sellout: '⏰', happy: '🍻', spend: '🍽️', specials: '⭐', music: '🎸', story: '✍️', book: '📅', takeout: '🥡', known: '👍', groups: '👥', instagram: '📸', facebook: '📘', door: '📍', social: '📸', experiences: '🍇', menu: '🍷' };
  // Distillery test 3 (2026-11-13): a cocktail glass for a distillery's happy hour.
  // Cocktail test 1 (2026-11-13): a lounge's too.
  if (C.distillery || CK) P2_ICONS.happy = '🍸';
  // Café test 3 (2026-11-11): a café's weekly events get a calendar, not a guitar.
  if (C.cafe) P2_ICONS.music = '🗓️';
  // Distillery test 1 (2026-11-13): cocktails, not pints; tours, not a guitar.
  if (C.distillery) { P2_ICONS.happy = '🍹'; P2_ICONS.music = '🥃'; }
  // Breweries (2026-11-12): their menu is food, not a wine list.
  if (C.brewery) P2_ICONS.menu = '📖';
  // Cocktail lounges (2026-11-13): music and DJs.
  if (CK) P2_ICONS.music = '🎶';
  // "87 %" in French, as the line beside it says (café test 6).
  function pct(n){ return n + (C.lang === 'fr' ? '\u00a0%' : '%'); }
  function scoreBox(raise){
    var sc = S.score || { pct: 0, soon: 0, badge: 'none' };
    // Winery test 3 (2026-11-12): what was sent can lower the score (a short story replacing a long description): the
    // lower number is the one shown.
    if (sc.soon < sc.pct) sc = { pct: sc.soon, soon: sc.soon, badge: sc.badge };
    // Never "done" beside a bare low number: when things are on their way, the ring shows where the page will be.
    // One number only (two read as a grade): where the page will be once we add what was sent.
    if (sc.soon > sc.pct) return '<div class="su-score"><div class="su-ring" style="background:conic-gradient(#1E4F4C ' + sc.pct + '%, #C9A34A 0 ' + sc.soon + '%, #E5DED2 0)"><b>' + pct(sc.soon) + '</b></div><div><strong>' + h(fill(T.pctAbout, { n: sc.soon })) + '</strong><span>'
      + h(T.pctAboutSub) + '</span>' + (raise ? '<small>' + h(T.pctRaise) + '</small>' : '') + '</div></div>';
    return '<div class="su-score"><div class="su-ring" style="background:conic-gradient(#1E4F4C ' + sc.pct + '%, #E5DED2 0)"><b>' + pct(sc.pct) + '</b></div><div><strong>' + h(fill(T.pctNow, { n: sc.pct })) + '</strong><span>'
      + h(sc.pct >= 100 ? T.pctDone : raise ? T.pctRaise : T.niceWork) + '</span></div></div>';
  }
  function preview(){
    // Breweries (2026-11-12): the kind, the town and the flight price as the card shows it ("From $12").
    if (C.brewery) return '<p class="su-lead" style="margin-top:20px">' + h(T.howLooks) + '</p><div class="su-preview">' + (S.mainSrc || C.image ? '<img src="' + h(S.mainSrc || C.image) + '" alt="">' : '') + '<div><strong>' + h(C.name) + '</strong><p>'
      + h([S.place && CUR.place_type ? (C.placeShow || {})[S.place] || S.place : C.typeLabel, C.regionLabel, S.savedFlight === 0 ? T.feeCardFree : S.savedFlight != null ? fill(T.feeCard, { x: flightText(S.savedFlight) }) : ''].filter(Boolean).join(' · ')) + '</p></div></div>';
    // Cocktail lounges (2026-11-13): what they serve, the town and the cocktail price as the card shows it ("From $16").
    if (C.cocktail) return '<p class="su-lead" style="margin-top:20px">' + h(T.howLooks) + '</p><div class="su-preview">' + (S.mainSrc || C.image ? '<img src="' + h(S.mainSrc || C.image) + '" alt="">' : '') + '<div><strong>' + h(C.name) + '</strong><p>'
      + h([C.typeLabel, S.cuis.length ? S.cuis.map(function(c){ return (C.cuisineShow || {})[c] || C.cuisineNames[c] || c; }).join(' · ') : '', C.regionLabel, typeof S.savedCp === 'number' && S.savedCp <= (C.feeLiveMax || 40) ? fill(T.feeCard, { x: cpText(S.savedCp) }) : ''].filter(Boolean).join(' · ')) + '</p></div></div>';
    // Wineries (2026-11-12): the kind, the town and the tasting price as the card shows it.
    if (C.winery) return '<p class="su-lead" style="margin-top:20px">' + h(T.howLooks) + '</p><div class="su-preview">' + (S.mainSrc || C.image ? '<img src="' + h(S.mainSrc || C.image) + '" alt="">' : '') + '<div><strong>' + h(C.name) + '</strong><p>'
      + h([S.place ? (C.placeShow || {})[S.place] || S.place : C.typeLabel, C.regionLabel, S.savedFee === 0 ? T.feeCardFree : S.savedFee != null ? fill(T.feeCard, { x: feeText(S.savedFee) }) : ''].filter(Boolean).join(' · ')) + '</p></div></div>';
    return '<p class="su-lead" style="margin-top:20px">' + h(T.howLooks) + '</p><div class="su-preview">' + (S.mainSrc || C.image ? '<img src="' + h(S.mainSrc || C.image) + '" alt="">' : '') + '<div><strong>' + h(C.name) + '</strong><p>'
      // Café test 3 (2026-11-11): a café's kind comes first, as its page says it ("Bubble tea shop · Korean · Dessert", not
      // "Korean · Dessert · Bubble tea", which read like a Korean restaurant).
      + h([C.cafe && S.place ? (C.placeShow || {})[S.place] || C.placeNames[S.place] || S.place : '', S.cuis.length ? S.cuis.map(function(c){ return (C.cuisineShow || {})[c] || C.cuisineNames[c] || c; }).join(' · ') : C.cafe && S.place ? '' : C.typeLabel, !C.cafe && S.place && C.placeNames[S.place] ? C.placeNames[S.place] : '', C.regionLabel, S.done.spend && S.done.spend !== 'skip' && C.spendPublic ? (C.cafe ? fill(T.aPersonCafe, { n: money(S.spend), words: cafeWords() }) : fill(T.aPerson, { n: S.spend })) : ''].filter(Boolean).join(' · ')) + '</p></div></div>';
  }
  // Café test 6 (2026-11-12): reopening the Hours step showed only the usual week, and an owner with summer hours
  // feared they were lost. One line per saved season: "Summer (Jun–Sep): 7 AM – 3 PM every day ✓". No new question.
  function weekShort(w, sep){
    var txt = DAYS.map(function(d){ var x = w && w[d]; return x ? x.map(function(y){ return t12(y[0]) + ' – ' + t12(y[1]); }).join(', ') : ''; });
    if (txt.every(function(t){ return t === txt[0]; })) return txt[0] ? fill(T.everyDayHours, { t: txt[0] }) : T.closed;
    var out = [], i = 0;
    while (i < 7) { var j = i; while (j + 1 < 7 && txt[j + 1] === txt[i]) j++; out.push((j > i ? dayName(DAYS[i]) + '–' + dayName(DAYS[j]) : dayName(DAYS[i])) + ' ' + (txt[i] || String(T.closed).toLowerCase())); i = j + 1; }
    return out.join(sep || ' · ');
  }
  // Winery test 5 (2026-11-12): after saving, one line with every set of hours ("Summer: 11 AM – 5 PM every day · Winter
  // (Nov–Apr): Mon–Thu closed, Fri–Sun Noon – 4 PM"), so both seasons are checked at a glance.
  function hoursRecap(){
    var parts = [], kinds = [];
    (CUR.hours_seasons || []).forEach(function(sz){ var x = seasonInfo(sz); if (x) { parts.push(x.kw + ' (' + x.range + ')' + (C.lang === 'fr' ? '\u00a0: ' : ': ') + weekShort(x.w, ', ')); kinds.push(x.kind); } });
    var w = S.week; if (!w || !DAYS.some(function(d){ return w[d] && w[d].length; })) return '';
    var other = kinds.length && kinds.every(function(k){ return k === 'winter'; }) ? 'summer' : kinds.length && kinds.every(function(k){ return k === 'summer'; }) ? 'winter' : '';
    var ul = other ? String((T.seasonWord || {})[other] || other) : '';
    var lead = kinds.length ? (ul ? ul.charAt(0).toUpperCase() + ul.slice(1) : T.recapRest) : T.recapHours;
    // Distillery test 2 (2026-11-13): the walk-in season and "by appointment the rest of the year" (or the open dates of a
    // place closed part of the year) go with the hours: « Ven–Dim 12 h – 17 h (1 juin – 30 sept.) · sur rendez-vous le reste de l’année ».
    var per = '';
    if (APPT && S.wine && S.wine.year === 'appointment' && S.wine.season && S.wine.season.from && S.wine.season.to) per = ' ' + fill(T.recapAppt, { a: mdLabel(S.wine.season.from), b: mdLabel(S.wine.season.to) });
    else if (S.openSea && S.openSea.from && S.openSea.to && /^\d{2}-\d{2}$/.test(S.openSea.from) && /^\d{2}-\d{2}$/.test(S.openSea.to)) per = ' ' + fill(T.recapOpen, { a: mdLabel(S.openSea.from), b: mdLabel(S.openSea.to) });
    parts.unshift(lead + (C.lang === 'fr' ? '\u00a0: ' : ': ') + weekShort(w, ', ') + per);
    return '<p class="su-hint" id="suHoursRecap">' + h(parts.join(' · ')) + '</p>';
  }
  function seasonInfo(sz){
      if (!sz || !/^\d{2}-\d{2}$/.test(sz.from || '') || !/^\d{2}-\d{2}$/.test(sz.to || '')) return null;
      var w = parseWeek(sz.hours); if (!w) return null;
      var lab = String(sz.label || '').toLowerCase(), a = +sz.from.slice(0, 2), b = +sz.to.slice(0, 2), da = +sz.from.slice(3), db = +sz.to.slice(3);
      var kind = /summer|été|ete\b/.test(lab) ? 'summer' : /winter|hiver/.test(lab) ? 'winter' : (a <= b ? a <= 7 && 7 <= b : !(b < 7 && 7 < a)) ? 'summer' : 'winter';
      var kw = String((T.seasonWord || {})[kind] || kind); kw = kw.charAt(0).toUpperCase() + kw.slice(1);
      var last = new Date(2025, b, 0).getDate();
      var md2 = function(m, d, show){ return !show ? monthName(m - 1) : mdLabel(('0' + m).slice(-2) + '-' + ('0' + d).slice(-2)); };
      return { kind: kind, kw: kw, w: w, range: md2(a, da, da > 1) + '–' + md2(b, db, db < last) };
  }
  function seasonLines(){
    return (CUR.hours_seasons || []).map(function(sz){
      if (!sz || !/^\d{2}-\d{2}$/.test(sz.from || '') || !/^\d{2}-\d{2}$/.test(sz.to || '')) return '';
      var w = parseWeek(sz.hours); if (!w) return '';
      var lab = String(sz.label || '').toLowerCase(), a = +sz.from.slice(0, 2), b = +sz.to.slice(0, 2), da = +sz.from.slice(3), db = +sz.to.slice(3);
      var kind = /summer|été|ete\b/.test(lab) ? 'summer' : /winter|hiver/.test(lab) ? 'winter' : (a <= b ? a <= 7 && 7 <= b : !(b < 7 && 7 < a)) ? 'summer' : 'winter';
      var kw = String((T.seasonWord || {})[kind] || kind); kw = kw.charAt(0).toUpperCase() + kw.slice(1);
      var last = new Date(2025, b, 0).getDate();
      var md2 = function(m, d, show){ return !show ? monthName(m - 1) : mdLabel(('0' + m).slice(-2) + '-' + ('0' + d).slice(-2)); };
      var range = md2(a, da, da > 1) + '–' + md2(b, db, db < last);
      return '<p class="su-sent su-seasonnow su-seahours">' + h(fill(T.seasonHoursLine, { kind: kw, range: range, hours: weekShort(w) })) + '</p>';
    }).join('');
  }
  function weekRows(w){ return '<div class="su-box">' + DAYS.map(function(d){ var x = w && w[d]; return '<div><span>' + h(dayName(d)) + '</span><span>' + (x ? x.map(function(y){ return t12(y[0]) + ' – ' + t12(y[1]); }).join(', ') : h(T.closed)) + '</span></div>'; }).join('') + '</div>'; }

  // What is left to reach 100%: the setup's own open steps, plus anything the portal's checklist still asks for (so the
  // two always agree). Each is a button that opens the step that answers it.
  var ITEM_STEP = { arrival: 'door', photo_main: 'photos', photo_extra: 'photos', menu: 'menu', happy_hour: 'happy', specials: 'specials', entertainment: 'music', description: 'story', pyv_reservations: 'book',
    pyv_takeout: 'takeout', pyv_known: 'known', pyv_groups: 'groups', instagram: 'instagram', facebook: 'facebook', hours: 'hours', hours_fresh: 'hours', avg_spend: 'spend', cuisine: 'cuisine', dietary: 'offer', address_pin: 'basics', phone: 'basics',
    kitchen: 'hours:kitchen', sports: 'offer:sports', games: 'offer', minors: 'offer:minors',
    cafe_kind: 'cuisine', season: 'hours:year', serves: 'cuisine:serve', stay: 'stay', wifi: 'offer', dogs_kids: 'offer', ordering: 'order' };
  // "Optional: weekly specials, weekly events, your story and more": only Part 2 items not done yet (never happy hour
  // right after she did it).
  function moreSub(){
    // Facebook and Instagram are always named while open (pub test 3, 2026-11-10: they're what owners care about).
    var open = P2.filter(function(k){ return !answered(k) && !(C.pub && (k === 'book' || k === 'takeout')); });
    var social = open.filter(function(k){ return k === 'facebook' || k === 'instagram'; }), other = open.filter(function(k){ return social.indexOf(k) < 0; });
    // A café's one Instagram and Facebook screen keeps its capitals too.
    if ((C.cafe || C.winery || C.brewery || C.cocktail) && other.indexOf('social') >= 0) { social.push('social'); other = other.filter(function(k){ return k !== 'social'; }); }
    var shown = other.slice(0, Math.max(1, 3 - social.length)), open2 = shown.map(function(k){ return String(T.labels[k]).toLowerCase().replace(/\bdj(s?)\b/g, 'DJ$1'); }).concat(social.map(function(k){ return T.labels[k]; }));
    if (!open2.length) return '';
    return cl(T.optional) + open2.join(', ') + (open.length > shown.length + social.length ? ' ' + T.andMore : '');
  }
  function leftList(){
    var out = [], seen = {};
    // Never an item she already answered or sent (pub fresh-eyes, 2026-11-10: Takeout ticked on "What you offer" and a
    // Facebook name sent were still listed).
    var tickedBy = { book: 'takes_reservations', takeout: 'takeout', groups: 'great_groups' };
    STEPS.forEach(function(k){
      if (fin(k) && fin(k) !== 'skip' && fin(k) !== 'later') return;
      if (k === 'spend' && S.spendNotSure) return; // "Not sure? Skip": not asked again on this screen
      if (tickedBy[k] && S.badges[tickedBy[k]]) return;
      if (C.pub && (k === 'book' || k === 'takeout')) return; // not part of a pub's score
      seen[k] = true; out.push({ step: k, label: T.labels[k] });
    });
    ((S.score && S.score.left) || []).forEach(function(it){ var st = ITEM_STEP[it.k], chk = st, lab = C.lang === 'fr' ? it.fr : it.en; if (COMBO && (it.k === 'instagram' || it.k === 'facebook')) { st = 'social'; lab = T.labels.social; } if (itemStep(it.k)) st = chk = itemStep(it.k); if (COMBO && st === 'closures') st = chk = 'hours'; if (!st || seen[st] || (st === 'spend' && S.spendNotSure)) return; if (chk.indexOf(':') < 0 && answered(chk) && !C.brewery) return; if (tickedBy[st] && S.badges[tickedBy[st]]) return; seen[st] = true; out.push({ step: st, label: lab }); });
    return out;
  }
  // Winery test 2 (2026-11-12): setup ended below 100% with nothing left to answer (a story under 120 letters): the items
  // the score still misses, each with a way to fix it, instead of "Everything is done!" beside 95%.
  function gapList(){
    var sc = S.score || {}; if (leftList().length || Math.max(sc.pct || 0, sc.soon || 0) >= 100) return [];
    var out = [], seen = {};
    (sc.left || []).forEach(function(it){ var st = itemStep(it.k) || ITEM_STEP[it.k]; if (!st || seen[st] || STEPS.indexOf(st.split(':')[0]) < 0) return; seen[st] = true; out.push({ step: st, label: C.lang === 'fr' ? it.fr : it.en }); });
    return out;
  }
  // One "To reach 100%" row (pub test 3, 2026-11-10). The front door says it waits for a visit; the average spend, when
  // our research has one, asks "About $24 a person?" Yes / No, change it (Yes saves that number as hers).
  function spendGuess(){ return CUR.avg_spend && CUR.avg_spend.source === 'research' && CUR.avg_spend.amount ? CUR.avg_spend.amount : 0; }
  function leftItem(o){
    if (o.step === 'door' || o.step === 'door:photo') return big('➜', o.label, fill(T.doorNextTime, { type: C.typeWord }), true, 'jump:' + o.step);
    if (o.step === 'spend' && !CK && spendGuess()) {
      var n = spendGuess();
      return '<div class="su-day su-spendask" id="suSpendAsk"><p class="su-q" style="margin-top:0">' + h(fill(T.spendAsk, { n: n })) + '</p><p class="su-hint">' + h(T.spendAskSub) + '</p><div class="su-stack">'
        + big('✓', fill(T.spendAskYes, { n: n }), '', false, 'spendConfirm') + big('✎', T.spendAskNo, '', true, 'jump:spend') + '</div>'
        // Pub test 4 (2026-11-10): "Not sure? Skip" leaves the question open: no change to the score, and this screen
        // doesn't ask again (it's still under "More about your place").
        + '<div class="su-skip" style="margin-top:10px"><button type="button" class="su-link" data-act="spendSkip">' + h(T.spendSkip) + '</button></div></div>';
    }
    return big('➜', o.label, S.done[o.step] === 'later' ? T.laterSub : '', true, 'jump:' + o.step);
  }
  // ---------- "Exit setup" with answers not saved yet: "Save these first?" ----------
  function unsaved(){ return !!(S.dirty || S.photos.length || S.menuFiles.length || S.menuPages.length || S.sheetFiles.length); }
  function exitAction(){
    var st = S.step, b = base(st);
    var here = { 'hours:edit': 'hoursSave', 'hours:season': 'hoursSave', 'hours:year': 'hoursSave', 'basics:edit': 'basicsSave', 'happy:type': 'happySave', 'specials:type': 'specialsSave', 'music:yes': 'musicSave', story: 'storySave', 'book:yes': 'lineSave:book:reservations',
      'takeout:yes': 'lineSave:takeout:takeout', 'groups:yes': 'lineSave:groups:groups', known: 'lineSave:known:known_for', 'offer:dogs': 'dogSave', instagram: 'socialSave:instagram', facebook: 'socialSave:facebook', social: 'socialBoth',
      'menu:web': 'menuWebSave', 'menu:social': 'menuSocialSave', 'happy:web': 'sheetWebSave:happy', 'specials:web': 'sheetWebSave:specials', 'photos:review': 'sendPhotos', 'menu:upload': 'sendMenuFiles', 'menu:cam': 'sendMenuPages',
      'happy:sheet': 'sendSheet:happy', 'specials:sheet': 'sendSheet:specials', 'closures:add': 'closureAddSave', 'closures:months': 'monthsUseSave', 'hours:open': 'openSave:keep',
      'hours:kitchentime': 'kitchenSave', 'offer:sports': 'sportsSave', 'offer:minors': 'minorsSave',
      winery: 'winerySave', tastings: 'tastingsSave', visit: 'visitSave', experiences: 'expSave', 'hours:appt': 'apptSave',
      taproom: 'taproomSave', flights: 'flightsSave', groups: FOLD ? 'brewGroupsSave' : undefined,
      'cuisine:serve': 'serveSave', 'offer:laptops': 'laptopSave', stay: 'staySave', order: 'orderSave', diet: 'dietSave', coffee: 'coffeeSave', sellout: 'selloutSave' }[st];
    if (here) return here;
    var d = S.dirty || b;
    if (d === 'offer') return 'offerSave'; if (d === 'closures') return 'closuresSave'; if (d === 'spend') return CK ? 'cpriceSave' : 'spendSave'; if (d === 'cuisine') return 'cuisineExit';
    if (S.photos.length) return 'sendPhotos'; if (S.menuPages.length) return 'sendMenuPages'; if (S.menuFiles.length) return 'sendMenuFiles';
    return '';
  }
  function askExit(){
    var old = el('suExitBox'); if (old) old.parentNode.removeChild(old);
    // Added above the question without redrawing it, so nothing typed on the screen is lost.
    screen.insertAdjacentHTML('afterbegin', '<div class="su-exitbox" id="suExitBox" role="alertdialog" aria-labelledby="suExitQ"><h2 id="suExitQ" tabindex="-1">' + h(T.exitQ) + '</h2><p>' + h(T.exitLead) + '</p><div class="su-stack">'
      + '<button type="button" class="su-big" id="suExitSave"><span class="su-ico" aria-hidden="true">✓</span><span>' + h(T.exitSave) + '</span></button>'
      + '<button type="button" class="su-big su-alt" id="suExitDrop"><span class="su-ico" aria-hidden="true">✕</span><span>' + h(T.exitDrop) + '</span></button></div>'
      + '<div class="su-skip"><button type="button" class="su-link" id="suExitStay">' + h(T.exitStay) + '</button></div></div>');
    window.scrollTo(0, 0); try { el('suExitQ').focus({ preventScroll: true }); } catch (e) {}
    // "Don't save": what was typed on this step is dropped here too.
    el('suExitDrop').onclick = function(){ drDrop(base(S.step)); leave({ box: true, drop: true }); };
    el('suExitStay').onclick = function(){ S.langGo = false; var b2 = el('suExitBox'); if (b2) b2.parentNode.removeChild(b2); };
    el('suExitSave').onclick = function(){
      if (S.busy) return; var a = exitAction(); if (!a) return leave({ box: true });
      S.exitAfter = true; act(a);
      // Something still needs fixing (a missing tick, an empty box): the reason is on the screen, and we stay.
      if (!S.busy && !S.leaving) { S.exitAfter = false; S.langGo = false; }
    };
  }
  el('suExit').onclick = function(e){ if (S.busy) { e.preventDefault(); return; } S.langGo = false;
    // Café test 5 (2026-11-12): photos picked with the rights box ticked are sent on the way out (then the page is left).
    if (S.step === 'photos:review' && goodPhotos().length && S.rights) { e.preventDefault(); S.exitAfter = true; return sendPhotos(); }
    if (unsaved()) { e.preventDefault(); askExit(); } };
  // Interrupted (another app, the phone locked) with photos picked and the box ticked: they're sent right away, so
  // nothing picked is lost. Unticked, nothing is sent without her say-so (the photos wait on the screen).
  document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden' && S.step === 'photos:review' && S.rights && !S.busy && goodPhotos().length) sendPhotos(); });


  // ---------- Unsaved answers kept on this device (café test 3, 2026-11-11) ----------
  // Leaving or reloading lost what was typed on a step (seven days of hours, a price). Each step's unsaved answers are
  // kept in sessionStorage (this tab only), keyed by the link and the step, and come back when the owner returns to that
  // step; a successful save clears them. Only what changed is kept, each with the value it replaced: when the page
  // has changed since (saved from another screen or the edit page), that answer is left as the page has it. Typed
  // boxes not read yet are kept by screen. Every storage access is in try/catch (private mode, blocked storage).
  var DRAFT_KEYS = ['week', 'sea', 'openSea', 'openTouched', 'seaTouched', 'hoursOpen', 'months', 'closures', 'extra', 'everyYear', 'holNotes', 'cuis', 'place', 'cuiTouched', 'spend',
    'badges', 'noDogs', 'noWash', 'noWifi', 'noSports', 'noGames', 'noDiet', 'dogNote', 'story', 'visit', 'ig', 'fb', 'socNo', 'cafe', 'wine', 'brew', 'kitchen', 'minors', 'sports', 'happy', 'happySea', 'specials', 'nights', 'cp'];
  var DR = { base: {}, s: {}, at: {}, last: '', restored: {} };
  // True while answers kept on this device (not saved yet) are shown on the step's screens.
  function pending(step){ return S.dirty === step && !!DR.restored[step]; }
  // The same key on the English and French addresses (café test 6): switching language keeps what was typed.
  function drKey(b){ return 'suDraft:' + String(C.base).replace(/^\/fr(?=\/owner\/)/, '') + ':' + b; }
  function drGet(b){ try { var v = window.sessionStorage.getItem(drKey(b)); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function drPut(b, d){ try { window.sessionStorage.setItem(drKey(b), JSON.stringify(d)); } catch (e) {} }
  function drDrop(b){ try { window.sessionStorage.removeItem(drKey(b)); } catch (e) {} }
  function js(v){ return v === undefined ? '~' : JSON.stringify(v); }
  function isObj(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
  function drSnap(){ var o = {}; DRAFT_KEYS.forEach(function(k){ o[k] = S[k] === undefined ? undefined : clone(S[k]); }); return o; }
  // { 'badges.wifi': { was, now }, spend: { was, now } } (JSON strings) for what differs from the step's start.
  function drDiff(b0){
    var out = {};
    DRAFT_KEYS.forEach(function(k){
      var a = b0[k], c = S[k];
      if (isObj(a) && isObj(c)) { var ks = {}; Object.keys(a).concat(Object.keys(c)).forEach(function(j){ ks[j] = 1; }); Object.keys(ks).forEach(function(j){ var x = js(a[j]), y = js(c[j]); if (x !== y) out[k + '.' + j] = { was: x, now: y }; }); }
      else { var x2 = js(a), y2 = js(c); if (x2 !== y2) out[k] = { was: x2, now: y2 }; }
    });
    return out;
  }
  // A box on the screen by its id or its first data- attribute.
  function drSel(inp){
    if (inp.id) return '[id="' + inp.id + '"]';
    for (var i = 0; i < inp.attributes.length; i++) { var a = inp.attributes[i]; if (/^data-/.test(a.name)) return '[' + a.name + '="' + String(a.value).replace(/"/g, '\\"') + '"]'; }
    return '';
  }
  function drBoxes(){ return screen.querySelectorAll('input[type=text], input[type=tel], input[type=url], input[type=email], input[type=time], input[type=number], input[type=search], input:not([type]), textarea, select'); }
  function drChanged(inp){
    if (inp.tagName !== 'SELECT') return inp.value !== inp.defaultValue;
    var di = 0; for (var i = 0; i < inp.options.length; i++) if (inp.options[i].defaultSelected) { di = i; break; }
    return inp.selectedIndex !== di;
  }
  // Saves the current step's unsaved answers (or drops them when nothing differs).
  function drSave(){
    if (S.leaving) return;
    var b = base(S.step); if (!isStep(b) || !DR.base[b]) return;
    // What's typed in the time and deal boxes, as the screen's own Save reads it (so "Are these your hours?" shows them).
    try { if (S.step === 'hours:edit' || S.step === 'hours:season') readTimes(); if (/^(happy|specials):type$|^music:yes$/.test(S.step)) readEntries(); if (C.cafe) readCafe(); if (C.winery) readWine(); if (C.brewery) readBrew(); } catch (e) {}
    var d = drGet(b) || { s: {}, boxes: {} };
    d.s = drDiff(DR.base[b]);
    var bx = {}; Array.prototype.forEach.call(drBoxes(), function(inp){ if (inp.id === 'suCq' || !drChanged(inp)) return; var sel = drSel(inp); if (sel) bx[sel] = inp.value; });
    d.boxes = d.boxes || {}; if (Object.keys(bx).length) d.boxes[S.step] = bx; else delete d.boxes[S.step];
    if (!Object.keys(d.s).length && !Object.keys(d.boxes).length) return drDrop(b);
    drPut(b, d);
  }
  // After a screen is drawn. Entering a step: its starting point (as drawn, so a screen that adds an empty row compares
  // like with like). Once per page load: its kept answers that the page still matches, then the screen again. Each time
  // the screen is entered: the boxes typed on it but not saved.
  function drAfter(){
    var b = base(S.step); if (!isStep(b)) { DR.last = ''; DR.at = {}; return; }
    if (DR.last !== b) { DR.last = b; if (!DR.base[b] || !drGet(b)) DR.base[b] = drSnap(); }
    if (!DR.s[b]) { DR.s[b] = true; if (drApply(b)) { S.dirty = b; DR.restored[b] = true; render(); return true; } }
    if (DR.at.step === S.step) return; DR.at = { step: S.step };
    var d = drGet(b), bx = d && d.boxes && d.boxes[S.step]; if (!bx) return;
    Object.keys(bx).forEach(function(sel){ var inp; try { inp = screen.querySelector(sel); } catch (e) { inp = null; } if (!inp || inp.value === bx[sel]) return; inp.value = bx[sel]; try { inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {} });
    S.dirty = b; DR.restored[b] = true;
  }
  function drApply(b){
    var d = drGet(b); if (!d || !d.s) return false;
    var any = false;
    Object.keys(d.s).forEach(function(path){
      var q = path.split('.'), k = q[0], j = q.length > 1 ? q.slice(1).join('.') : null, w = d.s[path];
      if (DRAFT_KEYS.indexOf(k) < 0) return;
      var cur = j === null ? js(S[k]) : isObj(S[k]) ? js(S[k][j]) : S[k] == null ? '~' : null;
      if (cur !== w.was || cur === w.now) return;
      var val = w.now === '~' ? undefined : JSON.parse(w.now);
      if (j === null) S[k] = val; else { if (!isObj(S[k])) S[k] = {}; if (val === undefined) delete S[k][j]; else S[k][j] = val; }
      any = true;
    });
    return any;
  }
  function drSaved(step){ drDrop(step); delete DR.base[step]; DR.s[step] = true; delete DR.restored[step]; if (DR.last === step) DR.last = ''; }
  // ---------- Screens ----------
  function render(){
    kindWords();
    // Café test 3 (2026-11-11): the price step is named in the kind's words ("Price of one drink").
    if (C.cafe && T.spendLabel) T.labels.spend = fill(T.spendLabel, { words: cafeWords() });
    bar();
    var s = S.step, p = s.split(':'), x = '';
    if (base(s) !== 'closures') S.hoursJust = false;
    if (s === 'start' || s === 'more' || s === 'ess') { S.toList = false; S.toFinish = false; S.toEss = false; } else if (s === 'finish') { S.toList = false; S.toEss = false; }
    if (s === 'start') {
      var any = STEPS.some(function(k){ return S.done[k]; });
      var nxt = firstOpen();
      // Welcome back: the button first, then what's done.
      x = any ? q(nxt === 'finish' ? T.changeQ : S.fresh ? T.welcome : T.soFarQ, nxt === 'finish' ? T.changeLead : T.welcomeLead) + msgs() + '<div class="su-stack" style="margin-bottom:22px">'
          + (nxt === 'finish' ? big('➜', T.seeFinish, '', false, 'go:finish') : nxt === 'more' ? big('➜', T.moreOpt, T.optional, false, 'go:more') + big('👀', T.seeFinish, '', true, 'go:ess') : big('➜', T.carryOn, fill(T.nextIs, { step: T.labels[nxt] }), false, 'resume')) + '</div>'
          + statusRows(P1) + (p1Done() || p2Count() ? '<h2 class="su-h2">' + h(T.moreQ) + '</h2>' + statusRows(P2) : '')
        // Pub test 8 (2026-11-10): nothing said it was free, and an owner wary of money read the badge and prices as an upsell.
        // Café test 4 (2026-11-11): no staff-access note here before anything is done; the edit page, where "People with
        // access" is, keeps it.
        : q(fill(T.hi, { name: C.name }), fill(T.hiLead, { type: C.typeWord })) + '<p class="su-free" id="suFree"><span aria-hidden="true">✓</span> ' + h(T.freeLine) + '</p><div class="su-stack">' + big('➜', T.start, '', false, 'go:basics') + '</div>';
    } else if (p[0] === 'saved') {
      var how = S.done[p[1]];
      // Two phrases only (pub fresh-eyes, 2026-11-10): "Saved ✓ It's on your page now." or "Sent ✓ It'll show on your page
      // within a day." (plus "soon" for the average spend while it isn't shown publicly).
      var sentStep = how === 'day';
      var title = how === 'email' ? T.emailTitle2 : how === 'later' ? T.laterTitle : how === 'no' || how === 'unsure' ? T.gotIt : sentStep ? T.sentTitle : T.savedTitle;
      var line = S.savedLine[p[1]] || (how === 'day' ? T.savedDay : how === 'email' ? T.savedEmail : how === 'later' ? T.savedLater : how === 'no' ? T.savedNo : T.savedLive);
      // The first "Sent" says what it means (pub fresh-eyes 2, 2026-11-10).
      if (sentStep && !S.sentExplained) S.sentExplained = p[1];
      // Pub test 3 (2026-11-10): "It'll show within a day" and "Sent means we check it first, usually within a day" said
      // the same thing twice. The first Sent now says it once, in the lead.
      var explain = sentStep && S.sentExplained === p[1] && !S.savedLine[p[1]];
      if (explain) line = T.sentMeans;
      // No sports, but the description still talks about them (pub test 5): one tap to fix it in "Your story". Never changed
      // for them: they edit it, and it's checked first like any description.
      var sb = p[1] === 'offer' && !S.badges.sports_tv && !S.storyFixed ? sportsBit() : '';
      x = '<div class="su-saved"><div class="su-check" aria-hidden="true">' + (how === 'email' ? '✉' : how === 'later' ? '🕓' : '✓') + '</div><h1>' + h(title) + '</h1><p class="su-lead"' + (explain ? ' id="suSentMeans"' : '') + '>' + h(line) + '</p></div>'
        // Brewery test 1 (2026-11-12): the description exactly as it was sent (with any join fixed), so she sees the words.
        + (p[1] === 'story' && S.storySent && T.storySentAs ? '<div class="su-day" id="suStorySent"><p class="su-q" style="margin:0 0 6px">' + h(T.storySentAs) + '</p><p class="su-hint" style="margin:0;white-space:pre-wrap">' + h(S.storySent) + '</p></div>' : '')
        + (sb ? '<div class="su-day su-sportsfix" id="suSportsFix"><p class="su-q" style="margin:0 0 6px">' + h(T.storySportsQ) + '</p><p class="su-hint" style="margin:0 0 12px">' + h(fill(T.storySportsLead, { bit: sb })) + '</p>' + big('✎', T.storySportsBtn, '', true, 'storyFix') + '</div>' : '')
        + '<div class="su-stack">' + big('➜', nextLabel(p[1]), '', false, 'after:' + p[1]) + '</div>';
    } else if (s === 'ess') {
      // Part 1 is done: the score, the page, and one choice.
      // "Your page is ready. 8 of 8 essentials done." first; one number lower down.
      var open1 = P1.filter(function(k){ return !answered(k); }), nd = P1.length - open1.length;
      x = '<div class="su-saved" style="padding-top:4px"><div class="su-check" aria-hidden="true">✓</div><h1>' + h(open1.length ? T.essNearly || T.essReady : T.essReady) + '</h1><p class="su-lead" id="suEssCount">' + h(fill(T.essCount, { n: nd, total: P1.length })) + '</p></div>'
        + (open1.length ? '<p class="su-q">' + h(T.essSkipped) + '</p><div class="su-stack" style="margin-bottom:18px">' + open1.map(function(k){ return big('➜', T.labels[k], '', true, 'jumpEss:' + k); }).join('') + '</div>' : '')
        + preview() + scoreBox(true)
        + '<div class="su-stack" style="margin-top:18px">' + big('➜', T.moreOpt, moreSub(), false, 'go:more') + big('✓', T.doneNow, '', true, 'doneNow') + '</div>'
        // Winery test 1 (2026-11-12): one clear way back to fix an answer: the "Tap any line to change it" list. A line
        // changed from there comes back to that list.
        + '<div class="su-skip" style="margin-top:14px"><button type="button" class="su-link" id="suChangeAnswer" data-act="go:start">' + h(T.changeAnswer) + '</button></div>';
    } else if (s === 'more') {
      // Part 2: optional, any order. A tick on the ones already answered.
      var tile2 = function(k){ var d = S.done[k], on = d && d !== 'skip'; return '<button type="button" class="su-tile" aria-pressed="' + (on ? 'true' : 'false') + '" data-act="open:' + k + '"><span class="su-e" aria-hidden="true">' + (P2_ICONS[k] || '•') + '</span>' + h(T.labels[k]) + (on ? '<span class="su-tile-sub">' + h(capFirst(stText(k, d))) + '</span>' : '') + '</button>'; };
      var top4 = P2.filter(function(k){ return TOP2.indexOf(k) >= 0; }), rest2 = P2.filter(function(k){ return TOP2.indexOf(k) < 0; });
      var restOpen = S.moreOpen || rest2.some(function(k){ return S.done[k] && S.done[k] !== 'skip'; });
      x = q(T.moreQ, T.moreLead) + msgs() + '<div class="su-tiles">' + top4.map(tile2).join('') + '</div>' + (rest2.length ? '<details class="su-fold" id="suFold"' + (restOpen ? ' open' : '') + '><summary>' + h(T.fewMore) + '</summary><div class="su-tiles">' + rest2.map(tile2).join('') + '</div></details>' : '')
        + '<div class="su-stack">' + big('➜', allDone() ? T.seeFinish : T.doneNow, '', !allDone(), allDone() ? 'go:finish' : 'doneNow2') + '</div>';
    } else if (s === 'basics') {
      x = doneLine('basics') + q(T.basicsQ) + msgs() + '<div class="su-box"><div><span>' + h(T.address) + '</span><span>' + h(CUR.address || '—') + '</span></div><div><span>' + h(T.phone) + '</span><span>' + h(CUR.phone || '—') + '</span></div><div><span>' + h(T.website) + '</span><span>' + h(siteShown()) + '</span></div></div>'
        + '<div class="su-stack">' + big('✓', T.yesRight, '', false, 'basicsOk') + big('✎', T.changeThem, '', true, 'go:basics:edit') + '</div>' + skip('basics');
    } else if (s === 'basics:edit') {
      x = q(T.basicsEditQ) + msgs() + field('suAddr', T.streetLabel, S.addr != null ? S.addr : CUR.address || '', { max: 200 }) + field('suPhone', T.phoneLabel, S.phone != null ? S.phone : CUR.phone || '', { type: 'tel', max: 40 })
        + field('suSite', T.websiteLabel, S.site != null ? S.site : siteDomain(CUR.website), { mode: 'url', max: 300 }) + '<p class="su-example">' + h(T.websiteEx) + '</p>'
        + '<div class="su-stack">' + big('✓', T.saveThese, '', false, 'basicsSave') + big('✕', T.noWebsiteBtn, '', true, 'basicsNoSite') + '</div>';
    } else if (s === 'hours') {
      // Winery test 4 (2026-11-12): a winery says "We don't have set hours. Visits are by appointment" here (and on the
      // day list); once it has, the screen says so and "Yes, that's right" keeps it.
      var anyOpen = S.week && DAYS.some(function(d){ return S.week[d]; }), noneNow = APPT && AI.visit === 'appointment' && !anyOpen && !!CUR.hours;
      x = doneLine('hours') + q(T.hoursQ) + msgs() + (anyOpen ? weekRows(S.week) + seasonLines() + '<div class="su-stack">' + big('✓', T.yesRight, '', false, 'hoursOk') + big('✎', T.changeThem, '', true, 'go:hours:edit') + noSetBtn() + '</div>'
        : noneNow ? '<p class="su-sent" id="suNoSetNow">' + h(T.noSetHoursNow) + '</p><div class="su-stack">' + big('✓', T.yesRight, '', false, 'noSetHours') + big('✎', T.addHours, '', true, 'go:hours:edit') + '</div>'
        : '<p class="su-lead">' + h(T.noHours) + '</p><div class="su-stack">' + big('✎', T.addHours, '', false, 'go:hours:edit') + noSetBtn() + '</div>') + skip('hours');
    } else if (s === 'hours:year') {
      // Pub test 6 (2026-11-10): after the usual hours, one question. Most places tap Yes and are done; the other season
      // gets its own short day-by-day list (any day can be open, even one closed in the usual week).
      var mrN = S.sea.on ? monthRun(S.sea.months) : null;
      x = q(T.allYearQ, T.allYearLead) + (APPT && S.wine.year === 'appointment' && S.wine.season ? '<p class="su-sent su-seasonnow" id="suApptNow">' + h(wSeasonText(S.wine.season)) + '</p>' : '') + (S.openSea ? '<p class="su-sent su-seasonnow" id="suOpenNow">' + h(openText(S.openSea)) + '</p>' : '') + (mrN && mrN.a ? '<p class="su-sent su-seasonnow" id="suSeasonNow">' + h(fill(T.seasonNow, { kind: T.seasonWord[S.sea.kind] || T.seasonWord.summer, a: monthName(mrN.a - 1), b: monthName(mrN.b - 1) })) + '</p>' : '') + msgs()
        + '<div class="su-stack">' + big('✓', T.allYearYes, '', false, 'yearAll') + big('☀️', T.allYearSummer, T.allYearSummerSub, true, 'yearSeason:summer') + big('❄️', T.allYearWinter, T.allYearWinterSub, true, 'yearSeason:winter')
        // Café test 2 (2026-11-11): a seasonal place says its open dates here, once, for every type.
        + big('🗓️', T.allYearClosed, T.allYearClosedSub, true, 'yearClosed')
        // Wineries (2026-11-12): the one new choice, "In the off-season we're open by appointment".
        + (APPT && T.allYearAppt ? big('📞', T.allYearAppt, T.allYearApptSub, true, 'yearAppt') : '') + '</div>';
    } else if (s === 'hours:open') {
      // Café test 2: "Open from [Apr 25] to [Oct 12] every year". Whole months stay a quick path (the months screen).
      var os0 = S.openDraft || S.openSea || { from: '', to: '' }, fromHours = S.openFrom === 'hours';
      x = q(T.openQ, T.openLead) + msgs() + '<div class="su-seadates su-openseason"><p class="su-q">' + h(T.openFrom) + '</p>' + mdPick('suOf', os0.from, T.openFrom) + '<p class="su-q">' + h(T.openTo) + '</p>' + mdPick('suOt', os0.to, T.openTo) + '</div>'
        + '<p class="su-hint su-repeats">' + h(T.repeatsYearly) + '</p><p class="su-hint"><button type="button" class="su-link" data-act="openMonths">' + h(T.openMonthsLink) + '</button></p>'
        + '<div class="su-stack">' + (fromHours ? big('✓', T.openSame, T.openSameSub, false, 'openSave:same') + big('☀️', T.openSummer, T.openSummerSub, true, 'openSave:summer') : big('✓', T.openSaveOnly, '', false, 'openSave:only'))
        + big('✕', T.allYearBtn, '', true, 'openNone') + '</div>';
    } else if (s === 'hours:edit' || s === 'hours:season') {
      var seas = s === 'hours:season';
      if (!S.week) { S.week = {}; DAYS.forEach(function(d){ S.week[d] = null; }); }
      if (seas && !S.sea.week) S.sea.week = clone(S.week);
      // A clear Open ✓ / Closed switch, "Same as Monday" on every later day (pub fresh-eyes, 2026-11-10: Sunday could only
      // copy Saturday, and "Open" read like a label). "Copy Monday to every day" sits right under Monday's card (pub
      // fresh-eyes 2: "Same every day" at the top didn't say which day it copied). A closing time after midnight gets a
      // plain note under it ("= midnight", "1 AM (early Saturday morning)").
      // Pub test 3 (2026-11-10): "1 AM" on the iPhone time wheel meant rolling the hour and switching PM to AM, and the
      // "(early Saturday morning)" note only showed once it was right. The hint now says it up front, and each day's
      // last closing time has quick buttons: Midnight, 1 AM, 2 AM (restaurants too: the screen is shared).
      // Pub test 4 (2026-11-10): the 7 full day cards were about 3 phone screens for someone changing 3 days. The screen
      // now starts from the current hours as a short list, one row a day with a big Change button; only the days tapped
      // open up (the full card: Open/Closed, the times, Midnight / 1 AM / 2 AM, the early-morning note, "Same as"). An
      // open day can copy its hours to every day or Mon–Fri. Days never opened keep their hours exactly as stored.
      if (!seas && !S.hoursOpenSet) { S.hoursOpenSet = true; S.hoursOpen = {}; if (!DAYS.some(function(d){ return S.week[d]; })) S.hoursOpen.mon = true; }
      var wk = W(), hop = HO(), firstOpenCard = DAYS.filter(function(d){ return hop[d] && wk[d]; })[0];
      // Exact days (pub test 7): "open late May to early September" without rounding to whole months.
      x = (seas ? q(T.seasonEditQ[S.sea.kind] || T.seasonEditQ.summer, T.seasonEditLead) + '<p class="su-q">' + h(T.whichMonths) + '</p>'
          + (S.sea.exact ? seaExactHtml('hours', S.sea) : monthChips(S.sea.months, 'sea') + '<p class="su-hint"><button type="button" class="su-link" data-sea="hours:exact">' + h(T.seasonExactLink) + '</button></p>') + '<h2 class="su-h2">' + h(T.seasonDaysH) + '</h2>'
          // Café test 4 (2026-11-11): "Open after midnight?" is said once, beside each day's Midnight / 1 AM / 2 AM buttons
          // (it was also a paragraph at the top).
          : q(T.hoursEditQ, T.hoursEditLead)) + msgs() + DAYS.map(function(d, i){
        var w = wk[d], prev = i > 0 ? wk[DAYS[i - 1]] : null, mon = i > 1 ? wk.mon : null;
        if (!hop[d]) return '<div class="su-day su-hrow" id="suRow' + d + '"><div class="su-hsum"><b>' + h(dayName(d)) + '</b><span>' + (w ? h(w.map(function(y){ return t12(y[0]) + ' – ' + t12(y[1]); }).join(', ')) : h(T.closed)) + '</span>'
          + (w && lateNote(d, w[w.length - 1]) && w[w.length - 1][1] !== '00:00' && w[w.length - 1][1] !== '24:00' ? '<small>' + h(lateNote(d, w[w.length - 1])) + '</small>' : '') + '</div>'
          // Pub test 7 (2026-11-10): one tap marks a day Closed (or opens it again) right from the list; Change is for times.
          // Pub test 8 (2026-11-10): "Closed" sat right beside "✎ Change", one thumb-width away. Change keeps its place on
          // the day's line; "Mark closed" moves to its own line under it, and a day closed by mistake says so with Undo
          // ("Monday closed · Undo").
          + '<span class="su-hbtns"><button type="button" class="su-hchg" data-hopen="' + d + '" aria-label="' + h(fill(T.hoursChangeDay, { day: longDay(d) })) + '"><span aria-hidden="true">✎</span> ' + h(T.hoursChange) + '</button></span>'
          + '<div class="su-hoffrow">' + (w ? '<button type="button" class="su-hoff" data-hoff="' + d + '" aria-pressed="false" aria-label="' + h(fill(T.closeDayAria, { day: longDay(d) })) + '">' + h(T.closeDayBtn) + '</button>'
            // Café test 6 (2026-11-12): "Reopen" takes the place of "Mark closed" (same spot, same height) and the "Monday
            // closed" note comes after it, so a quick second tap on the next day's button never lands on another day.
            // Winery test 5 (2026-11-12): the line above already says "Mon Closed", so the note is for screen readers only
            // ("closed" twice on every winter row).
            // Cocktail test 1 (2026-11-13): one thing only, "Reopen": the "Monday closed" note (read out with the page text
            // too) went; the button's own name says it ("Monday closed. Open Monday again").
            : hoffUndo(d) ? '<button type="button" class="su-hoff su-hoff-undo" data-hoff="' + d + '" aria-pressed="true" aria-label="' + h(fill(T.dayClosedNow, { day: longDay(d) }) + '. ' + fill(T.openDayAria, { day: longDay(d) })) + '">' + h(T.reopenDay || T.undo) + '</button>'
            : '<button type="button" class="su-hoff" data-hoff="' + d + '" aria-pressed="true" aria-label="' + h(fill(T.openDayAria, { day: longDay(d) })) + '">' + h(T.openDayBtn) + '</button>') + '</div></div>';
        return '<div class="su-day su-hopen" id="suRow' + d + '"><div class="su-dh"><span>' + h(dayName(d)) + '</span><span class="su-switch" role="group" aria-label="' + h(dayName(d)) + '"><button type="button" class="su-on" aria-pressed="' + (w ? 'true' : 'false') + '" data-dayopen="' + d + '">' + h(w ? T.openOn : T.open) + '</button><button type="button" class="su-off" aria-pressed="' + (w ? 'false' : 'true') + '" data-dayclosed="' + d + '">' + h(T.closedOff) + '</button></span></div>'
          + (w ? w.map(function(y, j){ return '<div class="su-times"><label class="su-sr" for="o' + d + j + '">' + h(fill(T.opens, { day: dayName(d) })) + '</label><input type="time" id="o' + d + j + '" data-h="' + d + ':' + j + ':0" value="' + y[0] + '"> ' + h(T.to) + ' <label class="su-sr" for="c' + d + j + '">' + h(fill(T.closes, { day: dayName(d) })) + '</label><input type="time" id="c' + d + j + '" data-h="' + d + ':' + j + ':1" value="' + (y[1] === '24:00' ? '00:00' : y[1]) + '"></div><p class="su-hint su-late" id="suLate' + d + j + '" aria-live="polite"' + (lateNote(d, y) ? '' : ' hidden') + '>' + h(lateNote(d, y)) + '</p>' + brewQuick(d, j, y, w.length - 1) + (j === w.length - 1 ? lateBtns(d, j, y) : ''); }).join('')
            + (prev || mon ? '<div class="su-samerow">' + (prev ? '<button type="button" class="su-toggle su-same" data-same="' + d + '">' + h(fill(T.sameAs, { day: longDay(DAYS[i - 1]) })) + '</button>' : '') + (mon ? '<button type="button" class="su-toggle su-same" data-samemon="' + d + '">' + h(T.sameAsMon) + '</button>' : '') + '</div>' : '')
            + '<div class="su-samerow su-copyrow" role="group" aria-label="' + h(T.copyTo) + '"><span class="su-latelbl">' + h(T.copyTo) + '</span><button type="button" class="su-toggle" data-copyall="' + d + '">' + h(DAYS.every(function(x){ return x === d || copyGets(d, x); }) ? T.copyAll : T.copyOpen) + '</button>'
            // The other season (pub test 6): "Every day" opens the closed days too ("open daily in summer" in one tap).
            // Café test 6 (2026-11-12): not when the first button already says "Every day" (every day open: two identical buttons).
            + (seas && !othersClosed(d) && !DAYS.every(function(x){ return x === d || copyGets(d, x); }) ? '<button type="button" class="su-toggle" data-copyevery="' + d + '">' + h(T.copyAll) + '</button>' : '') + '<button type="button" class="su-toggle" data-copywk="' + d + '">' + h(T.copyWeek) + '</button>'
            // Café test 5 (2026-11-12): Sat–Sun beside Mon–Fri (same rule: a day marked Closed stays closed).
            + '<button type="button" class="su-toggle" data-copywe="' + d + '">' + h(T.copyWeekend) + '</button>' + hDone(d) + '</div>'
            // Said once, under the first open card (café test 5: it repeated under every open day).
            + (!seas && d === firstOpenCard && DAYS.some(function(x){ return x !== d && !copyGets(d, x); }) ? '<p class="su-hint su-copynote">' + h(T.copyClosedNote) + '</p>' : '') : '<div class="su-samerow su-hdonerow">' + hDone(d) + '</div>') + '</div>';
      }).join('')
        + '<div class="su-stack">' + (seas ? big('✓', T.saveHours, '', false, 'hoursSave') : big('➜', T.hoursNext, '', false, 'hoursNext') + noSetBtn()) + '</div>';
    } else if (s === 'hours:kitchen') {
      var ks = S.kitchen.mode ? '<p class="su-sent">' + h(fill(T.kitchenSaid[S.kitchen.mode], { t: t12(S.kitchen.closes) })) + '</p>' : '';
      x = ks + q(T.kitchenQ, T.kitchenLead) + msgs() + '<div class="su-stack">' + big('✓', T.kitchenEarlier, '', false, 'go:hours:kitchentime') + big(CK ? '🍽' : '🍔', T.kitchenSame, '', true, 'kitchenSame') + big('✕', T.kitchenNone, '', true, 'kitchenNone') + '</div>'
        + '<div class="su-skip"><button type="button" class="su-link" data-act="go:saved:hours">' + h(T.skip) + '</button></div>';
    } else if (s === 'hours:kitchentime') {
      // Pub test 7 (2026-11-10): with summer (or winter) hours on file, that season's kitchen time too.
      var ks0 = kitchenSeason(), kz = S.kitchen.sea;
      x = q(T.kitchenTimeQ, T.kitchenTimeLead) + msgs() + '<div class="su-day"><div class="su-times"><label class="su-q" for="suKto" style="margin:0">' + h(T.kitchenAt) + '</label> <input type="time" id="suKto" value="' + h(S.kitchen.closes) + '"></div></div>'
        + (ks0 ? '<div class="su-day su-kseason" id="suKitchenSeason"><p class="su-q" style="margin-top:0">' + h(fill(T.kitchenSeasonQ, { kind: T.seasonWord[ks0.kind] || T.seasonWord.summer, range: mdText(ks0.from) + ' – ' + mdText(ks0.to) })) + '</p>'
          + '<div class="su-stack" role="group">' + ['same', 'close', 'time'].map(function(m){ var on = kz.mode === m; return '<button type="button" class="su-big' + (on ? '' : ' su-alt') + '" aria-pressed="' + (on ? 'true' : 'false') + '" data-ksea="' + m + '"><span class="su-ico" aria-hidden="true">' + (on ? '✓' : '○') + '</span><span>' + h(m === 'same' ? T.kitchenSeasonSame : m === 'close' ? T.kitchenSeasonClose : T.kitchenSeasonAt + '…') + '</span></button>'; }).join('') + '</div>'
          + (kz.mode === 'time' ? '<div class="su-times" style="margin-top:12px"><label class="su-q" for="suKsto" style="margin:0">' + h(T.kitchenSeasonAt) + '</label> <input type="time" id="suKsto" value="' + h(kz.closes) + '"></div>' : '') + '</div>' : '')
        + field('suKnote', T.kitchenNoteLabel, S.kitchen.note, { max: 120 }) + ex(T.kitchenNoteEx) + '<div class="su-stack">' + big('✓', T.saveKitchen, '', false, 'kitchenSave') + '</div>';
    } else if (s === 'offer:sports') {
      x = q(T.sportsQ, T.sportsLead) + msgs() + '<div class="su-chips" role="group" aria-label="' + h(T.sportsQ) + '">' + C.sports.map(function(o){ return '<button type="button" class="su-chip su-chip-wide" aria-pressed="' + (S.sports.list[o.k] ? 'true' : 'false') + '" data-sport="' + o.k + '">' + h(o.t) + '</button>'; }).join('') + '</div>'
        + '<p class="su-q">' + h(T.tvsQ) + '</p><div class="su-chips" role="group" aria-label="' + h(T.tvsQ) + '">' + C.tvs.map(function(o){ return '<button type="button" class="su-chip" aria-pressed="' + (S.sports.tvs === o.k ? 'true' : 'false') + '" data-tv="' + o.k + '">' + h(o.t) + '</button>'; }).join('') + '</div>'
        + '<p class="su-hint" id="suSportsTip">' + h(T.sportsEx) + '</p><div class="su-stack">' + big('➜', T.nextPlain, '', false, 'sportsSave') + '</div>';
    } else if (s === 'offer:minors') {
      x = q(T.minorsQ, T.minorsLead) + (S.minorsGuessed && S.minors.policy === 'adults' && T.minorsGuess ? '<p class="su-sent su-research" id="suMinorsGuess">' + h(T.minorsGuess) + '</p>' : '') + msgs() + '<div class="su-stack" role="group" aria-label="' + h(T.minorsQ) + '">' + ['adults', 'minors_until', 'all_ages'].map(function(k){ var on = S.minors.policy === k; return '<button type="button" class="su-big' + (on ? '' : ' su-alt') + '" aria-pressed="' + (on ? 'true' : 'false') + '" data-minors="' + k + '"><span class="su-ico" aria-hidden="true">' + (on ? '✓' : '○') + '</span><span>' + h(T.minorsOpts[k]) + '</span></button>'; }).join('') + '</div>'
        + (S.minors.policy === 'minors_until' ? '<div class="su-day" style="margin-top:14px"><div class="su-times"><label class="su-q" for="suMto" style="margin:0">' + h(T.minorsUntil) + '</label> <input type="time" id="suMto" value="' + h(S.minors.until || beforeClose()) + '"></div></div>' : '')
        + field('suMnote', T.minorsNoteLabel, S.minors.note, { max: 120 }) + ex(T.minorsNoteEx) + '<div class="su-stack">' + big('✓', T.saveThese, '', false, 'minorsSave') + '</div>'
        + '<div class="su-skip"><button type="button" class="su-link" data-act="go:saved:offer">' + h(T.skip) + '</button></div>';
    } else if (s === 'closures') {
      var nothing = !S.closures.length && !S.extra.length && !S.openSea;
      var changedC = closuresKey() !== S.closuresWas, newC = S.closures.filter(function(k){ return S.closuresSaved.indexOf(k) < 0 && !HOL.some(function(o){ return o.key === k && holCovered(o); }); }).length + Math.max(0, S.extra.length - S.savedExtra);
      x = (COMBO && S.hoursJust ? '<p class="su-sent" id="suHoursSaved">' + h(S.hoursNone && T.noSetHoursSaved ? T.noSetHoursSaved : S.done.hours === 'day' ? T.hoursSentNow : T.hoursSavedNow) + '</p>' + (S.hoursNone ? '' : hoursRecap()) : changedC ? '' : doneLine('closures')) + q(T.closuresQ, T.closuresLead) + msgs() + (S.added ? '<p class="su-sent" id="suAdded">' + h(fill(T.added, { x: S.added })) + '</p>' : '')
        + S.extra.map(function(c, i){ return '<div class="su-row" style="margin-bottom:10px"><span aria-hidden="true">📅</span><span>' + h(closureLabel(c) + (c.note ? ' · ' + c.note : '')) + '</span><button type="button" data-xdel="' + i + '" aria-label="' + h(T.remove) + '">✕</button></div>'; }).join('')
        // Café test 2 (2026-11-11): one place for the closed part of the year (the Hours answer). Shown here with Change.
        + (S.openSea ? '<div class="su-row su-openrow" style="margin-bottom:10px"><span aria-hidden="true">🗓️</span><span>' + h(openText(S.openSea)) + '</span><button type="button" class="su-link" data-act="openEdit" aria-label="' + h(T.openChange) + '">' + h(T.openChange) + '</button></div>' : '')
        + '<button type="button" class="su-more" data-act="go:closures:add">' + h(T.anotherDay) + '</button>'
        // Café test 4 (2026-11-11): "We're closed part of the year" is asked once, in Hours ("Are these your hours all
        // year?"). This screen only shows a saved open season, with Change.
        + '<h2 class="su-h2">' + h(T.holidaysH) + '</h2><div class="su-tiles">' + HOL.filter(function(o, i){ return S.holAll || i < HOL_FEW || S.closures.indexOf(o.key) >= 0; }).map(function(o){ var cov = holCovered(o); return '<button type="button" class="su-tile' + (cov ? ' su-covered' : '') + '" aria-pressed="' + (cov || S.closures.indexOf(o.key) >= 0 ? 'true' : 'false') + '" data-hol="' + o.key + '"' + (cov ? ' disabled' : '') + '><span class="su-tile-sub">' + h(dateLabel(o.date)) + '</span>' + h(T.holidays[o.key]) + (cov ? '<span class="su-tile-sub su-covered-note">' + h(!coveredBy(o.date) && T.holSeason ? T.holSeason : T.holCovered) + '</span>' : '') + '</button>'; }).join('') + '</div>'
        + (HOL.length > HOL_FEW ? '<button type="button" class="su-more" data-act="holAll">' + h(S.holAll ? T.holFewer : fill(T.holAll, { n: HOL.length })) + '</button>' : '')
        + HOL.filter(function(o){ return o.yearly && S.closures.indexOf(o.key) >= 0 && !holCovered(o); }).map(function(o){ return '<label class="su-tick" style="margin:10px 0 0"><input type="checkbox" data-yearly="' + o.key + '"' + (yearlyOn(o.key) ? ' checked' : '') + '><span>' + h(cl(T.holidays[o.key]) + T.everyYear) + '</span></label>'; }).join('')
        + (HOL.some(function(o){ return o.yearly && S.closures.indexOf(o.key) >= 0 && !holCovered(o); }) ? '<p class="su-example">' + h(T.everyYearSub) + '</p>' : '')
        // Pub test 6 (2026-11-10): not sticky. On a 375x667 phone the big button sat over the holiday tiles; it now comes
        // after them.
        + '<div class="su-stack su-closures-save">' + (nothing ? big('✕', T.nothingComing, '', false, 'closuresNone') : big('✓', newC > 0 ? fill(newC === 1 ? T.saveClosures1 : T.saveClosuresN, { n: newC }) : T.saveClosures, '', false, 'closuresSave')) + '</div>' + skip('closures');
    } else if (s === 'closures:months') {
      // Pub test 7 (2026-11-10): "Which months are you CLOSED?" (it asked which months you're open: 11 taps, and easy to tap
      // the month you're closed). Stored exactly as before: the open months ("2-12").
      if (!S.closedM) { S.closedM = {}; var mr0 = monthRun(S.months); if (!mr0.none && !mr0.all) for (var mi = 1; mi <= 12; mi++) if (!S.months[mi]) S.closedM[mi] = true; }
      x = q(T.monthsClosedQ, T.monthsClosedLead) + msgs() + chips(S.closedM, 'closedm', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function(i){ return { k: i, t: monthName(i - 1) }; }), T.monthsClosedQ)
        + '<div class="su-stack">' + big('✓', T.monthsUse, '', false, 'monthsUse') + big('✕', T.allYearBtn, '', true, 'monthsClear') + '</div>';
    } else if (s === 'closures:add') {
      x = q(T.closeAddQ, T.closeAddLead) + msgs() + field('suCf', T.firstDay, S.addFrom || nextMonth(), { type: 'date' })
        + '<p class="su-q">' + h(T.howLong) + '</p><div class="su-chips">' + [['1', T.len1], ['7', T.len7], ['14', T.len14], ['pick', T.lenPick]].map(function(o){ return '<button type="button" class="su-chip" aria-pressed="' + (S.addLen === o[0] ? 'true' : 'false') + '" data-len="' + o[0] + '">' + h(o[1]) + '</button>'; }).join('') + '</div>'
        + (S.addLen === 'pick' ? field('suCt', T.lastDay, S.addTo || '', { type: 'date' }) : '<p class="su-sent su-cends" id="suCends" aria-live="polite">' + h(closeEnds(S.addFrom || nextMonth())) + '</p>')
        + field('suCn', T.why, S.addNote || '', { max: 60 }) + ex(T.whyEx)
        // Café test 1 (2026-11-11): "Every year" for her own dates, like the holidays' "This year and next".
        + '<label class="su-tick" style="margin:12px 0 0"><input type="checkbox" id="suCyear"' + (S.addYearly ? ' checked' : '') + '><span>' + h(T.closeYearly) + '</span></label><p class="su-example">' + h(T.closeYearlySub) + '</p>'
        + '<div class="su-stack">' + big('✓', T.addDates, '', false, 'closureAdd') + '</div>';
    } else if (s === 'spend' && CK) {
      // Cocktail lounges (Decided 2, 2026-11-13): "About how much is a cocktail?" $12 · $14 · $16 · $18 · Other · We don't
      // serve cocktails. The card shows "From $16"; "We don't serve cocktails" shows no price.
      var cp = S.cp, cpOn = function(n){ return !cp.other && !cp.none && cp.fee === n; };
      x = doneLine('spend') + '<h1>' + h(T.cpriceQ) + '</h1><p class="su-lead" id="suCpLead">' + h(cpLeadText()) + '</p>'
        + (cp.guessed && cp.fee != null && !isNaN(cp.fee) ? '<p class="su-sent su-research" id="suCpGuess">' + h(fill(T.cpriceGuess, { x: cpText(cp.fee) })) + '</p>' : '')
        + (CUR.cocktail_price_waiting != null ? '<p class="su-sent" id="suCpWaiting">' + h(fill(T.cpriceWaiting, { x: cpText(CUR.cocktail_price_waiting) })) + '</p>' : '') + msgs()
        + '<div class="su-chips" role="group" aria-label="' + h(T.cpriceQ) + '" id="suCpChips">' + CQ.map(function(n){ return '<button type="button" class="su-chip" aria-pressed="' + (cpOn(n) ? 'true' : 'false') + '" data-cfee="' + n + '">' + h(cpText(n)) + '</button>'; }).join('')
        + '<button type="button" class="su-chip" aria-pressed="' + (cp.other && !cp.none ? 'true' : 'false') + '" data-cfee="other">' + h(T.feeOther) + '</button></div>'
        + (cp.other && !cp.none ? field('suCfee', T.feeLabel, cp.fee == null || isNaN(cp.fee) ? '' : String(cp.fee), { mode: 'decimal', max: 8 }) + '<p class="su-hint" id="suCfeeOver">' + h(fill(T.feeOver, { n: C.feeLiveMax || 40 })) + '</p>' : '')
        // Cocktail test 1 (2026-11-13): no "We don't serve cocktails" for a lounge (only while it is the stored answer).
        + (cp.none ? '<div class="su-stack" style="margin-top:10px"><button type="button" class="su-big" aria-pressed="true" data-cfee="none" id="suCpNone"><span class="su-ico" aria-hidden="true">✓</span><span>' + h(T.cpriceNone) + '<small>' + h(T.cpriceNoneSub) + '</small></span></button></div>' : '')
        + '<div class="su-stack" style="margin-top:18px">' + big('✓', T.saveThis, '', false, 'cpriceSave') + '</div>' + skip('spend');
    } else if (s === 'spend') {
      var guess = CUR.avg_spend && CUR.avg_spend.source === 'research' ? ' ' + fill(T.spendGuess, { n: CUR.avg_spend.amount }) : '';
      // Cafés (Decided 2): "About how much is a coffee and a pastry?" in the words for their kind.
      var sw = C.cafe ? cafeWords() : '';
      x = doneLine('spend') + q(fill(T.spendQ, { words: sw }), fill(C.spendPublic ? T.spendLead : T.spendLeadOff || T.spendLead, { n: money(S.spend), words: sw }) + guess) + (C.spendPublic ? '' : '<p class="su-hint" id="suSpendWhy">' + h(T.spendWhyOff) + '</p>') + msgs() + '<div class="su-num"><button type="button" data-act="spend:-1" aria-label="' + h(T.less) + '">−</button><output id="suSpend" aria-live="polite">' + (C.lang === 'fr' ? money(S.spend) + '\u00a0$' : '$' + money(S.spend)) + '</output><button type="button" data-act="spend:1" aria-label="' + h(T.more) + '">+</button></div>'
        // Café test 2 (2026-11-11): cents for cafés ($5.50 a scoop), in 25-cent steps.
        + (C.cafe ? '<div class="su-samerow su-cents" role="group" aria-label="' + h(T.centsLabel) + '"><button type="button" class="su-toggle" data-act="spend:-0.25" aria-label="' + h(T.centsLess) + '">' + h(T.centsDown || '−25¢') + '</button><button type="button" class="su-toggle" data-act="spend:0.25" aria-label="' + h(T.centsMore) + '">' + h(T.centsUp || '+25¢') + '</button></div>' : '')
        + '<div class="su-stack">' + big('✓', fill(T.spendYes, { n: money(S.spend) }), '', false, 'spendSave') + '</div>' + skip('spend');
    } else if (s === 'taproom') {
      // Breweries (2026-11-12): "What kind of place?" (one of four) and "Food here?" (the main one), "Can people bring their
      // own food?" and, with their own kitchen, the pub's "Does your kitchen close before the bar?", all on one screen.
      var bw = S.brew;
      // Brewery test 2 (2026-11-13): the guess names the kind ("We picked “Brewery”"), so it reads above the fold on a phone.
      // Distilleries (Decided 1, 2026-11-13): no kind question; "Food here?" leads the screen.
      x = doneLine('taproom') + (C.distillery ? q(T.tfoodQ, T.tfoodLead) + msgs() : q(T.tkindQ, T.tkindLead) + (S.kindGuessed && S.place === S.kindGuessed && !CUR.place_type ? '<p class="su-sent su-research" id="suKindGuess">' + h(fill(T.kindGuess, { kind: (C.placeNames || {})[S.place] || (C.placeShow || {})[S.place] || S.place })) + '</p>' : '') + msgs()
        + '<div class="su-stack" role="group" id="suKindTiles">' + C.placeTypes.map(function(pt){ var on = S.place === pt; return '<button type="button" class="su-big' + (on ? '' : ' su-alt') + '" aria-pressed="' + (on ? 'true' : 'false') + '" data-place="' + h(pt) + '"><span class="su-ico" aria-hidden="true">' + (on ? '✓' : '○') + '</span><span>' + h(C.placeNames[pt] || pt) + ((T.tkindSubs || {})[pt] ? '<small>' + h(T.tkindSubs[pt]) + '</small>' : '') + '</span></button>'; }).join('') + '</div>'
        + '<h2 class="su-h2">' + h(T.tfoodQ) + '</h2><p class="su-hint">' + h(T.tfoodLead) + '</p>') + (S.foodGuessed && bw.food === S.foodGuessed && !BI.food ? '<p class="su-sent su-research" id="suFoodGuess">' + h(T.foodGuess) + '</p>' : '')
        // Brewery test 2 (2026-11-13): "Most days" / "Weekends only" right under Food trucks, the only food-truck detail.
        + bpicks('food', ['kitchen', 'trucks', 'snacks', 'none'], T.tfoods, T.tfoodSubs, bw.food === 'trucks' && T.ttrucks ? { trucks: '<div class="su-day" id="suTrucksQ" style="margin:2px 0 6px"><p class="su-q" style="margin-top:0">' + h(T.ttrucksQ) + '</p>'
          + (S.trucksGuessed && bw.trucks === S.trucksGuessed && !BI.trucks ? '<p class="su-sent su-research" id="suTrucksGuess">' + h(T.trucksGuess) + '</p>' : '') + bchips('trucks', ['most_days', 'weekends'], T.ttrucks, T.ttrucksQ) + '</div>' } : null)
        + (bw.food === 'kitchen' ? '<div class="su-day" id="suKitchenQ" style="margin-top:12px"><p class="su-q" style="margin-top:0">' + h(T.tkitchenQ) + '</p>' + bchips('kmode', ['same', 'earlier'], T.tkitchenOpts, T.tkitchenQ)
          + (bw.kmode === 'earlier' ? '<div class="su-times" style="margin-top:10px"><label class="su-q" for="suKto" style="margin:0">' + h(T.tkitchenAt) + '</label> <input type="time" id="suKto" value="' + h(bw.kcloses || beforeClose()) + '"></div>' : '') + '</div>' : '')
        + '<h2 class="su-h2">' + h(T.outsideQ) + '</h2>' + bchips('outside', ['yes', 'no'], T.outsideOpts, T.outsideQ)
        + '<div class="su-stack" style="margin-top:18px">' + big('✓', T.saveThese, '', false, 'taproomSave') + '</div>' + skip('taproom');
    } else if (s === 'flights') {
      // Breweries (2026-11-12): the flight price (quick buttons, Other, or "We don't do flights") and the to-go chips.
      var bf = S.brew, feeOn = function(n){ return !bf.feeOther && !bf.noFlights && bf.fee === n; };
      x = doneLine('flights') + '<h1>' + h(T.flightQ) + '</h1><p class="su-lead" id="suFlightLead">' + h(flightLeadText()) + '</p>' + (bf.feeGuessed && bf.fee != null && !isNaN(bf.fee) ? '<p class="su-sent su-research" id="suFeeGuess">' + h(fill(C.researchFeeFrom === 'visit' ? T.flightGuessVisit : T.flightGuess, { x: flightText(bf.fee) })) + '</p>' : '')
        + (CUR.flight_fee_waiting != null ? '<p class="su-sent" id="suFeeWaiting">' + h(fill(T.flightWaiting, { x: flightText(CUR.flight_fee_waiting) })) + '</p>' : '') + msgs()
        + '<div class="su-chips" role="group" aria-label="' + h(T.flightQ) + '" id="suFeeChips">' + QUICK_FLIGHTS.map(function(n){ return '<button type="button" class="su-chip" aria-pressed="' + (feeOn(n) ? 'true' : 'false') + '" data-bfee="' + n + '">' + h(flightText(n)) + '</button>'; }).join('')
        + '<button type="button" class="su-chip" aria-pressed="' + (bf.feeOther && !bf.noFlights ? 'true' : 'false') + '" data-bfee="other">' + h(T.feeOther) + '</button>'
        // Distilleries (Decided 2): "Free tastings" is its own button (the card says "Free tasting").
        + (C.distillery && T.feeFree ? '<button type="button" class="su-chip su-chip-wide" aria-pressed="' + (feeOn(0) ? 'true' : 'false') + '" data-bfee="0">' + h(T.feeFree) + '</button>' : '') + '</div>'
        + (bf.feeOther && !bf.noFlights ? field('suFee', T.feeLabel, bf.fee == null || isNaN(bf.fee) ? '' : String(bf.fee), { mode: 'decimal', max: 8 }) + '<p class="su-hint" id="suFeeOver">' + h(fill(T.feeOver, { n: C.feeLiveMax })) + '</p>' : '')
        + '<div class="su-stack" style="margin-top:10px"><button type="button" class="su-big' + (bf.noFlights ? '' : ' su-alt') + '" aria-pressed="' + (bf.noFlights ? 'true' : 'false') + '" data-bfee="none"><span class="su-ico" aria-hidden="true">' + (bf.noFlights ? '✓' : '○') + '</span><span>' + h(T.noFlights) + '<small>' + h(T.noFlightsSub) + '</small></span></button></div>'
        // Distillery test 1 (2026-11-13): the winery's "free with a bottle" question (not for free tastings or none).
        + (C.distillery && T.waivedQ && !bf.noFlights && !(bf.fee === 0 && !bf.feeOther) ? '<h2 class="su-h2" id="suWaivedQ">' + h(T.waivedQ) + '</h2>' + bpicks('waived', ['yes', 'two', 'no'], T.waivedOpts) : '')
        + '<h2 class="su-h2">' + h(T.togoQ) + '</h2><p class="su-hint">' + h(T.togoLead) + '</p>' + (S.togoGuessed && T.togoGuess ? '<p class="su-sent su-research" id="suToGoGuess">' + h(T.togoGuess) + '</p>' : '') + '<div class="su-chips" role="group" aria-label="' + h(T.togoQ) + '" id="suToGo">'
        + TOGO.concat(['none']).map(function(k){ return '<button type="button" class="su-chip' + (String(T.togo[k]).length > 8 ? ' su-chip-wide' : '') + '" aria-pressed="' + (bf.togo[k] ? 'true' : 'false') + '" data-btogo="' + k + '">' + h(T.togo[k]) + '</button>'; }).join('') + '</div>'
        + '<div class="su-stack" style="margin-top:18px">' + big('✓', T.saveThese, '', false, 'flightsSave') + '</div>' + skip('flights');
    } else if (s === 'winery') {
      // Wineries (2026-11-12): "What kind of winery?" (one of five) and "Food here?" on one screen. A restaurant on the estate
      // with its own page is only pointed to (Decided 3): its hours and menu are updated there.
      var wr = S.wine, rp = C.restaurantPage;
      x = doneLine('winery') + q(T.wkindQ, T.wkindLead) + msgs()
        + '<div class="su-stack" role="group" id="suKindTiles">' + C.placeTypes.map(function(pt){ var on = S.place === pt; return '<button type="button" class="su-big' + (on ? '' : ' su-alt') + '" aria-pressed="' + (on ? 'true' : 'false') + '" data-place="' + h(pt) + '"><span class="su-ico" aria-hidden="true">' + (on ? '✓' : '○') + '</span><span>' + h(C.placeNames[pt] || pt) + ((T.wkindSubs || {})[pt] ? '<small>' + h(T.wkindSubs[pt]) + '</small>' : '') + '</span></button>'; }).join('') + '</div>'
        + '<h2 class="su-h2">' + h(T.foodQ) + '</h2>' + (T.foodLead ? '<p class="su-hint">' + h(T.foodLead) + '</p>' : '') + wpicks('food', ['none', 'snacks', 'picnic', 'restaurant'], T.foods)
        + (wr.food === 'restaurant' ? (rp ? '<div class="su-day su-ownpage" id="suOwnPage"><p class="su-q" style="margin-top:0">' + h(fill(T.ownPage, { name: rp.name })) + '</p><p class="su-hint">' + h(T.ownPageSub) + '</p><a class="su-link" href="' + h(rp.url) + '" target="_blank" rel="noopener">' + h(fill(T.ownPageLink, { name: rp.name })) + ' ↗</a></div>'
            : field('suRname', T.rnameLabel, wr.rname, { max: 60 }) + ex(T.rnameEx) + field('suRwhen', T.rwhenLabel, wr.rwhen, { max: 60 }) + ex(T.rwhenEx)) : '')
        + '<div class="su-stack" style="margin-top:18px">' + big('✓', T.saveThese, '', false, 'winerySave') + '</div>' + skip('winery');
    } else if (s === 'tastings') {
      var wf = S.wine, feeOn = function(n){ return !wf.feeOther && wf.fee === n; };
      x = doneLine('tastings') + q(T.feeQ, T.feeLead) + (wf.feeGuessed && wf.fee != null && !isNaN(wf.fee) ? '<p class="su-sent su-research" id="suFeeGuess">' + h(fill(C.researchFeeFrom === 'visit' && T.feeGuessVisit ? T.feeGuessVisit : T.feeGuess, { x: feeText(wf.fee) })) + '</p>' : '')
        + (CUR.tasting_fee_waiting != null ? '<p class="su-sent" id="suFeeWaiting">' + h(fill(T.feeWaiting, { x: feeText(CUR.tasting_fee_waiting) })) + '</p>' : '') + msgs()
        + '<div class="su-chips" role="group" aria-label="' + h(T.feeQ) + '" id="suFeeChips">' + QUICK_FEES.map(function(n){ return '<button type="button" class="su-chip" aria-pressed="' + (feeOn(n) ? 'true' : 'false') + '" data-fee="' + n + '">' + h(feeText(n)) + '</button>'; }).join('')
        + '<button type="button" class="su-chip" aria-pressed="' + (wf.feeOther ? 'true' : 'false') + '" data-fee="other">' + h(T.feeOther) + '</button></div>'
        + (wf.feeOther ? field('suFee', T.feeLabel, wf.fee == null || isNaN(wf.fee) ? '' : String(wf.fee), { mode: 'decimal', max: 8 }) + '<p class="su-hint" id="suFeeOver">' + h(fill(T.feeOver, { n: C.feeLiveMax })) + '</p>' : '')
        + (wf.fee === 0 && !wf.feeOther ? '' : '<h2 class="su-h2">' + h(T.waivedQ) + '</h2>' + wpicks('waived', ['yes', 'two', 'no'], T.waivedOpts))
        + '<div class="su-stack" style="margin-top:18px">' + big('✓', T.saveThese, '', false, 'tastingsSave') + '</div>' + skip('tastings');
    } else if (s === 'visit') {
      // Winery test 2 (2026-11-12): the booking link box shows for walk-ins too, as optional (a group or tasting booking page).
      var wv = S.wine, linkShown = !!wv.visit, walkIn = wv.visit === 'walk_in';
      x = doneLine('visit') + q(T.visitQ, T.visitLead) + msgs() + wpicks('visit', ['walk_in', 'recommended', 'needed', 'appointment'], T.visits, T.visitSubs)
        // The booking link box (the same field as the edit page's), unless walk-ins only. "We don't take bookings online" is
        // offered only while no link is on file (it would contradict the page's Book button).
        + (linkShown ? '<div id="suBookBox" style="margin-top:14px">' + (wv.noBook && !walkIn ? '' : field('suBookUrl', walkIn && T.bookLinkLabelWalkIn ? T.bookLinkLabelWalkIn : T.bookLinkLabel, S.bookUrl != null ? S.bookUrl : CUR.booking_url || C.bookingKnown || '', { mode: 'url', max: 300 }) + ex(T.bookLinkEx) + '<p class="su-hint">' + h(T.bookLinkHint) + '</p>')
          + (CUR.booking_url || C.bookingKnown || walkIn ? '' : '<div class="su-chips" role="group" aria-label="' + h(T.bookLinkLabel) + '"><button type="button" class="su-chip su-chip-wide" aria-pressed="' + (wv.noBook ? 'true' : 'false') + '" data-wnobook="1">' + h(T.noBookLink) + '</button></div>') + '</div>' : '')
        + '<h2 class="su-h2">' + h(T.groupsSizeQ) + '</h2><p class="su-hint">' + h(T.groupsSizeLead) + '</p>' + wchips('groups', [4, 6, 8, 10, 12], { 4: '4+', 6: '6+', 8: '8+', 10: '10+', 12: '12+' }, T.groupsSizeQ)
        + '<h2 class="su-h2">' + h(T.busesQ) + '</h2>' + (T.busesLead ? '<p class="su-hint" id="suBusesLead">' + h(T.busesLead) + '</p>' : '') + wchips('buses', ['welcome', 'book', 'no'], T.buses, T.busesQ)
        + '<div class="su-stack" style="margin-top:18px">' + big('✓', T.saveThese, '', false, 'visitSave') + '</div>' + skip('visit');
    } else if (s === 'experiences') {
      x = doneLine('experiences') + q(T.expQ, T.expLead) + msgs() + [0, 1].map(function(i){ var e = S.wine.exp[i];
        return '<div class="su-day"><p class="su-q" style="margin-top:0">' + h(fill(T.expN, { n: i + 1 })) + '</p>'
          + '<div class="su-chips" role="group" aria-label="' + h(T.expNameLabel) + '">' + T.expQuick.map(function(t){ return '<button type="button" class="su-chip su-chip-wide" aria-pressed="' + (e.label === t ? 'true' : 'false') + '" data-xq="' + i + ':' + h(t) + '">' + h(t) + '</button>'; }).join('') + '</div>'
          + field('suXl' + i, T.expNameLabel, e.label, { max: 24 }) + field('suXt' + i, T.expTextLabel, e.text, { max: 120 }) + ex(i ? T.expEx2 : T.expEx1) + '</div>'; }).join('')
        + '<div class="su-stack" style="margin-top:14px">' + big('✓', T.saveThese, '', false, 'expSave') + big('✕', T.expNone, '', true, 'expNone') + '</div>' + skip('experiences');
    } else if (s === 'hours:appt') {
      // Wineries (2026-11-12): "In the off-season we're open by appointment": the walk-in season, repeated every year.
      var ap0 = S.apptDraft || S.wine.season || { from: '', to: '' };
      x = q(T.apptQ, T.apptLead) + msgs() + '<div class="su-seadates su-openseason"><p class="su-q">' + h(T.apptFrom) + '</p>' + mdPick('suAf', ap0.from, T.apptFrom) + '<p class="su-q">' + h(T.apptTo) + '</p>' + mdPick('suAt', ap0.to, T.apptTo) + '</div>'
        + '<p class="su-hint su-repeats">' + h(T.repeatsYearly) + '</p><div class="su-stack">' + big('✓', T.apptSave, '', false, 'apptSave') + big('✕', T.allYearBtn, '', true, 'go:hours:year') + '</div>';
    } else if (s === 'cuisine' && C.cafe) {
      // Cafés (2026-11-10): "What kind of café?" first (one of 11), then "What do you serve?".
      x = doneLine('cuisine') + q(T.kindQ, T.kindLead) + (S.kindGuessed && S.place === S.kindGuessed ? '<p class="su-sent su-research" id="suKindGuess">' + h(fill(T.kindGuess, { kind: C.placeNames[S.place] || S.place })) + '</p>' : '') + msgs()
        + '<div class="su-tiles" id="suKindTiles">' + C.placeTypes.map(function(pt){ return '<button type="button" class="su-tile" aria-pressed="' + (S.place === pt ? 'true' : 'false') + '" data-place="' + h(pt) + '">' + h(C.placeNames[pt] || pt) + '</button>'; }).join('') + '</div>'
        + '<div class="su-stack' + (S.place ? ' su-sticky' : '') + '">' + big('➜', T.kindNext, '', false, 'kindNext') + '</div>' + skip('cuisine');
    } else if (s === 'cuisine:serve') {
      // Café test 2 (2026-11-11): the chip that matches the kind is ticked as a suggestion, only while nothing is saved yet.
      var pre = KIND_SERVE[S.place];
      if (pre && !S.serveSuggested && !(CI.serves || []).length && !Object.keys(S.cafe.serves).some(function(z){ return S.cafe.serves[z]; })) { S.cafe.serves[pre] = true; S.serveSuggested = pre; }
      var preName = S.serveSuggested && S.cafe.serves[S.serveSuggested] ? (C.serves.filter(function(o){ return o.k === S.serveSuggested; })[0] || {}).t : '';
      x = q(T.serveQ, T.serveLead) + (preName ? '<p class="su-sent su-research" id="suServePre">' + h(fill(T.servePre, { x: preName })) + '</p>' : '') + msgs() + '<div class="su-tiles" id="suServeTiles">' + servesShown().map(function(o){ return '<button type="button" class="su-tile" aria-pressed="' + (S.cafe.serves[o.k] ? 'true' : 'false') + '" data-ctog="serves:' + o.k + '"><span class="su-e" aria-hidden="true">' + o.i + '</span>' + h(o.t) + '</button>'; }).join('') + '</div>'
        + (S.cuis.length ? '<p class="su-sent">' + h(fill(T.picked, { list: S.cuis.map(function(c){ return C.cuisineNames[c] || c; }).join(', ') })) + '</p>' : '')
        + '<button type="button" class="su-more" data-act="go:cuisine:style">' + h(T.styleMore) + '</button>'
        + '<div class="su-stack su-sticky">' + big('✓', T.saveServe, '', false, 'serveSave') + '</div>';
    } else if (s === 'cuisine' || s === 'cuisine:style') {
      var showAll = S.cuiAll || S.cuiQ.trim();
      var shown = showAll ? C.cuisines : C.popular.concat(S.cuis.filter(function(c){ return C.popular.indexOf(c) < 0; }));
      if (s === 'cuisine:style') { x = q(T.styleMore, T.styleLead) + (S.cuis.length ? '<p class="su-sent">' + h(fill(T.picked, { list: S.cuis.map(function(c){ return C.cuisineNames[c] || c; }).join(', ') })) + '</p>' : '') + msgs()
        + (showAll ? field('suCq', T.typeToFind, S.cuiQ, { type: 'search', data: 'placeholder="' + h(T.findEx) + '"' }) : '')
        + '<div class="su-tiles" id="suCuiTiles">' + shown.map(function(c){ return '<button type="button" class="su-tile" aria-pressed="' + (S.cuis.indexOf(c) >= 0 ? 'true' : 'false') + '" data-cui="' + h(c) + '"><span class="su-e" aria-hidden="true">' + (C.cuisineIcons[c] || '🍽️') + '</span>' + h(C.cuisineNames[c] || c) + '</button>'; }).join('') + '</div>'
        + '<p class="su-lead" id="suCuiNone" hidden>' + h(T.notOnList) + '</p>' + (showAll ? '' : '<button type="button" class="su-more" data-act="cuiAll">' + h(T.showMore) + '</button>')
        + '<div class="su-stack su-sticky">' + big('✓', T.styleDone, '', false, 'styleDone') + '</div>';
      } else
      x = doneLine('cuisine') + q(T.cuisineQ, C.pub && !S.cuis.length ? T.cuisineLeadEmpty : T.cuisineLead) + (S.cuis.length ? '<p class="su-sent">' + h(fill(T.picked, { list: S.cuis.map(function(c){ return C.cuisineNames[c] || c; }).join(', ') })) + '</p>' : '') + msgs()
        + (showAll ? field('suCq', T.typeToFind, S.cuiQ, { type: 'search', data: 'placeholder="' + h(T.findEx) + '"' }) : '')
        + '<div class="su-tiles" id="suCuiTiles">' + shown.map(function(c){ return '<button type="button" class="su-tile" aria-pressed="' + (S.cuis.indexOf(c) >= 0 ? 'true' : 'false') + '" data-cui="' + h(c) + '"><span class="su-e" aria-hidden="true">' + (C.cuisineIcons[c] || '🍽️') + '</span>' + h(C.cuisineNames[c] || c) + '</button>'; }).join('') + '</div>'
        + '<p class="su-lead" id="suCuiNone" hidden>' + h(T.notOnList) + '</p>'
        + (showAll ? '' : '<button type="button" class="su-more" data-act="cuiAll">' + h(T.showMore) + '</button>')
        + '<div class="su-stack' + (S.cuis.length ? ' su-sticky' : '') + '">' + big('➜', T.cuisineNext, '', false, 'cuisineNext') + '</div>'
        // Only before the kitchen question is answered (pub test 5: offered right after "food until we close").
        + (C.pub && !S.kitchen.mode ? '<div class="su-skip"><button type="button" class="su-link" data-act="noFood">' + h(T.noFood) + '</button></div>' : '') + skip('cuisine');
    } else if (s === 'cuisine:place') {
      x = q(T.placeQ, T.placeLead) + msgs() + '<div class="su-tiles">' + C.placeTypes.map(function(pt){ return '<button type="button" class="su-tile" aria-pressed="' + (S.place === pt ? 'true' : 'false') + '" data-place="' + h(pt) + '">' + h(C.placeNames[pt] || pt) + '</button>'; }).join('') + '</div>'
        + '<div class="su-stack">' + big('✓', T.saveFood, '', false, 'cuisineSave') + '</div>';
    } else if (s === 'photos') {
      x = (S.photosSent || S.done.photos === 'day' ? '<p class="su-sent">' + h(fill(T.photosSent, { n: S.photosSent || '' }).replace('  ', ' ').replace(/^✓ (\S)/, function(m, c){ return '✓ ' + c.toUpperCase(); })) + '</p>' + q(T.photosMore) : q(T.photosQ, photosHint())) + msgs()
        + '<div class="su-stack">' + big('📷', T.take, T.takeSub, false, 'take') + big('🖼️', T.choose, '', true, 'pick') + (S.photosSent || S.done.photos === 'day' ? big('➜', T.photosNoMore, '', true, 'after:photos') : '') + '</div>' + (S.photosSent || S.done.photos ? '' : skip('photos'));
    } else if (s === 'photos:review') {
      var g = goodPhotos();
      // With a main photo already on the page, it stays unless the owner picks a new one (pub fresh-eyes 2, 2026-11-10: a new
      // upload quietly became the main photo). With none yet, the first good photo is the main one, as before.
      if (C.image && S.keepMain !== false) S.photos.forEach(function(ph){ ph.main = false; });
      else if (g.length && !g.some(function(ph){ return ph.main; })) { S.photos.forEach(function(ph){ ph.main = false; }); g[0].main = true; }
      var keeping = !!C.image && !S.photos.some(function(ph){ return ph.main; });
      // Pub test 7 (2026-11-10): after she picks a new main photo it is the one shown here ("Your new main photo (on your
      // page within a day)"), not the old Google Maps one.
      var ownish = C.imageSource === 'own' || C.imageSource === 'pending';
      x = q(T.reviewQ, C.image ? (ownish ? T.reviewLeadKeep : T.reviewLeadKeepOther) : T.reviewLead)
        + (C.image ? '<div class="su-curmain"><img src="' + h(C.image) + '" alt=""><div><p class="su-q" style="margin:0 0 8px" id="suCurMain">' + h(C.imageSource === 'pending' ? T.curMainPending : C.imageSource === 'own' ? T.curMain : C.imageSource === 'google' ? T.curMainGoogle : T.curMainOther) + '</p><button type="button" class="su-toggle" data-act="keepMain" aria-pressed="' + (keeping ? 'true' : 'false') + '">' + h((keeping ? '✓ ' : '') + (C.imageSource === 'pending' ? T.keepMainPending : C.imageSource === 'own' ? T.keepMain : T.keepMainOther)) + '</button></div></div>' : '')
        + '<div class="su-grid">' + S.photos.map(function(ph, i){
        var m = ph.bad === 'small' ? T.tooSmall : T.cantOpen;
        return '<div class="su-ph' + (ph.main ? ' su-main' : '') + (ph.bad ? ' su-bad' : '') + '">' + (ph.thumb ? '<img src="' + ph.thumb + '" alt="">' : '<img alt="">')
          + '<button type="button" class="su-x" data-del="' + i + '" aria-label="' + h(fill(T.removePhoto, { n: i + 1 })) + '"' + (S.busy ? ' disabled' : '') + '>✕</button>'
          // Photo order (pub test 9, 2026-11-10): earlier / later; your page shows them in this order after the main photo.
          + (S.photos.length > 1 && !S.busy ? '<span class="su-order"><button type="button" class="su-ord" data-pmove="' + i + ':-1" aria-label="' + h(fill(T.photoEarlier, { n: i + 1 })) + '"' + (i === 0 ? ' disabled' : '') + '>◀</button><button type="button" class="su-ord" data-pmove="' + i + ':1" aria-label="' + h(fill(T.photoLater, { n: i + 1 })) + '"' + (i === S.photos.length - 1 ? ' disabled' : '') + '>▶</button></span>' : '')
          + (ph.bad ? '<div class="su-badmsg">' + h(m) + '</div><span class="su-tag">' + h(T.wontAdd) + '</span>' : '<button type="button" class="su-tag" data-main="' + i + '" aria-pressed="' + (ph.main ? 'true' : 'false') + '">' + h(ph.main ? T.isMain : T.makeMain) + '</button>') + '</div>';
      }).join('') + '</div>' + (S.photos.length > 1 ? '<p class="su-hint">' + h(T.photoOrderHint) + '</p>' : '') + (S.busy ? '' : '<button type="button" class="su-more" data-act="pick">' + h(T.addAnother) + '</button>')
        + msgs() + '<p class="su-note" id="suProgress" role="status"></p>' + (S.busy ? '' : '<p class="su-hint" id="suSendFirst">' + h(T.sendBeforeLeave) + '</p>')
        // Café test 4 (2026-11-11): a picked photo isn't kept if the page is left before Send.
        // Café test 5 (2026-11-12): the rights box sits right above Send. Send tapped first asks for it gently (a gold outline
        // and "Tick this box, then tap Send." in it), never a red error.
        + '<label class="su-tick su-rights' + (S.rights ? ' su-ticked' : '') + (S.rightsAsk && !S.rights ? ' su-ask' : '') + '" id="suTickBox"><input type="checkbox" id="suRights"' + (S.rights ? ' checked' : '') + '><span><small>' + h(T.rightsStep) + '</small>' + h(T.rights)
        + '<span class="su-rightsask" id="suRightsAsk" role="status">' + (S.rightsAsk && !S.rights ? h(S.backWarned ? T.photosBackAsk : T.rightsAsk) : '') + '</span></span></label>'
        + '<div class="su-stack">' + big('✓', S.error ? T.tryAgain : g.length === 1 ? T.sendOne : fill(T.sendMany, { n: g.length }), '', false, 'sendPhotos') + '</div>';
    } else if (s === 'menu') {
      var sentM = S.done.menu === 'day';
      // Sent already: say so in the heading, Next is the main button, and a newer menu is the smaller choice (as photos).
      x = (sentM ? q(T.menuSentQ) + msgs() + '<div class="su-stack" style="margin-bottom:22px">' + big('➜', nextLabel('menu'), '', false, 'after:menu') + '</div><h2 class="su-h2">' + h(T.menuNewer) + '</h2>'
          : (S.done.menu === 'email' ? '<p class="su-sent">' + h(T.menuSentEmail) + '</p>' : '') + q(T.menuQ, T.menuLead) + msgs())
        + '<div class="su-stack">' + big('📷', T.snap, T.snapSub, sentM, 'go:menu:cam') + big('📄', T.upload, T.uploadSub, true, 'go:menu:upload') + (C.website ? big('🌐', T.web, '', true, 'go:menu:web') : '') + big('📘', T.menuSocial, fbKnown() ? fill(T.menuFbKnown, { x: siteDomain(fbKnown()) }) : '', true, 'go:menu:social')
        // Café test 2 (2026-11-11): flavours that change every day ("see Instagram / Facebook / the board").
        + (C.cafe ? big('🔄', iceKind() ? T.menuDailyIce : T.menuDaily, T.menuDailySub, true, 'go:menu:daily') : '') + big('✉️', T.emailIt, '', true, 'go:menu:email') + '</div>' + (sentM ? '' : skip('menu'));
    } else if (s === 'menu:daily') {
      var mdw = S.cafe.menuDaily || '';
      x = q(iceKind() ? T.menuDailyQIce : T.menuDailyQ, T.menuDailyLead) + msgs() + '<div class="su-stack" role="group">' + ['instagram', 'facebook', 'board'].map(function(k){ var on = mdw === k; return '<button type="button" class="su-big' + (on ? '' : ' su-alt') + '" aria-pressed="' + (on ? 'true' : 'false') + '" data-act="menuDaily:' + k + '"><span class="su-ico" aria-hidden="true">' + (on ? '✓' : { instagram: '📸', facebook: '📘', board: '🪧' }[k]) + '</span><span>' + h(T.menuDailyWhere[k]) + '</span></button>'; }).join('') + '</div>'
        + '<p class="su-hint">' + h(fill(T.menuDailyShows, { x: (iceKind() ? T.menuDailyLineIce : T.menuDailyLine) + T.menuDailySee.instagram })) + '</p>';
    } else if (s === 'menu:social') {
      // Pub test 5 (2026-11-10): the menu is on Facebook or Instagram. A link is the menu link (checked first, like the
      // website one); a page name goes to us to find (the Facebook "find the link" way).
      x = q(T.menuSocialQ, T.menuSocialLead) + msgs() + field('suMsoc', T.menuSocialLabel, S.menuSoc || fbKnown(), { mode: 'url', max: 300 }) + ex(T.menuSocialEx)
        + '<div class="su-stack">' + big('✓', T.saveThis, '', false, 'menuSocialSave') + '</div>';
    } else if (s === 'menu:upload' || s === 'happy:sheet' || s === 'specials:sheet') {
      var isMenu = s === 'menu:upload', files = isMenu ? S.menuFiles : S.sheetFiles;
      var title = isMenu ? (files.length ? T.upQSome : T.upQ) : p[0] === 'happy' ? T.sheetHappyQ : T.sheetSpecialsQ;
      var lead = isMenu ? (files.length ? T.upLeadSome : T.upLead) : files.length ? T.sheetLeadSome : T.sheetLead;
      x = q(title, lead) + msgs() + files.map(function(f, i){ return '<div class="su-row"><span aria-hidden="true">' + (f.pdf ? '📄' : '🖼️') + '</span><span>' + h(f.name) + '</span><button type="button" data-fdel="' + i + '" aria-label="' + h(fill(T.removeFile, { name: f.name })) + '"' + (S.busy ? ' disabled' : '') + '>✕</button></div>'; }).join('')
        // The menu (pub test 4): "Add another file" first, "Send my menu" second (first only to try a failed send again).
        + '<p class="su-note" id="suProgress" role="status"></p><div class="su-stack">' + (files.length && !(isMenu && !S.error && !S.busy) ? big('✓', S.error ? T.tryAgain : isMenu ? T.sendMenu : T.sendIt, '', false, isMenu ? 'sendMenuFiles' : 'sendSheet:' + p[0]) : '')
        + (S.busy ? '' : big('📄', files.length ? T.upMore : isMenu ? T.upPick : T.chooseFile, '', !!files.length && !(isMenu && !S.error), isMenu ? 'menuFile' : 'sheetFile') + (isMenu ? '' : big('📷', T.camTake, '', true, 'sheetCam')))
        + (isMenu && files.length && !S.error && !S.busy ? big('✓', T.sendMenu, '', true, 'sendMenuFiles') : '') + '</div>';
    } else if (s === 'menu:cam') {
      var n = S.menuPages.length;
      x = q(n ? (n === 1 ? T.camGot1 : fill(T.camGotN, { n: n })) : T.camQ, n ? T.camLeadSome : T.camLead) + msgs()
        + (n ? '<p class="su-hint">' + h(T.tapBigger) + '</p><div class="su-pages su-pages-big">' + S.menuPages.map(function(pg, i){ return '<div><img data-zoom="1" src="' + pg.thumb + '" alt="' + h(fill(T.page, { n: i + 1 })) + '"><span>' + (i + 1) + '</span><button type="button" class="su-x" data-pdel="' + i + '" aria-label="' + h(fill(T.removePage, { n: i + 1 })) + '"' + (S.busy ? ' disabled' : '') + '>✕</button></div>'; }).join('') + '</div>' : '')
        // Pub test 4 (2026-11-10): "Add another page" comes first and is the main button, so a 2-page menu isn't sent
        // after page 1; "Send my menu" is second (first only to try a failed send again).
        + '<p class="su-note" id="suProgress" role="status"></p><div class="su-stack">' + (n && (S.error || S.busy) ? big('✓', S.error ? T.tryAgain : T.sendMenu, '', false, 'sendMenuPages') : '')
        + (S.busy ? '' : big('📷', n ? T.camMore : T.camTake, '', !!(n && S.error), 'menuCam')) + (n && !S.error && !S.busy ? big('✓', T.sendMenu, '', true, 'sendMenuPages') : '') + '</div>';
    } else if (s === 'menu:web' || s === 'happy:web' || s === 'specials:web') {
      // Pub test 9 (2026-11-10): never the website's query or #fragment, so a tracked link (…/?utm_source=okanaganroam) is
      // never prefilled for "add the page after the /". Brewery test 4: its path is kept (siteUrl).
      var site = siteUrl(C.website), siteHost = siteHostOf(C.website);
      var lead2 = s === 'menu:web' ? (site ? T.webLead : T.webLeadEmpty) : p[0] === 'happy' ? T.webWhereHappy : T.webWhereSpecials;
      var urlNow = S.webUrl != null ? S.webUrl : site;
      x = q(s === 'menu:web' ? (site ? T.webQ : T.webQEmpty) : T.webWhereQ, lead2) + msgs() + field('suUrl', T.webLabel, urlNow, { mode: 'url', max: 300 })
        // Pub test 7 (2026-11-10): one tap for the website she typed or we have ("Use sandbarpub.ca"); never one being removed.
        // Café test 5 (2026-11-12): hidden while the box already holds that address (it read as a puzzle beside it).
        + (site ? '<p class="su-hint" id="suUseSiteRow"' + (urlNow.trim() === site ? ' hidden' : '') + '><button type="button" class="su-link su-usesite" data-act="urlBack">' + h(fill(T.useSite, { site: siteHost })) + '</button></p>' : '')
        + (s === 'menu:web' ? '' : ex(fill(p[0] === 'happy' ? T.webExHappy : T.webExSpecials, { site: siteHost || 'yourplace.com' })))
        + '<div class="su-stack">' + big('✓', T.useAddress, s === 'menu:web' ? '' : T.webCopy, false, s === 'menu:web' ? 'menuWebSave' : 'sheetWebSave:' + p[0]) + '</div>';
    } else if (s === 'menu:email') {
      var mail = 'mailto:' + C.email + '?subject=' + encodeURIComponent(fill(T.mailSubject, { name: C.name }));
      x = q(T.emailQ, fill(T.emailLead, { name: C.name })) + '<div class="su-row su-mail"><span aria-hidden="true">✉️</span><span id="suEm">' + h(C.email) + '</span><button type="button" data-act="copy">' + h(T.copy) + '</button></div><p class="su-note" id="suCopied" role="status"></p>'
        + '<div class="su-stack"><a class="su-big su-alt" href="' + h(mail) + '"><span class="su-ico" aria-hidden="true">✉️</span><span>' + h(T.openMail) + '<small>' + h(T.openMailSub) + '</small></span></a>' + big('✓', T.willEmail, '', false, 'menuEmailDone') + '</div>';
    } else if (s === 'offer') {
      // Winery test 1 (2026-11-12): "Food here: Picnic area" pre-ticks the Picnic area tile, as a suggestion only (saved with
      // this screen, like the research ticks), while this screen has never been saved.
      if (C.winery && !S.done.offer && !S.picnicSuggested && S.wine.food === 'picnic' && C.offerLabels.picnic_area && !S.badges.picnic_area) { S.badges.picnic_area = true; S.picnicSuggested = true; }
      // Winery test 2 (2026-11-12): research's Plan your visit lines (free parking, step-free, dogs welcome) pre-tick their
      // tiles the same way: suggestions only, saved with this screen, while it has never been saved.
      if ((C.winery || C.brewery || CK) && !S.done.offer && !S.visitTicksSet) { S.visitTicksSet = true; S.visitTicked = (C.visitTicks || []).filter(function(k){ if (S.badges[k] || (k === 'dog_friendly' && S.noDogs)) return false; S.badges[k] = true; return true; }); }
      // Pub test 5: tiles pre-ticked from our research say so, above the tiles (until the owner has saved this screen).
      var resTicked = !S.done.offer && ((C.researchTicks || []).some(function(k){ return S.badgesAtStart[k]; }) || (S.visitTicked || []).some(function(k){ return S.badges[k]; }));
      x = doneLine('offer') + q(T.offerQ, T.offerLead) + (resTicked ? '<p class="su-sent su-research" id="suResearch">' + h(T.researchLine) + '</p>' : '')
        + (S.picnicSuggested && !S.done.offer && S.badges.picnic_area && T.picnicFromFood ? '<p class="su-sent su-research" id="suPicnicFromFood">' + h(T.picnicFromFood) + '</p>' : '') + msgs() + C.offerGroups.map(function(g){ return '<h2 class="su-h2">' + h(g.title) + '</h2><div class="su-tiles">' + g.keys.filter(tileShown).map(function(k){ return '<button type="button" class="su-tile" aria-pressed="' + (S.badges[k] ? 'true' : 'false') + '" data-off="' + k + '"><span class="su-e" aria-hidden="true">' + C.offerIcons[k] + '</span>' + h(C.offerLabels[k]) + '</button>'; }).join('')
          + (g.keys.indexOf('vegan') >= 0 && !C.brewery ? '<button type="button" class="su-tile su-tile-wide" aria-pressed="' + (S.noDiet ? 'true' : 'false') + '" data-off="none_diet"><span class="su-e" aria-hidden="true">🚫</span>' + h(T.noneDiet) + '<span class="su-tile-sub">' + h(T.noneDietSub) + '</span></button>' : '')
          + (C.pub && GAMES.some(function(gk){ return g.keys.indexOf(gk) >= 0; }) ? '<button type="button" class="su-tile su-tile-wide" aria-pressed="' + (S.noGames ? 'true' : 'false') + '" data-off="no_games"><span class="su-e" aria-hidden="true">🚫</span>' + h(T.noGames) + '<span class="su-tile-sub">' + h(T.noGamesSub) + '</span></button>' : '')
          + (C.cafe && g.keys.indexOf('wifi') >= 0 ? '<button type="button" class="su-tile su-tile-wide" aria-pressed="' + (S.noWifi ? 'true' : 'false') + '" data-off="no_wifi"><span class="su-e" aria-hidden="true">🚫</span>' + h(T.noWifi) + '<span class="su-tile-sub" id="suNoWifiSub">' + h(wifiSubText()) + '</span></button>' : '')
          // Café test 2 (2026-11-11): "No seats inside (takeout only)" up front, and an explicit "No washroom" (never shown).
          + (C.cafe && g.keys.indexOf('washroom') >= 0 ? '<button type="button" class="su-tile su-tile-wide" aria-pressed="' + (S.noWash ? 'true' : 'false') + '" data-off="no_washroom"><span class="su-e" aria-hidden="true">🚫</span>' + h(T.noWashroom) + '<span class="su-tile-sub">' + h(T.noWashroomSub) + '</span></button>'
            + '<button type="button" class="su-tile su-tile-wide" aria-pressed="' + (S.cafe.stay.seats === 'takeout' ? 'true' : 'false') + '" data-off="takeout_only"><span class="su-e" aria-hidden="true">🥡</span>' + h(T.takeoutOnly) + '<span class="su-tile-sub">' + h(T.takeoutOnlySub) + '</span></button>' : '')
          + (C.pub && g.keys.indexOf('sports_tv') >= 0 ? '<button type="button" class="su-tile su-tile-wide" aria-pressed="' + (S.noSports ? 'true' : 'false') + '" data-off="no_sports"><span class="su-e" aria-hidden="true">🚫</span>' + h(T.noSports) + '<span class="su-tile-sub">' + h(T.noSportsSub) + '</span></button>' : '')
          + (g.keys.indexOf('dog_friendly') >= 0 ? '<button type="button" class="su-tile su-tile-wide" aria-pressed="' + (S.noDogs ? 'true' : 'false') + '" data-off="no_dogs"><span class="su-e" aria-hidden="true">🚫</span>' + h(T.noDogs) + '<span class="su-tile-sub" id="suNoDogsSub">' + h(dogSubText()) + '</span></button>'
            // Pub test 8 (2026-11-10): "Service dogs welcome", the follow-up to No dogs (shown only while No dogs is on).
            + (C.offerLabels.service_dogs ? '<button type="button" class="su-tile su-tile-wide su-subtile" id="suServiceDogs" aria-pressed="' + (S.badges.service_dogs ? 'true' : 'false') + '" data-off="service_dogs"' + (S.noDogs ? '' : ' hidden') + '><span class="su-e" aria-hidden="true">' + C.offerIcons.service_dogs + '</span>' + h(C.offerLabels.service_dogs) + '<span class="su-tile-sub">' + h(T.serviceDogsSub) + '</span></button>' : '') : '') + '</div>'; }).join('')
        + '<p class="su-hint su-sportsnote" id="suSportsNote" role="status"' + (sportsBit() && !S.badges.sports_tv ? '' : ' hidden') + '>' + h(fill(T.storySportsLead, { bit: sportsBit() })) + '</p>'
        + '<div class="su-stack su-offer-save">' + big('✓', T.saveOffer, '', false, 'offerSave') + '</div>' + skip('offer');
    } else if (s === 'offer:laptops') {
      x = q(T.laptopQ, T.laptopLead) + msgs() + radios('stay.laptops', ['all_day', 'not_busy', 'none'], T.laptops, T.laptopSub)
        + '<div class="su-stack" style="margin-top:14px">' + big('✓', T.saveThis, '', false, 'laptopSave') + '</div><div class="su-skip"><button type="button" class="su-link" data-act="go:' + (offerNext('offer:laptops') || 'saved:offer') + '">' + h(T.skip) + '</button></div>';
    } else if (s === 'stay') {
      x = doneLine('stay') + q(T.stayQ, T.stayLead) + msgs() + '<h2 class="su-h2">' + h(T.seatsQ) + '</h2>' + radios('stay.seats', ['takeout', 'few', 'lots'], T.seats)
        + '<h2 class="su-h2">' + h(T.laptopsQ) + '</h2>' + radios('stay.laptops', ['all_day', 'not_busy', 'none'], T.laptops, T.laptopSub)
        + '<h2 class="su-h2">' + h(T.stayExtras) + '</h2><div class="su-tiles">' + ctile('stay.outlets', '🔌', T.outlets) + ctile('stay.quiet', '🤫', T.quiet) + '</div>'
        + '<div class="su-stack">' + big('✓', T.saveThese, '', false, 'staySave') + '</div>' + skip('stay');
    } else if (s === 'order') {
      var od = S.cafe.order;
      // Café test 4 (2026-11-11): Drive-thru and Walk-up window are asked once, on "What you offer" (the badges the page
      // shows). This screen no longer repeats them, and its save never touches them.
      x = doneLine('order') + q(T.orderQ, T.orderLead) + msgs() + '<div class="su-tiles">' + ctile('order.online', '🌐', T.orderOnline) + (cakesShown() ? ctile('order.preorder', '🎂', T.preorder) : '')
        + '<button type="button" class="su-tile su-tile-wide" aria-pressed="' + (od.counter ? 'true' : 'false') + '" data-ctog="order.counter"><span class="su-e" aria-hidden="true">🚫</span>' + h(T.counterOnly) + '<span class="su-tile-sub">' + h(cakesShown() ? T.counterOnlySub : T.counterOnlySubNoCakes || T.counterOnlySub) + '</span></button></div>'
        + (od.online ? field('suOurl', T.orderUrlLabel, od.url, { mode: 'url', max: 300 }) + ex(T.orderUrlEx) : '')
        + (od.preorder ? field('suOhow', T.preorderHowLabel, od.how, { max: 120 }) + ex(T.preorderHowEx) + field('suOpurl', T.preorderUrlLabel, od.purl, { mode: 'url', max: 300 }) : '')
        + (od.online || od.preorder ? '<p class="su-hint">' + h(T.linkHint) + '</p>' : '')
        + '<div class="su-stack">' + big('✓', T.saveThese, '', false, 'orderSave') + '</div>' + skip('order');
    } else if (s === 'diet' && iceKind()) {
      // Café test 2 (2026-11-11): gelato and ice cream get their own questions (dairy-free sorbet, vegan, gluten-free cups
      // or cones), not milks and baking.
      var di = S.cafe.diet;
      x = doneLine('diet') + q(T.dietQ, T.dietLead) + msgs() + '<h2 class="su-h2">' + h(T.iceDfQ) + '</h2><div class="su-tiles">' + ctile('diet.df_sorbet', '🍧', T.dfSorbet) + ctile('diet.vegan_ice', '🌱', T.veganIce) + '</div>'
        + '<h2 class="su-h2">' + h(T.gfConesQ) + '</h2>' + radios('diet.gf_cones', ['cups', 'cones'], T.gfCones)
        + '<h2 class="su-h2">' + h(T.dietMore) + '</h2><div class="su-tiles">' + ctile('diet.nut_free', '🥜', T.nutFreeIce) + '</div>'
        + field('suDnote', T.dietNoteLabel, di.note, { max: 120, data: 'aria-describedby="suDnoteC"' }) + '<p class="su-count" id="suDnoteC" aria-live="polite">' + h(noteRoom(di.note)) + '</p>' + ex(T.dietNoteExIce)
        + '<div class="su-stack">' + big('✓', T.saveThese, '', false, 'dietSave') + '</div>' + skip('diet');
    } else if (s === 'diet') {
      var dt = S.cafe.diet, anyMilk = Object.keys(dt.milks).some(function(m){ return dt.milks[m]; });
      x = doneLine('diet') + q(T.dietQ, T.dietLead) + msgs() + '<h2 class="su-h2">' + h(T.milksQ) + '</h2><div class="su-chips" role="group" aria-label="' + h(T.milksQ) + '">' + C.milks.map(function(o){ return '<button type="button" class="su-chip" aria-pressed="' + (dt.milks[o.k] ? 'true' : 'false') + '" data-ctog="milks:' + o.k + '">' + h(o.t) + '</button>'; }).join('') + '</div>'
        + (anyMilk ? '<p class="su-q">' + h(T.milkExtraQ) + '</p>' + radios('diet.milk_extra', ['no', 'yes'], T.milkExtra) : '')
        + '<h2 class="su-h2">' + h(T.gfQ) + '</h2>' + radios('diet.gf_kitchen', ['dedicated', 'shared'], T.gf)
        + '<h2 class="su-h2">' + h(T.dietMore) + '</h2><div class="su-tiles">' + ctile('diet.vegan_baking', '🌱', T.veganBaking) + ctile('diet.nut_free', '🥜', T.nutFree) + '</div>'
        // Café test 1 (2026-11-11): a short note in her words ("Oat & almond milk +50¢ · Gluten-free: macarons only"), with a live count.
        + field('suDnote', T.dietNoteLabel, dt.note, { max: 120, data: 'aria-describedby="suDnoteC"' }) + '<p class="su-count" id="suDnoteC" aria-live="polite">' + h(noteRoom(dt.note)) + '</p>' + ex(T.dietNoteEx)
        + '<div class="su-stack">' + big('✓', T.saveThese, '', false, 'dietSave') + '</div>' + skip('diet');
    } else if (s === 'coffee') {
      var cf = S.cafe.coffee;
      x = doneLine('coffee') + q(T.coffeeQ, T.coffeeLead) + msgs() + '<div class="su-tiles">' + ctile('coffee.roast_own', '🔥', T.roastOwn) + ctile('coffee.beans', '🫘', T.beansForSale) + '</div>'
        + (cf.roast_own ? '' : field('suCsrc', T.sourceLabel, cf.source, { max: 80 }) + ex(T.sourceEx))
        + '<div class="su-stack">' + big('✓', T.saveThis, '', false, 'coffeeSave') + '</div>' + skip('coffee');
    } else if (s === 'sellout') {
      x = doneLine('sellout') + q(T.selloutQ, T.selloutLead) + msgs() + '<label class="su-q" for="suSell">' + h(T.selloutLabel) + '</label><textarea class="su-field su-line" id="suSell" maxlength="120" rows="2">' + h(S.cafe.sellout) + '</textarea>' + ex(T.selloutEx)
        + '<div class="su-stack">' + big('✓', T.saveThis, '', false, 'selloutSave') + big('✕', T.selloutNo, '', true, 'no:sellout') + '</div>' + skip('sellout');
    } else if (s === 'offer:dogs') {
      // Brewery test 1 (2026-11-12): research's "Dogs on the patio" fills in "Patio only" as a suggestion (saved with the screen).
      if (C.brewery && C.suggestDogNote && !S.dogGuessSet && !S.dogNote && !((CUR.visit_rows || {}).dogs)) { S.dogGuessSet = true; S.dogNote = C.suggestDogNote; S.dogGuessed = true; }
      x = q(T.dogQ, T.dogLead) + msgs() + (S.dogGuessed && S.dogNote === C.suggestDogNote && T.dogGuess ? '<p class="su-sent su-research" id="suDogGuess">' + h(T.dogGuess) + '</p>' : '') + quick('dogs', 'suDog', S.dogNote) + '<label class="su-sr" for="suDog">' + h(T.dogQ) + '</label><textarea class="su-field su-line" id="suDog" maxlength="180" rows="2">' + h(S.dogNote) + '</textarea>' + ex(T.dogEx)
        + '<div class="su-stack">' + big('✓', T.saveThis, '', false, 'dogSave') + '</div><div class="su-skip"><button type="button" class="su-link" data-act="go:' + (offerNext('offer:dogs') || 'saved:offer') + '">' + h(T.skip) + '</button></div>';
    } else if (s === 'happy') { x = C.happyHour ? yesNo('happy', T.happyQ, '', T.happyYes) : '';
    } else if (s === 'happy:yes' || s === 'specials:yes') {
      var hk = p[0];
      x = q(T.howQ, T.howLead) + '<div class="su-stack">' + big('📄', hk === 'happy' ? T.happyUp : T.specialsUp, T.upSub, false, 'go:' + hk + ':sheet') + big('📷', hk === 'happy' ? T.happyPhoto : T.specialsPhoto, T.photoSub, true, 'sheetCamGo:' + hk)
        // Pub test 8 (2026-11-10): no "It's on my website" when there's no website (she'd just said "We don't have a website").
        + (C.website ? big('🌐', hk === 'happy' ? T.happyWeb : T.specialsWeb, '', true, 'go:' + hk + ':web') : '') + big('✎', hk === 'happy' ? T.happyType : T.specialsType, hk === 'happy' ? T.happyTypeSub : T.specialsTypeSub, true, 'go:' + hk + ':type') + '</div>';
    } else if (s === 'happy:type') {
      if (!S.happy.length) S.happy.push(happyDefault());
      x = q(T.happyTypeQ, T.happyTypeLead) + msgs() + S.happy.map(function(e, i){
        return '<div class="su-day"><div class="su-dh"><span>' + h(fill(T.happyN, { n: i + 1 })) + '</span>' + (S.happy.length > 1 ? '<button type="button" class="su-toggle" data-rm="happy:' + i + '">' + h(T.remove) + '</button>' : '') + '</div>'
          + '<p class="su-q">' + h(T.whichDays) + '</p><div class="su-samerow" style="margin:0 0 8px"><button type="button" class="su-toggle" data-act="hhDays:' + i + ',all">' + h(T.everyDay) + '</button><button type="button" class="su-toggle" data-act="hhDays:' + i + ',wk">' + h(T.monFri) + '</button></div>' + dayChips(e.days, 'happy.' + i) + warnHtml('happy', i, e) + '<p class="su-q">' + h(T.whatTime) + '</p>'
          + (S.week && DAYS.some(function(d){ return S.week[d]; }) ? '<div class="su-samerow" style="margin:0 0 8px"><button type="button" class="su-toggle" data-act="allDay:' + i + '">' + h(T.allDay) + '</button></div>' : '') + '<div class="su-times"><label class="su-sr" for="hf' + i + '">' + h(T.starts) + '</label><input type="time" id="hf' + i + '" data-hh="' + i + ':from" value="' + e.from + '"> ' + h(T.to) + ' '
          // Until close (pub test 9, 2026-11-10): the end is the place's closing time that day (after midnight too).
          + (e.close ? '<span class="su-closetxt">' + h(T.untilCloseShort) + '</span>' : '<label class="su-sr" for="ht' + i + '">' + h(T.ends) + '</label><input type="time" id="ht' + i + '" data-hh="' + i + ':to" value="' + e.to + '">') + '</div>'
          + '<div class="su-samerow" style="margin:8px 0 0"><button type="button" class="su-toggle" aria-pressed="' + (e.close ? 'true' : 'false') + '" data-act="hhClose:' + i + '">' + h(T.untilClose) + '</button></div>'
          // A live count (pub test 9): the room left for the deal, its days included when there are several happy hours.
          + field('hw' + i, T.whatsOn, e.what, { max: 60, data: 'data-hh="' + i + ':what" data-room="' + i + '" aria-describedby="hwc' + i + '"' }) + '<p class="su-count" id="hwc' + i + '" aria-live="polite">' + h(roomText(i, e.what)) + '</p>' + (i === 0 ? ex(T.whatsOnEx) : '') + '</div>';
      }).join('') + (S.happy.length < 6 ? '<button type="button" class="su-more" data-act="add:happy">' + h(T.addHappy) + '</button>' : '')
        + '<div class="su-day">' + seasonBox('happy', S.happySea, T.happySeasonH) + '</div>' + '<div class="su-stack">' + big('✓', T.saveHappy, '', false, 'happySave') + '</div>';
    } else if (s === 'specials') { x = yesNo('specials', T.specialsQ, T.specialsLead);
    } else if (s === 'specials:type') {
      if (!S.specials.length) S.specials.push({ days: {}, text: '', price: '', start: '', end: '' });
      x = q(T.specialsTypeQ, T.upTo7) + msgs() + S.specials.map(function(e, i){
        return '<div class="su-day"><div class="su-dh"><span>' + h(fill(T.specialN, { n: i + 1 })) + '</span>' + (S.specials.length > 1 ? '<button type="button" class="su-toggle" data-rm="specials:' + i + '">' + h(T.remove) + '</button>' : '') + '</div>'
          // Café test 3 (2026-11-11): "Every day" in one tap (tap again to clear), like the happy hour's.
          + '<p class="su-q">' + h(T.whichDaysOr) + '</p><div class="su-samerow" style="margin:0 0 8px"><button type="button" class="su-chip su-chip-wide" id="suSpAll' + i + '" aria-pressed="' + (allDays(e.days) ? 'true' : 'false') + '" data-act="spDays:' + i + '">' + h(T.everyDay) + '</button></div>' + dayChips(e.days, 'specials.' + i) + field('sp' + i, T.whatIsIt, e.text, { max: 80, data: 'data-sp="' + i + ':text"' }) + (i === 0 ? ex(T.specialEx) : '')
          + field('spp' + i, T.priceIf, e.price, { max: 20, data: 'data-sp="' + i + ':price"' }) + (i === 0 ? ex(T.priceEx) : '')
          + '<p class="su-q" id="spwq' + i + '">' + h(T.specialTimeQ) + '</p><div class="su-times" style="margin-top:0" role="group" aria-labelledby="spwq' + i + '"><label class="su-sr" for="sps' + i + '">' + h(T.starts) + '</label><input type="time" id="sps' + i + '" data-sp="' + i + ':start" value="' + h(e.start || '') + '"> ' + h(T.to) + ' ' + (e.endClose ? '<span class="su-closetxt">' + h(T.untilCloseShort) + '</span>' : '<label class="su-sr" for="spe' + i + '">' + h(T.ends) + '</label><input type="time" id="spe' + i + '" data-sp="' + i + ':end" value="' + h(e.end || '') + '">') + '</div>'
          + '<div class="su-samerow" style="margin:8px 0 0"><button type="button" class="su-toggle" aria-pressed="' + (e.endClose ? 'true' : 'false') + '" data-act="spClose:' + i + '">' + h(T.untilClose) + '</button></div>' + (i === 0 ? ex(T.specialTimeEx) : '')
          + seasonBox('specials.' + i, e.sea || (e.sea = seaFrom())) + warnHtml('specials', i, e) + '</div>';
      }).join('') + (S.specials.length < 7 ? '<button type="button" class="su-more" data-act="add:specials">' + h(T.addSpecial) + '</button>' : '') + '<div class="su-stack">' + big('✓', T.saveSpecials, '', false, 'specialsSave') + '</div>';
    } else if (s === 'music') { x = yesNo('music', T.musicQ, T.musicLead);
      // Brewery test 1 (2026-11-12): research's Games line, shown as a hint until the events are answered.
      if (C.brewery && C.researchEvents && !S.done.music && T.eventsHint) x = x.replace('</h1>', '</h1><p class="su-sent su-research" id="suEventsHint">' + h(fill(T.eventsHint, { x: C.researchEvents })) + '</p>');
    } else if (s === 'music:yes') {
      // A plainly stated weekly event ("Trivia Tuesdays") is filled in as a suggestion; nothing is saved until Save.
      if (C.brewery && !S.nights.length && !S.done.music && !S.nightsGuessSet && (C.suggestNights || []).length) { S.nightsGuessSet = true; S.nightsGuessed = true; C.suggestNights.forEach(function(g){ var dd = {}; g.days.forEach(function(d){ dd[d] = true; }); S.nights.push({ days: dd, kind: g.kind, what: (T.kinds || {})[g.kind] || '', start: g.start || '' }); }); }
      if (!S.nights.length) S.nights.push({ days: {}, kind: '', what: '', start: '' });
      x = q(T.musicTypeQ, T.upTo7) + msgs() + (S.nightsGuessed && T.eventsGuess ? '<p class="su-sent su-research" id="suEventsGuess">' + h(T.eventsGuess) + '</p>' : (C.brewery && C.researchEvents && !S.done.music && T.eventsHint ? '<p class="su-sent su-research" id="suEventsHint">' + h(fill(T.eventsHint, { x: C.researchEvents })) + '</p>' : '')) + S.nights.map(function(e, i){
        return '<div class="su-day"><div class="su-dh"><span>' + h(fill(T.eventN, { n: i + 1 })) + '</span>' + (S.nights.length > 1 ? '<button type="button" class="su-toggle" data-rm="nights:' + i + '">' + h(T.remove) + '</button>' : '') + '</div>'
          // Cocktail test 1 (2026-11-13): its how often from the edit page ("1st Thu of the month"), kept when this is saved.
          + (function(){ var k = e.orig ? (CUR.weekly_nights || []).indexOf(e.orig) : -1, o = k >= 0 && (C.nightsOften || [])[k]; return o && T.oftenNow ? '<p class="su-hint su-often" id="suOften' + i + '">' + h(fill(CUR.weekly_nights_waiting ? T.oftenWaiting : T.oftenNow, { x: o })) + '</p>' : ''; })()
          + '<p class="su-q" id="ntq' + i + '">' + h(T.whatEvent) + '</p>' + (function(){
            // Pub fresh-eyes (2026-11-10): the kinds sat folded under "Pick a kind" and went unseen. The 6 most common
            // show open; the rest wait under "More kinds" (open when the picked kind is one of them).
            var chip = function(k){ return '<button type="button" class="su-chip" aria-pressed="' + (e.kind === k ? 'true' : 'false') + '" data-kind="' + i + ':' + k + '">' + h(T.kinds[k]) + '</button>'; };
            var nTop = C.nightKindsTop || 6, top = C.nightKinds.slice(0, nTop), rest = C.nightKinds.slice(nTop);
            return '<div class="su-chips su-kinds">' + top.map(chip).join('') + '</div>'
              + (rest.length ? '<details class="su-kinds"' + (rest.indexOf(e.kind) >= 0 ? ' open' : '') + '><summary>' + h(T.moreKinds) + '</summary><div class="su-chips">' + rest.map(chip).join('') + '</div></details>' : '');
          })()
          + '<input class="su-field" id="nt' + i + '" data-nt="' + i + '" type="text" maxlength="40" aria-labelledby="ntq' + i + '" value="' + h(e.what) + '"' + (e.kind === 'other' ? ' placeholder="' + h(T.otherPh) + '"' : '') + '>' + (i === 0 ? ex(T.eventEx) : '')
          // Distillery test 2 (2026-11-13): a tour or class may be "By appointment" (no day): next to the day chips.
          + '<p class="su-q">' + h(T.whichNights) + '</p>' + (nightAppt(e) ? '' : dayChips(e.days, 'nights.' + i))
          + (apptKind(e.kind) ? '<div class="su-samerow" style="margin:8px 0 0"><button type="button" class="su-toggle" id="suAppt' + i + '" aria-pressed="' + (nightAppt(e) ? 'true' : 'false') + '" data-act="ntAppt:' + i + '">' + h(T.byAppt) + '</button></div>' : '')
          + '<label class="su-q" for="ntt' + i + '">' + h(T.eventTime) + '</label><div class="su-times" style="margin-top:0"><input type="time" id="ntt' + i + '" data-ntt="' + i + '" value="' + h(e.start || '') + '"></div>'
          + seasonBox('nights.' + i, e.sea || (e.sea = seaFrom())) + warnHtml('nights', i, e) + '</div>';
      }).join('') + (T.eventsOften ? '<p class="su-hint" id="suEventsOften">' + h(T.eventsOften) + (T.eventsOftenLink && C.back ? ' <a href="' + h(C.back + '#tours-events') + '" id="suEventsOftenLink">' + h(T.eventsOftenLink) + '</a>' : '') + '</p>' : '') + (S.nights.length < 7 ? '<button type="button" class="su-more" data-act="add:nights">' + h(T.addEvent) + '</button>' : '') + '<div class="su-stack">' + big('✓', T.saveEvents, '', false, 'musicSave') + '</div>';
    } else if (s === 'story') {
      var L2 = S.story.length, sb2 = S.storyReturn ? sportsBit() : '';
      x = doneLine('story') + q(T.storyQ, T.storyLead) + (sb2 ? '<p class="su-sent su-research" id="suStoryHint">' + h(fill(T.storySportsHint, { bit: sb2 })) + '</p>' : '') + msgs() + (C.storyPending && S.story === C.storyPending && T.storyPendingHint ? '<p class="su-sent" id="suStoryPending" role="status">' + h(T.storyPendingHint) + '</p>' : storyCur() ? '<p class="su-hint" id="suStoryEdit">' + h(T.storyEnglishHint && S.story === CUR.description && (String(CUR.description).match(/\b(?:the|and|with|from|our|its|of|is)\b/gi) || []).length >= 2 && !/\b(?:le|la|les|et|avec|nos|des|est)\b/i.test(CUR.description) ? T.storyEnglishHint : T.storyEditHint) + '</p>' : '') + '<label class="su-sr" for="suStory">' + h(T.storyLabel) + '</label><textarea class="su-field su-area" id="suStory" maxlength="1200">' + h(S.story) + '</textarea>'
        + '<p class="su-count' + (L2 >= STORY_OK ? ' su-ok' : '') + '" id="suCount">' + h(L2 >= STORY_OK ? T.storyGood : T.storyCount) + '</p>' + ex(kindText('story') || T.storyEx)
        // Wineries (2026-11-12): the Known for line on the same screen (on the page right away).
        + (C.winery ? '<h2 class="su-h2">' + h(T.knownQ) + '</h2><p class="su-hint">' + h(T.knownLead) + '</p>' + enLineHint(S.wine.known === ((CUR.visit_rows || {}).known_for || '') ? S.wine.known : '', 'suKnownEn') + field('suKnown', T.knownQ, S.wine.known, { max: 180, sr: true }) + ex(T.knownEx) : '')
        + (FOLD ? '<h2 class="su-h2">' + h(T.knownQ) + '</h2><p class="su-hint">' + h(T.knownLead) + '</p>' + enLineHint(S.brew.known === ((CUR.visit_rows || {}).known_for || '') ? S.brew.known : '', 'suKnownEn') + field('suKnown', T.knownQ, S.brew.known, { max: 180, sr: true }) + ex(T.knownEx) : '')
        + '<div class="su-stack">' + big('✓', C.winery || FOLD ? T.saveThese : T.saveThis, '', false, 'storySave') + '</div>' + skip('story');
    } else if (s === 'book') { x = yesNo('book', T.bookQ, '', T.bookYes, T.bookNo);
    } else if (s === 'book:yes' || s === 'takeout:yes' || s === 'groups:yes' || s === 'known') {
      var cfg = { 'book:yes': ['reservations', T.bookHowQ, '', T.bookEx], 'takeout:yes': ['takeout', T.takeoutHowQ, '', T.takeoutEx], 'groups:yes': ['groups', T.groupsHowQ, '', T.groupsEx], known: ['known_for', T.knownQ, T.knownLead, T.knownEx] }[s];
      x = doneLine(base(s)) + q(cfg[1], cfg[2]) + msgs() + enLineHint(S.visit[cfg[0]] === ((CUR.visit_rows || {})[cfg[0]] || '') ? S.visit[cfg[0]] : '', 'suLineEn') + quick(cfg[0], 'suLine', S.visit[cfg[0]] || '') + '<label class="su-sr" for="suLine">' + h(cfg[1]) + '</label><textarea class="su-field su-line" id="suLine" maxlength="180" rows="2">' + h(S.visit[cfg[0]] || '') + '</textarea>' + ex(cfg[3])
        // Pub test 9 (2026-11-10): the booking link has its box right here (the same one as the edit page's "Name, address &
        // links"), and a link typed into the line above is offered a move into it instead of being refused.
        + (s === 'book:yes' ? '<div class="su-day su-movelink" id="suMoveLink" role="status"' + (S.linkOffer ? '' : ' hidden') + '><p class="su-q" style="margin-top:0">' + h(T.linkInLine) + '</p><div class="su-stack">' + big('➜', T.moveLink, S.linkOffer || '', false, 'moveLink') + '</div></div>'
          + field('suBookUrl', T.bookLinkLabel, S.bookUrl != null ? S.bookUrl : CUR.booking_url || '', { mode: 'url', max: 300 }) + ex(T.bookLinkEx) + '<p class="su-hint">' + h(T.bookLinkHint) + '</p>' : '')
        + '<div class="su-stack">' + big('✓', T.saveThis, '', false, 'lineSave:' + base(s) + ':' + cfg[0]) + '</div>'
        + (s === 'known' ? skip('known') : '<div class="su-skip"><button type="button" class="su-link" data-act="no:' + base(s) + '">' + h({ book: T.bookNoLink, takeout: T.takeoutNoLink, groups: T.groupsNoLink }[base(s)]) + '</button></div>');
    } else if (s === 'takeout') { x = yesNo('takeout', T.takeoutQ);
    } else if (s === 'groups' && FOLD) {
      // Cocktail lounges (Decided 5, 2026-11-13): the same screen, with quick answers (Private room, Buyouts, Call ahead for 8
      // or more) and "Do people need to book a table?" (Walk-ins only is one tap) above the booking link box.
      // Breweries (2026-11-12): "Groups of __ or more, please book ahead" in one tap (the size replaces the whole line, so
      // "book ahead" is never said twice), the line in her own words, and the booking link box, which always shows (a
      // walk-in taproom can still add a page for group bookings). "We can't take big groups" is the explicit answer.
      // Cocktail test 3 (2026-11-14): the pressed size is the one in the "book ahead" sentence, not "for 20" of a room.
      var gl = S.brew.groups, gszS = sentencesOf(gl).filter(function(x){ return isSizeLine(x) || /book|réserv/i.test(x); })[0] || '', gsz = (/\b(\d{1,2})\b/.exec(gszS) || [])[1];
      // Brewery test 2 (2026-11-13): "We can't take big groups" comes first, so a "no" is one tap without scrolling.
      x = doneLine('groups') + q(T.groupsQ, T.groupsLead) + msgs()
        + '<div class="su-stack" id="suGroupsNone" style="margin-bottom:14px">' + big('✕', T.groupsNone, '', true, 'no:groups') + '</div>'
        + '<div class="su-chips" role="group" aria-label="' + h(T.groupsQ) + '" id="suGroupSizes">' + GROUP_SIZES.map(function(n){ var on = sentencesOf(gl).indexOf(fill(T.groupsLine, { n: n })) >= 0 || (!!gsz && +gsz === n); return '<button type="button" class="su-chip" aria-pressed="' + (on ? 'true' : 'false') + '" data-bgroup="' + n + '">' + n + '+</button>'; }).join('') + '</div>'
        + enLineHint(gl === ((CUR.visit_rows || {}).groups || '') ? gl : '', 'suGroupsEn') + (CK ? quick('groups', 'suGroupsLine', gl) : '') + field('suGroupsLine', T.groupsLineLabel, gl, { max: 180 }) + ex(T.groupsEx)
        + (CK ? '<h2 class="su-h2" id="suBookQ">' + h(T.bookQ2) + '</h2>' + enLineHint(S.brew.book === ((CUR.visit_rows || {}).reservations || '') ? S.brew.book : '', 'suBookEn') + quick('reservations', 'suBookLine', S.brew.book) + field('suBookLine', T.bookLineLabel, S.brew.book, { max: 180 }) : '')
        + '<div id="suBookBox" style="margin-top:14px">' + field('suBookUrl', T.bookLinkLabel, S.bookUrl != null ? S.bookUrl : CUR.booking_url || C.bookingKnown || '', { mode: 'url', max: 300 }) + ex(T.bookLinkEx) + '<p class="su-hint">' + h(T.bookLinkHint) + '</p></div>'
        + '<div class="su-stack" style="margin-top:18px">' + big('✓', T.saveThese, '', false, 'brewGroupsSave') + '</div>' + skip('groups');
    } else if (s === 'groups') { x = yesNo('groups', T.groupsQ, T.groupsLead);
    } else if (s === 'instagram' || s === 'facebook') {
      var ig = s === 'instagram';
      x = doneLine(s) + (C.socialSent[s] ? '<p class="su-sent">' + h(T.socialSent) + '</p>' : '') + (ig && S.igFromMenu && S.ig ? '<p class="su-sent su-research" id="suIgFromMenu">' + h(fill(T.igFromMenu, { x: S.ig })) + '</p>' : '') + (!ig && S.fbFromWebsite && S.fb && S.fb !== S.socSaved.facebook && T.fbFromWebsite ? '<p class="su-sent su-research" id="suFbFromSite">' + h(T.fbFromWebsite) + '</p>' : '') + (ig && S.igFromWebsite && S.ig && S.ig !== S.socSaved.instagram && T.igFromWebsite ? '<p class="su-sent su-research" id="suIgFromSite">' + h(T.igFromWebsite) + '</p>' : '') + q(ig ? T.igQ : T.fbQ, ig ? T.igLead : T.fbLead) + (ig ? '' : '<p class="su-hint" id="suFbWhy">' + h(T.fbWhy) + '</p>') + msgs() + '<label class="su-sr" for="suSoc">' + h(ig ? T.igLabel : T.fbLabel) + '</label><input class="su-field" id="suSoc" type="text" autocapitalize="none" autocomplete="off" value="' + h(ig ? S.ig : S.fb) + '">'
        // Café test 3 (2026-11-11): no TikTok box (Dayton: keep it easy). A TikTok already saved stays on the page.
        + '<div class="su-stack">' + big('✓', T.saveBtn, '', false, 'socialSave:' + s) + big('✕', ig ? T.igNo : T.fbNo, '', true, 'socialNo:' + s)
        // Pub test 6 (2026-11-10): an answer for "I'm not sure" that still counts (never "we're not on it").
        + big('🤷', T.socialUnsure, T.socialUnsureSub, true, 'socialUnsure:' + s) + '</div>' + skip(s);
    } else if (s === 'social') {
      x = doneLine('social') + q(T.socialQ, T.socialLead) + msgs() + socialPart('instagram') + socialPart('facebook')
        + '<div class="su-stack" style="margin-top:18px">' + big('✓', T.saveThese, '', false, 'socialBoth') + '</div>' + skip('social');
    } else if (s === 'door') {
      x = doneLine('door') + q(T.doorQ, fill(C.brewery && T.doorLeadCidery && (S.place || CUR.place_type) === 'Cidery' ? T.doorLeadCidery : T.doorLead, { type: C.typeWord })) + '<h2 class="su-h2">' + h(fill(T.doorHere, { type: C.typeWord })) + '</h2><div class="su-stack">' + big('📍', T.imHere, '', false, 'go:door:photo') + big('🕓', T.notNow, T.notNowSub, true, 'later:door') + '</div>';
    } else if (s === 'door:photo') {
      x = q(T.doorPhotoQ, T.doorPhotoLead) + msgs() + (S.door.photo ? '<img class="su-door" src="' + S.door.photo + '" alt="">' : '')
        + '<div class="su-stack">' + (S.door.photo ? big('➜', T.checkPin, '', false, 'go:door:pin') : '') + big('📷', S.door.photo ? T.takeAgain : T.take, '', !!S.door.photo, 'doorTake') + '</div>';
    } else if (s === 'door:pin') {
      x = (S.door.mapFail ? q(T.mapFailQ, '') : q(T.pinQ, T.pinLead)) + '<p class="su-hint" id="suGps" role="status">' + h(S.door.mapFail ? T.mapFail : S.door.best ? '' : S.door.noLoc ? T.noGps : T.finding) + '</p>' + (S.door.mapFail ? '' : '<div id="suMap" class="su-map"></div>') + msgs()
        + '<label class="su-tick' + (S.nudge === T.doorRightsNeed ? ' su-need' : '') + '"><input type="checkbox" id="suDoorRights"' + (S.door.rights ? ' checked' : '') + '><span>' + h(T.doorRights) + '</span></label>'
        + '<div class="su-stack">' + big('✓', S.error ? T.tryAgain : S.door.mapFail ? T.mapFailSend : T.doorSend, '', false, 'doorSend') + '</div>';
    } else if (s === 'finish') {
      var sc = S.score || { pct: 0, soon: 0, badge: 'none' }, left = leftList(), gaps = gapList();
      // Winery test 2 (2026-11-12): the "Change an answer" link on the last screen too (back to the "Tap any line" list).
      var changeLink = '<div class="su-skip" style="margin-top:14px"><button type="button" class="su-link" id="suChangeAnswerEnd" data-act="go:start">' + h(T.changeAnswer) + '</button></div>';
      if (!left.length && gaps.length) left = gaps;
      var onlyDoor = left.every(function(o){ return o.step === 'door'; });
      // "I'm done for now" is the end (pub test 6, 2026-11-10): "Nice work" and the number, the page, and the rest folded
      // under a small, optional "Want to add more later?" (it was a "To reach 100%" list that looked like more homework).
      if (S.doneNowSaid && left.length) {
        x = '<div class="su-saved" style="padding-top:4px"><div class="su-check" aria-hidden="true">✓</div><h1>' + h(T.doneNowTitle) + '</h1><p class="su-lead">' + h(T.doneNowLead) + '</p></div>' + scoreBox() + preview() + (C.statsHtml || '')
          + '<div class="su-stack"><a class="su-big" href="' + h(C.pageHref) + '" target="_blank" rel="noopener"><span class="su-ico" aria-hidden="true">↗</span><span>' + h(T.seePage) + '</span></a>'
          + '<a class="su-big su-alt" href="' + h(C.back) + '"><span class="su-ico" aria-hidden="true">←</span><span>' + h(T.backSettings) + '</span></a></div>'
          + '<details class="su-later" id="suLater"><summary>' + h(T.addLater) + '</summary><p class="su-hint">' + h(T.addLaterLead) + '</p><div class="su-stack">' + left.map(leftItem).join('') + '</div></details>' + changeLink;
      } else
      x = '<div class="su-saved" style="padding-top:4px"><h1>' + h(gaps.length ? T.finishAlmost : !left.length ? T.finishQ : allDone() && onlyDoor ? T.finishHome : allDone() ? T.finishAlmost : T.finishSoFar) + '</h1></div>' + scoreBox()
        // Greyed until it's earned, with "Reach 100% to earn it" beside it (pub fresh-eyes 2: it looked already won).
        + '<p class="su-badge-line"><span class="su-badge-pill' + (sc.badge === 'earned' ? '' : ' su-badge-off') + '"' + (sc.badge === 'earned' ? '' : ' aria-disabled="true"') + '>' + C.badgeChip + '</span>' + (sc.badge === 'earned' ? '' : ' <span class="su-badge-reach">' + h(Math.max(sc.pct, sc.soon || 0) < 100 || sc.soon < sc.pct ? T.badgeReach : T.badgeSoon) + '</span>') + '</p>'
        + (sc.badge === 'none' ? '' : '<p class="su-badge-text">' + h(sc.badge === 'earned' ? T.badgeEarned : T.badgePaused) + '</p>')
        + (left.length ? '<h2 class="su-h2">' + h(T.toReach) + '</h2><div class="su-stack">' + left.map(leftItem).join('') + '</div>' : '')
        + preview()
        // Owner stats (pub test 9, 2026-11-10): the page's own numbers for the last 30 days (made on the server, owner-only).
        + (C.statsHtml || '')
        + '<div class="su-stack"><a class="su-big" href="' + h(C.pageHref) + '" target="_blank" rel="noopener"><span class="su-ico" aria-hidden="true">↗</span><span>' + h(T.seePage) + '</span></a>'
        + '<a class="su-big su-alt" href="' + h(C.back) + '"><span class="su-ico" aria-hidden="true">←</span><span>' + h(T.backSettings) + '</span></a></div>' + changeLink;
    }
    if (S.error || S.nudge) { S.exitAfter = false; S.langGo = false; }
    // A failed save always says so, whatever the screen.
    if (S.error && x.indexOf('su-error') < 0) x = msgs() + x;
    screen.innerHTML = x;
    wire();
    navSync();
    if (drAfter()) return;
    var e2 = screen.querySelector('.su-error');
    if (e2) { e2.setAttribute('tabindex', '-1'); try { e2.focus({ preventScroll: true }); } catch (e) {} e2.scrollIntoView({ block: 'center' }); }
    // A rejected answer (pub test 6: the website): the box is outlined in red and the cursor goes into it.
    if (S.badField) { var bf = el(S.badField); S.badField = ''; if (bf) { bf.setAttribute('aria-invalid', 'true'); var em = screen.querySelector('.su-error'); if (em) { em.id = 'suFieldError'; bf.setAttribute('aria-describedby', 'suFieldError'); }
      bf.addEventListener('input', function(){ bf.removeAttribute('aria-invalid'); }); try { bf.focus({ preventScroll: true }); var nn = bf.value.length; bf.setSelectionRange(nn, nn); } catch (x2) {} bf.scrollIntoView({ block: 'center' }); } }
    if (S.step === 'door:pin') doorMap();
    // A closure just added: show its row (it used to sit hidden under the Save button).
    if (S.step === 'closures' && S.added && !e2) { var ad = el('suAdded'); if (ad) ad.scrollIntoView({ block: 'start' }); window.scrollBy(0, -90); }
  }

  // ---------- Pictures ----------
  function goodPhotos(){ return S.photos.filter(function(ph){ return !ph.bad; }); }
  function loadImage(file){ return new Promise(function(ok, no){ var url = URL.createObjectURL(file), img = new Image(); img.onload = function(){ ok({ img: img, url: url }); }; img.onerror = function(){ URL.revokeObjectURL(url); no(new Error('read')); }; img.src = url; }); }
  function jpeg(img, maxEdge){ var w = img.naturalWidth, hh = img.naturalHeight, sc = Math.min(1, maxEdge / Math.max(w, hh)); var c = document.createElement('canvas'); c.width = Math.round(w * sc); c.height = Math.round(hh * sc); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c; }
  function photoPayload(ph){
    var c = jpeg(ph.img, 1600), out = { image: c.toDataURL('image/jpeg', 0.85) };
    [160, 240, 480, 960, 1200].forEach(function(cw){ if (cw >= c.width) return; try { var s2 = document.createElement('canvas'); s2.width = cw; s2.height = Math.round(c.height * cw / c.width); var sc = s2.getContext('2d'); sc.imageSmoothingEnabled = true; sc.imageSmoothingQuality = 'high'; sc.drawImage(c, 0, 0, s2.width, s2.height); out['image_w' + cw] = s2.toDataURL('image/jpeg', 0.72); } catch (e) {} });
    return out;
  }
  function addPhotoFiles(files){
    files = Array.prototype.slice.call(files || []); if (!files.length) return;
    var room = Math.max(0, C.maxPhotos - S.photos.length), extra = files.length > room; files = files.slice(0, room);
    Promise.all(files.map(function(f){ return loadImage(f).then(function(r){ return { img: r.img, thumb: r.url, bad: Math.max(r.img.naturalWidth, r.img.naturalHeight) < C.minEdge ? 'small' : '' }; }, function(){ return { bad: 'read', thumb: '' }; }); }))
      .then(function(items){ items.forEach(function(ph){ S.photos.push(ph); }); S.error = extra ? fill(T.tooMany, { n: C.maxPhotos }) : ''; if (S.step === 'photos:review') render(); else go('photos:review'); });
  }
  function say(id, text){ var n = el(id); if (n) n.textContent = text; }
  function sendPhotos(){
    var list = goodPhotos();
    if (!list.length) { S.nudge = T.needPhoto; return render(); }
    if (!S.rights) { S.rightsAsk = true; S.exitAfter = false; S.langGo = false; S.backAfter = false; var y0 = window.scrollY; render(); window.scrollTo(0, y0); var tb = el('suTickBox'); if (tb) tb.scrollIntoView({ block: 'center' }); var rb = el('suRights'); if (rb) try { rb.focus({ preventScroll: true }); } catch (e) {} return; }
    var total = list.length, i = 0, mainP = list.filter(function(ph){ return ph.main; })[0];
    S.busy = true; S.error = ''; S.nudge = ''; S.rightsAsk = false; S.lastBatch = total; render();
    var next = function(){
      var ph = list[i];
      if (!ph) {
        if (mainP) { try { S.mainSrc = jpeg(mainP.img, 1200).toDataURL('image/jpeg', 0.8); C.image = S.mainSrc; C.imageSource = 'pending'; S.keepMain = true; } catch (e) {} }
        S.photosSent += total; S.photos = []; S.rights = false;
        return progress('photos', 'day').then(function(ok){ S.busy = false; if (!ok) return render();
          // Sent on the way back (Back with the box ticked): the toast, then the question before.
          if (S.backAfter) { S.backAfter = false; S.flash = savedText('photos'); return goBack(); }
          go('saved:photos'); });
      }
      say('suProgress', fill(T.adding, { i: i + 1, n: total }));
      var body = photoPayload(ph); body.credit = C.credit; body.rights = true; body.contact_name = ''; body.contact_email = ''; body.company_website = ''; body.started_at = started; body.notify = i === total - 1; body.main = !!ph.main;
      return post(C.base + '/photos', body).then(function(j){ if (j && j.ok) { S.photos.splice(S.photos.indexOf(ph), 1); i++; return next(); } S.busy = false; S.error = why(j); render(); });
    };
    next();
  }
  function readDataUrl(file){ return new Promise(function(ok, no){ var r = new FileReader(); r.onload = function(){ ok(r.result); }; r.onerror = function(){ no(new Error('read')); }; r.readAsDataURL(file); }); }
  function pageBody(item){
    if (item.pdf) { if (item.file.size > C.pdfMax) return Promise.reject(new Error(fill(T.fileTooBig, { name: item.name }))); return readDataUrl(item.file).then(function(d){ return { pdf: 'data:application/pdf;base64,' + String(d).split(',')[1] }; }); }
    var src = item.img ? Promise.resolve({ img: item.img }) : loadImage(item.file);
    return src.then(function(r){ if (Math.max(r.img.naturalWidth, r.img.naturalHeight) < C.menuMinEdge) throw new Error(T.pageSmall); return { image: jpeg(r.img, 2400).toDataURL('image/jpeg', 0.85) }; });
  }
  // Pages to /menu/pages (sheet: happy_hour | specials, or none for the menu), then one /menu/help.
  function sendPages(items, sheet, step, note){
    if (S.busy) return;
    S.busy = true; S.error = ''; render();
    var total = items.length, i = 0;
    var finish = function(){
      var body = { note: note, contact_email: '', contact_phone: '' }; if (sheet) body.sheet = sheet;
      return post(C.base + '/menu/help', body).then(function(j){
        if (j && j.ok) { items.length = 0; return progress(step, 'day').then(function(ok){ S.busy = false; if (ok) go('saved:' + step); else render(); }); }
        S.busy = false; S.error = why(j); render();
      });
    };
    var next = function(){
      var it = items[0]; if (!it) return finish();
      say('suProgress', T.sending + ' ' + (i + 1) + '/' + total);
      return pageBody(it).then(function(b){ if (sheet) b.sheet = sheet; return post(C.base + '/menu/pages', b); }, function(e){ return { ok: false, error: e.message }; }).then(function(j){
        if (j && j.ok) { items.shift(); i++; return next(); }
        S.busy = false; S.error = why(j); render();
      });
    };
    next();
  }
  function addFiles(target, files){
    Array.prototype.slice.call(files || []).forEach(function(f){
      if (target.length >= C.maxPages) { S.error = fill(T.tooManyPages, { n: C.maxPages }); return; }
      target.push({ file: f, name: f.name || 'file', pdf: f.type === 'application/pdf' || /[.]pdf$/i.test(f.name || '') });
    });
    render();
  }

  // ---------- The front door (same checks as the edit page's storefront section: <base>/arrival) ----------
  var watch = null, map = null, marker = null;
  function gps(){ if (!navigator.geolocation) { S.door.noLoc = true; return; } if (watch !== null || S.door.noLoc) return;
    watch = navigator.geolocation.watchPosition(function(pos){ var c = pos.coords; if (!S.door.best || c.accuracy < S.door.best.accuracy) { S.door.best = { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy }; say('suGps', ''); if (marker && !S.door.moved) { marker.setLatLng([c.latitude, c.longitude]); map.setView([c.latitude, c.longitude]); S.door.spot = { lat: c.latitude, lng: c.longitude }; } } },
      function(){ if (!S.door.best) { S.door.noLoc = true; stopGps(); say('suGps', T.noGps); } }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    // No answer at all (a blocked prompt): after 10 seconds say so, so it never sits on "Finding your location…".
    setTimeout(function(){ if (!S.door.best) { S.door.noLoc = true; say('suGps', T.noGps); } }, 10000); }
  function stopGps(){ if (watch !== null && navigator.geolocation) navigator.geolocation.clearWatch(watch); watch = null; }
  function leaflet(cb){ var b = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/', ready = function(){ L.Icon.Default.imagePath = b + 'images/'; cb(); }; if (window.L) return ready();
    var l = document.createElement('link'), sc = document.createElement('script'); l.rel = 'stylesheet'; l.href = b + 'leaflet.min.css'; sc.src = b + 'leaflet.min.js'; sc.onload = ready; sc.onerror = mapFailed; document.head.appendChild(l); document.head.appendChild(sc); }
  // The map can't load (blocked, offline, slow): never "Please wait for the map…" forever (pub fresh-eyes, 2026-11-10).
  // She sends the photo with the listing's own pin; it waits for us, and we place the pin from the photo.
  function mapFailed(){
    if (S.door.mapFail || map || S.step !== 'door:pin') return;
    S.door.mapFail = true; if (!S.door.spot && C.pin) S.door.spot = { lat: C.pin.lat, lng: C.pin.lng };
    var y = window.scrollY; render(); window.scrollTo(0, y);
  }
  function doorMap(){
    var at = S.door.spot || S.door.best || C.pin; var box = el('suMap'); if (!box || !at) return;
    map = null; marker = null;
    setTimeout(function(){ if (!map) mapFailed(); }, 8000);
    leaflet(function(){ if (!el('suMap')) return; map = L.map('suMap', { zoomControl: true }).setView([at.lat, at.lng], 19);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, referrerPolicy: 'origin', attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
      marker = L.marker([at.lat, at.lng], { draggable: true, autoPan: true }).addTo(map); S.door.spot = S.door.spot || { lat: at.lat, lng: at.lng };
      marker.on('dragend', function(){ var m = marker.getLatLng(); S.door.spot = { lat: m.lat, lng: m.lng }; S.door.moved = true; }); });
  }
  function doorSend(){
    if (S.busy) return;
    if (!S.door.rights) { S.nudge = T.doorRightsNeed; return render(); }
    if (!S.door.spot) { S.nudge = T.needPin; return render(); }
    stopGps(); S.busy = true; S.error = ''; S.nudge = ''; render();
    var b = { image: S.door.photo, lat: S.door.spot.lat, lng: S.door.spot.lng, rights: true }; if (S.door.best) { b.device_lat = S.door.best.lat; b.device_lng = S.door.best.lng; b.accuracy = S.door.best.accuracy; }
    post(C.base + '/arrival', b).then(function(j){ if (j && j.ok) return progress('door', j.live ? 'live' : 'day').then(function(ok){ S.busy = false; if (ok) go('saved:door'); else render(); }); S.busy = false; S.error = why(j); render(); });
  }

  // ---------- Saving each step ----------
  // "Closed Jan to Mar each year" / "Closed in January each year": the closed months of an open run.
  function closedMonthsText(mr){
    var ca = mr.b % 12 + 1, cb = mr.a === 1 ? 12 : mr.a - 1;
    return ca === cb ? fill(T.monthsClosedOne, { a: monthName(ca - 1) }) : fill(T.monthsClosedRow, { a: monthName(ca - 1), b: monthName(cb - 1) });
  }
  function windowsOk(w){ return DAYS.some(function(d){ return w[d] && w[d].length; }); }
  // Winery test 4 (2026-11-12): the one "no set hours" choice, wineries only.
  function noSetBtn(){ return APPT && T.noSetHours ? big('📞', T.noSetHours, '', true, 'noSetHours') : ''; }
  function noSetHoursSave(){
    var none = {}; DAYS.forEach(function(d){ none[d] = []; });
    var ch = { hours: none, hours_checked: true }; if (AI.visit !== 'appointment') { if (C.distillery) ch.brewery_info = { visit: 'appointment' }; else ch.winery_info = { visit: 'appointment' }; }
    saveAll('hours', [ch], null, COMBO ? 'closures' : null, function(){
      if (COMBO) { S.hoursJust = true; S.hoursNone = true; } else S.savedLine.hours = T.noSetHoursSaved;
      AI.visit = 'appointment'; S.wine.visit = 'appointment'; var nw = {}; DAYS.forEach(function(d){ nw[d] = null; }); CUR.hours = CUR.hours && typeof CUR.hours === 'object' ? nw : JSON.stringify(nw);
      S.week = {}; DAYS.forEach(function(d){ S.week[d] = null; }); S.hoursOpenSet = false; S.sea.on = false; S.seaTouched = false; S.openTouched = false; S.wYearPick = '';
    });
  }
  function monthRun(obj){
    var on = []; for (var i = 1; i <= 12; i++) if (obj[i]) on.push(i);
    if (!on.length) return { none: true }; if (on.length === 12) return { all: true };
    // The run's first month: an "on" month whose previous month is off. Exactly one, or the months aren't in a row.
    var starts = on.filter(function(m){ return !obj[m === 1 ? 12 : m - 1]; }); if (starts.length !== 1) return { bad: true };
    var a = starts[0], b = a; while (obj[b % 12 + 1] && (b % 12 + 1) !== a) b = b % 12 + 1; return { a: a, b: b };
  }
  var LAST = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function hoursSave(){
    readTimes();
    if (!windowsOk(S.week)) { S.nudge = T.needOpenDay; return render(); }
    var week = {}; DAYS.forEach(function(d){ week[d] = S.week[d] || []; });
    var ch = { hours: week, hours_checked: true };
    // Seasonal hours not answered on this visit: left exactly as stored.
    if (S.seaTouched) {
      var stored = CUR.hours_seasons || [], s0 = stored[0], rest = stored.slice(1), list = rest;
      if (S.sea.on) {
        var r = monthRun(S.sea.months);
        if (S.sea.exact) { var xo = seaOut({ on: true, exact: S.sea.exact }); if (!xo.ok) { S.nudge = xo.why; return render(); } }
        else if (r.none || r.bad || r.all) { S.nudge = r.bad ? T.monthsInRow : T.winterNeedMonths; return render(); }
        if (!S.sea.week || !windowsOk(S.sea.week)) { S.nudge = T.seasonNeedOpenDay; return render(); }
        var sw = {}; DAYS.forEach(function(d){ sw[d] = S.sea.week[d] || []; });
        var pad = function(n){ return ('0' + n).slice(-2); };
        var same = s0 && S.sea.kind === S.sea.storedKind;
        // The same months as stored keep their exact dates (a set from Jun 15 stays Jun 15).
        var keepDates = same && JSON.stringify(S.sea.months) === S.sea.monthsWas;
        list = [{ from: S.sea.exact ? S.sea.exact.from : keepDates ? s0.from : pad(r.a) + '-01', to: S.sea.exact ? S.sea.exact.to : keepDates ? s0.to : pad(r.b) + '-' + LAST[r.b - 1], label: same && s0.label ? s0.label : (S.sea.kind === 'winter' ? 'Winter hours' : 'Summer hours'), hours: sw }].concat(rest);
      }
      if (JSON.stringify(list) !== JSON.stringify(stored)) ch.hours_seasons = list;
    }
    // Café test 2 (2026-11-11): the open season answered in this step ("We're closed part of the year").
    var listH = [ch];
    if (S.openTouched) { var ov = openVal(S.openSea); if (ov !== (CUR.open_months || '')) ch.open_months = ov; if (C.cafe && (ov ? 'seasonal' : 'all') !== S.savedYear) listH.push({ cafe_info: { year: ov ? 'seasonal' : 'all' } }); if (C.brewery && !C.distillery && (ov ? 'seasonal' : 'all') !== S.savedYear) listH.push(yearPart(ov ? 'seasonal' : 'all')); }
    // Wineries (2026-11-12): the off-season answer (all year, closed part of the year, or by appointment).
    var wyNew = APPT && S.wYearPick ? (S.wYearPick === 'appointment' ? 'appointment' : openVal(S.openSea) ? 'seasonal' : 'all') : '';
    if (wyNew && (wyNew !== S.savedWYear || (wyNew === 'appointment' && JSON.stringify(S.wine.season) !== JSON.stringify(AI.season || null)))) listH.push(apptPart(wyNew === 'appointment' ? { year: wyNew, season: S.wine.season } : { year: wyNew }));
    saveAll('hours', listH, null, C.pub ? 'hours:kitchen' : COMBO ? 'closures' : null, function(){
      if (COMBO) { S.hoursJust = true; S.hoursNone = false; }
      if (wyNew) { S.savedWYear = wyNew; S.wine.year = wyNew; AI.year = wyNew; if (C.distillery) S.savedYear = wyNew; if (wyNew === 'appointment') AI.season = S.wine.season; else { delete AI.season; S.wine.season = null; } S.wYearPick = ''; }
      if (ch.hours_seasons) { CUR.hours_seasons = ch.hours_seasons; S.sea.storedKind = S.sea.on ? S.sea.kind : ''; S.sea.monthsWas = JSON.stringify(S.sea.months); }
      if ('open_months' in ch) CUR.open_months = ch.open_months;
      S.seaTouched = false; S.openTouched = false;
    });
  }
  // The "open all year?" answer: a café's (cafe_info) or a brewery's (brewery_info).
  var YEAR_ANSWER = !!(C.cafe || C.brewery);
  function yearPart(y){ return C.brewery ? { brewery_info: { year: y } } : { cafe_info: { year: y } }; }
  function readTimes(){ readSeasons(); var w = W(); Array.prototype.forEach.call(screen.querySelectorAll('[data-h]'), function(inp){ var q2 = inp.getAttribute('data-h').split(':'); if (w && w[q2[0]] && w[q2[0]][+q2[1]]) w[q2[0]][+q2[1]][+q2[2]] = inp.value; }); }
  // The room a happy hour's deal has (60 letters, less its days when there are several happy hours).
  function hhRoom(i){ var e = S.happy[i]; return 60 - (S.happy.length > 1 && e ? dayPrefix(e).length : 0); }
  function noteRoom(v){ var left = 120 - String(v || '').length; return left >= 0 ? fill(left === 1 ? T.charLeft1 : T.charsLeft, { n: left }) : fill(-left === 1 ? T.charOver1 : T.charsOver, { n: -left }); }
  function roomText(i, v){ var left = hhRoom(i) - String(v || '').trim().length; return left >= 0 ? fill(left === 1 ? T.charLeft1 : T.charsLeft, { n: left }) : fill(-left === 1 ? T.charOver1 : T.charsOver, { n: -left }); }
  function roomRefresh(){ S.happy.forEach(function(e, i){ var b = el('hw' + i), c = el('hwc' + i); if (!b || !c) return; c.textContent = roomText(i, b.value); c.className = 'su-count' + (hhRoom(i) - b.value.trim().length < 0 ? ' su-over' : ''); }); }
  // A day's closing time for a window starting at `from` (the usual week): '23:00', '01:00' (after midnight), or null.
  function closeFor(d, from){
    var w = S.week && S.week[d]; if (!w) return null; var m = function(t){ var x = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return x ? +x[1] * 60 + +x[2] : null; }, f = m(from);
    for (var i = 0; i < w.length; i++) { var a = m(w[i][0]), b = m(w[i][1]); if (a === null || b === null || f === null) continue; if (b <= a) b += 1440; if (f >= a && f < b) return w[i][1] === '24:00' ? '00:00' : w[i][1]; }
    return null;
  }
  function happySave(){
    readEntries();
    var week = {}, deals = [], many = S.happy.length > 1, close = {};
    DAYS.forEach(function(d){ week[d] = []; });
    for (var i = 0; i < S.happy.length; i++) {
      var e = S.happy[i], ds = DAYS.filter(function(d){ return e.days[d]; });
      if (!ds.length) { S.nudge = T.needDays; return render(); }
      for (var k = 0; k < ds.length; k++) {
        if (week[ds[k]].length >= 2) { S.nudge = fill(T.twoPerDay, { day: dayName(ds[k]) }); return render(); }
        // Until close: stored with that day's closing time as its end (what older pages show) and marked in "_close".
        if (e.close) { var ce = closeFor(ds[k], e.from); if (!ce || ce === e.from) { S.nudge = fill(T.closeUnknown, { day: longDay(ds[k]) }); return render(); } week[ds[k]].push([e.from, ce]); (close[ds[k]] = close[ds[k]] || []).push(e.from); }
        else week[ds[k]].push([e.from, e.to]);
      }
      var pre = many ? dayPrefix(e) : '', what = e.what.trim();
      // Never cut short: a deal that doesn't fit says so, with how much room there is.
      if (what && (pre + what).length > 60) { S.nudge = fill(T.dealLong, { n: i + 1, max: 60 - pre.length }); return render(); }
      if (what) deals.push({ text: pre + what });
    }
    deals = deals.concat(S.happyKeep);
    if (deals.length > 6) { S.nudge = T.dealsMany; return render(); }
    // Its season (pub test 7): all year, or the months (or exact days) it runs.
    var hs = seaOut(S.happySea); if (!hs.ok) { S.nudge = hs.why; return render(); }
    week._season = hs.from ? { from: hs.from, to: hs.to } : null;
    week._close = Object.keys(close).length ? close : null;
    S.happyTyped = true;
    var list = [];
    if (S.notOffered.indexOf('happy_hour') >= 0) list.push({ not_offered: S.notOffered.filter(function(k){ return k !== 'happy_hour'; }) });
    // The Happy hour feature goes on with the times: the page only shows the deals (and the chip) while it is on.
    list.push({ happy_hour: week, happy_hour_deals: deals.length ? { deals: deals, deals_fr: [] } : null, badges: { happy_hour: true } });
    saveAll('happy', list);
  }
  function readEntries(){
    readSeasons();
    Array.prototype.forEach.call(screen.querySelectorAll('[data-hh]'), function(inp){ var q2 = inp.getAttribute('data-hh').split(':'); S.happy[+q2[0]][q2[1]] = inp.value; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-sp]'), function(inp){ var q2 = inp.getAttribute('data-sp').split(':'); S.specials[+q2[0]][q2[1]] = inp.value; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-nt]'), function(inp){ S.nights[+inp.getAttribute('data-nt')].what = inp.value; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-ntt]'), function(inp){ S.nights[+inp.getAttribute('data-ntt')].start = inp.value; });
  }
  // "18" -> "$18": a bare number typed as a price gets its dollar sign.
  // Café test 3 (2026-11-11): its own name. As a second `function money` it replaced the price screen's one, which
  // showed "$$9" and "Yes, about $$7.25".
  function moneyStr(v){ v = String(v || '').trim(); return /^\d{1,4}(\.\d{1,2})?$/.test(v) ? '$' + v : v; }
  function specialsSave(){
    readEntries(); var out = [];
    for (var i = 0; i < S.specials.length; i++) {
      var e = S.specials[i], ds = DAYS.filter(function(d){ return e.days[d]; }), text = e.text.trim();
      if (!ds.length) { S.nudge = T.needDays; return render(); }
      if (!text) { S.nudge = T.needText; return render(); }
      var ss = seaOut(e.sea); if (!ss.ok) { S.nudge = ss.why; return render(); }
      if (e.orig && e.was === daysKey(e.days) + '|' + e.text + '|' + e.price + '|' + seaKey(e.sea) + '|' + (e.start || '') + '|' + (e.end || '') && !!e.endClose === (e.orig.end === 'close')) { out.push(e.orig); continue; }
      if (e.start && e.end && e.start === e.end) { S.nudge = T.specialTimeSame; return render(); }
      if (text.length > 80) { S.nudge = fill(T.textLong, { n: i + 1, max: 80 }); return render(); }
      var o0 = e.orig || {}, sameText = e.orig && e.was.split('|')[1] === e.text;
      // Café test 3 (2026-11-11): one typed line stays one line. A comma no longer splits it ("Buy 9, get the 10th free"
      // became "Buy 9" over "get the 10th free"). A line that fits a title (40) is the title, and the deal repeats it
      // (the deal is required; the page never shows a repeat). A longer line is cut between words: the title is the words
      // that fit, the deal the rest, so the page reads it in order.
      var t1 = text, rest = '';
      if (text.length > 40) { var cut = text.lastIndexOf(' ', 40); if (cut < 10) cut = 40; t1 = text.slice(0, cut).trim(); rest = text.slice(cut).trim(); }
      out.push({ days: ds, title: sameText ? o0.title : t1, deal: sameText ? o0.deal : (rest || text), price: moneyStr(e.price) || null, kind: o0.kind || (C.servesAlcohol ? 'both' : 'food'),
        start: e.start || null, end: e.end || (e.endClose ? 'close' : null), title_fr: sameText ? o0.title_fr || null : null, deal_fr: sameText ? o0.deal_fr || null : null, season_from: ss.from, season_to: ss.to });
    }
    var list = []; if (S.notOffered.indexOf('specials') >= 0) list.push({ not_offered: S.notOffered.filter(function(k){ return k !== 'specials'; }) });
    list.push({ specials: out }); saveAll('specials', list);
  }
  function apptKind(k){ return k === 'tour' || k === 'class'; }
  function nightAppt(e){ return !!(e && e.appt && apptKind(e.kind)); }
  function musicSave(){
    S.nightsGuessed = false;
    readEntries(); var out = [];
    for (var i = 0; i < S.nights.length; i++) {
      var e = S.nights[i], ds = DAYS.filter(function(d){ return e.days[d]; }), title = (e.what || '').trim() || (e.kind && e.kind !== 'other' ? T.kinds[e.kind] : '');
      if (!title && e.kind === 'other') { S.nudge = T.otherNeed; return render(); }
      var appt = nightAppt(e); if (appt) ds = [];
      if (!ds.length && !appt) { S.nudge = T.needDays; return render(); }
      if (!title) { S.nudge = T.needText; return render(); }
      var ns = seaOut(e.sea); if (!ns.ok) { S.nudge = ns.why; return render(); }
      if (e.orig && e.was === daysKey(appt ? {} : e.days) + '|' + e.kind + '|' + e.what + '|' + e.start + '|' + seaKey(e.sea) + (appt ? '|appt' : '')) { out.push(e.orig); continue; }
      if (title.length > 40) { S.nudge = fill(T.textLong, { n: i + 1, max: 40 }); return render(); }
      var n0 = e.orig || {}, sameTitle = e.orig && n0.title === title;
      out.push({ days: ds, kind: e.kind || 'other', title: title, start: e.start || null, end: n0.end || null, detail: n0.detail || null, host: n0.host || null, cost: n0.cost || null, frequency: appt ? 'appointment' : n0.frequency && n0.frequency !== 'appointment' ? n0.frequency : 'weekly',
        title_fr: sameTitle ? n0.title_fr || null : null, detail_fr: sameTitle ? n0.detail_fr || null : null, season_from: ns.from, season_to: ns.to });
    }
    var list = []; if (S.notOffered.indexOf('entertainment') >= 0) list.push({ not_offered: S.notOffered.filter(function(k){ return k !== 'entertainment'; }) });
    list.push({ weekly_nights: out }); saveAll('music', list, null, null, function(){ CUR.weekly_nights_waiting = false; });
  }
  // "No" answers: clear what the page shows, then say "we don't have one" where the checklist has one.
  function sayNo(step){
    var noKey = { happy: 'happy_hour', specials: 'specials', music: 'entertainment', book: 'pyv_reservations', takeout: 'pyv_takeout', groups: 'pyv_groups', instagram: 'instagram', facebook: 'facebook' }[step];
    var clear = {
      happy: CUR.happy_hour || CUR.happy_hour_deals || (CUR.badges || {}).happy_hour ? { happy_hour: null, happy_hour_deals: null, badges: { happy_hour: false } } : null,
      specials: (CUR.specials || []).length ? { specials: null } : null,
      music: (CUR.weekly_nights || []).length || (CUR.badges || {}).live_music ? { weekly_nights: null, badges: { live_music: false } } : null,
      book: S.visit.reservations || S.badges.takes_reservations ? Object.assign(S.visit.reservations ? { visit_rows: { reservations: '' } } : {}, S.badges.takes_reservations ? { badges: { takes_reservations: false } } : {}) : null,
      takeout: S.visit.takeout || S.badges.takeout ? Object.assign(S.visit.takeout ? { visit_rows: { takeout: '' } } : {}, S.badges.takeout ? { badges: { takeout: false } } : {}) : null,
      groups: S.visit.groups || S.badges.great_groups ? Object.assign(S.visit.groups ? { visit_rows: { groups: '' } } : {}, S.badges.great_groups ? { badges: { great_groups: false } } : {}) : null,
      sellout: CI.sellout ? { cafe_info: { sellout: null } } : null,
      instagram: CUR.instagram_url ? { instagram_url: '' } : null,
      facebook: CUR.facebook_url ? { facebook_url: '' } : null,
    }[step];
    var list = []; if (clear) list.push(clear); if (noKey) list.push({ not_offered: addNot(noKey) });
    if (step === 'sellout') S.cafe.sellout = '';
    var clearLocal = function(){ if (step === 'sellout') CI.sellout = ''; var vk = { book: 'reservations', takeout: 'takeout', groups: 'groups' }[step], bk = { book: 'takes_reservations', takeout: 'takeout', groups: 'great_groups' }[step]; if (vk) S.visit[vk] = ''; if (bk) S.badges[bk] = false; };
    if (!list.length) return record(step, 'no', function(){ clearLocal(); go('saved:' + step); });
    saveAll(step, list, 'no', null, clearLocal);
  }

  // Instagram / Facebook: a link or @name is checked and goes on the page; a plain page name is a note for us to find
  // the link (never published as typed). Never an error for a name: anything that isn't a link is treated as the name.
  function socialSave(v, val){
    if (S.busy) return;
    var ig = v === 'instagram', link = '';
    if (ig) { if (/^@?[A-Za-z0-9._]{2,30}$/.test(val)) link = val.charAt(0) === '@' ? val : '@' + val; else if (/instagram\.com\//i.test(val) && !/\s/.test(val)) link = val; }
    else if (/facebook\.com\//i.test(val) && !/\s/.test(val)) link = val;
    var asName = function(){
      S.error = '';
      return post(C.base + '/menu/help', { note: fill(ig ? T.igNote : T.fbNote, { name: val }), sheet: v, contact_email: '', contact_phone: '' }).then(function(j){
        if (!(j && j.ok)) { S.busy = false; S.error = why(j); return render(); }
        S.savedLine[v] = ig ? T.savedIgName : T.savedFbName; C.socialSent[v] = true;
        return progress(v, 'day').then(function(ok){ S.busy = false; if (ok) go('saved:' + v); else render(); });
      });
    };
    S.busy = true; S.error = ''; S.nudge = ''; render();
    var drop = S.notOffered.indexOf(v) >= 0 ? change({ not_offered: S.notOffered.filter(function(z){ return z !== v; }) }) : Promise.resolve('live');
    drop.then(function(r0){
      if (!r0) { S.busy = false; return render(); }
      if (!link) return asName();
      var ch = {}; ch[v + '_url'] = link;
      return change(ch).then(function(r){
        if (!r) return asName();
        S.savedLine[v] = ''; return progress(v, r).then(function(ok){ S.busy = false; if (ok) go('saved:' + v); else render(); });
      });
    });
  }

  // ---------- Instagram and Facebook on one screen (cafés, 2026-11-11) ----------
  // Each part: the box (or "We're not on it" / "Not sure" when tapped). Saved with the same checks as the one-network
  // screens: a link or @name goes on the page, a plain name is a note for us, "not on it" clears the link and says so.
  function socialPart(n){
    var ig = n === 'instagram', ch = S.socNo[n], id = ig ? 'suIg' : 'suFb', d = S.done[n];
    var now = d === 'live' || d === 'day' ? '<p class="su-sent">' + h(C.socialSent[n] && d === 'day' ? T.socialSent : T.alreadyDone) + '</p>' : '';
    return '<h2 class="su-h2">' + h(ig ? 'Instagram' : 'Facebook') + '</h2>' + now
      + (ig && S.igFromMenu && S.ig ? '<p class="su-sent su-research" id="suIgFromMenu">' + h(fill(T.igFromMenu, { x: S.ig })) + '</p>' : '')
      + (!ig && !ch && S.fbFromWebsite && S.fb && S.fb !== S.socSaved.facebook && T.fbFromWebsite ? '<p class="su-sent su-research" id="suFbFromSite">' + h(T.fbFromWebsite) + '</p>' : '')
      + (ig && !ch && S.igFromWebsite && S.ig && S.ig !== S.socSaved.instagram && T.igFromWebsite ? '<p class="su-sent su-research" id="suIgFromSite">' + h(T.igFromWebsite) + '</p>' : '')
      + (ch ? '' : '<p class="su-hint">' + h(ig ? T.igLead : T.fbWhy) + '</p><label class="su-q" for="' + id + '">' + h(ig ? T.igLabel : T.fbLabel) + '</label><input class="su-field" id="' + id + '" type="text" autocapitalize="none" autocomplete="off" value="' + h(ig ? S.ig : S.fb) + '">')
      + '<div class="su-chips" role="group" aria-label="' + h(ig ? 'Instagram' : 'Facebook') + '" style="margin-top:10px">'
      + [['no', ig ? T.igNo : T.fbNo], ['unsure', T.socialUnsure]].map(function(o){ return '<button type="button" class="su-chip su-chip-wide" aria-pressed="' + (ch === o[0] ? 'true' : 'false') + '" data-soc="' + n + ':' + o[0] + '">' + h(o[1]) + '</button>'; }).join('') + '</div>';
  }
  function readSocial(){ var a = el('suIg'), b = el('suFb'); if (a) S.ig = a.value.trim(); if (b) S.fb = b.value.trim(); }
  // One network's answer. -> Promise of its status ('live', 'day', 'no', 'unsure', a kept answer) or '' (nothing to save),
  // or null with the reason shown.
  function socialOne(n){
    var ig = n === 'instagram', ch = S.socNo[n], val = ig ? S.ig : S.fb;
    if (ch === 'unsure') return Promise.resolve('unsure');
    if (ch === 'no' && S.done[n] === 'no' && S.notOffered.indexOf(n) >= 0 && !(ig ? CUR.instagram_url : CUR.facebook_url)) return Promise.resolve('no');
    if (ch === 'no') {
      var clr = ig ? (CUR.instagram_url ? { instagram_url: '' } : null) : (CUR.facebook_url ? { facebook_url: '' } : null);
      return (clr ? change(clr) : Promise.resolve('live')).then(function(r){
        if (!r) return null;
        if (ig) { CUR.instagram_url = ''; S.ig = ''; } else { CUR.facebook_url = ''; S.fb = ''; }
        return change({ not_offered: addNot(n) }).then(function(r2){ return r2 ? 'no' : null; });
      });
    }
    if (!val) return Promise.resolve('');
    // The same as what's saved: kept as it is.
    if (val === S.socSaved[n] && answered(n)) return Promise.resolve(S.done[n]);
    var link = '';
    if (ig) { if (/^@?[A-Za-z0-9._]{2,30}$/.test(val)) link = val.charAt(0) === '@' ? val : '@' + val; else if (/instagram\.com\//i.test(val) && !/\s/.test(val)) link = val; }
    else if (/facebook\.com\//i.test(val) && !/\s/.test(val)) link = val;
    var asName = function(){
      S.error = '';
      return post(C.base + '/menu/help', { note: fill(ig ? T.igNote : T.fbNote, { name: val }), sheet: n, contact_email: '', contact_phone: '' }).then(function(j){
        if (!(j && j.ok)) { S.error = why(j); return null; }
        S.socLines.push(ig ? T.savedIgName : T.savedFbName); C.socialSent[n] = true; S.socSaved[n] = val; return 'day';
      });
    };
    var drop = S.notOffered.indexOf(n) >= 0 ? change({ not_offered: S.notOffered.filter(function(z){ return z !== n; }) }) : Promise.resolve('live');
    return drop.then(function(r0){
      if (!r0) return null;
      if (!link) return asName();
      var c2 = {}; c2[n + '_url'] = link;
      return change(c2).then(function(r){ if (!r) { S.error = ''; return asName(); } S.socSaved[n] = val; return r; });
    });
  }
  function socialBoth(){
    if (S.busy) return;
    readSocial();
    if (!S.socNo.instagram && !S.socNo.facebook && !S.ig && !S.fb) { S.nudge = T.socialNeed; return render(); }
    S.busy = true; S.error = ''; S.nudge = ''; S.socLines = []; render();
    var got = {};
    var fail = function(){ S.busy = false; render(); };
    socialOne('instagram').then(function(a){
      if (a === null) return fail();
      got.instagram = a;
      return socialOne('facebook').then(function(b){
        if (b === null) return fail();
        got.facebook = b;
        var keys = ['instagram', 'facebook'].filter(function(n){ return got[n]; });
        var all = keys.map(function(n){ return got[n]; });
        var st = all.indexOf('day') >= 0 ? 'day' : all.indexOf('live') >= 0 ? 'live' : all.indexOf('unsure') >= 0 ? 'unsure' : 'no';
        var rec = function(i){
          if (i >= keys.length) return progress('social', st);
          // A kept answer is already recorded.
          if (S.done[keys[i]] === got[keys[i]]) return rec(i + 1);
          return progress(keys[i], got[keys[i]]).then(function(ok){ return ok ? rec(i + 1) : false; });
        };
        return rec(0).then(function(ok){
          S.busy = false; if (!ok) return render();
          S.savedLine.social = S.socLines.join(' ') || (st === 'unsure' ? T.savedUnsure : '');
          S.socNo = { instagram: S.done.instagram === 'no' ? 'no' : S.done.instagram === 'unsure' ? 'unsure' : '', facebook: S.done.facebook === 'no' ? 'no' : S.done.facebook === 'unsure' ? 'unsure' : '' };
          go('saved:social');
        });
      });
    });
  }

  // Pub test 7 (2026-11-10): new words typed straight after the old description ("…pub food.A beach bar…") get the
  // space they were missing. Only that one join is touched; the rest is exactly as she typed it.
  function storyJoinFix(v){
    var old = storyCur().replace(/\s+$/, ''); v = String(v || '');
    if (old && v.length > old.length && v.indexOf(old) === 0 && /[.!?,;:)]$/.test(old) && /^[^\s.,;:!?)]/.test(v.slice(old.length))) return old + ' ' + v.slice(old.length);
    return v;
  }
  // The stored seasonal hours the kitchen's seasonal time goes with: { from, to, kind } or null.
  function kitchenSeason(){
    var s0 = (CUR.hours_seasons || [])[0]; if (!s0 || !/^\d{2}-\d{2}$/.test(s0.from || '') || !/^\d{2}-\d{2}$/.test(s0.to || '')) return null;
    var lab = String(s0.label || '').toLowerCase(), m = +s0.from.slice(0, 2);
    return { from: s0.from, to: s0.to, kind: /winter|hiver/.test(lab) ? 'winter' : /summer|été/.test(lab) ? 'summer' : (m >= 4 && m <= 9 ? 'summer' : 'winter') };
  }
  function mdText(md){ return mdLabel(md); }
  function readKsea(){ var e = el('suKsto'); if (e) S.kitchen.sea.closes = e.value; }
  // ---------- Wiring ----------
  function act(a){
    var p = a.split(':'), k = p[0], v = p.slice(1).join(':');
    if (k === 'go') return go(v);
    if (k === 'skip') { if (answered(v)) return after(v); return record(v, 'skip', function(){ after(v); }); }
    // From "Change something?" or Welcome back: straight to that question with the saved answer, then back to the list.
    if (k === 'edit') { S.toList = true; S.toFinish = false; S.hist = ['start']; S.step = 'start'; return go(filled(v)); }
    if (k === 'closureAddSave') { act('closureAdd'); if (!S.nudge) act('closuresSave'); return; }
    if (k === 'monthsUseSave') { act('monthsUse'); if (!S.nudge) act('closuresSave'); return; }
    if (k === 'cuisineExit' && C.cafe) {
      // Save and exit on the café's kind or style screen: the kind (and food styles touched), plus what they serve if picked.
      var sv0 = (C.serves || []).map(function(o){ return o.k; }).filter(function(z){ return S.cafe.serves[z]; }), ce = [];
      if (S.place) { var ke = { place_type: S.place }; if (S.cuiTouched) ke.cuisines = S.cuis; ce.push(ke); }
      if (sv0.length) ce.push({ cafe_info: { serves: sv0 } });
      if (!ce.length) return leave(); return saveAll('cuisine', ce);
    }
    if (k === 'cuisineExit' && CK) { if (!S.cuis.length) return leave(); return saveAll('cuisine', foodAgain([{ cuisines: S.cuis }])); }
    if (k === 'cuisineExit') { if (!S.cuis.length) return leave(); return saveAll('cuisine', foodAgain([S.place ? { cuisines: S.cuis, place_type: S.place } : { cuisines: S.cuis }])); }
    if (k === 'spend' || k === 'add' || k === 'closureAdd' || k === 'monthsUse' || k === 'monthsClear') mark();
    if (k === 'later') return record(v, 'later');
    if (k === 'open') { S.toList = false; S.hist = ['more']; S.step = 'more'; return go(filled(v)); }
    if (k === 'after') return after(v);
    if (k === 'resume') { S.toList = false; var f = firstOpen(); return go(f); }
    if (k === 'jump') { S.toFinish = true; S.toList = false; return go(filled(v)); }
    if (k === 'jumpEss') { S.hist = ['ess']; S.step = 'ess'; go(filled(v)); S.toEss = true; return render(); }
    // "I'm done for now": the portal's own checklist may speak up again from here on.
    if (k === 'doneNow' || k === 'doneNow2') { if (S.busy) return; S.busy = true; return post(C.base + '/setup/progress', { done_for_now: true }).then(function(){ S.busy = false; if (k === 'doneNow') return leave(); S.doneNowSaid = true; go('finish'); }); }
    if (k === 'no') return sayNo(v);
    // Café test 1 (2026-11-11): "Yes, that's right" with no website on file is the "We don't have a website" answer too,
    // so the checklist's Website item counts it (it stopped at 97%). Never while a website is on file or waiting.
    if (k === 'basicsOk') { if (!CUR.website && !C.website && S.notOffered.indexOf('website') < 0) return saveAll('basics', [{ not_offered: addNot('website') }]); return record('basics', 'live'); }
    if (k === 'basicsSave') {
      S.addr = el('suAddr').value; S.phone = el('suPhone').value; S.site = el('suSite').value;
      var ch = {}; if (S.addr.trim() !== (CUR.address || '')) ch.address = S.addr; if (phoneChanged(S.phone)) ch.phone = S.phone;
      // Website (2026-11-10): typed as "example.com" is fine (the server adds https://); it's checked first, like today.
      var site = S.site.trim();
      // Café test 4 (2026-11-11): a Facebook page typed as the website is the Facebook link (saved and live, checked the
      // same way as the Facebook step's) and the website stays "none", so Facebook isn't asked again later.
      var fbl = fbFromSite(site);
      if (fbl) {
        delete ch.website; var nlF = S.notOffered.filter(function(z){ return z !== 'facebook'; });
        if (!CUR.website && !C.website && nlF.indexOf('website') < 0) nlF.push('website');
        var listF = []; if (Object.keys(ch).length) listF.push(ch); listF.push({ facebook_url: fbl });
        if (nlF.slice().sort().join() !== S.notOffered.slice().sort().join()) listF.push({ not_offered: nlF });
        return saveAll('basics', listF, null, null, function(){ phoneSaved(ch); S.site = null; S.fb = fbl; CUR.facebook_url = fbl; S.savedLine.basics = T.fbFromSite + (S.savedLine.basics ? ' ' + S.savedLine.basics : ''); if ((STEPS.indexOf('facebook') >= 0 || COMBO) && !answered('facebook')) progress('facebook', 'live'); });
      }
      if (site && !siteOk(site)) { S.nudge = T.websiteBad; S.badField = 'suSite'; return render(); }
      if (siteDomain(site) !== siteDomain(CUR.website)) ch.website = site;
      if (!Object.keys(ch).length) { S.nudge = T.noChange; return render(); }
      var listB = [ch]; if (site && S.notOffered.indexOf('website') >= 0) listB.unshift({ not_offered: S.notOffered.filter(function(z){ return z !== 'website'; }) });
      // The new website (still being checked) is what the menu link offers next (pub test 7).
      return saveAll('basics', listB, null, null, function(){ phoneSaved(ch); if (ch.website) C.website = /^https?:\/\//i.test(ch.website) ? ch.website : 'https://' + ch.website; });
    }
    // "We don't have a website": with none on file it's the existing not-offered answer (live); with one on file the
    // removal is a website change, checked first like any other (Sent ✓ within a day).
    if (k === 'basicsNoSite') {
      S.addr = el('suAddr').value; S.phone = el('suPhone').value; S.site = '';
      var chN = {}; if (S.addr.trim() !== (CUR.address || '')) chN.address = S.addr; if (phoneChanged(S.phone)) chN.phone = S.phone;
      if (CUR.website) { chN.website = ''; return saveAll('basics', [chN], null, null, function(){ phoneSaved(chN); C.website = ''; }); }
      var listN = [{ not_offered: addNot('website') }]; if (Object.keys(chN).length) listN.push(chN);
      return saveAll('basics', listN, null, null, function(){ phoneSaved(chN); });
    }
    if (k === 'noSetHours') return noSetHoursSave();
    if (k === 'hoursOk') return go('hours:year');
    if (k === 'hoursNext') { readTimes(); if (!windowsOk(S.week)) { S.nudge = APPT && T.needOpenDayAppt ? T.needOpenDayAppt : T.needOpenDay; return render(); } return go('hours:year'); }
    // Café test 3 (2026-11-11): "Yes, all year" also clears a saved open season (open_months), so the page stops saying
    // "Closed for the season".
    // Café test 4: a café's "Yes, all year" is its season answer on the checklist too (closures no longer asks it).
    if (k === 'yearAll' && APPT) S.wYearPick = 'all';
    if (k === 'yearAll') { S.sea.on = false; S.seaTouched = true; if (S.openSea || CUR.open_months || (YEAR_ANSWER && S.savedYear !== 'all')) { S.openSea = null; S.openTouched = true; } return hoursSave(); }
    // Café test 2 (2026-11-11): "We're closed part of the year" and its dates.
    if (k === 'yearClosed') { S.openFrom = 'hours'; S.openDraft = null; return go('hours:open'); }
    if (k === 'openEdit') { S.openFrom = 'closures'; S.openDraft = null; return go('hours:open'); }
    if (k === 'openMonths') {
      var odm = { from: mdRead('suOf'), to: mdRead('suOt') }; S.openDraft = odm.from || odm.to ? odm : S.openDraft;
      S.closedM = {}; var o0 = S.openDraft && S.openDraft.from && S.openDraft.to ? S.openDraft : S.openSea;
      if (o0) { var om0 = seaMonths({ on: true, months: {}, exact: o0 }); for (var mi0 = 1; mi0 <= 12; mi0++) if (!om0[mi0]) S.closedM[mi0] = true; }
      S.openMonthsBack = true; return go('closures:months');
    }
    if (k === 'openNone' || k === 'openSave') {
      var oNew = null;
      if (k === 'openSave') {
        var of = mdRead('suOf'), ot = mdRead('suOt'); S.openDraft = { from: of, to: ot };
        if (!of || !ot) { S.nudge = T.openNeed; return render(); }
        if (of === ot) { S.nudge = T.openSameDay; return render(); }
        oNew = { from: of, to: ot };
      }
      S.openSea = oNew; S.openDraft = null; S.openTouched = true; S.dirty = 'hours';
      if (S.openFrom === 'hours') {
        if (APPT) S.wYearPick = 'seasonal';
        if (v === 'summer') { if (S.sea.kind !== 'summer' || !S.sea.week) { S.sea.kind = 'summer'; S.sea.months = {}; SEA_MONTHS.summer.forEach(function(m){ S.sea.months[m] = true; }); S.sea.week = clone(S.week); } S.sea.on = true; S.sea.open = {}; S.seaTouched = true; return go('hours:season'); }
        if (k === 'openNone') return go('hours:year', true);
        if (v !== 'keep') { S.sea.on = false; S.seaTouched = true; }
        return hoursSave();
      }
      // From the closures screen (or the checklist): just the dates.
      var ovc = openVal(S.openSea), lc = [];
      if (ovc !== (CUR.open_months || '')) lc.push({ open_months: ovc });
      if (C.cafe && (ovc ? 'seasonal' : 'all') !== S.savedYear) lc.push({ cafe_info: { year: ovc ? 'seasonal' : 'all' } });
      if (C.brewery && !C.distillery && (ovc ? 'seasonal' : 'all') !== S.savedYear) lc.push(yearPart(ovc ? 'seasonal' : 'all'));
      if (APPT && S.savedWYear !== 'appointment' && (ovc ? 'seasonal' : 'all') !== S.savedWYear) { lc.push(apptPart({ year: ovc ? 'seasonal' : 'all' })); S.savedWYear = ovc ? 'seasonal' : 'all'; S.wine.year = S.savedWYear; if (C.distillery) S.savedYear = S.savedWYear; }
      if (!lc.length) { S.openTouched = false; S.step = S.hist.pop() || 'closures'; return render(); }
      return saveAll('closures', lc, null, 'closures', function(){ CUR.open_months = ovc; S.openTouched = false; S.hist.pop(); S.hist.pop(); });
    }
    if (k === 'yearSeason') {
      if (S.sea.kind !== v || !S.sea.week) {
        // A new season (or the other one): its usual months, and the usual week to start from (every day, closed ones too).
        S.sea.kind = v; S.sea.months = {}; SEA_MONTHS[v].forEach(function(m){ S.sea.months[m] = true; }); S.sea.week = clone(S.week);
      }
      if (APPT) S.wYearPick = 'all';
      S.sea.on = true; S.sea.open = {}; S.seaTouched = true; S.dirty = 'hours'; return go('hours:season');
    }
    // Pubs (2026-11-10): the kitchen, the sports and who's welcome.
    if (k === 'kitchenSame' || k === 'kitchenNone') { var km = k === 'kitchenSame' ? 'same' : 'none'; return saveAll('hours', [{ pub_info: { kitchen: { mode: km } } }], null, null, function(){ kitchenSaid(km); S.kitchen.note = ''; }); }
    if (k === 'kitchenSave') {
      var kt = el('suKto'), kn = el('suKnote'); if (kt) S.kitchen.closes = kt.value; if (kn) S.kitchen.note = kn.value.trim(); readKsea();
      // Never pre-filled (pub test 4): a blank time asks gently, and nothing is saved.
      if (!/^\d{2}:\d{2}$/.test(S.kitchen.closes)) { S.nudge = T.kitchenNeed; return render(); }
      var kseason = kitchenSeason(), kv = { mode: 'earlier', closes: S.kitchen.closes, note: S.kitchen.note };
      if (kseason && S.kitchen.sea.mode !== 'same') {
        if (S.kitchen.sea.mode === 'time' && !/^\d{2}:\d{2}$/.test(S.kitchen.sea.closes)) { S.nudge = T.kitchenSeasonNeed; return render(); }
        kv.season = { from: kseason.from, to: kseason.to, closes: S.kitchen.sea.mode === 'close' ? 'close' : S.kitchen.sea.closes };
      }
      return saveAll('hours', [{ pub_info: { kitchen: kv } }], null, null, function(){ kitchenSaid('earlier'); S.pubInfo.kitchen = kv; });
    }
    if (k === 'noFood') return saveAll('cuisine', [{ pub_info: { kitchen: { mode: 'none' } } }], 'no', null, function(){ kitchenSaid('none'); });
    if (k === 'sportsSave') {
      var sl = C.sports.map(function(o){ return o.k; }).filter(function(z){ return S.sports.list[z]; });
      if (!sl.length) { S.nudge = T.sportsNeed; return render(); }
      return saveAll('offer', [{ pub_info: { sports: { list: sl, tvs: S.sports.tvs } } }], null, offerNext('offer:sports'));
    }
    if (k === 'minorsSave') {
      readMinors();
      if (!S.minors.policy) { S.nudge = T.minorsNeed; return render(); }
      var mv = { policy: S.minors.policy, note: S.minors.note }; if (S.minors.policy === 'minors_until') mv.until = S.minors.until;
      // Breweries (2026-11-12): stored with their own answers; it writes the Kids & dogs line and decides the Kids badge.
      if (C.brewery) { S.savedLine.offer = T.minorsLive; return saveAll('offer', [{ brewery_info: { minors: mv } }], null, null, function(){ BI.minors = mv; }); }
      // Cocktail lounges (Decided 4): her answer decides the Kids badge (the brewery rule), stored with the pub answers.
      if (CK) S.savedLine.offer = T.minorsLive;
      return saveAll('offer', [{ pub_info: { minors: mv } }]);
    }
    if (k === 'hoursSave') return hoursSave();
    // "Until close" on a happy hour (pub test 9): on or off; the end-time box comes back when it is off.
    if (k === 'hhClose') { readEntries(); var ec = S.happy[+v]; if (!ec) return; ec.close = !ec.close; if (S.nudge && /close|ferm/i.test(S.nudge)) S.nudge = ''; render(); return; }
    // The same for a weekly special (its end is stored as 'close', the way it always was).
    if (k === 'ntAppt') { readEntries(); var en0 = S.nights[+v]; if (!en0) return; en0.appt = !nightAppt(en0); if (en0.appt) en0.days = {}; S.nudge = ''; var y0 = window.scrollY; render(); window.scrollTo(0, y0); return; }
    if (k === 'spClose') { readEntries(); var es = S.specials[+v]; if (!es) return; es.endClose = !es.endClose; if (es.endClose) es.end = ''; render(); return; }
    // "All day (open to close)" (pub fresh-eyes, 2026-11-10): the happy hour runs from the earliest opening to the latest
    // closing of the days picked (or of the whole week when no day is picked yet).
    if (k === 'allDay') {
      // Days with different hours get a happy hour each (Mon–Thu 11 AM–11 PM, Fri–Sat 11 AM–1 AM), same deal.
      readEntries(); var i9 = +v, e9 = S.happy[i9]; if (!e9) return;
      var picked = DAYS.filter(function(d){ return e9.days[d] && S.week && S.week[d]; });
      var use = picked.length ? picked : DAYS.filter(function(d){ return S.week && S.week[d]; }); if (!use.length) return;
      var groups9 = [], byKey = {};
      use.forEach(function(d){ var w9 = S.week[d], key9 = w9[0][0] + '-' + w9[w9.length - 1][1];
        if (!byKey[key9]) { byKey[key9] = { days: {}, from: w9[0][0], to: w9[w9.length - 1][1] === '24:00' ? '00:00' : w9[w9.length - 1][1] }; groups9.push(byKey[key9]); } byKey[key9].days[d] = true; });
      e9.days = groups9[0].days; e9.from = groups9[0].from; e9.to = groups9[0].to;
      var add9 = groups9.slice(1, 1 + Math.max(0, 6 - S.happy.length)).map(function(g){ return { days: g.days, from: g.from, to: g.to, what: e9.what }; });
      Array.prototype.splice.apply(S.happy, [i9 + 1, 0].concat(add9));
      mark(); var y9 = window.scrollY; render(); window.scrollTo(0, y9); return;
    }
    if (k === 'keepMain') { S.keepMain = true; S.photos.forEach(function(ph){ ph.main = false; }); return render(); }
    if (k === 'spDays') { readEntries(); var es = S.specials[+v]; if (!es) return; var on7 = !allDays(es.days); es.days = {}; if (on7) DAYS.forEach(function(d){ es.days[d] = true; }); mark(); var ys = window.scrollY; render(); window.scrollTo(0, ys); return; }
    if (k === 'hhDays') { readEntries(); var sp = String(v).split(','), eh = S.happy[+sp[0]]; if (!eh) return; eh.days = {}; DAYS.forEach(function(d){ if (sp[1] === 'all' || ['mon', 'tue', 'wed', 'thu', 'fri'].indexOf(d) >= 0) eh.days[d] = true; }); mark(); var yh = window.scrollY; render(); window.scrollTo(0, yh); return; }
    if (k === 'monthsUse') {
      // The months tapped are the closed ones; the open months are the rest (none tapped: open all year).
      var cm = S.closedM || {}, nClosed = 0, openM = {}; for (var mj = 1; mj <= 12; mj++) { if (cm[mj]) nClosed++; else openM[mj] = true; }
      if (!nClosed) { S.months = {}; S.closedM = null; if (S.openMonthsBack) { S.openMonthsBack = false; S.openDraft = null; } S.step = S.hist.pop() || 'closures'; S.nudge = ''; return render(); }
      if (nClosed === 12) { S.nudge = T.monthsAllClosed; return render(); }
      var r = monthRun(openM); if (r.bad) { S.nudge = T.monthsClosedInRow; return render(); }
      S.months = openM; S.closedM = null;
      // Café test 2: the quick path from "When are you open each year?" fills its dates with the whole months.
      if (S.openMonthsBack) { S.openMonthsBack = false; S.openDraft = { from: pad2(r.a) + '-01', to: pad2(r.b) + '-' + MLAST[r.b - 1] }; }
      S.step = S.hist.pop() || 'closures'; S.nudge = ''; return render();
    }
    if (k === 'monthsClear') { S.months = {}; S.closedM = null; if (S.step !== 'closures') S.step = S.hist.pop() || 'closures'; S.nudge = ''; return render(); }
    if (k === 'closuresNone' || k === 'closuresSave') {
      var out = k === 'closuresNone' ? [] : HOL.filter(function(o){ return S.closures.indexOf(o.key) >= 0 && !holCovered(o, true); }).map(function(o){ return { from: o.date, to: o.date, note: S.holNotes[o.key] != null ? holKeep(o.key, S.holNotes[o.key]) : holEn(o.key) }; });
      out = out.concat(k === 'closuresNone' ? [] : HOL.filter(function(o){ return S.closures.indexOf(o.key) >= 0 && yearlyOn(o.key) && !holCovered(o, true) && !coveredBy(o.next) && !offSeason(o.next, true); }).map(function(o){ var nd = o.next; return { from: nd, to: nd, note: S.holNotes[o.key] != null && S.holNotes[o.key] !== '' ? holKeep(o.key, S.holNotes[o.key]) : holEn(o.key) }; })).concat(S.extra);
      // Café test 2 (2026-11-11): the open season is the Hours answer ("We're closed part of the year"); this screen
      // shows it and links to it, and never writes it (two places could disagree).
      var om = CUR.open_months || '';
      // Café test 5 (2026-11-12): only what changed is sent. Unchanged holidays and closed dates aren't sent again, nor the
      // "open all year" answer the Hours step just saved (it came back 400 "nothing new to send").
      var cl = closuresKey() === S.closuresWas ? [] : [{ closures: out }];
      // Cafés (2026-11-10): the answer itself ("open all year" or seasonal) counts on the checklist.
      if (C.cafe && (om ? 'seasonal' : 'all') !== S.savedYear) cl.push({ cafe_info: { year: om ? 'seasonal' : 'all' } });
      if (C.brewery && !C.distillery && (om ? 'seasonal' : 'all') !== S.savedYear) cl.push(yearPart(om ? 'seasonal' : 'all'));
      var wyc = APPT && S.savedWYear !== 'appointment' && (om ? 'seasonal' : 'all') !== S.savedWYear ? (om ? 'seasonal' : 'all') : '';
      if (wyc) cl.push(apptPart({ year: wyc }));
      return saveAll('closures', cl, k === 'closuresNone' ? 'no' : null, null, function(){ if (wyc) { S.savedWYear = wyc; S.wine.year = wyc; if (C.distillery) S.savedYear = wyc; } S.added = ''; S.closuresWas = closuresKey(); S.closuresSaved = S.closures.slice(); S.savedExtra = S.extra.length; });
    }
    if (k === 'closureAdd') {
      var cf = el('suCf').value, ctEl = el('suCt'), cn = el('suCn').value.trim(); S.addFrom = cf; S.addNote = cn; if (ctEl) S.addTo = ctEl.value;
      if (!cf) { S.nudge = T.needFirst; return render(); }
      var to = cf;
      if (S.addLen === 'pick') to = S.addTo && S.addTo >= cf ? S.addTo : cf;
      else { var d0 = new Date(cf + 'T12:00:00'); d0.setDate(d0.getDate() + (+S.addLen - 1)); to = ymd(d0); }
      var cnote = cn.replace(/[()&<>]/g, '').slice(0, 60), cy = el('suCyear'); S.addYearly = !!(cy && cy.checked);
      // Café test 2 (2026-11-11): "Every year" is one yearly rule ({ from: 'MM-DD', to: 'MM-DD', yearly: true }, "Every year:
      // Apr 1 – Apr 24"), not a dated copy for this year and next. Up to a year long, like any closure.
      if (S.addYearly) { var yr = { from: cf.slice(5), to: to.slice(5), note: cnote, yearly: true }; if (to.slice(0, 4) !== cf.slice(0, 4) && yr.to >= yr.from) { S.nudge = T.yearlyTooLong; return render(); }
        if (!S.extra.some(function(c){ return c.yearly && c.from === yr.from && c.to === yr.to; })) S.extra.push(yr); S.added = closureLabel(yr); }
      else { S.extra.push({ from: cf, to: to, note: cnote }); S.added = dateLabel(cf) + (to !== cf ? ' – ' + dateLabel(to) : ''); }
      S.addFrom = ''; S.addTo = ''; S.addNote = ''; S.addLen = '1'; S.addYearly = false;
      S.step = S.hist.pop() || 'closures'; S.nudge = ''; return render();
    }
    if (k === 'spend') { S.spend = Math.round(Math.max(C.cafe ? 2 : 5, Math.min(300, S.spend + (+v))) * 4) / 4; if (!C.cafe) S.spend = Math.round(S.spend); return render(); }
    if (k === 'spendConfirm') { S.spend = spendGuess() || S.spend; S.toFinish = true; if (!C.spendPublic) S.savedLine.spend = T.savedSpendOff; return saveAll('spend', [{ avg_spend: S.spend }], null, null, function(){ CUR.avg_spend = { amount: S.spend, source: 'owner' }; }); }
    if (k === 'spendSkip') { S.spendNotSure = true; if (answered('spend') || S.done.spend === 'skip') return render(); return record('spend', 'skip', function(){ render(); }); }
    if (k === 'spendSave' && CK) return act('cpriceSave');
    if (k === 'spendSave') { if (!C.spendPublic) S.savedLine.spend = T.savedSpendOff; return saveAll('spend', [{ avg_spend: S.spend }], null, null, function(){ spendAuto = false; }); }
    if (k === 'cuiAll') { S.cuiAll = true; return render(); }
    if (k === 'holAll') { S.holAll = !S.holAll; var yh = window.scrollY; render(); window.scrollTo(0, yh); return; }
    // Cocktail lounges (Decided 3): no "What kind of pub is it?"; the food is saved as it is.
    if (k === 'cuisineNext' && CK) { if (!S.cuis.length) { S.nudge = T.pickOne; return render(); } S.savedLine.cuisine = T.savedCuisine; return saveAll('cuisine', foodAgain([{ cuisines: S.cuis }])); }
    if (k === 'cuisineNext') { if (!S.cuis.length) { S.nudge = T.pickOne; return render(); } return go('cuisine:place'); }
    if (k === 'cpriceSave') {
      readBrew(); var cpv = S.cp;
      if (cpv.none) { S.savedLine.spend = T.cpriceSavedNone; return saveAll('spend', S.savedCp === 'none' ? [] : [{ cocktail_price: 'none' }], 'no', null, function(){ S.savedCp = 'none'; CUR.cocktail_price = 'none'; cpv.guessed = false; }); }
      if (cpv.fee == null || isNaN(cpv.fee) || cpv.fee <= 0 || cpv.fee > 500) { S.nudge = cpv.other ? T.feeNeed : T.cpriceNeed; if (cpv.other) S.badField = 'suCfee'; return render(); }
      S.savedLine.spend = cpv.fee > (C.feeLiveMax || 40) && cpv.fee !== S.savedCp ? T.cpriceSavedDay : T.cpriceSavedLive;
      return saveAll('spend', cpv.fee === S.savedCp ? [] : [{ cocktail_price: cpv.fee }], null, null, function(){ cpv.guessed = false; if (cpv.fee <= (C.feeLiveMax || 40)) { S.savedCp = cpv.fee; CUR.cocktail_price = cpv.fee; } else CUR.cocktail_price_waiting = cpv.fee; });
    }
    if (k === 'cuisineSave') { if (!S.place) { S.nudge = T.placeNeed; return render(); } S.savedLine.cuisine = T.savedCuisine; return saveAll('cuisine', foodAgain([{ cuisines: S.cuis, place_type: S.place }])); }
    if (k === 'take') return el('suTake').click();
    if (k === 'pick') return el('suPick').click();
    if (k === 'sendPhotos') return sendPhotos();
    if (k === 'menuFile') return el('suMenuFile').click();
    if (k === 'menuCam') return el('suMenuCam').click();
    if (k === 'sendMenuFiles') return sendPages(S.menuFiles, null, 'menu', T.menuNote);
    if (k === 'sendMenuPages') return sendPages(S.menuPages, null, 'menu', T.menuNote);
    if (k === 'menuWebSave') { var u = el('suUrl').value.trim(); S.webUrl = u; if (!u) { S.nudge = T.webEmpty; return render(); } return saveAll('menu', [{ menu_url: u }], 'day'); }
    if (k === 'menuEmailDone') return record('menu', 'email');
    if (k === 'menuDaily') {
      // Café test 2 (2026-11-11): saved as the café's answer (cafe_info.menu_daily), live at once; never the type-up queue.
      S.cafe.menuDaily = v; S.savedLine.menu = fill(T.savedMenuDaily, { x: (iceKind() ? T.menuDailyLineIce : T.menuDailyLine) + T.menuDailySee[v] });
      return saveAll('menu', [{ cafe_info: { menu_daily: v } }], null, null, function(){ CI.menu_daily = v; });
    }
    if (k === 'menuSocialSave') {
      var ms = el('suMsoc').value.trim(); S.menuSoc = ms; if (!ms) { S.nudge = T.menuSocialEmpty; return render(); }
      // Café test 2: an @handle typed here is offered on the Instagram step (when the page has no Instagram yet).
      var mh = /(?:^|\s)@([A-Za-z0-9._]{2,30})\b/.exec(ms) || /instagram\.com\/([A-Za-z0-9._]{2,30})/i.exec(ms);
      if (mh && !CUR.instagram_url && !S.ig) { S.ig = '@' + mh[1]; S.igFromMenu = true; }
      var mlink = /^@[A-Za-z0-9._]{2,30}$/.test(ms) ? 'https://www.instagram.com/' + ms.slice(1) : /(?:facebook\.com|fb\.com|instagram\.com)\//i.test(ms) && !/\s/.test(ms) ? ms : '';
      if (mlink) return saveAll('menu', [{ menu_url: mlink }], 'day');
      if (S.busy) return; S.busy = true; S.error = ''; render();
      return post(C.base + '/menu/help', { note: fill(T.menuSocialNote, { name: ms }), sheet: 'menu_social', contact_email: '', contact_phone: '' }).then(function(j){
        if (!(j && j.ok)) { S.busy = false; S.error = why(j); return render(); }
        S.savedLine.menu = T.savedMenuSocialName;
        return progress('menu', 'day').then(function(ok){ S.busy = false; if (ok) go('saved:menu'); else render(); });
      });
    }
    if (k === 'copy') { var sel = function(){ var rg = document.createRange(); rg.selectNodeContents(el('suEm')); var s2 = window.getSelection(); s2.removeAllRanges(); s2.addRange(rg); say('suCopied', T.selected); }; try { navigator.clipboard.writeText(C.email).then(function(){ say('suCopied', T.copied); }, sel); } catch (e) { sel(); } return; }
    if (k === 'urlBack') { var uu = el('suUrl'); if (uu) { uu.value = siteUrl(C.website); S.webUrl = uu.value; var usr = el('suUseSiteRow'); if (usr) usr.hidden = true; uu.focus(); try { uu.setSelectionRange(uu.value.length, uu.value.length); } catch (e2) {} } return; }
    if (k === 'sheetFile') return el('suSheetFile').click();
    if (k === 'sheetCam') return el('suSheetCam').click();
    if (k === 'sheetCamGo') { S.sheetFiles = []; S.hist.push(S.step); S.step = v + ':sheet'; render(); return el('suSheetCam').click(); }
    if (k === 'sendSheet') { var what = v === 'happy' ? T.whatHappy : T.whatSpecials; return sendPages(S.sheetFiles, v === 'happy' ? 'happy_hour' : 'specials', v, fill(T.sheetNote, { what: what })); }
    if (k === 'sheetWebSave') {
      var url = el('suUrl').value.trim(); S.webUrl = url; if (!url) { S.nudge = T.webEmpty; return render(); }
      if (S.busy) return; S.busy = true; S.error = ''; render();
      return post(C.base + '/menu/help', { note: fill(T.sheetWebNote, { what: v === 'happy' ? T.whatHappy : T.whatSpecials, url: url }), sheet: v === 'happy' ? 'happy_hour' : 'specials', contact_email: '', contact_phone: '' })
        .then(function(j){ if (j && j.ok) return progress(v, 'day').then(function(ok){ S.busy = false; if (!ok) return render(); S.webUrl = null; go('saved:' + v); }); S.busy = false; S.error = why(j); render(); });
    }
    if (k === 'offerSave') {
      var badges = {}; C.offerGroups.forEach(function(g){ g.keys.filter(tileShown).forEach(function(b){ badges[b] = !!S.badges[b]; }); });
      // Cafés: "Laptop friendly" is the laptops answer (its own small screen next), never a stored badge.
      if (C.cafe) delete badges.laptop;
      // Service dogs (pub test 8) only goes with No dogs.
      if (C.offerLabels.service_dogs) badges.service_dogs = !!(S.noDogs && !badges.dog_friendly && S.badges.service_dogs);
      var list = [];
      // A ticked "Takes reservations" replaces an earlier "we don't" answer (never both).
      if (badges.takes_reservations && S.notOffered.indexOf('pyv_reservations') >= 0) list.push({ not_offered: S.notOffered.filter(function(z){ return z !== 'pyv_reservations'; }) });
      if (badges.great_groups && S.notOffered.indexOf('pyv_groups') >= 0) list.push({ not_offered: (list.length ? list[0].not_offered : S.notOffered).filter(function(z){ return z !== 'pyv_groups'; }) });
      // A dietary tile ticked takes back an earlier "None of these".
      var diet = badges.vegan || badges.vegetarian || badges.gluten_free;
      if ((diet || !S.noDiet) && S.notOffered.indexOf('dietary') >= 0) { var cur0 = list.length ? list[list.length - 1].not_offered : S.notOffered; list.push({ not_offered: cur0.filter(function(z){ return z !== 'dietary'; }) }); }
      // "No dogs allowed" (pub test 4): taken back before Dog friendly is saved, given after it is turned off.
      if ((badges.dog_friendly || !S.noDogs) && S.notOffered.indexOf('dogs') >= 0) list.push({ not_offered: { remove: ['dogs'] } });
      list.push({ badges: badges });
      // "None of these" (no vegan, vegetarian or gluten-free options): the same answer as the portal's "we don't have one".
      if (!diet && S.noDiet && S.notOffered.indexOf('dietary') < 0) list.push({ not_offered: 'ADD_DIETARY' });
      if (!badges.dog_friendly && S.noDogs && S.notOffered.indexOf('dogs') < 0) list.push({ not_offered: { add: ['dogs'] } });
      // Dogs un-ticked: the "where are dogs allowed" line goes too. Ticked: that's the next small screen.
      if (!S.badges.dog_friendly && (CUR.visit_rows || {}).dogs) { list.push({ visit_rows: { dogs: '' } }); S.dogNote = ''; }
      // Pubs (2026-11-10): saving this screen with no game ticked = "No games"; Sports on TV not ticked = "We don't show
      // sports" (and its sports go). Only from the screen's own Save: "Save and exit" with picks half done never records
      // a "we don't" answer the owner didn't give (fresh-eyes pub test) — it only takes back ones a tick contradicts.
      if (C.pub && !CK) {
        var gameOn = GAMES.some(function(g){ return badges[g]; }), add = [], rem = [], partial = !!S.exitAfter;
        // Pub test 9 (2026-11-10): only the "No games" tile is a "we don't have games" answer. Games left unticked used
        // to record one ("You told us you don't have: games"); now they leave the question open.
        if (gameOn || !S.noGames) rem.push('games'); else if (!partial) add.push('games');
        // Pub test 6 (2026-11-10): Sports on TV left unticked is not an answer. Only an explicit one is "You told us you
        // don't have": the "No sports / no TVs" tile, or unticking a Sports on TV we had ticked from research.
        var noSportsSaid = S.noSports || (!!S.badgesAtStart.sports_tv && !badges.sports_tv);
        if (badges.sports_tv || !noSportsSaid) rem.push('sports'); else if (!partial) add.push('sports');
        if (!badges.sports_tv && !partial && S.pubInfo.sports) { list.push({ pub_info: { sports: null } }); S.sports = { list: {}, tvs: '' }; }
        list.push({ not_offered: { add: add, remove: rem } });
      }
      // Cafés (2026-11-10): Laptop friendly unticked takes back an "all day" / "not at busy times" answer; "No Wi-Fi" is
      // the explicit answer (like No games); a drive-thru or walk-up window ticked answers "Ordering" too.
      if (C.cafe) {
        var lp = S.cafe.stay.laptops;
        if (!S.badges.laptop && (lp === 'all_day' || lp === 'not_busy')) { S.cafe.stay.laptops = ''; var cs = cafeStay(); list.push({ cafe_info: { stay: Object.keys(cs).length ? cs : null } }); }
        var wadd = [], wrem = [];
        if (badges.wifi || !S.noWifi) wrem.push('wifi'); else if (!S.exitAfter) wadd.push('wifi');
        if (badges.drive_thru || badges.walk_up) { wrem.push('ordering'); S.cafe.order.counter = false; }
        if (badges.washroom || !S.noWash) wrem.push('washroom'); else if (!S.exitAfter) wadd.push('washroom');
        list.push({ not_offered: { add: wadd, remove: wrem } });
        // The seats answer from this screen (café test 2): takeout only, or taken back.
        if (S.cafe.stay.seats !== S.seatsWas && (S.cafe.stay.seats === 'takeout' || S.seatsWas === 'takeout')) { var cs2 = cafeStay(); list.push({ cafe_info: { stay: Object.keys(cs2).length ? cs2 : null } }); S.seatsWas = S.cafe.stay.seats; }
      }
      return saveAll('offer', list, null, offerNext('offer'));
    }
    // ---------- Cafés (2026-11-10) ----------
    if (k === 'kindNext') { if (!S.place) { S.nudge = T.kindNeed; return render(); } return go('cuisine:serve'); }
    if (k === 'styleDone') { S.nudge = ''; return go('cuisine:serve'); }
    if (k === 'serveSave') {
      var sv = C.serves.map(function(o){ return o.k; }).filter(function(z){ return S.cafe.serves[z]; });
      if (S.serveSuggested && !S.cafe.serves[S.serveSuggested]) S.serveSuggested = '';
      if (!S.place) { S.nudge = T.kindNeed; return go('cuisine'); }
      if (!sv.length) { S.nudge = T.serveNeed; return render(); }
      // The kind is saved only now, when the owner confirms it (a suggestion from the name is never saved by itself).
      var kc = { place_type: S.place }; if (S.cuiTouched) kc.cuisines = S.cuis;
      S.savedLine.cuisine = T.savedCuisine;
      return saveAll('cuisine', [kc, { cafe_info: { serves: sv } }], null, null, function(){ CUR.place_type = S.place; S.kindGuessed = ''; S.cuiTouched = false; S.serveSuggested = ''; CI.serves = sv; cafeHappy(sv.indexOf('beer_wine') >= 0); syncCoffee(); });
    }
    if (k === 'laptopSave') {
      if (!S.cafe.stay.laptops) { S.nudge = T.laptopNeed; return render(); }
      if (S.cafe.stay.laptops === 'none') S.badges.laptop = false;
      return saveAll('offer', [{ cafe_info: { stay: cafeStay() } }], null, offerNext('offer:laptops'));
    }
    if (k === 'staySave') {
      if (!S.cafe.stay.laptops && !S.cafe.stay.seats) { S.nudge = T.stayNeed; return render(); }
      return saveAll('stay', [{ cafe_info: { stay: cafeStay() } }], null, null, function(){ S.badges.laptop = S.cafe.stay.laptops === 'all_day' || S.cafe.stay.laptops === 'not_busy'; });
    }
    if (k === 'orderSave') {
      readCafe(); var od2 = S.cafe.order;
      if (od2.online && !od2.url) { S.nudge = T.orderUrlNeed; S.badField = 'suOurl'; return render(); }
      if (!od2.counter && !od2.online && !od2.preorder && !S.badges.drive_thru && !S.badges.walk_up) { S.nudge = T.orderNeed; return render(); }
      var ol = [], oi = od2.preorder ? (od2.how ? { preorder: true, preorder_how: od2.how } : { preorder: true }) : null;
      if (JSON.stringify(oi) !== S.savedOrder) ol.push({ cafe_info: { order: oi } });
      var links = { order_url: od2.online ? od2.url : '', preorder_url: od2.preorder ? od2.purl : '' };
      if (links.order_url !== (CL.order_url || '') || links.preorder_url !== (CL.preorder_url || '')) ol.push({ cafe_links: links });
      ol.push({ not_offered: od2.counter ? { add: ['ordering'] } : { remove: ['ordering'] } });
      return saveAll('order', ol, od2.counter ? 'no' : null, null, function(){ CL = { order_url: links.order_url, preorder_url: links.preorder_url }; });
    }
    if (k === 'dietSave') {
      readCafe(); var dt2 = S.cafe.diet, mk = C.milks.map(function(o){ return o.k; }).filter(function(z){ return dt2.milks[z]; });
      var dnote = String(dt2.note || '').trim().replace(/\s+/g, ' ');
      if (dnote.length > 120) { S.nudge = fill(T.textLong, { n: 1, max: 120 }); return render(); }
      var dv = { milks: mk, milk_extra: mk.length ? dt2.milk_extra : '', gf_kitchen: dt2.gf_kitchen, vegan_baking: !!dt2.vegan_baking, nut_free: !!dt2.nut_free };
      // Café test 2 (2026-11-11): the gelato answers ride along (kept as they are for other kinds).
      if (dt2.df_sorbet) dv.df_sorbet = true; if (dt2.vegan_ice) dv.vegan_ice = true; if (dt2.gf_cones) dv.gf_cones = dt2.gf_cones;
      if (dnote) dv.note = dnote;
      if (!mk.length && !dv.gf_kitchen && !dv.vegan_baking && !dv.nut_free && !dv.df_sorbet && !dv.vegan_ice && !dv.gf_cones && !dnote) { S.nudge = T.dietNeed; return render(); }
      var dl = [{ cafe_info: { diet: dv } }];
      // Dairy-free milks named here tick the "Dairy-free milks" tile too (never untick it).
      // Review fix (2026-11-12): the tiles are marked ticked only once the save went through, so a retry sends them again.
      var dfMilk = mk.length && !S.badges.dairy_free_milk;
      if (dfMilk) dl.push({ badges: { dairy_free_milk: true } });
      // Bug-check (2026-11-12): vegan gelato or ice cream ticks "Vegan options" too (never unticks it), taking back an
      // earlier "None of these" for dietary options.
      var veganIce = dv.vegan_ice && !S.badges.vegan, dietNone = veganIce && S.notOffered.indexOf('dietary') >= 0;
      if (veganIce) {
        if (dietNone) dl.push({ not_offered: { remove: ['dietary'] } });
        dl.push({ badges: { vegan: true } });
      }
      return saveAll('diet', dl, null, null, function(){
        if (dfMilk) S.badges.dairy_free_milk = true;
        if (dietNone) S.notOffered = S.notOffered.filter(function(z){ return z !== 'dietary'; });
        if (veganIce) { S.badges.vegan = true; S.noDiet = false; }
      });
    }
    if (k === 'coffeeSave') {
      readCafe(); var cf2 = S.cafe.coffee;
      if (!cf2.roast_own && !cf2.beans && !cf2.source) { S.nudge = T.coffeeNeed; return render(); }
      return saveAll('coffee', [{ cafe_info: { coffee: { roast_own: !!cf2.roast_own, source: cf2.roast_own ? '' : cf2.source, beans: !!cf2.beans } } }]);
    }
    if (k === 'selloutSave') {
      readCafe(); if (!S.cafe.sellout) { S.nudge = T.needLine; S.badField = 'suSell'; return render(); }
      return saveAll('sellout', [{ cafe_info: { sellout: S.cafe.sellout } }], null, null, function(){ CI.sellout = S.cafe.sellout; });
    }
    if (k === 'dogSave') {
      S.dogNote = el('suDog').value.trim();
      // Winery test 2 (2026-11-12): an unchanged line is sent too (as long as there is one): saving it says it's right, so it
      // becomes hers and a full Plan your visit box never drops it.
      if (!S.dogNote && !((CUR.visit_rows || {}).dogs || '')) return go(offerNext('offer:dogs') || 'saved:offer');
      return saveAll('offer', [{ visit_rows: { dogs: S.dogNote } }], null, offerNext('offer:dogs'), function(){ CUR.visit_rows = CUR.visit_rows || {}; CUR.visit_rows.dogs = S.dogNote; S.dogGuessed = false; C.visitResearch = (C.visitResearch || []).filter(function(k){ return k !== 'dogs'; }); });
    }
    if (k === 'add') { readEntries(); var arr = S[v]; arr.push(v === 'happy' ? happyDefault() : v === 'specials' ? { days: {}, text: '', price: '', sea: seaFrom() } : { days: {}, kind: '', what: '', sea: seaFrom() }); return render(); }
    if (k === 'happySave') return happySave();
    if (k === 'specialsSave') return specialsSave();
    if (k === 'musicSave') return musicSave();
    if (k === 'storyFix') { S.storyReturn = 'offer'; S.hist.push(S.step); S.step = 'story'; S.nudge = ''; S.error = ''; render(); var ta = el('suStory'); if (ta) { var bi = sportsAt(); try { ta.focus({ preventScroll: true }); if (bi) ta.setSelectionRange(bi[0], bi[1]); } catch (e) {} } return; }
    // ---------- Breweries (2026-11-12) ----------
    if (k === 'taproomSave') {
      readBrew(); var tb = S.brew;
      if (!S.place) { S.nudge = T.tkindNeed; return render(); }
      if (!tb.food) { S.nudge = T.tfoodNeed; return render(); }
      if (tb.food === 'trucks' && !tb.trucks) { S.nudge = T.ttrucksNeed; return render(); }
      if (tb.food === 'kitchen' && tb.kmode === 'earlier' && !/^\d{2}:\d{2}$/.test(tb.kcloses || '')) { S.nudge = T.tkitchenNeed; return render(); }
      var tl = [], bi = {};
      if (S.place !== (CUR.place_type || '')) tl.push({ place_type: S.place });
      if (tb.food !== (BI.food || '')) bi.food = tb.food;
      if (tb.outside && tb.outside !== (BI.outside || '')) bi.outside = tb.outside;
      if (tb.food === 'trucks' && tb.trucks !== (BI.trucks || '')) bi.trucks = tb.trucks;
      var kv = tb.food === 'kitchen' && tb.kmode ? (tb.kmode === 'earlier' ? { mode: 'earlier', closes: tb.kcloses } : { mode: 'same' }) : null;
      if (kv && JSON.stringify(kv) !== JSON.stringify(BI.kitchen || null)) bi.kitchen = kv;
      if (Object.keys(bi).length) tl.push({ brewery_info: bi });
      S.savedLine.taproom = T.taproomSaved;
      return saveAll('taproom', tl, null, null, function(){ CUR.place_type = S.place; Object.keys(bi).forEach(function(kk){ BI[kk] = bi[kk]; }); if (BI.food !== 'kitchen') delete BI.kitchen; if (BI.food !== 'trucks') delete BI.trucks; S.kindGuessed = ''; S.foodGuessed = ''; S.trucksGuessed = ''; syncMenu(); });
    }
    if (k === 'flightsSave') {
      readBrew(); var fb2 = S.brew, ff = fb2.noFlights ? null : fb2.fee;
      if (!fb2.noFlights && (ff == null || isNaN(ff) || ff < 0 || ff > 500)) { S.nudge = fb2.feeOther ? T.feeNeed : T.flightNeed; if (fb2.feeOther) S.badField = 'suFee'; return render(); }
      var tg = TOGO.concat(['none']).filter(function(kk){ return fb2.togo[kk]; });
      if (!tg.length) { S.nudge = T.togoNeed; return render(); }
      var fl = [], bi2 = {};
      if (fb2.noFlights !== (BI.no_flights === true)) bi2.no_flights = fb2.noFlights ? true : null;
      if (JSON.stringify(tg) !== JSON.stringify(BI.to_go || [])) bi2.to_go = tg;
      // A distillery's "free with a bottle" answer goes with a price only (a free tasting or none takes it back).
      if (C.distillery) { var wv2 = fb2.noFlights || ff === 0 ? null : fb2.waived || null; if (wv2 !== (BI.waived || null)) bi2.waived = wv2; }
      // "We don't do flights" takes the price back too; a price takes back "no flights".
      if (fb2.noFlights && S.savedFlight != null) fl.push({ flight_fee: null });
      if (Object.keys(bi2).length) fl.push({ brewery_info: bi2 });
      if (!fb2.noFlights && ff !== S.savedFlight) fl.push({ flight_fee: ff });
      S.savedLine.flights = !fb2.noFlights && ff > C.feeLiveMax && ff !== S.savedFlight ? T.flightSavedDay : T.flightSavedLive;
      return saveAll('flights', fl, null, null, function(){ Object.keys(bi2).forEach(function(kk){ if (bi2[kk] == null) delete BI[kk]; else BI[kk] = bi2[kk]; }); if (fb2.noFlights) { S.savedFlight = null; CUR.flight_fee = null; } else if (ff <= C.feeLiveMax) { S.savedFlight = ff; CUR.flight_fee = ff; CUR.flight_fee_waiting = null; } else if (ff !== S.savedFlight) CUR.flight_fee_waiting = ff; fb2.feeGuessed = false; S.togoGuessed = false; });
    }
    if (k === 'brewGroupsSave') {
      readBrew(); var gline = String(S.brew.groups || '').trim(), gbu = el('suBookUrl') ? el('suBookUrl').value.trim() : null;
      if (gbu && !siteOk(gbu)) { S.nudge = T.bookLinkBad; S.badField = 'suBookUrl'; return render(); }
      if (gline && linkIn(gline)) { S.nudge = T.groupsNoLink; return render(); }
      var glinkCh = gbu !== null && !!gbu && gbu !== (CUR.booking_url || C.bookingKnown || '');
      // Cocktail lounges: the Reservations line from the same screen ("Walk-ins only" is one tap).
      var bline = CK ? String(S.brew.book || '').trim() : '';
      if (bline && linkIn(bline)) { S.nudge = T.groupsNoLink; return render(); }
      if (!gline && !glinkCh && !bline) { S.nudge = T.groupsNeed; return render(); }
      var gl2 = [];
      if (bline && S.notOffered.indexOf('pyv_reservations') >= 0) gl2.push({ not_offered: { remove: ['pyv_reservations'] } });
      if (gline && S.notOffered.indexOf('pyv_groups') >= 0) gl2.push({ not_offered: { remove: ['pyv_groups'] } });
      // Sent even when unchanged: saying it's right makes research's line hers (a full box never drops it).
      if (gline || bline) { var vr2 = {}; if (gline) vr2.groups = gline; if (bline) vr2.reservations = bline; gl2.push({ visit_rows: vr2 }); }
      if (glinkCh) gl2.push({ booking_url: gbu });
      S.savedLine.groups = glinkCh ? T.groupsSavedLink : '';
      return saveAll('groups', gl2, null, null, function(){ if (bline) { S.visit.reservations = bline; CUR.visit_rows = CUR.visit_rows || {}; CUR.visit_rows.reservations = bline; C.visitResearch = (C.visitResearch || []).filter(function(kk){ return kk !== 'reservations'; }); } if (glinkCh) CUR.booking_url = gbu; if (!gline && CK) return; S.visit.groups = gline; CUR.visit_rows = CUR.visit_rows || {}; CUR.visit_rows.groups = gline; if (glinkCh) CUR.booking_url = gbu; C.visitResearch = (C.visitResearch || []).filter(function(kk){ return kk !== 'groups'; }); });
    }
    if (k === 'storySave' && FOLD) {
      S.story = storyJoinFix(el('suStory').value); readBrew();
      var bStoryCh = S.story.trim() !== storyBase(), bsl = [];
      if (bStoryCh && S.story.trim().length < 30) { S.nudge = T.storyShort; return render(); }
      if (!S.story.trim() && !S.brew.known) { S.nudge = T.storyShort; return render(); }
      if (bStoryCh) { bsl.push(storyOut(S.story)); S.storySent = S.story; } else S.storySent = '';
      // Sent even when unchanged (while it's research's), so the line becomes hers.
      var bKnownCh = S.brew.known !== ((CUR.visit_rows || {}).known_for || '') || (!!S.brew.known && (C.visitResearch || []).indexOf('known_for') >= 0);
      if (bKnownCh && S.brew.known) bsl.push({ visit_rows: { known_for: S.brew.known } }); else if (bKnownCh) bsl.push({ visit_rows: { known_for: '' } });
      S.savedLine.story = bStoryCh && bKnownCh ? T.storyKnownSaved : '';
      return saveAll('story', bsl, null, null, function(){ storyWaiting(); CUR.visit_rows = CUR.visit_rows || {}; CUR.visit_rows.known_for = S.brew.known; S.visit.known_for = S.brew.known; C.visitResearch = (C.visitResearch || []).filter(function(kk){ return kk !== 'known_for'; }); });
    }
    // ---------- Wineries (2026-11-12) ----------
    if (k === 'yearAppt') { S.apptDraft = null; return go('hours:appt'); }
    if (k === 'apptSave') {
      var af = mdRead('suAf'), at = mdRead('suAt'); S.apptDraft = { from: af, to: at };
      if (!af || !at) { S.nudge = T.apptNeed; return render(); }
      if (af === at) { S.nudge = T.openSameDay; return render(); }
      S.wine.season = { from: af, to: at }; S.wYearPick = 'appointment'; S.apptDraft = null;
      // By appointment in the off-season is not "closed for the season": a saved closed season goes.
      if (S.openSea || CUR.open_months) { S.openSea = null; S.openTouched = true; }
      S.dirty = 'hours'; return hoursSave();
    }
    if (k === 'winerySave') {
      readWine(); var wr2 = S.wine;
      if (!S.place) { S.nudge = T.wkindNeed; return render(); }
      if (wr2.food === 'restaurant' && !C.restaurantPage && !wr2.rname) { S.nudge = T.rnameNeed; S.badField = 'suRname'; return render(); }
      var wl = [], wi = {};
      if (S.place !== (CUR.place_type || '')) wl.push({ place_type: S.place });
      if (wr2.food && wr2.food !== (WI.food || '')) wi.food = wr2.food;
      if (wr2.food === 'restaurant' && !C.restaurantPage) { var rv = { name: wr2.rname }; if (wr2.rwhen) rv.when = wr2.rwhen; if (JSON.stringify(rv) !== JSON.stringify(WI.restaurant || null)) { wi.food = 'restaurant'; wi.restaurant = rv; } }
      if (Object.keys(wi).length) wl.push({ winery_info: wi });
      return saveAll('winery', wl, null, null, function(){ CUR.place_type = S.place; if (wi.food) WI.food = wi.food; if (wi.restaurant) WI.restaurant = wi.restaurant; if (WI.food !== 'restaurant') delete WI.restaurant; });
    }
    if (k === 'tastingsSave') {
      readWine(); var tf = S.wine.fee;
      if (tf == null || isNaN(tf) || tf < 0 || tf > 500) { S.nudge = T.feeNeed; if (S.wine.feeOther) S.badField = 'suFee'; return render(); }
      var tl = [];
      if (tf !== S.savedFee) tl.push({ tasting_fee: tf });
      var wv0 = tf !== 0 && S.wine.waived && S.wine.waived !== (WI.waived || '') ? S.wine.waived : '';
      if (wv0) tl.push({ winery_info: { waived: wv0 } });
      S.savedLine.tastings = tf > C.feeLiveMax && tf !== S.savedFee ? T.feeSavedDay : T.feeSavedLive;
      return saveAll('tastings', tl, null, null, function(){ if (tf <= C.feeLiveMax) { S.savedFee = tf; CUR.tasting_fee = tf; CUR.tasting_fee_waiting = null; } else if (tf !== S.savedFee) CUR.tasting_fee_waiting = tf; S.wine.feeGuessed = false; if (wv0) WI.waived = wv0; });
    }
    if (k === 'visitSave') {
      readWine(); var wv2 = S.wine;
      if (!wv2.visit && !wv2.groups && !wv2.buses) { S.nudge = T.visitNeed; return render(); }
      var bu = el('suBookUrl') ? el('suBookUrl').value.trim() : null; if (bu !== null) S.bookUrl = bu;
      var vl = [], wi2 = {};
      ['visit', 'groups', 'buses'].forEach(function(kk){ if (wv2[kk] && wv2[kk] !== (WI[kk] || '')) wi2[kk] = wv2[kk]; });
      // Winery test 4 (2026-11-12): "By appointment only" newly picked takes the old weekly hours off the page in the same
      // save (Undo in "Your updates" puts them back), so the page never says both.
      var apptClear = wi2.visit === 'appointment' && S.week && windowsOk(S.week);
      var none2 = {}; if (apptClear) DAYS.forEach(function(d){ none2[d] = []; });
      if (Object.keys(wi2).length) vl.push(apptClear ? { winery_info: wi2, hours: none2, hours_checked: true } : { winery_info: wi2 });
      var linkCh = bu !== null && !!bu && (!wv2.noBook || wv2.visit === 'walk_in') && bu !== (CUR.booking_url || C.bookingKnown || '');
      if (bu && !siteOk(bu)) { S.nudge = T.bookLinkBad; S.badField = 'suBookUrl'; return render(); }
      if (linkCh) vl.push({ booking_url: bu });
      var wantNone = wv2.noBook && wv2.visit !== 'walk_in' && !bu;
      if (wantNone && S.notOffered.indexOf('booking_link') < 0) vl.push({ not_offered: { add: ['booking_link'] } });
      if (!wantNone && S.notOffered.indexOf('booking_link') >= 0) vl.push({ not_offered: { remove: ['booking_link'] } });
      S.savedLine.visit = [apptClear ? T.apptHoursGone : '', linkCh ? T.visitSavedLink : ''].filter(Boolean).join(' ');
      return saveAll('visit', vl, null, null, function(){ Object.keys(wi2).forEach(function(kk){ WI[kk] = wi2[kk]; }); if (linkCh) CUR.booking_url = bu;
        if (apptClear) { var nw2 = {}; DAYS.forEach(function(d){ nw2[d] = null; }); CUR.hours = CUR.hours && typeof CUR.hours === 'object' ? nw2 : JSON.stringify(nw2); S.week = clone(nw2); S.hoursOpenSet = false; } });
    }
    if (k === 'expSave') {
      readWine();
      if (S.wine.exp.some(function(e){ return !e.label && e.text; })) { S.nudge = T.expNameNeed; return render(); }
      var xs = S.wine.exp.filter(function(e){ return e.label; }).map(function(e){ return e.text ? { label: e.label, text: e.text } : { label: e.label }; });
      if (!xs.length) { S.nudge = T.expNeed; return render(); }
      return saveAll('experiences', [{ winery_info: { experiences: xs } }], null, null, function(){ WI.experiences = xs; });
    }
    if (k === 'expNone') { S.wine.exp = [{ label: '', text: '' }, { label: '', text: '' }]; return saveAll('experiences', [{ winery_info: { experiences: [] } }], 'no', null, function(){ WI.experiences = []; }); }
    if (k === 'storySave' && C.winery) {
      S.story = storyJoinFix(el('suStory').value); readWine();
      var storyCh = S.story.trim() !== storyBase(), sl = [];
      if (storyCh && S.story.trim().length < 30) { S.nudge = T.storyShort; return render(); }
      if (!S.story.trim() && !S.wine.known) { S.nudge = T.storyShort; return render(); }
      if (storyCh) { sl.push(storyOut(S.story)); S.storySent = S.story; } else S.storySent = '';
      var knownCh = S.wine.known !== ((CUR.visit_rows || {}).known_for || '');
      // Winery test 2: an unchanged Known for line is sent too, so it becomes hers (the server only records it once).
      if (knownCh || S.wine.known) sl.push({ visit_rows: { known_for: S.wine.known } });
      S.savedLine.story = storyCh && knownCh ? T.storyKnownSaved : '';
      return saveAll('story', sl, null, null, function(){ storyWaiting(); CUR.visit_rows = CUR.visit_rows || {}; CUR.visit_rows.known_for = S.wine.known; S.visit.known_for = S.wine.known; });
    }
    if (k === 'storySave') { S.story = storyJoinFix(el('suStory').value); if (S.storyReturn) S.storyFixed = true; if (S.story.trim().length < 30) { S.nudge = T.storyShort; return render(); }
      // Brewery test 4: the story she already sent (not checked yet) isn't sent twice.
      if (C.storyPending && S.story.trim() === String(C.storyPending).trim()) { S.storySent = ''; return saveAll('story', []); }
      // French setup: the page text kept as it is (the English description stays English) sends nothing.
      if (C.lang === 'fr' && !C.storyPending && S.story.trim() === storyCur().trim()) { S.storySent = ''; return saveAll('story', []); }
      S.storySent = S.story; return saveAll('story', [storyOut(S.story)], null, null, storyWaiting); }
    if (k === 'moveLink') { var ln = el('suLine'), bu = el('suBookUrl'), got = linkIn(ln ? ln.value : ''); if (!got || !bu) return; bu.value = got.url; S.bookUrl = got.url; ln.value = got.rest; S.visit.reservations = got.rest; S.linkOffer = ''; S.nudge = ''; render(); var b2 = el('suBookUrl'); if (b2) b2.scrollIntoView({ block: 'center' }); return; }
    if (k === 'lineSave') {
      var step = p[1], key = p[2], line = el('suLine').value.trim();
      // The booking link (pub test 9): its own box on this screen; a link in the line is offered a move, never refused.
      var bkUrl = el('suBookUrl') ? el('suBookUrl').value.trim() : null; if (bkUrl !== null) S.bookUrl = bkUrl;
      if (bkUrl !== null) { var inl = linkIn(line); if (inl) { S.visit[key] = el('suLine').value; S.linkOffer = inl.url; S.nudge = ''; render(); var mv0 = el('suMoveLink'); if (mv0) mv0.scrollIntoView({ block: 'center' }); return; } S.linkOffer = ''; }
      var linkChanged = bkUrl !== null && bkUrl !== (CUR.booking_url || '');
      if (!line && !(bkUrl && step === 'book')) { if (step === 'known') { S.nudge = T.needLine; return render(); } S.nudge = T.needLine; return render(); }
      if (!line) { return saveAll(step, (S.badges.takes_reservations ? [] : [{ badges: { takes_reservations: true } }]).concat(linkChanged ? [{ booking_url: bkUrl }] : []), null, null, function(){ S.badges.takes_reservations = true; CUR.booking_url = bkUrl; }); }
      var sameLine = (S.visit[key] || '') === line && ((S.visitSaved || CUR.visit_rows || {})[key] || '') === line;
      S.visit[key] = line; var vr = {}; vr[key] = line;
      var list2 = []; var nk = { reservations: 'pyv_reservations', takeout: 'pyv_takeout', groups: 'pyv_groups' }[key];
      if (nk && S.notOffered.indexOf(nk) >= 0) list2.push({ not_offered: S.notOffered.filter(function(z){ return z !== nk; }) });
      // Saying how to book (or order, or that groups are welcome) ticks the matching feature too.
      // Pub test 9 (2026-11-10): only when it isn't ticked already (re-sending it came back "Nothing has changed yet").
      var bk = { reservations: 'takes_reservations', takeout: 'takeout', groups: 'great_groups' }[key];
      if (bk && !S.badges[bk]) { var bb = {}; bb[bk] = true; list2.push({ badges: bb }); S.badges[bk] = true; }
      if (!sameLine) list2.push({ visit_rows: vr });
      if (linkChanged) list2.push({ booking_url: bkUrl });
      return saveAll(step, list2, null, null, function(){ S.visitSaved = clone(S.visitSaved || CUR.visit_rows || {}); S.visitSaved[key] = line; if (linkChanged) CUR.booking_url = bkUrl; });
    }
    if (k === 'socialSave') {
      var val = el('suSoc').value.trim();
      if (!val) { S.nudge = fill(T.needValue, { no: v === 'instagram' ? T.igNo : T.fbNo }); return render(); }
      if (v === 'instagram') S.ig = val; else S.fb = val;
      return socialSave(v, val);
    }
    if (k === 'socialNo') return sayNo(v);
    if (k === 'socialBoth') return socialBoth();
    if (k === 'socialUnsure') { S.savedLine[v] = T.savedUnsure; return record(v, 'unsure'); }
    if (k === 'doorTake') { gps(); return el('suDoorCam').click(); }
    if (k === 'doorSend') return doorSend();
  }
  function wire(){
    Array.prototype.forEach.call(screen.querySelectorAll('[data-act]'), function(b){ b.onclick = function(){ if (!S.busy) act(b.getAttribute('data-act')); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('input[data-hh]'), function(inp){ inp.addEventListener('change', function(){ var q2 = inp.getAttribute('data-hh').split(':'); if (q2[1] !== 'what' && S.happy[+q2[0]]) { S.happy[+q2[0]][q2[1]] = inp.value; warnRefresh(); } }); });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-chip]'), function(b){ b.onclick = function(){
      var q2 = b.getAttribute('data-chip').split(':'), path = q2[0].split('.'), key = q2[1];
      var obj = path[0] === 'months' ? S.months : path[0] === 'closedm' ? S.closedM : path[0] === 'sea' ? S.sea.months : S[path[0]][+path[1]].days;
      obj[key] = !obj[key]; b.setAttribute('aria-pressed', obj[key] ? 'true' : 'false'); S.nudge = '';
      if (path[0] === 'specials' || path[0] === 'nights' || path[0] === 'happy') warnRefresh();
      if (path[0] === 'specials') { var spa = el('suSpAll' + path[1]); if (spa) spa.setAttribute('aria-pressed', allDays(obj) ? 'true' : 'false'); }
    }; });
    // The usual week or the other season's week (pub test 6): the same editor, on W().
    Array.prototype.forEach.call(screen.querySelectorAll('[data-closed]'), function(b){ b.onclick = function(){ readTimes(); var d = b.getAttribute('data-closed'), wk = W(); wk[d] = wk[d] ? null : [['11:00', '21:00']]; render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-dayopen]'), function(b){ b.onclick = function(){ readTimes(); var d = b.getAttribute('data-dayopen'), wk = W(); if (!wk[d]) { tapClosed(d, false); var tpl = wk.mon || wk[DAYS.filter(function(x){ return wk[x]; })[0]] || S.week[d] || S.week.mon; wk[d] = tpl ? clone(tpl) : [['11:00', '21:00']]; mark(); var y = window.scrollY; render(); window.scrollTo(0, y); } }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-ksea]'), function(b){ b.onclick = function(){ var kt = el('suKto'), kn = el('suKnote'); if (kt) S.kitchen.closes = kt.value; if (kn) S.kitchen.note = kn.value; readKsea(); S.kitchen.sea.mode = b.getAttribute('data-ksea'); S.nudge = ''; mark(); var y = window.scrollY; render(); window.scrollTo(0, y); }; });
    // Seasons (pub test 7): All year / Only some months / exact dates / back to months, and the month chips.
    Array.prototype.forEach.call(screen.querySelectorAll('[data-sea]'), function(b){ b.onclick = function(){
      readEntries(); readTimes(); var q2 = b.getAttribute('data-sea').split(':'), o = seaObj(q2[0]); if (!o) return;
      if (q2[1] === 'all') o.on = false; else if (q2[1] === 'some') o.on = true;
      else if (q2[1] === 'exact') { var r0 = monthRun(o.months); o.exact = r0.a ? { from: pad2(r0.a) + '-01', to: pad2(r0.b) + '-' + MLAST[r0.b - 1] } : { from: '', to: '' }; }
      else if (q2[1] === 'months') { var sm = seaMonths({ on: true, months: o.months, exact: o.exact }); o.exact = null; o.months = sm; }
      if (q2[0] === 'hours') S.seaTouched = true;
      S.nudge = ''; mark(); var y = window.scrollY; render(); window.scrollTo(0, y); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-smon]'), function(b){ b.onclick = function(){
      var q2 = b.getAttribute('data-smon').split(':'), o = seaObj(q2[0]); if (!o) return; o.months[q2[1]] = !o.months[q2[1]];
      b.setAttribute('aria-pressed', o.months[q2[1]] ? 'true' : 'false'); S.nudge = ''; mark(); warnRefresh(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-sexact]'), function(inp){ inp.addEventListener('change', function(){ readSeasons(); if (inp.getAttribute('data-sexact').indexOf('hours') === 0) S.seaTouched = true; warnRefresh(); }); });
    // One-tap Closed on the short list (pub test 7): closes the day, or opens it again with the hours it had (or the
    // first open day's), without opening its card.
    Array.prototype.forEach.call(screen.querySelectorAll('[data-hoff]'), function(b){ b.onclick = function(){
      readTimes(); var d = b.getAttribute('data-hoff'), wk = W(); S.hoffWas = S.hoffWas || {};
      if (wk[d]) { S.hoffWas[S.step + d] = wk[d]; wk[d] = null; tapClosed(d, true); }
      else { tapClosed(d, false); var tpl = S.hoffWas[S.step + d] || wk[DAYS.filter(function(x){ return wk[x]; })[0]] || S.week[d] || S.week.mon; wk[d] = tpl ? clone(tpl) : [['11:00', '21:00']]; delete S.hoffWas[S.step + d]; }
      mark(); var y = window.scrollY; render(); window.scrollTo(0, y); var nb = screen.querySelector('[data-hoff="' + d + '"]'); if (nb) try { nb.focus({ preventScroll: true }); } catch (e) {} }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-dayclosed]'), function(b){ b.onclick = function(){ readTimes(); var d = b.getAttribute('data-dayclosed'), wk = W(); if (wk[d]) { wk[d] = null; tapClosed(d, true); mark(); var y = window.scrollY; render(); window.scrollTo(0, y); } }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-samemon]'), function(b){ b.onclick = function(){ readTimes(); var d = b.getAttribute('data-samemon'), wk = W(); if (wk.mon) { wk[d] = clone(wk.mon); mark(); var y = window.scrollY; render(); window.scrollTo(0, y); } }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-late]'), function(b){ b.onclick = function(){ readTimes(); var q4 = b.getAttribute('data-late').split(':'), d4 = q4[0], wk = W(), w4 = wk[d4] && wk[d4][+q4[1]]; if (!w4) return; w4[1] = q4[2] + ':' + q4[3]; mark(); var y = window.scrollY; render(); window.scrollTo(0, y); }; });
    // Hours (pub test 4): open one day's card, fold it back, or copy an open day's hours to every day or Mon–Fri.
    Array.prototype.forEach.call(screen.querySelectorAll('[data-hopen]'), function(b){ b.onclick = function(){ readTimes(); var d = b.getAttribute('data-hopen'); HO()[d] = true; render(); var r = el('suRow' + d); if (r) { r.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); var f = r.querySelector('input[type=time]') || r.querySelector('button'); if (f) try { f.focus({ preventScroll: true }); } catch (e) {} } }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-hclose]'), function(b){ b.onclick = function(){ readTimes(); var d = b.getAttribute('data-hclose'); delete HO()[d]; var y = window.scrollY; render(); window.scrollTo(0, y); var r = el('suRow' + d); if (r && r.getBoundingClientRect().top < 60) { r.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-copyevery]'), function(b){ b.onclick = function(){
      readTimes(); var wk = W(), d = b.getAttribute('data-copyevery'), src = wk[d]; if (!src) return;
      DAYS.forEach(function(x){ if (x !== d) wk[x] = clone(src); }); mark(); var y = window.scrollY; render(); window.scrollTo(0, y); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-copyall],[data-copywk],[data-copywe]'), function(b){ b.onclick = function(){
      var we = b.hasAttribute('data-copywe');
      readTimes(); var wk = W(), all = b.hasAttribute('data-copyall'), d = b.getAttribute(all ? 'data-copyall' : we ? 'data-copywe' : 'data-copywk'), src = wk[d]; if (!src) return;
      // Pub test 5 (2026-11-10): copying never reopens a day marked Closed ("Every day" opened a closed Monday again). It
      // copies to the open days only ("Every open day", Mon–Fri's open days); a Tue–Sun pub is one tap. Only when every
      // other day is closed (a new page with no hours yet) does it fill them all.
      var gets = DAYS.filter(function(x){ return copyGets(d, x); });
      gets.forEach(function(x){ if (all || (we ? ['sat', 'sun'] : ['mon', 'tue', 'wed', 'thu', 'fri']).indexOf(x) >= 0) wk[x] = clone(src); });
      mark(); var y = window.scrollY; render(); window.scrollTo(0, y); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-same]'), function(b){ b.onclick = function(){ readTimes(); var d = b.getAttribute('data-same'), i = DAYS.indexOf(d), wk = W(); wk[d] = clone(wk[DAYS[i - 1]]); render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-yearly]'), function(b){ b.onchange = function(){ var k = b.getAttribute('data-yearly'); S.everyYear[k] = !yearlyOn(k); mark(); var y = window.scrollY; render(); window.scrollTo(0, y); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-hol]'), function(b){ b.onclick = function(){ if (b.disabled) return; var k = b.getAttribute('data-hol'), i = S.closures.indexOf(k); if (i >= 0) S.closures.splice(i, 1); else S.closures.push(k); var y = window.scrollY; render(); window.scrollTo(0, y); }; });
    var cfIn = el('suCf'); if (cfIn) cfIn.oninput = cfIn.onchange = function(){ S.addFrom = cfIn.value; var ce = el('suCends'); if (ce) ce.textContent = closeEnds(cfIn.value); };
    var cyIn = el('suCyear'); if (cyIn) cyIn.onchange = function(){ S.addYearly = cyIn.checked; };
    Array.prototype.forEach.call(screen.querySelectorAll('[data-len]'), function(b){ b.onclick = function(){ S.addFrom = el('suCf').value; S.addNote = el('suCn').value; var ct = el('suCt'); if (ct) S.addTo = ct.value; S.addLen = b.getAttribute('data-len'); var y = window.scrollY; render(); window.scrollTo(0, y); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-xdel]'), function(b){ b.onclick = function(){ S.extra.splice(+b.getAttribute('data-xdel'), 1); S.added = ''; render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-cui]'), function(b){ b.onclick = function(){
      var c = b.getAttribute('data-cui'), i = S.cuis.indexOf(c);
      S.cuiTouched = true;
      if (i >= 0) S.cuis.splice(i, 1); else if (S.cuis.length >= 3) { S.nudge = T.upTo3; return render(); } else S.cuis.push(c);
      S.nudge = ''; var y = window.scrollY; render(); window.scrollTo(0, y);
    }; });
    var cq = el('suCq'); if (cq) { var filt = function(){ S.cuiQ = cq.value; var tq = cq.value.trim().toLowerCase(), n = 0; Array.prototype.forEach.call(screen.querySelectorAll('[data-cui]'), function(b){ var c = b.getAttribute('data-cui'), on = !tq || c.toLowerCase().indexOf(tq) >= 0 || String(C.cuisineNames[c] || '').toLowerCase().indexOf(tq) >= 0; b.hidden = !on; if (on) n++; }); el('suCuiNone').hidden = n > 0; }; cq.oninput = filt; filt(); }
    Array.prototype.forEach.call(screen.querySelectorAll('[data-place]'), function(b){ b.onclick = function(){ var sp0 = spendFollows(); S.place = b.getAttribute('data-place'); if (C.brewery) S.kindGuessed = ''; if (sp0) S.spend = cafeSpendStart(); S.nudge = ''; mark(); var y = window.scrollY; render(); window.scrollTo(0, y); }; });
    // Café screens (2026-11-10).
    var redraw = function(){ S.nudge = ''; mark(); var y = window.scrollY; render(); window.scrollTo(0, y); };
    Array.prototype.forEach.call(screen.querySelectorAll('[data-ctog]'), function(b){ b.onclick = function(){
      readCafe(); var a = b.getAttribute('data-ctog');
      if (a.indexOf(':') > 0) { var q5 = a.split(':'), o5 = q5[0] === 'serves' ? S.cafe.serves : S.cafe.diet.milks; o5[q5[1]] = !o5[q5[1]]; return redraw(); }
      var p5 = a.split('.'); S.cafe[p5[0]][p5[1]] = !S.cafe[p5[0]][p5[1]];
      // "Order at the counter only" and the ways to order ahead: picking one turns the other off.
      if (a === 'order.counter' && S.cafe.order.counter) { S.cafe.order.online = false; S.cafe.order.preorder = false; }
      else if (p5[0] === 'order' && S.cafe.order[p5[1]]) S.cafe.order.counter = false;
      redraw(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-cpick]'), function(b){ b.onclick = function(){
      readCafe(); var q6 = b.getAttribute('data-cpick').split(':'), p6 = q6[0].split('.'); S.cafe[p6[0]][p6[1]] = S.cafe[p6[0]][p6[1]] === q6[1] ? '' : q6[1]; redraw(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-cbadge]'), function(b){ b.onclick = function(){
      readCafe(); var k7 = b.getAttribute('data-cbadge'); S.badges[k7] = !S.badges[k7]; if (S.badges[k7]) S.cafe.order.counter = false; redraw(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-off]'), function(b){ b.onclick = function(){
      var k = b.getAttribute('data-off');
      var press = function(key, on){ var n = screen.querySelector('[data-off="' + key + '"]'); if (n) n.setAttribute('aria-pressed', on ? 'true' : 'false'); };
      if (k === 'none_diet') { S.noDiet = !S.noDiet; press('none_diet', S.noDiet); if (S.noDiet) ['vegan', 'vegetarian', 'gluten_free'].forEach(function(d){ S.badges[d] = false; press(d, false); }); return; }
      // "No dogs allowed" and "Dog friendly": picking one turns the other off.
      if (k === 'no_games') { S.noGames = !S.noGames; press('no_games', S.noGames); if (S.noGames) GAMES.forEach(function(gk){ S.badges[gk] = false; press(gk, false); }); return; }
      if (k === 'no_washroom') { S.noWash = !S.noWash; press('no_washroom', S.noWash); if (S.noWash) { S.badges.washroom = false; press('washroom', false); } return; }
      if (k === 'washroom' && !S.badges.washroom) { S.noWash = false; press('no_washroom', false); }
      if (k === 'takeout_only') { S.cafe.stay.seats = S.cafe.stay.seats === 'takeout' ? '' : 'takeout'; press('takeout_only', S.cafe.stay.seats === 'takeout'); var wsub = el('suNoWifiSub'); if (wsub) wsub.textContent = wifiSubText(); return; }
      if (k === 'no_wifi') { S.noWifi = !S.noWifi; press('no_wifi', S.noWifi); if (S.noWifi) { S.badges.wifi = false; press('wifi', false); } return; }
      if (k === 'wifi' && !S.badges.wifi) { S.noWifi = false; press('no_wifi', false); }
      if (k === 'no_sports') { S.noSports = !S.noSports; press('no_sports', S.noSports); if (S.noSports) { S.badges.sports_tv = false; press('sports_tv', false); sportsNote(); } return; }
      // Distillery test 1 (2026-11-13): the service-dogs tile shows right under No dogs, scrolled into view.
      var sdog = function(){ var n = el('suServiceDogs'); if (n) { n.hidden = !S.noDogs; if (S.noDogs && n.scrollIntoView) { try { n.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { n.scrollIntoView(false); } } } };
      // Cocktail test 3 (2026-11-14): "Service dogs welcome" starts ticked under "No dogs allowed" (she can untick it; it
      // is saved only with the screen).
      if (k === 'no_dogs') { S.noDogs = !S.noDogs; press('no_dogs', S.noDogs); if (S.noDogs) { S.badges.dog_friendly = false; press('dog_friendly', false); if (C.offerLabels.service_dogs) { S.badges.service_dogs = true; press('service_dogs', true); } } else { S.badges.service_dogs = false; press('service_dogs', false); } sdog(); return; }
      S.badges[k] = !S.badges[k]; press(k, S.badges[k]);
      if (k === 'patio') { var dsub = el('suNoDogsSub'); if (dsub) dsub.textContent = dogSubText(); }
      if (k === 'dog_friendly' && S.badges[k]) { S.noDogs = false; press('no_dogs', false); S.badges.service_dogs = false; press('service_dogs', false); sdog(); }
      // A heated or covered patio is a patio (pub test 5): ticking it ticks Patio; unticking Patio unticks it.
      if (k === 'heated_patio' && S.badges[k] && !S.badges.patio) { S.badges.patio = true; press('patio', true); }
      if (k === 'patio' && !S.badges[k] && S.badges.heated_patio) { S.badges.heated_patio = false; press('heated_patio', false); }
      if (k === 'sports_tv') { if (S.badges[k]) { S.noSports = false; press('no_sports', false); } sportsNote(); }
      if (S.badges[k] && GAMES.indexOf(k) >= 0) { S.noGames = false; press('no_games', false); }
      if (S.badges[k] && (k === 'vegan' || k === 'vegetarian' || k === 'gluten_free')) { S.noDiet = false; press('none_diet', false); }
    }; });
    // Winery screens (2026-11-12): one-of-a-few answers, the tasting price buttons, "no online bookings" and the
    // experience name chips.
    // Brewery screens (2026-11-12): one-of-a-few answers, the flight price buttons, the to-go chips, the group sizes (the
    // size writes the whole line, never adds to it) and the quick opening and closing times.
    Array.prototype.forEach.call(screen.querySelectorAll('[data-bpick]'), function(b){ b.onclick = function(){
      readBrew(); var q10 = b.getAttribute('data-bpick').split(':'); S.brew[q10[0]] = String(S.brew[q10[0]]) === q10[1] && q10[0] !== 'food' && q10[0] !== 'trucks' ? '' : q10[1]; if (q10[0] === 'food') S.foodGuessed = ''; if (q10[0] === 'trucks') S.trucksGuessed = ''; S.nudge = ''; mark(); var y = window.scrollY; render(); window.scrollTo(0, y); }; });
    // Cocktail lounges: the price chips, Other and "We don't serve cocktails".
    Array.prototype.forEach.call(screen.querySelectorAll('[data-cfee]'), function(b){ b.onclick = function(){
      readBrew(); var fv = b.getAttribute('data-cfee'); S.cp.guessed = false; S.nudge = ''; mark();
      if (fv === 'none') { S.cp.none = !S.cp.none; if (S.cp.none) S.cp.other = false; }
      else if (fv === 'other') { S.cp.none = false; S.cp.other = true; if (CQ.indexOf(S.cp.fee) >= 0) S.cp.fee = null; }
      else { S.cp.none = false; S.cp.other = false; S.cp.fee = +fv; }
      var y = window.scrollY; render(); window.scrollTo(0, y); if (fv === 'other') { var fi = el('suCfee'); if (fi) try { fi.focus({ preventScroll: true }); } catch (e) {} }
    }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-bfee]'), function(b){ b.onclick = function(){
      readBrew(); var fv = b.getAttribute('data-bfee'); S.brew.feeGuessed = false; S.nudge = ''; mark();
      if (fv === 'none') { S.brew.noFlights = !S.brew.noFlights; if (S.brew.noFlights) { S.brew.feeOther = false; S.brew.fee = null; } var y0 = window.scrollY; render(); window.scrollTo(0, y0); return; }
      S.brew.noFlights = false;
      if (fv === 'other') { S.brew.feeOther = true; if (S.brew.fee != null && (QUICK_FLIGHTS.indexOf(S.brew.fee) >= 0 || (C.distillery && S.brew.fee === 0))) S.brew.fee = null; var y1 = window.scrollY; render(); window.scrollTo(0, y1); var fi = el('suFee'); if (fi) try { fi.focus({ preventScroll: true }); } catch (e) {} return; }
      S.brew.feeOther = false; S.brew.fee = +fv; var y2 = window.scrollY; render(); window.scrollTo(0, y2); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-btogo]'), function(b){ b.onclick = function(){
      readBrew(); var tk = b.getAttribute('data-btogo'); S.brew.togo[tk] = !S.brew.togo[tk]; S.togoGuessed = false;
      // "Nothing to go" and the rest never both.
      if (S.brew.togo[tk]) { if (tk === 'none') TOGO.forEach(function(z){ S.brew.togo[z] = false; }); else S.brew.togo.none = false; }
      S.nudge = ''; mark(); var y = window.scrollY; render(); window.scrollTo(0, y); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-bgroup]'), function(b){ b.onclick = function(){
      // Cocktail test 3 (2026-11-14): the size replaces only the "book ahead" sentence; a room or a capacity stays
      // ("Private room for 20. Groups of 10 or more: please book ahead").
      readBrew(); S.brew.groups = groupsKeep(S.brew.groups).concat([fill(T.groupsLine, { n: +b.getAttribute('data-bgroup') })]).join('. '); S.nudge = ''; mark(); var y = window.scrollY; render(); window.scrollTo(0, y); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-bq]'), function(b){ b.onclick = function(){ readTimes(); var q11 = b.getAttribute('data-bq').split(':'), wk = W(), w11 = wk[q11[0]] && wk[q11[0]][+q11[1]]; if (!w11) return; w11[+q11[2]] = q11[3] + ':' + q11[4]; mark(); var y = window.scrollY; render(); window.scrollTo(0, y); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-wpick]'), function(b){ b.onclick = function(){
      readWine(); var q8 = b.getAttribute('data-wpick').split(':'), key8 = q8[0], val8 = key8 === 'groups' ? +q8[1] : q8[1];
      S.wine[key8] = String(S.wine[key8]) === String(val8) ? (key8 === 'groups' ? 0 : '') : val8; redraw(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-fee]'), function(b){ b.onclick = function(){
      readWine(); var fv = b.getAttribute('data-fee'); S.wine.feeGuessed = false;
      if (fv === 'other') { S.wine.feeOther = true; if (S.wine.fee != null && QUICK_FEES.indexOf(S.wine.fee) >= 0) S.wine.fee = null; redraw(); var fi = el('suFee'); if (fi) try { fi.focus({ preventScroll: true }); } catch (e) {} return; }
      S.wine.feeOther = false; S.wine.fee = +fv; redraw(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-wnobook]'), function(b){ b.onclick = function(){ readWine(); var bu0 = el('suBookUrl'); if (bu0) S.bookUrl = bu0.value; S.wine.noBook = !S.wine.noBook; redraw(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-xq]'), function(b){ b.onclick = function(){ readWine(); var q9 = b.getAttribute('data-xq'), i9 = +q9.split(':')[0], l9 = q9.slice(q9.indexOf(':') + 1), e9 = S.wine.exp[i9], pre9 = Array.isArray(WI.experiences) ? null : (C.extras || [])[i9];
      // Winery test 3 (2026-11-12): a quick name that replaces a pre-filled one takes its details away too ("Picnic tables…"
      // stayed under "Vineyard tour"), and the tap is kept as a draft like typed text.
      if (e9.label !== l9 && pre9 && e9.label === (pre9.label || '') && e9.text === (pre9.text || '')) e9.text = '';
      e9.label = e9.label === l9 ? '' : l9;
      // The boxes first (the draft reads them), then the draft, then the screen.
      var xl9 = el('suXl' + i9), xt9 = el('suXt' + i9); if (xl9) xl9.value = e9.label; if (xt9) xt9.value = e9.text; mark(); drSave(); redraw(); }; });
    // The social screen's "We're not on it" / "Not sure" answers (cafés).
    Array.prototype.forEach.call(screen.querySelectorAll('[data-soc]'), function(b){ b.onclick = function(){ readSocial(); var q7 = b.getAttribute('data-soc').split(':'); S.socNo[q7[0]] = S.socNo[q7[0]] === q7[1] ? '' : q7[1]; S.nudge = ''; var y = window.scrollY; render(); window.scrollTo(0, y); mark(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-quick]'), function(b){ b.onclick = function(){
      var box = el(b.getAttribute('data-box')), t = b.getAttribute('data-quick'), sep = b.getAttribute('data-sep'), v = box.value.trim(), qk = b.getAttribute('data-key');
      // Cocktail test 3 (2026-11-14): only this box's chips (a Groups tap never re-lit the Reservations chips).
      var mine = Array.prototype.filter.call(screen.querySelectorAll('[data-quick]'), function(c){ return c.getAttribute('data-box') === b.getAttribute('data-box'); }), sibs = mine.map(function(c){ return c.getAttribute('data-quick'); });
      // Winery test 5 (2026-11-12): "Dogs welcome on the patio. Patio only" went live. The box still holding research's
      // line, untouched, is replaced by the tap; a line she typed gets the tap added; one that already says it stays.
      var pre = String(((CUR.visit_rows || {})[qk]) || '').trim();
      // Cocktail test 3 (2026-11-14): un-pressing a chip inside a longer Groups sentence ("Private room for 20") takes
      // that whole sentence away, never leaving "for 20" behind.
      var inLonger = qk === 'groups' && has(v, t) && sentencesOf(v).filter(function(x){ return has(x, t) && x.toLowerCase() !== t.toLowerCase(); }).length;
      if (inLonger) v = sentencesOf(v).filter(function(x){ return !has(x, t); }).join(sep);
      else if (has(v, t)) { var i = v.toLowerCase().indexOf(t.toLowerCase()); v = (v.slice(0, i) + v.slice(i + t.length)).replace(/([.,])\s*[.,]/g, '$1').replace(/^[\s.,]+|[\s.,]+$/g, '').replace(/\s{2,}/g, ' '); }
      // Research's untouched line is replaced by the tap, except a Groups fact the chip doesn't carry ("Private room for
      // 20" stays when Buyouts is tapped).
      else if (v && pre && v === pre && (C.visitResearch || []).indexOf(qk) >= 0) v = (qk === 'groups' ? groupsKeep(v, t, sibs) : []).concat([t]).join(sep);
      else if (saysIt(v, t, sibs)) return;
      else v = v ? v.replace(/[\s.,]+$/, '') + sep + t : t;
      box.value = v.slice(0, 180); mark();
      mine.forEach(function(c){ c.setAttribute('aria-pressed', saysIt(box.value, c.getAttribute('data-quick'), sibs) ? 'true' : 'false'); });
    }; });
    var fold = el('suFold'); if (fold) fold.addEventListener('toggle', function(){ S.moreOpen = fold.open; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-sport]'), function(b){ b.onclick = function(){ var k = b.getAttribute('data-sport'); S.sports.list[k] = !S.sports.list[k]; b.setAttribute('aria-pressed', S.sports.list[k] ? 'true' : 'false'); S.nudge = ''; }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-tv]'), function(b){ b.onclick = function(){ var k = b.getAttribute('data-tv'); S.sports.tvs = S.sports.tvs === k ? '' : k; Array.prototype.forEach.call(screen.querySelectorAll('[data-tv]'), function(c){ c.setAttribute('aria-pressed', c.getAttribute('data-tv') === S.sports.tvs ? 'true' : 'false'); }); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-minors]'), function(b){ b.onclick = function(){ readMinors(); S.minors.policy = b.getAttribute('data-minors'); S.nudge = ''; var y = window.scrollY; render(); window.scrollTo(0, y); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-zoom]'), function(im){ im.onclick = function(){ var bx = im.parentNode; bx.className = bx.className === 'su-zoomed' ? '' : 'su-zoomed'; }; });
    // A kind fills in its name while the box is empty or still holds another kind's name. "Something else" (pub test 6)
    // empties the box and puts the cursor in it, with "Type the name, e.g. Meat draw" (it used to type "Something else").
    Array.prototype.forEach.call(screen.querySelectorAll('[data-kind]'), function(b){ b.onclick = function(){
      readEntries(); var q2 = b.getAttribute('data-kind').split(':'), e = S.nights[+q2[0]], kindName = false;
      for (var kk in T.kinds) if (Object.prototype.hasOwnProperty.call(T.kinds, kk) && T.kinds[kk] === (e.what || '').trim()) kindName = true;
      e.kind = q2[1];
      if (q2[1] === 'other') { if (kindName) e.what = ''; render(); var nb = el('nt' + q2[0]); if (nb) { try { nb.focus({ preventScroll: true }); } catch (x) { nb.focus(); } nb.scrollIntoView({ block: 'center' }); } return; }
      if (!e.what || kindName) e.what = T.kinds[q2[1]]; render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-rm]'), function(b){ b.onclick = function(){ readEntries(); var q2 = b.getAttribute('data-rm').split(':'); S[q2[0]].splice(+q2[1], 1); render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-del]'), function(b){ b.onclick = function(){ S.photos.splice(+b.getAttribute('data-del'), 1); S.error = ''; if (!S.photos.length) { S.step = 'photos'; } render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-pmove]'), function(b){ b.onclick = function(){ var q2 = b.getAttribute('data-pmove').split(':'), i = +q2[0], j = i + +q2[1]; if (j < 0 || j >= S.photos.length) return; var t = S.photos[i]; S.photos[i] = S.photos[j]; S.photos[j] = t; render(); var nb = screen.querySelector('[data-pmove="' + j + ':' + q2[1] + '"]'); if (nb && !nb.disabled) nb.focus(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-main]'), function(b){ b.onclick = function(){ var k = +b.getAttribute('data-main'); S.photos.forEach(function(ph, i){ ph.main = i === k; }); S.keepMain = false; render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-fdel]'), function(b){ b.onclick = function(){ var l = S.step === 'menu:upload' ? S.menuFiles : S.sheetFiles; l.splice(+b.getAttribute('data-fdel'), 1); S.error = ''; render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-pdel]'), function(b){ b.onclick = function(){ S.menuPages.splice(+b.getAttribute('data-pdel'), 1); S.error = ''; render(); }; });
    var rt = el('suRights'); if (rt) rt.onchange = function(){ S.rights = rt.checked; var tb0 = el('suTickBox'); if (tb0) { tb0.classList.toggle('su-ticked', rt.checked); if (rt.checked) { tb0.classList.remove('su-ask'); S.rightsAsk = false; S.backWarned = false; var ra = el('suRightsAsk'); if (ra) ra.textContent = ''; } } if (rt.checked && S.nudge) { S.nudge = ''; render(); } };
    var dr = el('suDoorRights'); if (dr) dr.onchange = function(){ S.door.rights = dr.checked; if (dr.checked && S.nudge === T.doorRightsNeed) { S.nudge = ''; render(); } };
    Array.prototype.forEach.call(screen.querySelectorAll('[data-room]'), function(inp){ inp.addEventListener('input', roomRefresh); });
    if (S.step === 'happy:type') roomRefresh();
    var sfe = el('suFee'), sfl = el('suFlightLead'); if (sfe && sfl && C.brewery) sfe.addEventListener('input', function(){ readBrew(); sfl.textContent = flightLeadText(); });
    var cfe = el('suCfee'), cfl = el('suCpLead'); if (cfe && cfl && CK) cfe.addEventListener('input', function(){ readBrew(); cfl.textContent = cpLeadText(); });
    var su = el('suUrl'), usr0 = el('suUseSiteRow'); if (su && usr0) su.addEventListener('input', function(){ usr0.hidden = su.value.trim() === siteUrl(C.website); });
    var dn = el('suDnote'); if (dn) dn.oninput = function(){ S.cafe.diet.note = dn.value; var c = el('suDnoteC'); if (c) { c.textContent = noteRoom(dn.value); c.className = 'su-count' + (dn.value.length > 120 ? ' su-over' : ''); } };
    var st = el('suStory'); if (st) st.onblur = function(){ var fx = storyJoinFix(st.value); if (fx !== st.value) { st.value = fx; S.story = fx; } };
    if (st) st.oninput = function(){ S.story = st.value; var n = st.value.length, c = el('suCount'); c.textContent = n >= STORY_OK ? T.storyGood : T.storyCount; c.className = 'su-count' + (n >= STORY_OK ? ' su-ok' : ''); };
    // A ✕ inside every filled text box (pub test 3, 2026-11-10: clearing the old phone number was a long backspace). It
    // empties the box and keeps the cursor (and the phone's keyboard) in it.
    // Pub test 7 (2026-11-10): the story box too (its old text could only be removed with a long backspace).
    Array.prototype.forEach.call(screen.querySelectorAll('input.su-field[type=text], input.su-field[type=tel], input.su-field[type=search], textarea.su-area'), function(inp){
      if (inp.parentNode && /\bsu-fwrap\b/.test(inp.parentNode.className)) return;
      var area = inp.tagName === 'TEXTAREA';
      var w = document.createElement('div'); w.className = 'su-fwrap' + (area ? ' su-fwrap-area' : ''); inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
      var b = document.createElement('button'); b.type = 'button'; b.className = 'su-clear'; b.setAttribute('aria-label', area ? T.storyClear : T.clearField); b.setAttribute('data-clear', inp.id); b.textContent = '✕'; b.hidden = !inp.value; w.appendChild(b);
      var keep = function(e){ e.preventDefault(); }; b.addEventListener('mousedown', keep); b.addEventListener('pointerdown', keep);
      b.onclick = function(){ inp.value = ''; b.hidden = true; try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); } try { inp.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {} };
      inp.addEventListener('input', function(){ b.hidden = !inp.value; });
    });
    // Text never gets wiped: the cursor goes to the end of what's there.
    // Pub test 9 (2026-11-10): a one-line box we filled in (her old phone, website, a deal) is selected on its first tap,
    // so pasting replaces it; typing or a second tap places the cursor as usual, and the ✕ still clears it. Story boxes
    // and the menu address (made to be added to after its last /) keep the cursor at the end.
    Array.prototype.forEach.call(screen.querySelectorAll('input[type=text], input[type=tel], input[type=search], textarea'), function(inp){
      // Brewery test 4 (2026-11-13): the story box with research's text in it is selected on its first tap too, so typing
      // replaces it (never her own story, sent or on the page).
      var researchStory = inp.id === 'suStory' && C.storyResearch && !C.storyPending && !!storyCur() && inp.value === storyCur();
      var pre = (inp.tagName !== 'TEXTAREA' && inp.id !== 'suUrl' && inp.id !== 'suCq' && !!inp.value) || researchStory, first = true;
      inp.addEventListener('focus', function(){ var n = inp.value.length; if (!n) return; var sel = pre && first; first = false; setTimeout(function(){ try { if (inp.value.length !== n) return; if (sel) inp.select(); else inp.setSelectionRange(n, n); } catch (e) {} }, 0); });
    });
  }
  el('suPick').onchange = function(e){ addPhotoFiles(e.target.files); e.target.value = ''; };
  el('suTake').onchange = function(e){ addPhotoFiles(e.target.files); e.target.value = ''; };
  el('suMenuFile').onchange = function(e){ addFiles(S.menuFiles, e.target.files); e.target.value = ''; };
  el('suSheetFile').onchange = function(e){ addFiles(S.sheetFiles, e.target.files); e.target.value = ''; };
  el('suSheetCam').onchange = function(e){ addFiles(S.sheetFiles, e.target.files); e.target.value = ''; };
  el('suMenuCam').onchange = function(e){
    var f = (e.target.files || [])[0]; e.target.value = ''; if (!f) return;
    if (S.menuPages.length >= C.maxPages) { S.error = fill(T.tooManyPages, { n: C.maxPages }); return render(); }
    loadImage(f).then(function(r){ if (Math.max(r.img.naturalWidth, r.img.naturalHeight) < C.menuMinEdge) { S.error = T.pageSmall; return render(); } S.error = ''; S.menuPages.push({ file: f, img: r.img, thumb: r.url, name: f.name || 'page', pdf: false }); render(); }, function(){ S.error = T.cantOpen; render(); });
  };
  el('suDoorCam').onchange = function(e){
    var f = (e.target.files || [])[0]; e.target.value = ''; if (!f) return;
    loadImage(f).then(function(r){ S.door.photo = jpeg(r.img, 1600).toDataURL('image/jpeg', 0.85); S.error = ''; render(); }, function(){ S.error = T.cantOpen; render(); });
  };
  // Opened from the checklist: #photos, #menu or any step goes straight there.
  // Café test 2: no "Your coffee" tile for a gelato window (unless it ticked espresso or drip coffee). Only the saved kind
  // counts here, never a guess from the name.
  if (C.cafe && CUR.place_type) { var placeNow = S.place; S.place = CUR.place_type; syncCoffee(); S.place = placeNow; }
  var startAt = String(location.hash || '').slice(1);
  // Bug-check (2026-11-12): where she was, for a reload (history.state) or a language switch (kept a minute in this tab),
  // so "Save" there carries on as it would have (a first pass goes on to the next question, not back to the list).
  var navWas = null;
  try { navWas = history.state && history.state.suNav || null; } catch (e) {}
  try { var nl = window.sessionStorage.getItem(navKey()); if (nl) { window.sessionStorage.removeItem(navKey()); nl = JSON.parse(nl); if (!navWas && nl && Date.now() - (nl.at || 0) < 120000) navWas = nl; } } catch (e) {}
  if (navWas && navWas.h !== startAt) navWas = null;
  if (startAt === 'season') startAt = 'closures';
  if (COMBO && (startAt === 'instagram' || startAt === 'facebook')) startAt = 'social';
  if (COMBO && startAt === 'closures') { S.hist = ['start']; S.step = 'closures'; S.toList = true; }
  // Café test 4 (2026-11-11): the checklist's "Open all year, or seasonal?" opens the Hours question that asks it.
  if (startAt === 'hours:year') { S.hist = ['start']; S.step = 'hours:year'; S.toList = true; }
  // Winery test 1 (2026-11-12): opening a step that is already answered (from the checklist, a help answer or "See
  // what's done") is a fix: saving it goes back to the list, not on through the next questions.
  if (STEPS.indexOf(startAt) >= 0) { S.hist = ['start']; S.step = entry(startAt); if (S.done[startAt] && S.done[startAt] !== 'skip') S.toList = true; } else if (startAt === 'more') { S.hist = ['start']; S.step = 'more'; }
  // Pubs: the checklist's kitchen, sports and who's-welcome rows open their own screens.
  else if ((C.pub && ['hours:kitchen', 'offer:sports', 'offer:minors'].indexOf(startAt) >= 0) || (C.brewery && startAt === 'offer:minors')) { S.hist = ['start']; S.step = startAt; S.toList = true; }
  // Cafés: the checklist's "What you serve" row opens its own screen (the kind first while none is picked).
  else if (C.cafe && startAt === 'cuisine:serve') { S.hist = ['start']; S.step = S.place && CUR.place_type ? 'cuisine:serve' : 'cuisine'; S.toList = true; }
  // A reload or a language switch on an edit screen comes back to it (with what was typed), not to the summary.
  else if (startAt === 'hours:edit' || startAt === 'basics:edit') { S.hist = ['start', base(startAt)]; S.step = startAt; }
  if (navWas) { S.toList = !!navWas.toList; S.toFinish = !!navWas.toFinish; S.toEss = !!navWas.toEss; }
  // Answers tapped or typed but not saved yet (for "Exit setup").
  screen.addEventListener('input', function(e){ if (e.target && e.target.id !== 'suCq') mark(); });
  // Keep the after-midnight note in step with the time boxes as the owner types.
  var timeTyped = function(e){
    var a = e.target && e.target.getAttribute && e.target.getAttribute('data-h'); if (!a || !W()) return;
    var q3 = a.split(':'), d3 = q3[0], j3 = +q3[1], o3 = el('o' + d3 + j3), c3 = el('c' + d3 + j3), n3 = el('suLate' + d3 + j3);
    // Cocktail test 3 (2026-11-14): a typed time un-presses "Midnight" (and the other quick times) that no longer match.
    var vals = [o3 ? o3.value : '', c3 ? (c3.value === '24:00' ? '00:00' : c3.value) : ''];
    Array.prototype.forEach.call(screen.querySelectorAll('[data-late^="' + d3 + ':' + j3 + ':"]'), function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-late').split(':').slice(2).join(':') === vals[1] ? 'true' : 'false'); });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-bq^="' + d3 + ':' + j3 + ':"]'), function(b){ var p = b.getAttribute('data-bq').split(':'); b.setAttribute('aria-pressed', p[3] + ':' + p[4] === vals[+p[2]] ? 'true' : 'false'); });
    if (!o3 || !c3 || !n3) return; var t3 = lateNote(d3, [o3.value, c3.value]); n3.textContent = t3; n3.hidden = !t3;
  };
  screen.addEventListener('input', timeTyped); screen.addEventListener('change', timeTyped);
  screen.addEventListener('click', function(e){ var t = e.target && e.target.closest ? e.target.closest('[data-off],[data-cui],[data-place],[data-hol],[data-chip],[data-len],[data-xdel],[data-kind],[data-rm],[data-closed],[data-same],[data-samemon],[data-dayopen],[data-dayclosed],[data-hoff],[data-copyevery],[data-copywe],[data-sport],[data-tv],[data-minors],[data-ctog],[data-cpick],[data-cbadge],[data-soc],[data-wpick],[data-fee],[data-wnobook],[data-xq],[data-bpick],[data-bfee],[data-btogo],[data-bgroup],[data-bq]') : null; if (t) mark(); }, true);
  // Kept as the owner taps and types, and once more on the way out.
  var drT = null; function drSoon(){ clearTimeout(drT); drT = setTimeout(drSave, 250); }
  screen.addEventListener('input', drSoon); screen.addEventListener('change', drSoon); screen.addEventListener('click', function(){ setTimeout(drSave, 0); });
  window.addEventListener('pagehide', drSave);
  // ---------- Where she is, in the address (bug-check 2026-11-12) ----------
  // The address's #step follows the question on screen, so a reload (or iOS reloading a tab) comes back to it, or to the
  // Welcome back list from screens without one. It used to keep the step a language switch had put there.
  function navKey(){ return 'suNav:' + String(C.base).replace(/^\/fr(?=\/owner\/)/, ''); }
  function navRec(){ return { h: window.suLangHash ? window.suLangHash() : '', toList: !!S.toList, toFinish: !!S.toFinish, toEss: !!S.toEss }; }
  function navSync(){
    try {
      var r = navRec(), url = location.pathname + location.search + (r.h ? '#' + r.h : '');
      if (location.pathname + location.search + location.hash !== url || !history.state || JSON.stringify(history.state.suNav) !== JSON.stringify(r)) history.replaceState({ suNav: r }, '', url);
    } catch (e) {}
  }
  function navKeep(){ try { var r = navRec(); r.at = Date.now(); window.sessionStorage.setItem(navKey(), JSON.stringify(r)); } catch (e) {} }
  // Café test 6 (2026-11-12): "Français / English" opens the same question in the other language. What she typed is kept
  // as a draft (above) and there is no "leave this page?" prompt.
  window.suLangHash = function(){
    var s0 = S.step, b0 = base(s0);
    if (b0 === 'closures') return 'closures';
    // Bug-check (2026-11-12): mid-edit, the edit screen itself (with the unsaved answers), never the summary that read as saved.
    if (s0 === 'hours:edit' || s0 === 'hours:season') return 'hours:edit';
    if (s0 === 'basics:edit') return s0;
    // The screens the address can open on their own (the pubs' kitchen, sports and who's-welcome; a café's serves).
    if ((C.pub && ['hours:kitchen', 'offer:sports', 'offer:minors'].indexOf(s0) >= 0) || (C.brewery && s0 === 'offer:minors') || (C.cafe && s0 === 'cuisine:serve')) return s0;
    if (s0 === 'hours:year') return s0;
    if (STEPS.indexOf(b0) >= 0) return b0;
    return s0 === 'more' ? 'more' : '';
  };
  // Bug-check (2026-11-12): photos, menu pages or files picked but not sent are never dropped by a language switch. Photos
  // with the box ticked are sent first (as when leaving); anything else asks "Save these first?". false: don't go yet.
  window.suBeforeLang = function(){
    if (S.busy) return false;
    if (S.step === 'photos:review' && goodPhotos().length && S.rights) { S.langGo = true; S.exitAfter = true; sendPhotos(); return false; }
    if (S.photos.length || S.menuFiles.length || S.menuPages.length || S.sheetFiles.length) { S.langGo = true; askExit(); return false; }
    try { if (S.step === 'hours:edit' || S.step === 'hours:season') readTimes(); } catch (e) {}
    drSave(); navKeep(); S.leaving = true; return true;
  };
  render();
  window.addEventListener('beforeunload', function(e){ drSave(); if (S.leaving) return; if (S.busy || S.dirty || S.photos.length || S.menuFiles.length || S.menuPages.length || S.sheetFiles.length) { e.preventDefault(); e.returnValue = ''; } });
})();
