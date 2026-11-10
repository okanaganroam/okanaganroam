// Full easy setup (2026-11-09): the page script, served inline on /owner/<link>/setup (restaurants). Plain ES5.
// One question per screen. Every save uses the same server paths as the edit page (POST <base>/changes with
// from_setup, <base>/photos, <base>/menu/pages + /menu/help, <base>/arrival) and is recorded in <base>/setup/progress
// so the setup can say "Welcome back". The owner only ever sees "Saved ✓" and whether it's on the page now or
// within a day. Words: owner-setup-text.js. Approved mockup: drafts/easy-setup-mockup-2026-11-09/full-setup.html (v5).
(function(){
  var C = window.SETUP_CFG, T = C.t, CUR = C.cur;
  var STEPS = C.steps, P1 = C.part1, P2 = C.part2;
  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var el = function(id){ return document.getElementById(id); };
  var screen = el('suScreen');
  var started = Date.now();
  function fill(s, o){ return String(s).replace(/\{(\w+)\}/g, function(m, k){ return o && o[k] != null ? o[k] : m; }); }
  function h(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function dayName(d){ return C.dayNames[d]; }
  function monthName(i){ return C.monthNames[i]; }
  function t12(v){ var m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); if (!m) return v || ''; var hh = +m[1], mi = m[2]; if (C.lang === 'fr') return hh + ' h' + (mi === '00' ? '' : ' ' + mi); var ap = hh >= 12 && hh < 24 ? 'PM' : 'AM'; hh = hh % 12 || 12; return hh + (mi === '00' ? '' : ':' + mi) + ' ' + ap; }
  function parseWeek(w){ try { var o = typeof w === 'string' ? JSON.parse(w) : w; var out = {}; DAYS.forEach(function(d){ out[d] = o && o[d] && o[d].length ? o[d].map(function(x){ return [x[0], x[1]]; }) : null; }); return out; } catch (e) { return null; } }

  // ---------- State ----------
  var S = {
    step: 'start', hist: [], done: clone(C.progress.done || {}), error: '', nudge: '', busy: false, toFinish: false, savedLine: {}, addLen: '1',
    notOffered: (CUR.not_offered || []).slice(),
    week: parseWeek(CUR.hours), photos: [], rights: false, photosSent: 0, menuFiles: [], menuPages: [], sheetFiles: [], webUrl: null,
    spend: CUR.avg_spend && CUR.avg_spend.amount ? CUR.avg_spend.amount : 25,
    cuis: (CUR.cuisines || []).filter(function(c){ return C.cuisines.indexOf(c) >= 0; }), place: CUR.place_type || '', cuiAll: false, cuiQ: '',
    badges: clone(CUR.badges || {}), dogNote: (CUR.visit_rows || {}).dogs || '',
    months: {}, closures: [], extra: [], winter: { on: false, months: {}, from: '11:00', to: '20:00' },
    happy: [], specials: [], nights: [], story: CUR.description || '', visit: clone(CUR.visit_rows || {}),
    ig: (CUR.instagram_url || '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '@').replace(/\/$/, ''), fb: CUR.facebook_url || '',
    door: { photo: null, best: null, spot: null, noLoc: false, rights: false }, score: C.progress.score || null,
    dirty: '', exitAfter: false, leaving: false, toList: false, added: '', noDiet: (CUR.not_offered || []).indexOf('dietary') >= 0,
  };
  // Season months from "5-10".
  (function(){ var m = /^(\d+)-(\d+)$/.exec(CUR.open_months || ''); if (!m) return; var a = +m[1], b = +m[2], i = a; for (var n = 0; n < 12; n++) { S.months[i] = true; if (i === b) break; i = i % 12 + 1; } })();
  // Seasonal hours: the first one, as months + one time.
  (function(){
    var s = (CUR.hours_seasons || [])[0]; if (!s) return;
    var a = +s.from.slice(0, 2), b = +s.to.slice(0, 2), i = a; S.winter.on = true;
    for (var n = 0; n < 12; n++) { S.winter.months[i] = true; if (i === b) break; i = i % 12 + 1; }
    var w = parseWeek(s.hours) || {}; for (var k = 0; k < 7; k++) { var x = w[DAYS[k]]; if (x && x[0]) { S.winter.from = x[0][0]; S.winter.to = x[0][1]; break; } }
  })();
  // Closures: holidays are tiles, the rest are listed.
  var HOL = holidays();
  (CUR.closures || []).forEach(function(c){ var hit = HOL.filter(function(x){ return x.date === c.from && (c.to || c.from) === c.from; })[0]; if (hit) S.closures.push(hit.key); else S.extra.push({ from: c.from, to: c.to || c.from, note: c.note || '' }); });
  // Happy hours from the stored week: days with the same times are one happy hour.
  (function(){
    var w = parseWeek(CUR.happy_hour); if (!w) return; var groups = {};
    DAYS.forEach(function(d){ (w[d] || []).forEach(function(x){ var k = x[0] + '-' + x[1]; if (!groups[k]) { groups[k] = { days: {}, from: x[0], to: x[1], what: '' }; S.happy.push(groups[k]); } groups[k].days[d] = true; }); });
    var deals = CUR.happy_hour_deals && CUR.happy_hour_deals.deals ? CUR.happy_hour_deals.deals.map(function(d){ return d.text + (d.price ? ' ' + d.price : ''); }) : [];
    if (S.happy.length && deals.length) S.happy[0].what = deals.join('; ').slice(0, 60);
  })();
  (CUR.specials || []).forEach(function(x){ var days = {}; (x.days || []).forEach(function(d){ days[d] = true; }); var text = x.deal && x.deal.indexOf(x.title) === 0 ? x.deal : x.title + (x.deal && x.deal !== x.title ? ', ' + x.deal : ''); S.specials.push({ days: days, text: text.slice(0, 80), price: x.price || '' }); });
  (CUR.weekly_nights || []).forEach(function(x){ var days = {}; (x.days || []).forEach(function(d){ days[d] = true; }); S.nights.push({ days: days, kind: x.kind, what: x.title, start: x.start || '' }); });

  // ---------- Holidays (the next date of each, from today) ----------
  function ymd(d){ return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function easter(y){ var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451), mo = Math.floor((hh + l - 7 * m + 114) / 31), da = ((hh + l - 7 * m + 114) % 31) + 1; return new Date(y, mo - 1, da); }
  function thirdMonday(y, mo){ var d = new Date(y, mo, 1); var n = 0; while (true) { if (d.getDay() === 1 && ++n === 3) return d; d.setDate(d.getDate() + 1); } }
  function holidays(){
    var today = new Date(); today.setHours(0, 0, 0, 0); var y = today.getFullYear();
    var make = function(key, fn){ var d = fn(y); if (d < today) d = fn(y + 1); return { key: key, date: ymd(d), d: d }; };
    var list = [
      make('xmasEve', function(yy){ return new Date(yy, 11, 24); }), make('xmas', function(yy){ return new Date(yy, 11, 25); }), make('boxing', function(yy){ return new Date(yy, 11, 26); }),
      make('nye', function(yy){ return new Date(yy, 11, 31); }), make('nyd', function(yy){ return new Date(yy, 0, 1); }), make('family', function(yy){ return thirdMonday(yy, 1); }),
      make('goodFri', function(yy){ var e = easter(yy); return new Date(e.getFullYear(), e.getMonth(), e.getDate() - 2); }), make('easterMon', function(yy){ var e = easter(yy); return new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1); }),
    ];
    list.sort(function(a, b){ return a.d - b.d; });
    return list;
  }
  function dateLabel(s){ var d = new Date(s + 'T12:00:00'); try { return d.toLocaleDateString(C.lang === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (e) { return s; } }

  // ---------- Talking to the server ----------
  function post(url, body){
    var attempt = function(){
      return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) })
        .then(function(r){ if (r.status === 502 || r.status === 503 || r.status === 504) throw new Error('busy'); return r.json().catch(function(){ return { ok: false }; }); });
    };
    return attempt().catch(function(){ return new Promise(function(ok){ setTimeout(ok, 1500); }).then(attempt); }).catch(function(){ return { ok: false }; });
  }
  function why(j){
    var e = j && j.errors; if (e) { for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k) && typeof e[k] === 'string' && k !== 'visit_rows_key') return e[k]; }
    return (j && j.error) || T.failed;
  }
  function nothingChanged(j){ return !!(j && j.errors && j.errors.form && Object.keys(j.errors).length === 1 && C.nothing.some(function(x){ return j.errors.form.indexOf(x) >= 0; })); }
  // One save through /changes. -> 'live' | 'day' | null (error shown).
  function change(changes){
    if (changes.not_offered === 'ADD_DIETARY') changes = { not_offered: addNot('dietary') };
    return post(C.base + '/changes?from=setup', { changes: changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: started }).then(function(j){
      if (j && j.ok) { if (changes.not_offered) S.notOffered = changes.not_offered.slice(); return j.review && j.review.length ? 'day' : 'live'; }
      if (nothingChanged(j)) return 'live';
      S.error = why(j); return null;
    });
  }
  // Records one answer. -> true, or false with the reason shown (never "Saved" on a save that didn't happen).
  function progress(step, status){ return post(C.base + '/setup/progress', { step: step, status: status }).then(function(j){ if (j && j.ok) { S.done[step] = (j.progress && j.progress.done && j.progress.done[step]) || status; if (j.score) S.score = j.score; if (S.dirty === step) S.dirty = ''; return true; } S.error = why(j); return false; }); }
  function record(step, status, then){ if (S.busy) return; S.busy = true; S.error = ''; render(); return progress(step, status).then(function(ok){ S.busy = false; if (!ok) return render(); if (then) then(); else go('saved:' + step); }); }
  // Help's "did it go through?": what we have right now, read from the server each time it is asked.
  function stText(step, d){ return d === 'no' ? (T.noLabels[step] || T.st.no) : T.st[d]; }
  function statusHtml(done){
    var rows = STEPS.filter(function(k){ return done[k] && done[k] !== 'skip'; }).map(function(k){ return '<li>' + h(T.labels[k]) + ': ' + h(stText(k, done[k])) + '</li>'; }).join('');
    return '<p>' + T.helpYes + '</p>' + (rows ? '<ul>' + rows + '</ul>' : '<p>' + h(T.helpNone) + '</p>') + '<p>' + h(T.helpTail) + '</p>';
  }
  window.ohbLive = window.ohbLive || {};
  window.ohbLive['setup-status'] = function(lang, update){
    try { fetch(C.base + '/setup/progress', { headers: { 'Accept': 'application/json' }, credentials: 'same-origin', cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(j){ if (j && j.ok && j.progress && j.progress.done) update(statusHtml(j.progress.done)); }).catch(function(){}); } catch (e) {}
    return statusHtml(S.done);
  };
  // Runs saves one after another; any error stops and shows it.
  function saveAll(step, list, forced, to, onOk){
    if (S.busy) return;
    S.busy = true; S.error = ''; render();
    var statuses = [];
    var next = function(i){
      if (i >= list.length) {
        var st = forced || (statuses.indexOf('day') >= 0 ? 'day' : 'live');
        return progress(step, st).then(function(ok){ S.busy = false; if (!ok) return render(); if (onOk) onOk(); go(to || 'saved:' + step); });
      }
      return change(list[i]).then(function(r){ if (!r) { S.busy = false; return render(); } statuses.push(r); return next(i + 1); });
    };
    next(0);
  }
  function addNot(key){ var l = S.notOffered.slice(); if (l.indexOf(key) < 0) l.push(key); return l; }

  // ---------- Navigation ----------
  function base(s){ return String(s).split(':')[0]; }
  // Part 1 (the essentials) is asked in order and ends on 'ess'; Part 2 is a menu ('more') of optional questions.
  function inP2(step){ return P2.indexOf(step) >= 0; }
  function allDone(){ return STEPS.every(function(k){ return S.done[k]; }); }
  function p1Done(){ return P1.every(function(k){ return S.done[k]; }); }
  function p2Count(){ return P2.filter(function(k){ return S.done[k]; }).length; }
  function nextOf(step){ if (inP2(step)) return allDone() ? 'finish' : 'more'; var i = P1.indexOf(step); return P1[i + 1] || 'ess'; }
  function firstOpen(){ for (var i = 0; i < P1.length; i++) if (!S.done[P1[i]]) return P1[i]; return allDone() ? 'finish' : 'more'; }
  // Already ticked "Takes reservations" (or said how to order, or "Great for groups"): straight to "How do people book?".
  function entry(step){
    if (step === 'book' && (S.badges.takes_reservations || S.visit.reservations)) return 'book:yes';
    if (step === 'takeout' && (S.badges.takeout || S.visit.takeout)) return 'takeout:yes';
    if (step === 'groups' && (S.badges.great_groups || S.visit.groups)) return 'groups:yes';
    if (step === 'season') return 'closures';
    return step;
  }
  // Tile and number steps keep their picks in memory, so they can still be saved from another screen ("Save and exit").
  var KEPT = ['offer', 'cuisine', 'closures', 'spend'];
  function answered(step){ var d = S.done[step]; return d === 'live' || d === 'day' || d === 'email' || d === 'no'; }
  function leave(){ S.leaving = true; location.href = C.back; }
  function go(step, replace){ step = entry(step);
    if (S.exitAfter) return leave();
    if (S.dirty && base(step) !== S.dirty && KEPT.indexOf(S.dirty) < 0) S.dirty = ''; if (!replace) S.hist.push(S.step); S.step = step; S.error = ''; S.nudge = ''; render(); window.scrollTo(0, 0); var f = screen.querySelector('h1'); if (f) { f.setAttribute('tabindex', '-1'); try { f.focus({ preventScroll: true }); } catch (e) {} } }
  function filled(step){
    if (step === 'happy' && S.done.happy === 'live' && S.happy.length) return 'happy:type';
    if (step === 'specials' && S.done.specials === 'live' && S.specials.length) return 'specials:type';
    if (step === 'music' && S.done.music === 'live' && S.nights.length) return 'music:yes';
    return step;
  }
  function mark(){ var b = base(S.step); if (STEPS.indexOf(b) >= 0) S.dirty = b; }
  function after(step){ if (S.toList) { S.toList = false; S.hist = []; return go('start'); } if (S.toFinish) { S.toFinish = false; return go('finish'); } go(nextOf(step)); }
  // A picker whose picks were already sent: Back goes to the question before it (never "Send these 0 photos").
  function emptyPicker(st){ return (st === 'photos:review' && !S.photos.length) || (st === 'menu:upload' && !S.menuFiles.length && S.done.menu) || (st === 'menu:cam' && !S.menuPages.length && S.done.menu) || (/^(happy|specials):sheet$/.test(st) && !S.sheetFiles.length && S.done[base(st)]); }
  // Back goes to the previous question, never to a "Saved" screen (that question then shows what was sent).
  el('suBack').onclick = function(){ if (S.busy) return; var b = S.hist.pop(); while (b && (/^saved:/.test(b) || emptyPicker(b))) b = S.hist.pop(); if (!b) return; if (S.dirty && base(b) !== S.dirty && KEPT.indexOf(S.dirty) < 0) S.dirty = ''; S.step = b; S.error = ''; S.nudge = ''; render(); };
  function bar(){
    var s = S.step, b = base(s), i = P1.indexOf(b), two = inP2(b) || s === 'more';
    el('suProg').hidden = !(i >= 0 || two || s === 'finish' || s === 'ess');
    el('suProgText').textContent = s === 'finish' ? T.allDone : s === 'ess' ? T.essBar : two ? fill(T.moreProg, { n: p2Count(), total: P2.length }) + (s === 'more' ? '' : ' · ' + T.labels[b]) : i >= 0 ? fill(T.step, { n: i + 1, total: P1.length }) + ' · ' + T.labels[b] : '';
    el('suProgBar').style.width = (s === 'finish' || s === 'ess' ? 100 : two ? Math.round((p2Count() / P2.length) * 100) : Math.round(((i + 1) / (P1.length + 1)) * 100)) + '%';
    el('suBack').hidden = !S.hist.length || s === 'finish' || s === 'ess' || s === 'start' || S.busy;
  }

  // ---------- Pieces ----------
  function big(icon, text, sub, alt, act, attrs){ return '<button type="button" class="su-big' + (alt ? ' su-alt' : '') + '" data-act="' + act + '"' + (attrs || '') + '><span class="su-ico" aria-hidden="true">' + icon + '</span><span>' + h(text) + (sub ? '<small>' + h(sub) + '</small>' : '') + '</span></button>'; }
  // An answered question never offers "Skip this for now" (it used to turn a sent menu into "skipped"): it offers Next.
  function nextLabel(step){ if (S.toList) return T.backToList; var nx = S.toFinish ? 'finish' : nextOf(step); return nx === 'finish' ? T.finish : nx === 'ess' ? T.seeFinish : nx === 'more' ? T.backToMore : fill(T.nextStep, { step: T.labels[nx] }); }
  function skip(step){
    if (answered(step)) return '<div class="su-stack" style="margin-top:14px">' + big('➜', nextLabel(step), '', true, 'after:' + step) + '</div>';
    return '<div class="su-skip"><button type="button" class="su-link" data-act="skip:' + step + '">' + h(T.skip) + '</button></div>';
  }
  function msgs(){ return (S.nudge ? '<p class="su-error" role="alert">' + h(S.nudge) + '</p>' : '') + (S.error ? '<p class="su-error" role="alert">' + h(S.error) + '</p>' : ''); }
  // Back on a question already answered: say so, and which answer we have.
  function doneLine(step){
    var d = S.done[step]; if (!d || d === 'skip' || d === 'later') return '';
    var yn = ['happy', 'specials', 'music', 'book', 'takeout', 'groups'].indexOf(step) >= 0;
    return '<p class="su-sent">' + h(d === 'no' ? fill(T.youSaid, { a: T.noLabels[step] || T.no }) : yn ? fill(T.youSaid, { a: T.yes }) : T.alreadyDone) + '</p>';
  }
  function ex(x){ return '<p class="su-example">' + h(fill(T.example, { x: x })) + '</p>'; }
  function q(title, lead){ return '<h1>' + h(title) + '</h1>' + (lead ? '<p class="su-lead">' + h(lead) + '</p>' : ''); }
  function yesNo(step, title, lead, yesText, noText){ return doneLine(step) + q(title, lead) + msgs() + '<div class="su-stack">' + big('✓', yesText || T.yes, '', false, 'go:' + step + ':yes') + big('✕', noText || T.no, '', true, 'no:' + step) + '</div>' + skip(step); }
  function chips(obj, key, list, label){ return '<div class="su-chips" role="group" aria-label="' + h(label || '') + '">' + list.map(function(d){ return '<button type="button" class="su-chip" aria-pressed="' + (obj[d.k] ? 'true' : 'false') + '" data-chip="' + key + ':' + d.k + '">' + h(d.t) + '</button>'; }).join('') + '</div>'; }
  function dayChips(obj, key){ return chips(obj, key, DAYS.map(function(d){ return { k: d, t: dayName(d) }; }), T.whichDays); }
  function monthChips(obj, key){ var l = []; for (var i = 1; i <= 12; i++) l.push({ k: i, t: monthName(i - 1) }); return chips(obj, key, l, T.whichMonths); }
  function field(id, label, value, opts){ opts = opts || {}; return '<label class="su-q" for="' + id + '">' + h(label) + '</label><input class="su-field" id="' + id + '" type="' + (opts.type || 'text') + '"' + (opts.mode ? ' inputmode="' + opts.mode + '"' : '') + (opts.max ? ' maxlength="' + opts.max + '"' : '') + ' value="' + h(value) + '" autocomplete="off"' + (opts.data ? ' ' + opts.data : '') + '>'; }
  function list(items){ return '<ul class="su-done-list">' + items + '</ul>'; }
  function statusRows(steps){
    return list(steps.map(function(s){
      var d = S.done[s] || 'none', k = d === 'live' || d === 'day' || d === 'no' ? '✓' : d === 'email' ? '✉' : d === 'later' ? '🕓' : d === 'skip' ? '–' : '○';
      return '<li class="su-li-btn"><button type="button" class="su-rowbtn" data-act="edit:' + s + '"><span class="su-k su-k-' + d + '" aria-hidden="true">' + k + '</span><span>' + h(T.labels[s]) + ' <span class="su-dim">· ' + h(stText(s, d)) + '</span></span><span class="su-chev" aria-hidden="true">›</span></button></li>';
    }).join(''));
  }
  var TOP2 = ['happy', 'specials', 'music', 'story'];
  var P2_ICONS = { happy: '🍻', specials: '⭐', music: '🎸', story: '✍️', book: '📅', takeout: '🥡', known: '👍', groups: '👥', instagram: '📸', facebook: '📘', door: '📍' };
  function scoreBox(){
    var sc = S.score || { pct: 0, soon: 0, badge: 'none' };
    // Never "done" beside a bare low number: when things are on their way, the ring shows where the page will be.
    if (sc.soon > sc.pct) return '<div class="su-score"><div class="su-ring" style="background:conic-gradient(#1E4F4C ' + sc.pct + '%, #C9A34A 0 ' + sc.soon + '%, #E5DED2 0)"><b>' + sc.soon + '%</b></div><div><strong>' + h(fill(T.pctWill, { n: sc.soon })) + '</strong><span>'
      + h(T.pctWillSub) + '</span><small>' + h(fill(T.pctRightNow, { n: sc.pct })) + '</small></div></div>';
    return '<div class="su-score"><div class="su-ring" style="background:conic-gradient(#1E4F4C ' + sc.pct + '%, #E5DED2 0)"><b>' + sc.pct + '%</b></div><div><strong>' + h(fill(T.pctNow, { n: sc.pct })) + '</strong><span>'
      + h(sc.pct >= 100 ? T.pctDone : T.niceWork) + '</span></div></div>';
  }
  function preview(){
    return '<p class="su-lead" style="margin-top:20px">' + h(T.howLooks) + '</p><div class="su-preview">' + (S.mainSrc || C.image ? '<img src="' + h(S.mainSrc || C.image) + '" alt="">' : '') + '<div><strong>' + h(C.name) + '</strong><p>'
      + h([S.cuis.length ? S.cuis.map(function(c){ return C.cuisineNames[c] || c; }).join(' · ') : C.typeLabel, C.regionLabel, S.done.spend && S.done.spend !== 'skip' ? fill(T.aPerson, { n: S.spend }) : ''].filter(Boolean).join(' · ')) + '</p></div></div>';
  }
  function weekRows(w){ return '<div class="su-box">' + DAYS.map(function(d){ var x = w && w[d]; return '<div><span>' + h(dayName(d)) + '</span><span>' + (x ? x.map(function(y){ return t12(y[0]) + ' – ' + t12(y[1]); }).join(', ') : h(T.closed)) + '</span></div>'; }).join('') + '</div>'; }

  // What is left to reach 100%: the setup's own open steps, plus anything the portal's checklist still asks for (so the
  // two always agree). Each is a button that opens the step that answers it.
  var ITEM_STEP = { arrival: 'door', photo_main: 'photos', photo_extra: 'photos', menu: 'menu', happy_hour: 'happy', specials: 'specials', entertainment: 'music', description: 'story', pyv_reservations: 'book',
    pyv_takeout: 'takeout', pyv_known: 'known', pyv_groups: 'groups', instagram: 'instagram', facebook: 'facebook', hours: 'hours', hours_fresh: 'hours', avg_spend: 'spend', cuisine: 'cuisine', dietary: 'offer', address_pin: 'basics', phone: 'basics' };
  function leftList(){
    var out = [], seen = {};
    STEPS.forEach(function(k){ if (!S.done[k] || S.done[k] === 'skip' || S.done[k] === 'later') { seen[k] = true; out.push({ step: k, label: T.labels[k] }); } });
    ((S.score && S.score.left) || []).forEach(function(it){ var st = ITEM_STEP[it.k]; if (!st || seen[st]) return; seen[st] = true; out.push({ step: st, label: C.lang === 'fr' ? it.fr : it.en }); });
    return out;
  }
  // ---------- "Exit setup" with answers not saved yet: "Save these first?" ----------
  function unsaved(){ return !!(S.dirty || S.photos.length || S.menuFiles.length || S.menuPages.length || S.sheetFiles.length); }
  function exitAction(){
    var st = S.step, b = base(st);
    var here = { 'hours:edit': 'hoursSave', 'basics:edit': 'basicsSave', 'happy:type': 'happySave', 'specials:type': 'specialsSave', 'music:yes': 'musicSave', story: 'storySave', 'book:yes': 'lineSave:book:reservations',
      'takeout:yes': 'lineSave:takeout:takeout', 'groups:yes': 'lineSave:groups:groups', known: 'lineSave:known:known_for', 'offer:dogs': 'dogSave', instagram: 'socialSave:instagram', facebook: 'socialSave:facebook',
      'menu:web': 'menuWebSave', 'happy:web': 'sheetWebSave:happy', 'specials:web': 'sheetWebSave:specials', 'photos:review': 'sendPhotos', 'menu:upload': 'sendMenuFiles', 'menu:cam': 'sendMenuPages',
      'happy:sheet': 'sendSheet:happy', 'specials:sheet': 'sendSheet:specials', 'closures:add': 'closureAddSave', 'closures:months': 'monthsUseSave' }[st];
    if (here) return here;
    var d = S.dirty || b;
    if (d === 'offer') return 'offerSave'; if (d === 'closures') return 'closuresSave'; if (d === 'spend') return 'spendSave'; if (d === 'cuisine') return 'cuisineExit';
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
    el('suExitDrop').onclick = leave;
    el('suExitStay').onclick = function(){ var b2 = el('suExitBox'); if (b2) b2.parentNode.removeChild(b2); };
    el('suExitSave').onclick = function(){
      if (S.busy) return; var a = exitAction(); if (!a) return leave();
      S.exitAfter = true; act(a);
      // Something still needs fixing (a missing tick, an empty box): the reason is on the screen, and we stay.
      if (!S.busy && !S.leaving) S.exitAfter = false;
    };
  }
  el('suExit').onclick = function(e){ if (S.busy) { e.preventDefault(); return; } if (unsaved()) { e.preventDefault(); askExit(); } };

  // ---------- Screens ----------
  function render(){
    bar();
    var s = S.step, p = s.split(':'), x = '';
    if (s === 'start' || s === 'more' || s === 'ess') { S.toList = false; S.toFinish = false; } else if (s === 'finish') S.toList = false;
    if (s === 'start') {
      var any = STEPS.some(function(k){ return S.done[k]; });
      var nxt = firstOpen();
      // Welcome back: the button first, then what's done.
      x = any ? q(nxt === 'finish' ? T.changeQ : T.welcome, nxt === 'finish' ? T.changeLead : T.welcomeLead) + msgs() + '<div class="su-stack" style="margin-bottom:22px">'
          + (nxt === 'finish' ? big('➜', T.seeFinish, '', false, 'go:finish') : nxt === 'more' ? big('➜', T.moreOpt, fill(T.moreDone, { n: p2Count(), total: P2.length }), false, 'go:more') + big('👀', T.seeFinish, '', true, 'go:ess') : big('➜', T.carryOn, fill(T.nextIs, { step: T.labels[nxt] }), false, 'resume')) + '</div>'
          + statusRows(P1) + (p1Done() || p2Count() ? '<h2 class="su-h2">' + h(T.moreQ) + '</h2>' + statusRows(P2) : '')
        : q(fill(T.hi, { name: C.name }), T.hiLead) + '<div class="su-stack">' + big('➜', T.start, '', false, 'go:basics') + '</div>';
    } else if (p[0] === 'saved') {
      var how = S.done[p[1]];
      var title = how === 'email' ? T.emailTitle2 : how === 'later' ? T.laterTitle : how === 'no' ? T.gotIt : T.savedTitle;
      var line = S.savedLine[p[1]] || (how === 'day' ? T.savedDay : how === 'email' ? T.savedEmail : how === 'later' ? T.savedLater : how === 'no' ? T.savedNo : T.savedLive);
      x = '<div class="su-saved"><div class="su-check" aria-hidden="true">' + (how === 'email' ? '✉' : how === 'later' ? '🕓' : '✓') + '</div><h1>' + h(title) + '</h1><p class="su-lead">' + h(line) + '</p></div>'
        + '<div class="su-stack">' + big('➜', nextLabel(p[1]), '', false, 'after:' + p[1]) + '</div>';
    } else if (s === 'ess') {
      // Part 1 is done: the score, the page, and one choice.
      x = '<div class="su-saved" style="padding-top:4px"><div class="su-check" aria-hidden="true">✓</div><h1>' + h(T.essQ) + '</h1></div>' + scoreBox() + preview()
        + '<div class="su-stack">' + big('➜', T.moreOpt, T.moreOptSub, false, 'go:more') + '<a class="su-big su-alt" href="' + h(C.back) + '"><span class="su-ico" aria-hidden="true">✓</span><span>' + h(T.doneNow) + '</span></a></div>';
    } else if (s === 'more') {
      // Part 2: optional, any order. A tick on the ones already answered.
      var tile2 = function(k){ var d = S.done[k], on = d && d !== 'skip'; return '<button type="button" class="su-tile" aria-pressed="' + (on ? 'true' : 'false') + '" data-act="open:' + k + '"><span class="su-e" aria-hidden="true">' + P2_ICONS[k] + '</span>' + h(T.labels[k]) + (on ? '<span class="su-tile-sub">' + h(stText(k, d)) + '</span>' : '') + '</button>'; };
      var top4 = P2.filter(function(k){ return TOP2.indexOf(k) >= 0; }), rest2 = P2.filter(function(k){ return TOP2.indexOf(k) < 0; });
      x = q(T.moreQ, T.moreLead) + msgs() + '<div class="su-tiles">' + top4.map(tile2).join('') + '</div><h2 class="su-h2">' + h(T.fewMore) + '</h2><div class="su-tiles">' + rest2.map(tile2).join('') + '</div>'
        + '<div class="su-stack">' + big('➜', allDone() ? T.seeFinish : T.doneNow, '', !allDone(), 'go:finish') + '</div>';
    } else if (s === 'basics') {
      x = doneLine('basics') + q(T.basicsQ) + msgs() + '<div class="su-box"><div><span>' + h(T.address) + '</span><span>' + h(CUR.address || '—') + '</span></div><div><span>' + h(T.phone) + '</span><span>' + h(CUR.phone || '—') + '</span></div></div>'
        + '<div class="su-stack">' + big('✓', T.yesRight, '', false, 'basicsOk') + big('✎', T.changeThem, '', true, 'go:basics:edit') + '</div>' + skip('basics');
    } else if (s === 'basics:edit') {
      x = q(T.basicsEditQ) + msgs() + field('suAddr', T.streetLabel, S.addr != null ? S.addr : CUR.address || '', { max: 200 }) + field('suPhone', T.phoneLabel, S.phone != null ? S.phone : CUR.phone || '', { type: 'tel', max: 40 })
        + '<div class="su-stack">' + big('✓', T.saveThese, '', false, 'basicsSave') + '</div>';
    } else if (s === 'hours') {
      x = doneLine('hours') + q(T.hoursQ) + msgs() + (S.week && DAYS.some(function(d){ return S.week[d]; }) ? weekRows(S.week) + '<div class="su-stack">' + big('✓', T.yesRight, '', false, 'hoursOk') + big('✎', T.changeThem, '', true, 'go:hours:edit') + '</div>'
        : '<p class="su-lead">' + h(T.noHours) + '</p><div class="su-stack">' + big('✎', T.addHours, '', false, 'go:hours:edit') + '</div>') + skip('hours');
    } else if (s === 'hours:edit') {
      if (!S.week) { S.week = {}; DAYS.forEach(function(d){ S.week[d] = null; }); }
      x = q(T.hoursEditQ, T.hoursEditLead) + msgs() + DAYS.map(function(d, i){
        var w = S.week[d], prev = i > 0 ? S.week[DAYS[i - 1]] : null;
        return '<div class="su-day"><div class="su-dh"><span>' + h(dayName(d)) + '</span><button type="button" class="su-toggle" aria-pressed="' + (w ? 'false' : 'true') + '" data-closed="' + d + '">' + h(w ? T.open : T.closed) + '</button></div>'
          + (w ? w.map(function(y, j){ return '<div class="su-times"><label class="su-sr" for="o' + d + j + '">' + h(fill(T.opens, { day: dayName(d) })) + '</label><input type="time" id="o' + d + j + '" data-h="' + d + ':' + j + ':0" value="' + y[0] + '"> ' + h(T.to) + ' <label class="su-sr" for="c' + d + j + '">' + h(fill(T.closes, { day: dayName(d) })) + '</label><input type="time" id="c' + d + j + '" data-h="' + d + ':' + j + ':1" value="' + y[1] + '"></div>'; }).join('')
            + (prev ? '<button type="button" class="su-toggle su-same" data-same="' + d + '">' + h(fill(T.sameAs, { day: dayName(DAYS[i - 1]) })) + '</button>' : '') : '') + '</div>';
      }).join('')
        + '<div class="su-day"><div class="su-dh"><span>' + h(T.winterQ) + '</span><button type="button" class="su-toggle" data-act="winter" aria-pressed="' + (S.winter.on ? 'true' : 'false') + '">' + h(S.winter.on ? T.yes : T.no) + '</button></div>'
        + (S.winter.on ? '<p class="su-hint">' + h(T.winterHint) + '</p><p class="su-q">' + h(T.whichMonths) + '</p>' + monthChips(S.winter.months, 'winter') + '<p class="su-q">' + h(T.hoursThen) + '</p><div class="su-times"><label class="su-sr" for="wf">' + h(T.starts) + '</label><input type="time" id="wf" value="' + S.winter.from + '"> ' + h(T.to) + ' <label class="su-sr" for="wt">' + h(T.ends) + '</label><input type="time" id="wt" value="' + S.winter.to + '"></div>' : '')
        + '</div><div class="su-stack">' + big('✓', T.saveHours, '', false, 'hoursSave') + '</div>';
    } else if (s === 'closures') {
      var mr = monthRun(S.months), monthsOn = !mr.none && !mr.all && !mr.bad;
      var nothing = !S.closures.length && !S.extra.length && !monthsOn;
      x = doneLine('closures') + q(T.closuresQ, T.closuresLead) + msgs() + (S.added ? '<p class="su-sent" id="suAdded">' + h(fill(T.added, { x: S.added })) + '</p>' : '')
        + S.extra.map(function(c, i){ return '<div class="su-row" style="margin-bottom:10px"><span aria-hidden="true">📅</span><span>' + h(dateLabel(c.from) + (c.to && c.to !== c.from ? ' – ' + dateLabel(c.to) : '') + (c.note ? ' · ' + c.note : '')) + '</span><button type="button" data-xdel="' + i + '" aria-label="' + h(T.remove) + '">✕</button></div>'; }).join('')
        + (monthsOn ? '<div class="su-row" style="margin-bottom:10px"><span aria-hidden="true">🗓️</span><span>' + h(fill(T.monthsRow, { a: monthName(mr.a - 1), b: monthName(mr.b - 1) })) + '</span><button type="button" data-act="monthsClear" aria-label="' + h(T.remove) + '">✕</button></div>' : '')
        + '<button type="button" class="su-more" data-act="go:closures:add">' + h(T.anotherDay) + '</button>'
        + '<button type="button" class="su-more" data-act="go:closures:months">' + h(T.wholeMonths) + '</button>'
        + '<h2 class="su-h2">' + h(T.holidaysH) + '</h2><div class="su-tiles">' + HOL.map(function(o){ return '<button type="button" class="su-tile" aria-pressed="' + (S.closures.indexOf(o.key) >= 0 ? 'true' : 'false') + '" data-hol="' + o.key + '"><span class="su-tile-sub">' + h(dateLabel(o.date)) + '</span>' + h(T.holidays[o.key]) + '</button>'; }).join('') + '</div>'
        + '<div class="su-stack su-sticky">' + (nothing ? big('✕', T.nothingComing, '', false, 'closuresNone') : big('✓', T.saveClosures, '', false, 'closuresSave')) + '</div>' + skip('closures');
    } else if (s === 'closures:months') {
      x = q(T.monthsQ, T.monthsLead) + msgs() + monthChips(S.months, 'months') + '<div class="su-stack">' + big('✓', T.monthsUse, '', false, 'monthsUse') + big('✕', T.allYearBtn, '', true, 'monthsClear') + '</div>';
    } else if (s === 'closures:add') {
      x = q(T.closeAddQ, T.closeAddLead) + msgs() + field('suCf', T.firstDay, S.addFrom || '', { type: 'date' })
        + '<p class="su-q">' + h(T.howLong) + '</p><div class="su-chips">' + [['1', T.len1], ['7', T.len7], ['14', T.len14], ['pick', T.lenPick]].map(function(o){ return '<button type="button" class="su-chip" aria-pressed="' + (S.addLen === o[0] ? 'true' : 'false') + '" data-len="' + o[0] + '">' + h(o[1]) + '</button>'; }).join('') + '</div>'
        + (S.addLen === 'pick' ? field('suCt', T.lastDay, S.addTo || '', { type: 'date' }) : '') + field('suCn', T.why, S.addNote || '', { max: 60 }) + ex(T.whyEx)
        + '<div class="su-stack">' + big('✓', T.addDates, '', false, 'closureAdd') + '</div>';
    } else if (s === 'spend') {
      var guess = CUR.avg_spend && CUR.avg_spend.source === 'research' ? ' ' + fill(T.spendGuess, { n: CUR.avg_spend.amount }) : '';
      x = doneLine('spend') + q(T.spendQ, T.spendLead + guess) + msgs() + '<div class="su-num"><button type="button" data-act="spend:-1" aria-label="' + h(T.less) + '">−</button><output id="suSpend" aria-live="polite">' + (C.lang === 'fr' ? S.spend + ' $' : '$' + S.spend) + '</output><button type="button" data-act="spend:1" aria-label="' + h(T.more) + '">+</button></div>'
        + '<div class="su-stack">' + big('✓', fill(T.spendYes, { n: S.spend }), '', false, 'spendSave') + '</div>' + skip('spend');
    } else if (s === 'cuisine') {
      var showAll = S.cuiAll || S.cuiQ.trim();
      var shown = showAll ? C.cuisines : C.popular.concat(S.cuis.filter(function(c){ return C.popular.indexOf(c) < 0; }));
      x = doneLine('cuisine') + q(T.cuisineQ, T.cuisineLead) + (S.cuis.length ? '<p class="su-sent">' + h(fill(T.picked, { list: S.cuis.map(function(c){ return C.cuisineNames[c] || c; }).join(', ') })) + '</p>' : '') + msgs()
        + (showAll ? field('suCq', T.typeToFind, S.cuiQ, { type: 'search', data: 'placeholder="' + h(T.findEx) + '"' }) : '')
        + '<div class="su-tiles" id="suCuiTiles">' + shown.map(function(c){ return '<button type="button" class="su-tile" aria-pressed="' + (S.cuis.indexOf(c) >= 0 ? 'true' : 'false') + '" data-cui="' + h(c) + '"><span class="su-e" aria-hidden="true">' + (C.cuisineIcons[c] || '🍽️') + '</span>' + h(C.cuisineNames[c] || c) + '</button>'; }).join('') + '</div>'
        + '<p class="su-lead" id="suCuiNone" hidden>' + h(T.notOnList) + '</p>'
        + (showAll ? '' : '<button type="button" class="su-more" data-act="cuiAll">' + h(T.showMore) + '</button>')
        + '<div class="su-stack' + (S.cuis.length ? ' su-sticky' : '') + '">' + big('➜', T.cuisineNext, '', false, 'cuisineNext') + '</div>' + skip('cuisine');
    } else if (s === 'cuisine:place') {
      x = q(T.placeQ, T.placeLead) + msgs() + '<div class="su-tiles">' + C.placeTypes.map(function(pt){ return '<button type="button" class="su-tile" aria-pressed="' + (S.place === pt ? 'true' : 'false') + '" data-place="' + h(pt) + '">' + h(C.placeNames[pt] || pt) + '</button>'; }).join('') + '</div>'
        + '<div class="su-stack">' + big('✓', T.saveFood, '', false, 'cuisineSave') + '</div>';
    } else if (s === 'photos') {
      x = (S.photosSent || S.done.photos === 'day' ? '<p class="su-sent">' + h(fill(T.photosSent, { n: S.photosSent || '' }).replace('  ', ' ')) + '</p>' + q(T.photosMore) : q(T.photosQ, T.photosLead)) + msgs()
        + '<div class="su-stack">' + big('📷', T.take, T.takeSub, false, 'take') + big('🖼️', T.choose, '', true, 'pick') + (S.photosSent || S.done.photos === 'day' ? big('➜', T.photosNoMore, '', true, 'after:photos') : '') + '</div>' + (S.photosSent || S.done.photos ? '' : skip('photos'));
    } else if (s === 'photos:review') {
      var g = goodPhotos();
      if (g.length && !g.some(function(ph){ return ph.main; })) { S.photos.forEach(function(ph){ ph.main = false; }); g[0].main = true; }
      x = q(T.reviewQ, T.reviewLead) + '<div class="su-grid">' + S.photos.map(function(ph, i){
        var m = ph.bad === 'small' ? T.tooSmall : T.cantOpen;
        return '<div class="su-ph' + (ph.main ? ' su-main' : '') + (ph.bad ? ' su-bad' : '') + '">' + (ph.thumb ? '<img src="' + ph.thumb + '" alt="">' : '<img alt="">')
          + '<button type="button" class="su-x" data-del="' + i + '" aria-label="' + h(fill(T.removePhoto, { n: i + 1 })) + '"' + (S.busy ? ' disabled' : '') + '>✕</button>'
          + (ph.bad ? '<div class="su-badmsg">' + h(m) + '</div><span class="su-tag">' + h(T.wontAdd) + '</span>' : '<button type="button" class="su-tag" data-main="' + i + '" aria-pressed="' + (ph.main ? 'true' : 'false') + '">' + h(ph.main ? T.isMain : T.makeMain) + '</button>') + '</div>';
      }).join('') + '</div>' + (S.busy ? '' : '<button type="button" class="su-more" data-act="pick">' + h(T.addAnother) + '</button>')
        + msgs() + '<label class="su-tick' + (S.nudge === T.needRights ? ' su-need' : '') + '" id="suTickBox"><input type="checkbox" id="suRights"' + (S.rights ? ' checked' : '') + '><span>' + h(T.rights) + '</span></label>'
        + '<p class="su-note" id="suProgress" role="status"></p><div class="su-stack">' + big('✓', S.error ? T.tryAgain : g.length === 1 ? T.sendOne : fill(T.sendMany, { n: g.length }), '', false, 'sendPhotos') + '</div>';
    } else if (s === 'menu') {
      x = (S.done.menu === 'day' ? '<p class="su-sent">' + h(T.menuSent) + '</p>' : S.done.menu === 'email' ? '<p class="su-sent">' + h(T.menuSentEmail) + '</p>' : '') + q(T.menuQ, T.menuLead) + msgs() + '<div class="su-stack">'
        + big('📷', T.snap, T.snapSub, false, 'go:menu:cam') + big('📄', T.upload, T.uploadSub, true, 'go:menu:upload') + big('🌐', T.web, '', true, 'go:menu:web') + big('✉️', T.emailIt, '', true, 'go:menu:email') + '</div>' + skip('menu');
    } else if (s === 'menu:upload' || s === 'happy:sheet' || s === 'specials:sheet') {
      var isMenu = s === 'menu:upload', files = isMenu ? S.menuFiles : S.sheetFiles;
      var title = isMenu ? (files.length ? T.upQSome : T.upQ) : p[0] === 'happy' ? T.sheetHappyQ : T.sheetSpecialsQ;
      var lead = isMenu ? (files.length ? T.upLeadSome : T.upLead) : files.length ? T.sheetLeadSome : T.sheetLead;
      x = q(title, lead) + msgs() + files.map(function(f, i){ return '<div class="su-row"><span aria-hidden="true">' + (f.pdf ? '📄' : '🖼️') + '</span><span>' + h(f.name) + '</span><button type="button" data-fdel="' + i + '" aria-label="' + h(fill(T.removeFile, { name: f.name })) + '"' + (S.busy ? ' disabled' : '') + '>✕</button></div>'; }).join('')
        + '<p class="su-note" id="suProgress" role="status"></p><div class="su-stack">' + (files.length ? big('✓', S.error ? T.tryAgain : isMenu ? T.sendMenu : T.sendIt, '', false, isMenu ? 'sendMenuFiles' : 'sendSheet:' + p[0]) : '')
        + (S.busy ? '' : big('📄', files.length ? T.upMore : isMenu ? T.upPick : T.chooseFile, '', !!files.length, isMenu ? 'menuFile' : 'sheetFile') + (isMenu ? '' : big('📷', T.camTake, '', true, 'sheetCam'))) + '</div>';
    } else if (s === 'menu:cam') {
      var n = S.menuPages.length;
      x = q(n ? (n === 1 ? T.camGot1 : fill(T.camGotN, { n: n })) : T.camQ, n ? T.camLeadSome : T.camLead) + msgs()
        + (n ? '<p class="su-hint">' + h(T.tapBigger) + '</p><div class="su-pages su-pages-big">' + S.menuPages.map(function(pg, i){ return '<div><img data-zoom="1" src="' + pg.thumb + '" alt="' + h(fill(T.page, { n: i + 1 })) + '"><span>' + (i + 1) + '</span><button type="button" class="su-x" data-pdel="' + i + '" aria-label="' + h(fill(T.removePage, { n: i + 1 })) + '"' + (S.busy ? ' disabled' : '') + '>✕</button></div>'; }).join('') + '</div>' : '')
        + '<p class="su-note" id="suProgress" role="status"></p><div class="su-stack">' + (n ? big('✓', S.error ? T.tryAgain : T.sendMenu, '', false, 'sendMenuPages') : '') + (S.busy ? '' : big('📷', n ? T.camMore : T.camTake, '', !!n, 'menuCam')) + '</div>';
    } else if (s === 'menu:web' || s === 'happy:web' || s === 'specials:web') {
      var site = (C.website || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      var lead2 = s === 'menu:web' ? T.webLead : p[0] === 'happy' ? T.webWhereHappy : T.webWhereSpecials;
      x = q(s === 'menu:web' ? T.webQ : T.webWhereQ, lead2) + msgs() + field('suUrl', T.webLabel, S.webUrl != null ? S.webUrl : site, { mode: 'url', max: 300 })
        + '<p class="su-hint"><button type="button" class="su-link" data-act="urlBack">' + h(T.putBack) + '</button></p>'
        + (s === 'menu:web' ? '' : ex(fill(p[0] === 'happy' ? T.webExHappy : T.webExSpecials, { site: site || 'yourplace.com' })))
        + '<div class="su-stack">' + big('✓', T.useAddress, s === 'menu:web' ? '' : T.webCopy, false, s === 'menu:web' ? 'menuWebSave' : 'sheetWebSave:' + p[0]) + '</div>';
    } else if (s === 'menu:email') {
      var mail = 'mailto:' + C.email + '?subject=' + encodeURIComponent(fill(T.mailSubject, { name: C.name }));
      x = q(T.emailQ, fill(T.emailLead, { name: C.name })) + '<div class="su-row su-mail"><span aria-hidden="true">✉️</span><span id="suEm">' + h(C.email) + '</span><button type="button" data-act="copy">' + h(T.copy) + '</button></div><p class="su-note" id="suCopied" role="status"></p>'
        + '<div class="su-stack"><a class="su-big su-alt" href="' + h(mail) + '"><span class="su-ico" aria-hidden="true">✉️</span><span>' + h(T.openMail) + '<small>' + h(T.openMailSub) + '</small></span></a>' + big('✓', T.willEmail, '', false, 'menuEmailDone') + '</div>';
    } else if (s === 'offer') {
      x = doneLine('offer') + q(T.offerQ, T.offerLead) + msgs() + C.offerGroups.map(function(g){ return '<h2 class="su-h2">' + h(g.title) + '</h2><div class="su-tiles">' + g.keys.map(function(k){ return '<button type="button" class="su-tile" aria-pressed="' + (S.badges[k] ? 'true' : 'false') + '" data-off="' + k + '"><span class="su-e" aria-hidden="true">' + C.offerIcons[k] + '</span>' + h(C.offerLabels[k]) + '</button>'; }).join('')
          + (g.keys.indexOf('vegan') >= 0 ? '<button type="button" class="su-tile su-tile-wide" aria-pressed="' + (S.noDiet ? 'true' : 'false') + '" data-off="none_diet"><span class="su-e" aria-hidden="true">🚫</span>' + h(T.noneDiet) + '<span class="su-tile-sub">' + h(T.noneDietSub) + '</span></button>' : '') + '</div>'; }).join('')
        + '<div class="su-stack su-sticky">' + big('✓', T.saveOffer, '', false, 'offerSave') + '</div>' + skip('offer');
    } else if (s === 'offer:dogs') {
      x = q(T.dogQ, T.dogLead) + msgs() + '<label class="su-sr" for="suDog">' + h(T.dogQ) + '</label><textarea class="su-field su-line" id="suDog" maxlength="180" rows="2">' + h(S.dogNote) + '</textarea>' + ex(T.dogEx)
        + '<div class="su-stack">' + big('✓', T.saveThis, '', false, 'dogSave') + '</div><div class="su-skip"><button type="button" class="su-link" data-act="go:saved:offer">' + h(T.skip) + '</button></div>';
    } else if (s === 'happy') { x = C.happyHour ? yesNo('happy', T.happyQ, '', T.happyYes) : '';
    } else if (s === 'happy:yes' || s === 'specials:yes') {
      var hk = p[0];
      x = q(T.howQ, T.howLead) + '<div class="su-stack">' + big('📄', hk === 'happy' ? T.happyUp : T.specialsUp, T.upSub, false, 'go:' + hk + ':sheet') + big('📷', hk === 'happy' ? T.happyPhoto : T.specialsPhoto, T.photoSub, true, 'sheetCamGo:' + hk)
        + big('🌐', hk === 'happy' ? T.happyWeb : T.specialsWeb, '', true, 'go:' + hk + ':web') + big('✎', hk === 'happy' ? T.happyType : T.specialsType, hk === 'happy' ? T.happyTypeSub : T.specialsTypeSub, true, 'go:' + hk + ':type') + '</div>';
    } else if (s === 'happy:type') {
      if (!S.happy.length) S.happy.push({ days: {}, from: '15:00', to: '17:00', what: '' });
      x = q(T.happyTypeQ, T.happyTypeLead) + msgs() + S.happy.map(function(e, i){
        return '<div class="su-day"><div class="su-dh"><span>' + h(fill(T.happyN, { n: i + 1 })) + '</span>' + (S.happy.length > 1 ? '<button type="button" class="su-toggle" data-rm="happy:' + i + '">' + h(T.remove) + '</button>' : '') + '</div>'
          + '<p class="su-q">' + h(T.whichDays) + '</p>' + dayChips(e.days, 'happy.' + i) + '<p class="su-q">' + h(T.whatTime) + '</p><div class="su-times"><label class="su-sr" for="hf' + i + '">' + h(T.starts) + '</label><input type="time" id="hf' + i + '" data-hh="' + i + ':from" value="' + e.from + '"> ' + h(T.to) + ' <label class="su-sr" for="ht' + i + '">' + h(T.ends) + '</label><input type="time" id="ht' + i + '" data-hh="' + i + ':to" value="' + e.to + '"></div>'
          + field('hw' + i, T.whatsOn, e.what, { max: 60, data: 'data-hh="' + i + ':what"' }) + (i === 0 ? ex(T.whatsOnEx) : '') + '</div>';
      }).join('') + (S.happy.length < 6 ? '<button type="button" class="su-more" data-act="add:happy">' + h(T.addHappy) + '</button>' : '') + '<div class="su-stack">' + big('✓', T.saveHappy, '', false, 'happySave') + '</div>';
    } else if (s === 'specials') { x = yesNo('specials', T.specialsQ, T.specialsLead);
    } else if (s === 'specials:type') {
      if (!S.specials.length) S.specials.push({ days: {}, text: '', price: '' });
      x = q(T.specialsTypeQ, T.upTo7) + msgs() + S.specials.map(function(e, i){
        return '<div class="su-day"><div class="su-dh"><span>' + h(fill(T.specialN, { n: i + 1 })) + '</span>' + (S.specials.length > 1 ? '<button type="button" class="su-toggle" data-rm="specials:' + i + '">' + h(T.remove) + '</button>' : '') + '</div>'
          + '<p class="su-q">' + h(T.whichDaysOr) + '</p>' + dayChips(e.days, 'specials.' + i) + field('sp' + i, T.whatIsIt, e.text, { max: 80, data: 'data-sp="' + i + ':text"' }) + (i === 0 ? ex(T.specialEx) : '')
          + field('spp' + i, T.priceIf, e.price, { max: 20, data: 'data-sp="' + i + ':price"' }) + (i === 0 ? ex(T.priceEx) : '') + '</div>';
      }).join('') + (S.specials.length < 7 ? '<button type="button" class="su-more" data-act="add:specials">' + h(T.addSpecial) + '</button>' : '') + '<div class="su-stack">' + big('✓', T.saveSpecials, '', false, 'specialsSave') + '</div>';
    } else if (s === 'music') { x = yesNo('music', T.musicQ, T.musicLead);
    } else if (s === 'music:yes') {
      if (!S.nights.length) S.nights.push({ days: {}, kind: '', what: '', start: '' });
      x = q(T.musicTypeQ, T.upTo7) + msgs() + S.nights.map(function(e, i){
        return '<div class="su-day"><div class="su-dh"><span>' + h(fill(T.eventN, { n: i + 1 })) + '</span>' + (S.nights.length > 1 ? '<button type="button" class="su-toggle" data-rm="nights:' + i + '">' + h(T.remove) + '</button>' : '') + '</div>'
          + '<p class="su-q">' + h(T.whatEvent) + '</p><details class="su-kinds"><summary>' + h(e.kind ? fill(T.kindIs, { k: T.kinds[e.kind] }) : T.pickKind) + '</summary><div class="su-chips">' + C.nightKinds.map(function(k){ return '<button type="button" class="su-chip" aria-pressed="' + (e.kind === k ? 'true' : 'false') + '" data-kind="' + i + ':' + k + '">' + h(T.kinds[k]) + '</button>'; }).join('') + '</div></details>'
          + '<label class="su-sr" for="nt' + i + '">' + h(T.whatEvent) + '</label><input class="su-field" id="nt' + i + '" data-nt="' + i + '" type="text" maxlength="40" value="' + h(e.what) + '">' + (i === 0 ? ex(T.eventEx) : '')
          + '<p class="su-q">' + h(T.whichNights) + '</p>' + dayChips(e.days, 'nights.' + i)
          + '<label class="su-q" for="ntt' + i + '">' + h(T.eventTime) + '</label><div class="su-times" style="margin-top:0"><input type="time" id="ntt' + i + '" data-ntt="' + i + '" value="' + h(e.start || '') + '"></div></div>';
      }).join('') + (S.nights.length < 7 ? '<button type="button" class="su-more" data-act="add:nights">' + h(T.addEvent) + '</button>' : '') + '<div class="su-stack">' + big('✓', T.saveEvents, '', false, 'musicSave') + '</div>';
    } else if (s === 'story') {
      var L2 = S.story.length;
      x = doneLine('story') + q(T.storyQ, T.storyLead) + msgs() + '<label class="su-sr" for="suStory">' + h(T.storyLabel) + '</label><textarea class="su-field su-area" id="suStory" maxlength="1200">' + h(S.story) + '</textarea>'
        + '<p class="su-count' + (L2 >= 120 ? ' su-ok' : '') + '" id="suCount">' + h(L2 >= 120 ? T.storyGood : T.storyCount) + '</p>' + ex(T.storyEx) + '<div class="su-stack">' + big('✓', T.saveThis, '', false, 'storySave') + '</div>' + skip('story');
    } else if (s === 'book') { x = yesNo('book', T.bookQ, '', T.bookYes, T.bookNo);
    } else if (s === 'book:yes' || s === 'takeout:yes' || s === 'groups:yes' || s === 'known') {
      var cfg = { 'book:yes': ['reservations', T.bookHowQ, '', T.bookEx], 'takeout:yes': ['takeout', T.takeoutHowQ, '', T.takeoutEx], 'groups:yes': ['groups', T.groupsHowQ, '', T.groupsEx], known: ['known_for', T.knownQ, T.knownLead, T.knownEx] }[s];
      x = doneLine(base(s)) + q(cfg[1], cfg[2]) + msgs() + '<label class="su-sr" for="suLine">' + h(cfg[1]) + '</label><textarea class="su-field su-line" id="suLine" maxlength="180" rows="2">' + h(S.visit[cfg[0]] || '') + '</textarea>' + ex(cfg[3])
        + '<div class="su-stack">' + big('✓', T.saveThis, '', false, 'lineSave:' + base(s) + ':' + cfg[0]) + '</div>'
        + (s === 'known' ? skip('known') : '<div class="su-skip"><button type="button" class="su-link" data-act="no:' + base(s) + '">' + h({ book: T.bookNoLink, takeout: T.takeoutNoLink, groups: T.groupsNoLink }[base(s)]) + '</button></div>');
    } else if (s === 'takeout') { x = yesNo('takeout', T.takeoutQ);
    } else if (s === 'groups') { x = yesNo('groups', T.groupsQ);
    } else if (s === 'instagram' || s === 'facebook') {
      var ig = s === 'instagram';
      x = doneLine(s) + (C.socialSent[s] ? '<p class="su-sent">' + h(T.socialSent) + '</p>' : '') + q(ig ? T.igQ : T.fbQ, ig ? T.igLead : T.fbLead) + msgs() + '<label class="su-sr" for="suSoc">' + h(ig ? T.igLabel : T.fbLabel) + '</label><input class="su-field" id="suSoc" type="text" autocapitalize="none" autocomplete="off" value="' + h(ig ? S.ig : S.fb) + '">'
        + '<div class="su-stack">' + big('✓', T.saveBtn, '', false, 'socialSave:' + s) + big('✕', ig ? T.igNo : T.fbNo, '', true, 'socialNo:' + s) + '</div>' + skip(s);
    } else if (s === 'door') {
      x = doneLine('door') + q(T.doorQ, T.doorLead) + '<h2 class="su-h2">' + h(T.doorHere) + '</h2><div class="su-stack">' + big('📍', T.imHere, '', false, 'go:door:photo') + big('🕓', T.notNow, T.notNowSub, true, 'later:door') + '</div>';
    } else if (s === 'door:photo') {
      x = q(T.doorPhotoQ, T.doorPhotoLead) + msgs() + (S.door.photo ? '<img class="su-door" src="' + S.door.photo + '" alt="">' : '')
        + '<div class="su-stack">' + (S.door.photo ? big('➜', T.checkPin, '', false, 'go:door:pin') : '') + big('📷', S.door.photo ? T.takeAgain : T.take, '', !!S.door.photo, 'doorTake') + '</div>';
    } else if (s === 'door:pin') {
      x = q(T.pinQ, T.pinLead) + '<p class="su-hint" id="suGps" role="status">' + h(S.door.best ? '' : S.door.noLoc ? T.noGps : T.finding) + '</p><div id="suMap" class="su-map"></div>' + msgs()
        + '<label class="su-tick' + (S.nudge === T.doorRightsNeed ? ' su-need' : '') + '"><input type="checkbox" id="suDoorRights"' + (S.door.rights ? ' checked' : '') + '><span>' + h(T.doorRights) + '</span></label>'
        + '<div class="su-stack">' + big('✓', S.error ? T.tryAgain : T.doorSend, '', false, 'doorSend') + '</div>';
    } else if (s === 'finish') {
      var sc = S.score || { pct: 0, soon: 0, badge: 'none' }, left = leftList();
      var onlyDoor = left.every(function(o){ return o.step === 'door'; });
      x = '<div class="su-saved" style="padding-top:4px"><h1>' + h(!left.length ? T.finishQ : allDone() && onlyDoor ? T.finishHome : allDone() ? T.finishAlmost : T.finishSoFar) + '</h1></div>' + scoreBox()
        + '<p class="su-badge-line">' + C.badgeChip + '</p><p class="su-badge-text">' + h(sc.badge === 'earned' ? T.badgeEarned : sc.badge === 'paused' ? T.badgePaused : T.badgeEarn) + '</p>'
        + (left.length ? '<h2 class="su-h2">' + h(T.toReach) + '</h2><div class="su-stack">' + left.map(function(o){ return big('➜', o.label, S.done[o.step] === 'later' ? T.laterSub : '', true, 'jump:' + o.step); }).join('') + '</div>' : '')
        + preview()
        + '<div class="su-stack"><a class="su-big" href="' + h(C.pageHref) + '" target="_blank" rel="noopener"><span class="su-ico" aria-hidden="true">↗</span><span>' + h(T.seePage) + '</span></a>'
        + '<a class="su-big su-alt" href="' + h(C.back) + '"><span class="su-ico" aria-hidden="true">←</span><span>' + h(T.backSettings) + '</span></a></div>';
    }
    if (S.error || S.nudge) S.exitAfter = false;
    // A failed save always says so, whatever the screen.
    if (S.error && x.indexOf('su-error') < 0) x = msgs() + x;
    screen.innerHTML = x;
    wire();
    var e2 = screen.querySelector('.su-error');
    if (e2) { e2.setAttribute('tabindex', '-1'); try { e2.focus({ preventScroll: true }); } catch (e) {} e2.scrollIntoView({ block: 'center' }); }
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
    if (!S.rights) { S.nudge = T.needRights; render(); var tb = el('suTickBox'); if (tb) tb.scrollIntoView({ block: 'center' }); return; }
    var total = list.length, i = 0, mainP = list.filter(function(ph){ return ph.main; })[0];
    S.busy = true; S.error = ''; S.nudge = ''; render();
    var next = function(){
      var ph = list[i];
      if (!ph) {
        if (mainP) { try { S.mainSrc = jpeg(mainP.img, 1200).toDataURL('image/jpeg', 0.8); } catch (e) {} }
        S.photosSent += total; S.photos = []; S.rights = false;
        return progress('photos', 'day').then(function(ok){ S.busy = false; if (ok) go('saved:photos'); else render(); });
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
    var l = document.createElement('link'), sc = document.createElement('script'); l.rel = 'stylesheet'; l.href = b + 'leaflet.min.css'; sc.src = b + 'leaflet.min.js'; sc.onload = ready; document.head.appendChild(l); document.head.appendChild(sc); }
  function doorMap(){
    var at = S.door.spot || S.door.best || C.pin; var box = el('suMap'); if (!box || !at) return;
    map = null; marker = null;
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
  function windowsOk(w){ return DAYS.some(function(d){ return w[d] && w[d].length; }); }
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
    if (S.winter.on) {
      var r = monthRun(S.winter.months); if (r.none || r.bad || r.all) { S.nudge = r.bad ? T.monthsInRow : T.winterNeedMonths; return render(); }
      var sw = {}; DAYS.forEach(function(d){ sw[d] = S.week[d] ? [[S.winter.from, S.winter.to]] : []; });
      var pad = function(n){ return ('0' + n).slice(-2); };
      ch.hours_seasons = [{ from: pad(r.a) + '-01', to: pad(r.b) + '-' + LAST[r.b - 1], label: '', hours: sw }];
    } else if ((CUR.hours_seasons || []).length) ch.hours_seasons = [];
    saveAll('hours', [ch]);
  }
  function readTimes(){ Array.prototype.forEach.call(screen.querySelectorAll('[data-h]'), function(inp){ var q2 = inp.getAttribute('data-h').split(':'); if (S.week[q2[0]] && S.week[q2[0]][+q2[1]]) S.week[q2[0]][+q2[1]][+q2[2]] = inp.value; }); var wf = el('wf'), wt = el('wt'); if (wf) S.winter.from = wf.value; if (wt) S.winter.to = wt.value; }
  function happySave(){
    readEntries();
    var week = {}, deals = [], many = S.happy.length > 1;
    DAYS.forEach(function(d){ week[d] = []; });
    for (var i = 0; i < S.happy.length; i++) {
      var e = S.happy[i], ds = DAYS.filter(function(d){ return e.days[d]; });
      if (!ds.length) { S.nudge = T.needDays; return render(); }
      for (var k = 0; k < ds.length; k++) { if (week[ds[k]].length >= 2) { S.nudge = fill(T.twoPerDay, { day: dayName(ds[k]) }); return render(); } week[ds[k]].push([e.from, e.to]); }
      if (e.what.trim()) deals.push({ text: ((many ? ds.map(dayName).join(', ') + ': ' : '') + e.what.trim()).slice(0, 60) });
    }
    var list = [];
    if (S.notOffered.indexOf('happy_hour') >= 0) list.push({ not_offered: S.notOffered.filter(function(k){ return k !== 'happy_hour'; }) });
    // The Happy hour feature goes on with the times: the page only shows the deals (and the chip) while it is on.
    list.push({ happy_hour: week, happy_hour_deals: deals.length ? { deals: deals.slice(0, 6), deals_fr: [] } : null, badges: { happy_hour: true } });
    saveAll('happy', list);
  }
  function readEntries(){
    Array.prototype.forEach.call(screen.querySelectorAll('[data-hh]'), function(inp){ var q2 = inp.getAttribute('data-hh').split(':'); S.happy[+q2[0]][q2[1]] = inp.value; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-sp]'), function(inp){ var q2 = inp.getAttribute('data-sp').split(':'); S.specials[+q2[0]][q2[1]] = inp.value; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-nt]'), function(inp){ S.nights[+inp.getAttribute('data-nt')].what = inp.value; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-ntt]'), function(inp){ S.nights[+inp.getAttribute('data-ntt')].start = inp.value; });
  }
  // "18" -> "$18": a bare number typed as a price gets its dollar sign.
  function money(v){ v = String(v || '').trim(); return /^\d{1,4}(\.\d{1,2})?$/.test(v) ? '$' + v : v; }
  function specialsSave(){
    readEntries(); var out = [];
    for (var i = 0; i < S.specials.length; i++) {
      var e = S.specials[i], ds = DAYS.filter(function(d){ return e.days[d]; }), text = e.text.trim();
      if (!ds.length) { S.nudge = T.needDays; return render(); }
      if (!text) { S.nudge = T.needText; return render(); }
      out.push({ days: ds, title: text.split(',')[0].trim().slice(0, 40), deal: text.slice(0, 80), price: money(e.price) || null, kind: C.servesAlcohol ? 'both' : 'food' });
    }
    var list = []; if (S.notOffered.indexOf('specials') >= 0) list.push({ not_offered: S.notOffered.filter(function(k){ return k !== 'specials'; }) });
    list.push({ specials: out }); saveAll('specials', list);
  }
  function musicSave(){
    readEntries(); var out = [];
    for (var i = 0; i < S.nights.length; i++) {
      var e = S.nights[i], ds = DAYS.filter(function(d){ return e.days[d]; }), title = (e.what || '').trim() || (e.kind ? T.kinds[e.kind] : '');
      if (!ds.length) { S.nudge = T.needDays; return render(); }
      if (!title) { S.nudge = T.needText; return render(); }
      out.push({ days: ds, kind: e.kind || 'other', title: title.slice(0, 40), start: e.start || null, frequency: 'weekly' });
    }
    var list = []; if (S.notOffered.indexOf('entertainment') >= 0) list.push({ not_offered: S.notOffered.filter(function(k){ return k !== 'entertainment'; }) });
    list.push({ weekly_nights: out }); saveAll('music', list);
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
      instagram: CUR.instagram_url ? { instagram_url: '' } : null,
      facebook: CUR.facebook_url ? { facebook_url: '' } : null,
    }[step];
    var list = []; if (clear) list.push(clear); if (noKey) list.push({ not_offered: addNot(noKey) });
    var clearLocal = function(){ var vk = { book: 'reservations', takeout: 'takeout', groups: 'groups' }[step], bk = { book: 'takes_reservations', takeout: 'takeout', groups: 'great_groups' }[step]; if (vk) S.visit[vk] = ''; if (bk) S.badges[bk] = false; };
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

  // ---------- Wiring ----------
  function act(a){
    var p = a.split(':'), k = p[0], v = p.slice(1).join(':');
    if (k === 'go') return go(v);
    if (k === 'skip') { if (answered(v)) return after(v); return record(v, 'skip', function(){ after(v); }); }
    // From "Change something?" or Welcome back: straight to that question with the saved answer, then back to the list.
    if (k === 'edit') { S.toList = true; S.toFinish = false; S.hist = ['start']; S.step = 'start'; return go(filled(v)); }
    if (k === 'closureAddSave') { act('closureAdd'); if (!S.nudge) act('closuresSave'); return; }
    if (k === 'monthsUseSave') { act('monthsUse'); if (!S.nudge) act('closuresSave'); return; }
    if (k === 'cuisineExit') { if (!S.cuis.length) return leave(); return saveAll('cuisine', [S.place ? { cuisines: S.cuis, place_type: S.place } : { cuisines: S.cuis }]); }
    if (k === 'spend' || k === 'add' || k === 'winter' || k === 'closureAdd' || k === 'monthsUse' || k === 'monthsClear') mark();
    if (k === 'later') return record(v, 'later');
    if (k === 'open') { S.toList = false; S.hist = ['more']; S.step = 'more'; return go(filled(v)); }
    if (k === 'after') return after(v);
    if (k === 'resume') { S.toList = false; var f = firstOpen(); return go(f); }
    if (k === 'jump') { S.toFinish = true; S.toList = false; return go(filled(v)); }
    if (k === 'no') return sayNo(v);
    if (k === 'basicsOk') return record('basics', 'live');
    if (k === 'basicsSave') { S.addr = el('suAddr').value; S.phone = el('suPhone').value; var ch = {}; if (S.addr.trim() !== (CUR.address || '')) ch.address = S.addr; if (S.phone.trim() !== (CUR.phone || '')) ch.phone = S.phone; if (!Object.keys(ch).length) { S.nudge = T.noChange; return render(); } return saveAll('basics', [ch]); }
    if (k === 'hoursOk') return saveAll('hours', [{ hours_checked: true }]);
    if (k === 'hoursSave') return hoursSave();
    if (k === 'winter') { readTimes(); S.winter.on = !S.winter.on; return render(); }
    if (k === 'monthsUse') { var r = monthRun(S.months); if (r.none) { S.nudge = T.monthsNeed; return render(); } if (r.bad) { S.nudge = T.monthsInRow; return render(); } S.step = S.hist.pop() || 'closures'; S.nudge = ''; return render(); }
    if (k === 'monthsClear') { S.months = {}; if (S.step !== 'closures') S.step = S.hist.pop() || 'closures'; S.nudge = ''; return render(); }
    if (k === 'closuresNone' || k === 'closuresSave') {
      var out = k === 'closuresNone' ? [] : HOL.filter(function(o){ return S.closures.indexOf(o.key) >= 0; }).map(function(o){ return { from: o.date, to: o.date, note: T.holidays[o.key].replace(/[()&<>]/g, '') }; }).concat(S.extra);
      var mr2 = monthRun(S.months); if (mr2.bad) { S.nudge = T.monthsInRow; return render(); }
      var om = k === 'closuresNone' || mr2.none || mr2.all ? '' : mr2.a + '-' + mr2.b;
      var cl = [{ closures: out }]; if (om !== (CUR.open_months || '')) cl.push({ open_months: om });
      return saveAll('closures', cl, k === 'closuresNone' ? 'no' : null, null, function(){ CUR.open_months = om; S.added = ''; });
    }
    if (k === 'closureAdd') {
      var cf = el('suCf').value, ctEl = el('suCt'), cn = el('suCn').value.trim(); S.addFrom = cf; S.addNote = cn; if (ctEl) S.addTo = ctEl.value;
      if (!cf) { S.nudge = T.needFirst; return render(); }
      var to = cf;
      if (S.addLen === 'pick') to = S.addTo && S.addTo >= cf ? S.addTo : cf;
      else { var d0 = new Date(cf + 'T12:00:00'); d0.setDate(d0.getDate() + (+S.addLen - 1)); to = ymd(d0); }
      S.extra.push({ from: cf, to: to, note: cn.replace(/[()&<>]/g, '').slice(0, 60) }); S.added = dateLabel(cf) + (to !== cf ? ' – ' + dateLabel(to) : ''); S.addFrom = ''; S.addTo = ''; S.addNote = ''; S.addLen = '1';
      S.step = S.hist.pop() || 'closures'; S.nudge = ''; return render();
    }
    if (k === 'spend') { S.spend = Math.max(5, Math.min(300, S.spend + (+v))); return render(); }
    if (k === 'spendSave') { if (!C.spendPublic) S.savedLine.spend = T.savedSoon; return saveAll('spend', [{ avg_spend: S.spend }]); }
    if (k === 'cuiAll') { S.cuiAll = true; return render(); }
    if (k === 'cuisineNext') { if (!S.cuis.length) { S.nudge = T.pickOne; return render(); } return go('cuisine:place'); }
    if (k === 'cuisineSave') { if (!S.place) { S.nudge = T.placeNeed; return render(); } return saveAll('cuisine', [{ cuisines: S.cuis, place_type: S.place }]); }
    if (k === 'take') return el('suTake').click();
    if (k === 'pick') return el('suPick').click();
    if (k === 'sendPhotos') return sendPhotos();
    if (k === 'menuFile') return el('suMenuFile').click();
    if (k === 'menuCam') return el('suMenuCam').click();
    if (k === 'sendMenuFiles') return sendPages(S.menuFiles, null, 'menu', T.menuNote);
    if (k === 'sendMenuPages') return sendPages(S.menuPages, null, 'menu', T.menuNote);
    if (k === 'menuWebSave') { var u = el('suUrl').value.trim(); S.webUrl = u; if (!u) { S.nudge = T.webEmpty; return render(); } return saveAll('menu', [{ menu_url: u }], 'day'); }
    if (k === 'menuEmailDone') return record('menu', 'email');
    if (k === 'copy') { var sel = function(){ var rg = document.createRange(); rg.selectNodeContents(el('suEm')); var s2 = window.getSelection(); s2.removeAllRanges(); s2.addRange(rg); say('suCopied', T.selected); }; try { navigator.clipboard.writeText(C.email).then(function(){ say('suCopied', T.copied); }, sel); } catch (e) { sel(); } return; }
    if (k === 'urlBack') { var uu = el('suUrl'); if (uu) { uu.value = (C.website || '').replace(/^https?:\/\//, '').replace(/\/$/, ''); S.webUrl = uu.value; uu.focus(); } return; }
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
      var badges = {}; C.offerGroups.forEach(function(g){ g.keys.forEach(function(b){ badges[b] = !!S.badges[b]; }); });
      var list = [];
      // A ticked "Takes reservations" replaces an earlier "we don't" answer (never both).
      if (badges.takes_reservations && S.notOffered.indexOf('pyv_reservations') >= 0) list.push({ not_offered: S.notOffered.filter(function(z){ return z !== 'pyv_reservations'; }) });
      if (badges.great_groups && S.notOffered.indexOf('pyv_groups') >= 0) list.push({ not_offered: (list.length ? list[0].not_offered : S.notOffered).filter(function(z){ return z !== 'pyv_groups'; }) });
      // A dietary tile ticked takes back an earlier "None of these".
      var diet = badges.vegan || badges.vegetarian || badges.gluten_free;
      if ((diet || !S.noDiet) && S.notOffered.indexOf('dietary') >= 0) { var cur0 = list.length ? list[list.length - 1].not_offered : S.notOffered; list.push({ not_offered: cur0.filter(function(z){ return z !== 'dietary'; }) }); }
      list.push({ badges: badges });
      // "None of these" (no vegan, vegetarian or gluten-free options): the same answer as the portal's "we don't have one".
      if (!diet && S.noDiet && S.notOffered.indexOf('dietary') < 0) list.push({ not_offered: 'ADD_DIETARY' });
      // Dogs un-ticked: the "where are dogs allowed" line goes too. Ticked: that's the next small screen.
      if (!S.badges.dog_friendly && (CUR.visit_rows || {}).dogs) { list.push({ visit_rows: { dogs: '' } }); S.dogNote = ''; }
      return saveAll('offer', list, null, S.badges.dog_friendly ? 'offer:dogs' : null);
    }
    if (k === 'dogSave') {
      S.dogNote = el('suDog').value.trim();
      if (S.dogNote === ((CUR.visit_rows || {}).dogs || '')) return go('saved:offer');
      return saveAll('offer', [{ visit_rows: { dogs: S.dogNote } }], null, null, function(){ CUR.visit_rows = CUR.visit_rows || {}; CUR.visit_rows.dogs = S.dogNote; });
    }
    if (k === 'add') { readEntries(); var arr = S[v]; arr.push(v === 'happy' ? { days: {}, from: '15:00', to: '17:00', what: '' } : v === 'specials' ? { days: {}, text: '', price: '' } : { days: {}, kind: '', what: '' }); return render(); }
    if (k === 'happySave') return happySave();
    if (k === 'specialsSave') return specialsSave();
    if (k === 'musicSave') return musicSave();
    if (k === 'storySave') { S.story = el('suStory').value; if (S.story.trim().length < 30) { S.nudge = T.storyShort; return render(); } return saveAll('story', [{ description: S.story }]); }
    if (k === 'lineSave') {
      var step = p[1], key = p[2], line = el('suLine').value.trim();
      if (!line) { if (step === 'known') { S.nudge = T.needLine; return render(); } S.nudge = T.needLine; return render(); }
      S.visit[key] = line; var vr = {}; vr[key] = line;
      var list2 = []; var nk = { reservations: 'pyv_reservations', takeout: 'pyv_takeout', groups: 'pyv_groups' }[key];
      if (nk && S.notOffered.indexOf(nk) >= 0) list2.push({ not_offered: S.notOffered.filter(function(z){ return z !== nk; }) });
      // Saying how to book (or order, or that groups are welcome) ticks the matching feature too.
      var bk = { reservations: 'takes_reservations', takeout: 'takeout', groups: 'great_groups' }[key];
      if (bk) { var bb = {}; bb[bk] = true; list2.push({ badges: bb }); S.badges[bk] = true; }
      list2.push({ visit_rows: vr }); return saveAll(step, list2);
    }
    if (k === 'socialSave') { var val = el('suSoc').value.trim(); if (!val) { S.nudge = fill(T.needValue, { no: v === 'instagram' ? T.igNo : T.fbNo }); return render(); } if (v === 'instagram') S.ig = val; else S.fb = val; return socialSave(v, val); }
    if (k === 'socialNo') return sayNo(v);
    if (k === 'doorTake') { gps(); return el('suDoorCam').click(); }
    if (k === 'doorSend') return doorSend();
  }
  function wire(){
    Array.prototype.forEach.call(screen.querySelectorAll('[data-act]'), function(b){ b.onclick = function(){ if (!S.busy) act(b.getAttribute('data-act')); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-chip]'), function(b){ b.onclick = function(){
      var q2 = b.getAttribute('data-chip').split(':'), path = q2[0].split('.'), key = q2[1];
      var obj = path[0] === 'months' ? S.months : path[0] === 'winter' ? S.winter.months : S[path[0]][+path[1]].days;
      obj[key] = !obj[key]; b.setAttribute('aria-pressed', obj[key] ? 'true' : 'false'); S.nudge = '';
    }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-closed]'), function(b){ b.onclick = function(){ readTimes(); var d = b.getAttribute('data-closed'); S.week[d] = S.week[d] ? null : [['11:00', '21:00']]; render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-same]'), function(b){ b.onclick = function(){ readTimes(); var d = b.getAttribute('data-same'), i = DAYS.indexOf(d); S.week[d] = clone(S.week[DAYS[i - 1]]); render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-hol]'), function(b){ b.onclick = function(){ var k = b.getAttribute('data-hol'), i = S.closures.indexOf(k); if (i >= 0) S.closures.splice(i, 1); else S.closures.push(k); var y = window.scrollY; render(); window.scrollTo(0, y); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-len]'), function(b){ b.onclick = function(){ S.addFrom = el('suCf').value; S.addNote = el('suCn').value; var ct = el('suCt'); if (ct) S.addTo = ct.value; S.addLen = b.getAttribute('data-len'); var y = window.scrollY; render(); window.scrollTo(0, y); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-xdel]'), function(b){ b.onclick = function(){ S.extra.splice(+b.getAttribute('data-xdel'), 1); S.added = ''; render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-cui]'), function(b){ b.onclick = function(){
      var c = b.getAttribute('data-cui'), i = S.cuis.indexOf(c);
      if (i >= 0) S.cuis.splice(i, 1); else if (S.cuis.length >= 3) { S.nudge = T.upTo3; return render(); } else S.cuis.push(c);
      S.nudge = ''; var y = window.scrollY; render(); window.scrollTo(0, y);
    }; });
    var cq = el('suCq'); if (cq) { var filt = function(){ S.cuiQ = cq.value; var tq = cq.value.trim().toLowerCase(), n = 0; Array.prototype.forEach.call(screen.querySelectorAll('[data-cui]'), function(b){ var c = b.getAttribute('data-cui'), on = !tq || c.toLowerCase().indexOf(tq) >= 0 || String(C.cuisineNames[c] || '').toLowerCase().indexOf(tq) >= 0; b.hidden = !on; if (on) n++; }); el('suCuiNone').hidden = n > 0; }; cq.oninput = filt; filt(); }
    Array.prototype.forEach.call(screen.querySelectorAll('[data-place]'), function(b){ b.onclick = function(){ S.place = b.getAttribute('data-place'); S.nudge = ''; render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-off]'), function(b){ b.onclick = function(){
      var k = b.getAttribute('data-off');
      var press = function(key, on){ var n = screen.querySelector('[data-off="' + key + '"]'); if (n) n.setAttribute('aria-pressed', on ? 'true' : 'false'); };
      if (k === 'none_diet') { S.noDiet = !S.noDiet; press('none_diet', S.noDiet); if (S.noDiet) ['vegan', 'vegetarian', 'gluten_free'].forEach(function(d){ S.badges[d] = false; press(d, false); }); return; }
      S.badges[k] = !S.badges[k]; press(k, S.badges[k]);
      if (S.badges[k] && (k === 'vegan' || k === 'vegetarian' || k === 'gluten_free')) { S.noDiet = false; press('none_diet', false); }
    }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-zoom]'), function(im){ im.onclick = function(){ var bx = im.parentNode; bx.className = bx.className === 'su-zoomed' ? '' : 'su-zoomed'; }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-kind]'), function(b){ b.onclick = function(){ readEntries(); var q2 = b.getAttribute('data-kind').split(':'), e = S.nights[+q2[0]]; e.kind = q2[1]; if (!e.what) e.what = T.kinds[q2[1]]; render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-rm]'), function(b){ b.onclick = function(){ readEntries(); var q2 = b.getAttribute('data-rm').split(':'); S[q2[0]].splice(+q2[1], 1); render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-del]'), function(b){ b.onclick = function(){ S.photos.splice(+b.getAttribute('data-del'), 1); S.error = ''; if (!S.photos.length) { S.step = 'photos'; } render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-main]'), function(b){ b.onclick = function(){ var k = +b.getAttribute('data-main'); S.photos.forEach(function(ph, i){ ph.main = i === k; }); render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-fdel]'), function(b){ b.onclick = function(){ var l = S.step === 'menu:upload' ? S.menuFiles : S.sheetFiles; l.splice(+b.getAttribute('data-fdel'), 1); S.error = ''; render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-pdel]'), function(b){ b.onclick = function(){ S.menuPages.splice(+b.getAttribute('data-pdel'), 1); S.error = ''; render(); }; });
    var rt = el('suRights'); if (rt) rt.onchange = function(){ S.rights = rt.checked; if (rt.checked && S.nudge === T.needRights) { S.nudge = ''; render(); } };
    var dr = el('suDoorRights'); if (dr) dr.onchange = function(){ S.door.rights = dr.checked; if (dr.checked && S.nudge === T.doorRightsNeed) { S.nudge = ''; render(); } };
    var st = el('suStory'); if (st) st.oninput = function(){ S.story = st.value; var n = st.value.length, c = el('suCount'); c.textContent = n >= 120 ? T.storyGood : T.storyCount; c.className = 'su-count' + (n >= 120 ? ' su-ok' : ''); };
    // Text never gets wiped: the cursor goes to the end of what's there.
    Array.prototype.forEach.call(screen.querySelectorAll('input[type=text], input[type=tel], input[type=search], textarea'), function(inp){ inp.addEventListener('focus', function(){ var n = inp.value.length; if (!n) return; setTimeout(function(){ try { if (inp.value.length === n) inp.setSelectionRange(n, n); } catch (e) {} }, 0); }); });
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
  var startAt = String(location.hash || '').slice(1);
  if (startAt === 'season') startAt = 'closures';
  if (STEPS.indexOf(startAt) >= 0) { S.hist = ['start']; S.step = entry(startAt); } else if (startAt === 'more') { S.hist = ['start']; S.step = 'more'; }
  // Answers tapped or typed but not saved yet (for "Exit setup").
  screen.addEventListener('input', function(e){ if (e.target && e.target.id !== 'suCq') mark(); });
  screen.addEventListener('click', function(e){ var t = e.target && e.target.closest ? e.target.closest('[data-off],[data-cui],[data-place],[data-hol],[data-chip],[data-len],[data-xdel],[data-kind],[data-rm],[data-closed],[data-same]') : null; if (t) mark(); }, true);
  render();
  window.addEventListener('beforeunload', function(e){ if (S.leaving) return; if (S.busy || S.dirty || S.photos.length || S.menuFiles.length || S.menuPages.length || S.sheetFiles.length) { e.preventDefault(); e.returnValue = ''; } });
})();
