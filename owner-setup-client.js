// Full easy setup (2026-11-09): the page script, served inline on /owner/<link>/setup (restaurants). Plain ES5.
// One question per screen. Every save uses the same server paths as the edit page (POST <base>/changes with
// from_setup, <base>/photos, <base>/menu/pages + /menu/help, <base>/arrival) and is recorded in <base>/setup/progress
// so the setup can say "Welcome back". The owner only ever sees "Saved ✓" and whether it's on the page now or
// within a day. Words: owner-setup-text.js. Approved mockup: drafts/easy-setup-mockup-2026-11-09/full-setup.html (v5).
(function(){
  var C = window.SETUP_CFG, T = C.t, CUR = C.cur;
  var STEPS = C.steps;
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
    step: 'start', hist: [], done: clone(C.progress.done || {}), error: '', nudge: '', busy: false, toFinish: false,
    notOffered: (CUR.not_offered || []).slice(),
    week: parseWeek(CUR.hours), photos: [], rights: false, photosSent: 0, menuFiles: [], menuPages: [], sheetFiles: [], webUrl: null,
    spend: CUR.avg_spend && CUR.avg_spend.amount ? CUR.avg_spend.amount : 25,
    cuis: (CUR.cuisines || []).filter(function(c){ return C.cuisines.indexOf(c) >= 0; }), place: CUR.place_type || '', cuiAll: false, cuiQ: '',
    badges: clone(CUR.badges || {}), dogNote: (CUR.visit_rows || {}).dogs || '',
    months: {}, closures: [], extra: [], winter: { on: false, months: {}, from: '11:00', to: '20:00' },
    happy: [], specials: [], nights: [], story: CUR.description || '', visit: clone(CUR.visit_rows || {}),
    ig: (CUR.instagram_url || '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '@').replace(/\/$/, ''), fb: CUR.facebook_url || '',
    door: { photo: null, best: null, spot: null, noLoc: false, rights: false }, score: C.progress.score || null,
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
  (CUR.weekly_nights || []).forEach(function(x){ var days = {}; (x.days || []).forEach(function(d){ days[d] = true; }); S.nights.push({ days: days, kind: x.kind, what: x.title }); });

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
    return post(C.base + '/changes?from=setup', { changes: changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: started }).then(function(j){
      if (j && j.ok) { if (changes.not_offered) S.notOffered = changes.not_offered.slice(); return j.review && j.review.length ? 'day' : 'live'; }
      if (nothingChanged(j)) return 'live';
      S.error = why(j); return null;
    });
  }
  function progress(step, status){ S.done[step] = status; return post(C.base + '/setup/progress', { step: step, status: status }).then(function(j){ if (j && j.score) S.score = j.score; }); }
  // Runs saves one after another; any error stops and shows it.
  function saveAll(step, list, forced){
    if (S.busy) return;
    S.busy = true; S.error = ''; render();
    var statuses = [];
    var next = function(i){
      if (i >= list.length) {
        var st = forced || (statuses.indexOf('day') >= 0 ? 'day' : 'live');
        return progress(step, st).then(function(){ S.busy = false; go('saved:' + step); });
      }
      return change(list[i]).then(function(r){ if (!r) { S.busy = false; return render(); } statuses.push(r); return next(i + 1); });
    };
    next(0);
  }
  function addNot(key){ var l = S.notOffered.slice(); if (l.indexOf(key) < 0) l.push(key); return l; }

  // ---------- Navigation ----------
  function base(s){ return String(s).split(':')[0]; }
  function nextOf(step){ var i = STEPS.indexOf(step); return STEPS[i + 1] || 'finish'; }
  function firstOpen(){ for (var i = 0; i < STEPS.length; i++) if (!S.done[STEPS[i]]) return STEPS[i]; return 'finish'; }
  function go(step, replace){ if (!replace) S.hist.push(S.step); S.step = step; S.error = ''; S.nudge = ''; render(); window.scrollTo(0, 0); var f = screen.querySelector('h1'); if (f) { f.setAttribute('tabindex', '-1'); try { f.focus({ preventScroll: true }); } catch (e) {} } }
  function after(step){ if (S.toFinish) { S.toFinish = false; return go('finish'); } go(nextOf(step)); }
  // A picker whose picks were already sent: Back goes to the question before it (never "Send these 0 photos").
  function emptyPicker(st){ return (st === 'photos:review' && !S.photos.length) || (st === 'menu:upload' && !S.menuFiles.length && S.done.menu) || (st === 'menu:cam' && !S.menuPages.length && S.done.menu) || (/^(happy|specials):sheet$/.test(st) && !S.sheetFiles.length && S.done[base(st)]); }
  // Back goes to the previous question, never to a "Saved" screen (that question then shows what was sent).
  el('suBack').onclick = function(){ if (S.busy) return; var b = S.hist.pop(); while (b && (/^saved:/.test(b) || emptyPicker(b))) b = S.hist.pop(); if (!b) return; S.step = b; S.error = ''; S.nudge = ''; render(); };
  function bar(){
    var s = S.step, i = STEPS.indexOf(base(s));
    el('suProg').hidden = !(i >= 0 || s === 'finish');
    el('suProgText').textContent = s === 'finish' ? T.allDone : fill(T.step, { n: i + 1, total: STEPS.length }) + ' · ' + T.labels[STEPS[i]];
    el('suProgBar').style.width = (s === 'finish' ? 100 : Math.round(((i + 1) / (STEPS.length + 1)) * 100)) + '%';
    el('suBack').hidden = !S.hist.length || s === 'finish' || s === 'start' || S.busy;
  }

  // ---------- Pieces ----------
  function big(icon, text, sub, alt, act, attrs){ return '<button type="button" class="su-big' + (alt ? ' su-alt' : '') + '" data-act="' + act + '"' + (attrs || '') + '><span class="su-ico" aria-hidden="true">' + icon + '</span><span>' + h(text) + (sub ? '<small>' + h(sub) + '</small>' : '') + '</span></button>'; }
  function skip(step){ return '<div class="su-skip"><button type="button" class="su-link" data-act="skip:' + step + '">' + h(T.skip) + '</button></div>'; }
  function msgs(){ return (S.nudge ? '<p class="su-error" role="alert">' + h(S.nudge) + '</p>' : '') + (S.error ? '<p class="su-error" role="alert">' + h(S.error) + '</p>' : ''); }
  function doneLine(step){ return S.done[step] && S.done[step] !== 'skip' && S.done[step] !== 'later' ? '<p class="su-sent">' + h(T.alreadyDone) + '</p>' : ''; }
  function ex(x){ return '<p class="su-example">' + h(fill(T.example, { x: x })) + '</p>'; }
  function q(title, lead){ return '<h1>' + h(title) + '</h1>' + (lead ? '<p class="su-lead">' + h(lead) + '</p>' : ''); }
  function yesNo(step, title, lead, yesText){ return doneLine(step) + q(title, lead) + msgs() + '<div class="su-stack">' + big('✕', T.no, '', true, 'no:' + step) + big('✓', yesText || T.yes, '', false, 'go:' + step + ':yes') + '</div>' + skip(step); }
  function chips(obj, key, list, label){ return '<div class="su-chips" role="group" aria-label="' + h(label || '') + '">' + list.map(function(d){ return '<button type="button" class="su-chip" aria-pressed="' + (obj[d.k] ? 'true' : 'false') + '" data-chip="' + key + ':' + d.k + '">' + h(d.t) + '</button>'; }).join('') + '</div>'; }
  function dayChips(obj, key){ return chips(obj, key, DAYS.map(function(d){ return { k: d, t: dayName(d) }; }), T.whichDays); }
  function monthChips(obj, key){ var l = []; for (var i = 1; i <= 12; i++) l.push({ k: i, t: monthName(i - 1) }); return chips(obj, key, l, T.whichMonths); }
  function field(id, label, value, opts){ opts = opts || {}; return '<label class="su-q" for="' + id + '">' + h(label) + '</label><input class="su-field" id="' + id + '" type="' + (opts.type || 'text') + '"' + (opts.mode ? ' inputmode="' + opts.mode + '"' : '') + (opts.max ? ' maxlength="' + opts.max + '"' : '') + ' value="' + h(value) + '" autocomplete="off"' + (opts.data ? ' ' + opts.data : '') + '>'; }
  function list(items){ return '<ul class="su-done-list">' + items + '</ul>'; }
  function statusRows(){
    return list(STEPS.map(function(s){
      var d = S.done[s] || 'none', k = d === 'live' || d === 'day' ? '✓' : d === 'email' ? '✉' : d === 'later' ? '🕓' : d === 'skip' ? '–' : '○';
      return '<li><span class="su-k su-k-' + d + '" aria-hidden="true">' + k + '</span><span>' + h(T.labels[s]) + ' <span class="su-dim">· ' + h(T.st[d]) + '</span></span></li>';
    }).join(''));
  }
  function weekRows(w){ return '<div class="su-box">' + DAYS.map(function(d){ var x = w && w[d]; return '<div><span>' + h(dayName(d)) + '</span><span>' + (x ? x.map(function(y){ return t12(y[0]) + ' – ' + t12(y[1]); }).join(', ') : h(T.closed)) + '</span></div>'; }).join('') + '</div>'; }

  // ---------- Screens ----------
  function render(){
    bar();
    var s = S.step, p = s.split(':'), x = '';
    if (s === 'start') {
      var any = STEPS.some(function(k){ return S.done[k]; });
      var nxt = firstOpen();
      x = any ? q(T.welcome, T.welcomeLead) + statusRows() + '<div class="su-stack">' + big('➜', nxt === 'finish' ? T.seeFinish : T.carryOn, nxt === 'finish' ? '' : fill(T.nextIs, { step: T.labels[nxt] }), false, 'resume') + '</div>'
        : q(fill(T.hi, { name: C.name }), T.hiLead) + '<div class="su-stack">' + big('➜', T.start, '', false, 'go:basics') + '</div>';
    } else if (p[0] === 'saved') {
      var how = S.done[p[1]], nx = S.toFinish ? 'finish' : nextOf(p[1]);
      var title = how === 'email' ? T.emailTitle2 : how === 'later' ? T.laterTitle : T.savedTitle;
      var line = how === 'day' ? T.savedDay : how === 'email' ? T.savedEmail : how === 'later' ? T.savedLater : T.savedLive;
      x = '<div class="su-saved"><div class="su-check" aria-hidden="true">' + (how === 'email' ? '✉' : how === 'later' ? '🕓' : '✓') + '</div><h1>' + h(title) + '</h1><p class="su-lead">' + h(line) + '</p></div>'
        + '<div class="su-stack">' + big('➜', nx === 'finish' ? T.finish : fill(T.nextStep, { step: T.labels[nx] }), '', false, 'after:' + p[1]) + '</div>';
    } else if (s === 'basics') {
      x = doneLine('basics') + q(T.basicsQ) + '<div class="su-box"><div><span>' + h(T.address) + '</span><span>' + h(CUR.address || '—') + '</span></div><div><span>' + h(T.phone) + '</span><span>' + h(CUR.phone || '—') + '</span></div></div>'
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
    } else if (s === 'season') {
      x = doneLine('season') + q(T.seasonQ, T.seasonLead) + msgs() + '<div class="su-stack">' + big('✓', T.allYear, '', true, 'seasonAll') + big('📅', T.partYear, '', false, 'go:season:yes') + '</div>' + skip('season');
    } else if (s === 'season:yes') {
      x = q(T.monthsQ, T.monthsLead) + msgs() + monthChips(S.months, 'months') + '<div class="su-stack">' + big('✓', T.saveSeason, '', false, 'seasonSave') + '</div>';
    } else if (s === 'closures') {
      x = doneLine('closures') + q(T.closuresQ, T.closuresLead) + msgs() + '<div class="su-tiles">' + HOL.map(function(o){ return '<button type="button" class="su-tile" aria-pressed="' + (S.closures.indexOf(o.key) >= 0 ? 'true' : 'false') + '" data-hol="' + o.key + '"><span class="su-tile-sub">' + h(dateLabel(o.date)) + '</span>' + h(T.holidays[o.key]) + '</button>'; }).join('') + '</div>'
        + S.extra.map(function(c, i){ return '<div class="su-row"><span aria-hidden="true">📅</span><span>' + h(dateLabel(c.from) + (c.to && c.to !== c.from ? ' – ' + dateLabel(c.to) : '') + (c.note ? ' · ' + c.note : '')) + '</span><button type="button" data-xdel="' + i + '" aria-label="' + h(T.remove) + '">✕</button></div>'; }).join('')
        + '<button type="button" class="su-more" data-act="go:closures:add">' + h(T.anotherDay) + '</button>'
        + '<div class="su-stack">' + big('✓', T.saveClosures, '', false, 'closuresSave') + big('✕', T.nothingComing, '', true, 'closuresNone') + '</div>' + skip('closures');
    } else if (s === 'closures:add') {
      x = q(T.closeAddQ, T.closeAddLead) + msgs() + field('suCf', T.firstDay, '', { type: 'date' }) + field('suCt', T.lastDay, '', { type: 'date' }) + field('suCn', T.why, '', { max: 60 }) + ex(T.whyEx)
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
        + '<div class="su-stack">' + big('➜', T.cuisineNext, '', false, 'cuisineNext') + '</div>' + skip('cuisine');
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
      x = (S.done.menu === 'day' ? '<p class="su-sent">' + h(T.menuSent) + '</p>' : '') + q(T.menuQ, T.menuLead) + msgs() + '<div class="su-stack">'
        + big('📄', T.upload, T.uploadSub, false, 'go:menu:upload') + big('📷', T.snap, T.snapSub, true, 'go:menu:cam') + big('🌐', T.web, '', true, 'go:menu:web') + big('✉️', T.emailIt, '', true, 'go:menu:email') + '</div>' + skip('menu');
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
        + (n ? '<div class="su-pages">' + S.menuPages.map(function(pg, i){ return '<div><img src="' + pg.thumb + '" alt="' + h(fill(T.page, { n: i + 1 })) + '"><span>' + (i + 1) + '</span><button type="button" class="su-x" data-pdel="' + i + '" aria-label="' + h(fill(T.removePage, { n: i + 1 })) + '"' + (S.busy ? ' disabled' : '') + '>✕</button></div>'; }).join('') + '</div>' : '')
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
      x = doneLine('offer') + q(T.offerQ, T.offerLead) + msgs() + C.offerGroups.map(function(g){ return '<h2 class="su-h2">' + h(g.title) + '</h2><div class="su-tiles">' + g.keys.map(function(k){ return '<button type="button" class="su-tile" aria-pressed="' + (S.badges[k] ? 'true' : 'false') + '" data-off="' + k + '"><span class="su-e" aria-hidden="true">' + C.offerIcons[k] + '</span>' + h(C.offerLabels[k]) + '</button>'; }).join('') + '</div>'
          + (g.keys.indexOf('dog_friendly') >= 0 ? '<div id="suDogBox"' + (S.badges.dog_friendly ? '' : ' hidden') + '>' + field('suDog', T.dogQ, S.dogNote, { max: 180 }) + ex(T.dogEx) + '</div>' : ''); }).join('')
        + '<div class="su-stack">' + big('✓', T.saveOffer, '', false, 'offerSave') + '</div>' + skip('offer');
    } else if (s === 'happy') { x = C.happyHour ? yesNo('happy', T.happyQ, '', T.happyYes) : '';
    } else if (s === 'happy:yes' || s === 'specials:yes') {
      var hk = p[0];
      x = q(T.howQ, T.howLead) + '<div class="su-stack">' + big('📄', hk === 'happy' ? T.happyUp : T.specialsUp, T.upSub, false, 'go:' + hk + ':sheet') + big('📷', hk === 'happy' ? T.happyPhoto : T.specialsPhoto, T.photoSub, true, 'sheetCamGo:' + hk)
        + big('🌐', hk === 'happy' ? T.happyWeb : T.specialsWeb, '', true, 'go:' + hk + ':web') + big('✎', hk === 'happy' ? T.happyType : T.specialsType, hk === 'happy' ? T.happyTypeSub : T.specialsTypeSub, true, 'go:' + hk + ':type') + '</div>';
    } else if (s === 'happy:type') {
      if (!S.happy.length) S.happy.push({ days: { mon: true, tue: true, wed: true, thu: true, fri: true }, from: '15:00', to: '17:00', what: '' });
      x = q(T.happyTypeQ, T.happyTypeLead) + msgs() + S.happy.map(function(e, i){
        return '<div class="su-day"><div class="su-dh"><span>' + h(fill(T.happyN, { n: i + 1 })) + '</span>' + (S.happy.length > 1 ? '<button type="button" class="su-toggle" data-rm="happy:' + i + '">' + h(T.remove) + '</button>' : '') + '</div>'
          + '<p class="su-q">' + h(T.whichDays) + '</p>' + dayChips(e.days, 'happy.' + i) + '<p class="su-q">' + h(T.whatTime) + '</p><div class="su-times"><label class="su-sr" for="hf' + i + '">' + h(T.starts) + '</label><input type="time" id="hf' + i + '" data-hh="' + i + ':from" value="' + e.from + '"> ' + h(T.to) + ' <label class="su-sr" for="ht' + i + '">' + h(T.ends) + '</label><input type="time" id="ht' + i + '" data-hh="' + i + ':to" value="' + e.to + '"></div>'
          + field('hw' + i, T.whatsOn, e.what, { max: 60, data: 'data-hh="' + i + ':what" placeholder="' + h(T.whatsOnEx) + '"' }) + '</div>';
      }).join('') + ex(T.happyEx) + (S.happy.length < 6 ? '<button type="button" class="su-more" data-act="add:happy">' + h(T.addHappy) + '</button>' : '') + '<div class="su-stack">' + big('✓', T.saveHappy, '', false, 'happySave') + '</div>';
    } else if (s === 'specials') { x = yesNo('specials', T.specialsQ, T.specialsLead);
    } else if (s === 'specials:type') {
      if (!S.specials.length) S.specials.push({ days: {}, text: '', price: '' });
      x = q(T.specialsTypeQ, T.upTo7) + msgs() + S.specials.map(function(e, i){
        return '<div class="su-day"><div class="su-dh"><span>' + h(fill(T.specialN, { n: i + 1 })) + '</span>' + (S.specials.length > 1 ? '<button type="button" class="su-toggle" data-rm="specials:' + i + '">' + h(T.remove) + '</button>' : '') + '</div>'
          + '<p class="su-q">' + h(T.whichDaysOr) + '</p>' + dayChips(e.days, 'specials.' + i) + field('sp' + i, T.whatIsIt, e.text, { max: 80, data: 'data-sp="' + i + ':text" placeholder="' + h(T.specialEx) + '"' })
          + field('spp' + i, T.priceIf, e.price, { max: 20, data: 'data-sp="' + i + ':price" placeholder="' + h(T.priceEx) + '"' }) + '</div>';
      }).join('') + (S.specials.length < 7 ? '<button type="button" class="su-more" data-act="add:specials">' + h(T.addSpecial) + '</button>' : '') + '<div class="su-stack">' + big('✓', T.saveSpecials, '', false, 'specialsSave') + '</div>';
    } else if (s === 'music') { x = yesNo('music', T.musicQ, T.musicLead);
    } else if (s === 'music:yes') {
      if (!S.nights.length) S.nights.push({ days: {}, kind: '', what: '' });
      x = q(T.musicTypeQ, T.upTo7) + msgs() + S.nights.map(function(e, i){
        return '<div class="su-day"><div class="su-dh"><span>' + h(fill(T.eventN, { n: i + 1 })) + '</span>' + (S.nights.length > 1 ? '<button type="button" class="su-toggle" data-rm="nights:' + i + '">' + h(T.remove) + '</button>' : '') + '</div>'
          + '<p class="su-q">' + h(T.whatEvent) + '</p><div class="su-chips">' + C.nightKinds.map(function(k){ return '<button type="button" class="su-chip" aria-pressed="' + (e.kind === k ? 'true' : 'false') + '" data-kind="' + i + ':' + k + '">' + h(T.kinds[k]) + '</button>'; }).join('') + '</div>'
          + '<label class="su-sr" for="nt' + i + '">' + h(T.whatEvent) + '</label><input class="su-field" id="nt' + i + '" data-nt="' + i + '" type="text" maxlength="40" value="' + h(e.what) + '" placeholder="' + h(T.eventEx) + '">'
          + '<p class="su-q">' + h(T.whichNights) + '</p>' + dayChips(e.days, 'nights.' + i) + '</div>';
      }).join('') + (S.nights.length < 7 ? '<button type="button" class="su-more" data-act="add:nights">' + h(T.addEvent) + '</button>' : '') + '<div class="su-stack">' + big('✓', T.saveEvents, '', false, 'musicSave') + '</div>';
    } else if (s === 'story') {
      var L2 = S.story.length;
      x = doneLine('story') + q(T.storyQ, T.storyLead) + msgs() + '<label class="su-sr" for="suStory">' + h(T.storyLabel) + '</label><textarea class="su-field su-area" id="suStory" maxlength="1200">' + h(S.story) + '</textarea>'
        + '<p class="su-count' + (L2 >= 120 ? ' su-ok' : '') + '" id="suCount">' + h(fill(L2 >= 120 ? T.storyGood : T.storyCount, { n: L2 })) + '</p>' + ex(T.storyEx) + '<div class="su-stack">' + big('✓', T.saveThis, '', false, 'storySave') + '</div>' + skip('story');
    } else if (s === 'book') { x = yesNo('book', T.bookQ, '', T.bookYes);
    } else if (s === 'book:yes' || s === 'takeout:yes' || s === 'groups:yes' || s === 'known') {
      var cfg = { 'book:yes': ['reservations', T.bookHowQ, '', T.bookEx], 'takeout:yes': ['takeout', T.takeoutHowQ, '', T.takeoutEx], 'groups:yes': ['groups', T.groupsHowQ, '', T.groupsEx], known: ['known_for', T.knownQ, T.knownLead, T.knownEx] }[s];
      x = (s === 'known' ? doneLine('known') : '') + q(cfg[1], cfg[2]) + msgs() + '<label class="su-sr" for="suLine">' + h(cfg[1]) + '</label><textarea class="su-field su-line" id="suLine" maxlength="180" rows="2">' + h(S.visit[cfg[0]] || '') + '</textarea>' + ex(cfg[3])
        + '<div class="su-stack">' + big('✓', T.saveThis, '', false, 'lineSave:' + base(s) + ':' + cfg[0]) + '</div>' + (s === 'known' ? skip('known') : '');
    } else if (s === 'takeout') { x = yesNo('takeout', T.takeoutQ);
    } else if (s === 'groups') { x = yesNo('groups', T.groupsQ);
    } else if (s === 'instagram' || s === 'facebook') {
      var ig = s === 'instagram';
      x = doneLine(s) + q(ig ? T.igQ : T.fbQ, ig ? fill(T.igLead, { handle: C.handle }) : T.fbLead) + msgs() + '<label class="su-sr" for="suSoc">' + h(ig ? T.igLabel : T.fbLabel) + '</label><input class="su-field" id="suSoc" type="text" autocapitalize="none" autocomplete="off" value="' + h(ig ? S.ig : S.fb) + '">'
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
      var sc = S.score || { pct: 0, soon: 0, badge: 'none' }, left = STEPS.filter(function(k){ return !S.done[k] || S.done[k] === 'skip' || S.done[k] === 'later'; });
      x = '<div class="su-saved" style="padding-top:4px"><h1>' + h(T.finishQ) + '</h1></div>'
        + '<div class="su-score"><div class="su-ring" style="background:conic-gradient(#1E4F4C ' + sc.pct + '%, #C9A34A 0 ' + Math.max(sc.pct, sc.soon) + '%, #E5DED2 0)"><b>' + sc.pct + '%</b></div><div><strong>' + h(fill(T.pctNow, { n: sc.pct })) + '</strong><span>'
        + h(sc.soon > sc.pct ? fill(T.pctSoon, { n: sc.soon }) : sc.pct >= 100 ? T.pctDone : T.niceWork) + '</span></div></div>'
        + '<p class="su-badge-line">' + C.badgeChip + ' ' + h(sc.badge === 'earned' ? T.badgeEarned : sc.badge === 'paused' ? T.badgePaused : T.badgeEarn) + '</p>'
        + (left.length ? '<h2 class="su-h2">' + h(T.toReach) + '</h2><div class="su-stack">' + left.map(function(k){ return big('➜', T.labels[k], S.done[k] === 'later' ? T.laterSub : '', true, 'jump:' + k); }).join('') + '</div>' : '')
        + '<p class="su-lead" style="margin-top:20px">' + h(T.howLooks) + '</p>'
        + '<div class="su-preview">' + (S.mainSrc || C.image ? '<img src="' + h(S.mainSrc || C.image) + '" alt="">' : '') + '<div><strong>' + h(C.name) + '</strong><p>' + h([S.cuis.length ? S.cuis.map(function(c){ return C.cuisineNames[c] || c; }).join(' · ') : C.typeLabel, C.regionLabel, S.done.spend ? fill(T.aPerson, { n: S.spend }) : ''].filter(Boolean).join(' · ')) + '</p></div></div>'
        + '<div class="su-stack"><a class="su-big" href="' + h(C.pageHref) + '" target="_blank" rel="noopener"><span class="su-ico" aria-hidden="true">↗</span><span>' + h(T.seePage) + '</span></a>'
        + '<a class="su-big su-alt" href="' + h(C.back) + '"><span class="su-ico" aria-hidden="true">←</span><span>' + h(T.backSettings) + '</span></a></div>';
    }
    screen.innerHTML = x;
    wire();
    var e2 = screen.querySelector('.su-error');
    if (e2) { e2.setAttribute('tabindex', '-1'); try { e2.focus({ preventScroll: true }); } catch (e) {} e2.scrollIntoView({ block: 'center' }); }
    if (S.step === 'door:pin') doorMap();
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
        return progress('photos', 'day').then(function(){ S.busy = false; go('saved:photos'); });
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
        if (j && j.ok) { items.length = 0; return progress(step, 'day').then(function(){ S.busy = false; go('saved:' + step); }); }
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
    post(C.base + '/arrival', b).then(function(j){ if (j && j.ok) return progress('door', j.live ? 'live' : 'day').then(function(){ S.busy = false; go('saved:door'); }); S.busy = false; S.error = why(j); render(); });
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
    list.push({ happy_hour: week, happy_hour_deals: deals.length ? { deals: deals.slice(0, 6), deals_fr: [] } : null });
    saveAll('happy', list);
  }
  function readEntries(){
    Array.prototype.forEach.call(screen.querySelectorAll('[data-hh]'), function(inp){ var q2 = inp.getAttribute('data-hh').split(':'); S.happy[+q2[0]][q2[1]] = inp.value; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-sp]'), function(inp){ var q2 = inp.getAttribute('data-sp').split(':'); S.specials[+q2[0]][q2[1]] = inp.value; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-nt]'), function(inp){ S.nights[+inp.getAttribute('data-nt')].what = inp.value; });
  }
  function specialsSave(){
    readEntries(); var out = [];
    for (var i = 0; i < S.specials.length; i++) {
      var e = S.specials[i], ds = DAYS.filter(function(d){ return e.days[d]; }), text = e.text.trim();
      if (!ds.length) { S.nudge = T.needDays; return render(); }
      if (!text) { S.nudge = T.needText; return render(); }
      out.push({ days: ds, title: text.split(',')[0].trim().slice(0, 40), deal: text.slice(0, 80), price: e.price.trim() || null, kind: C.servesAlcohol ? 'both' : 'food' });
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
      out.push({ days: ds, kind: e.kind || 'other', title: title.slice(0, 40), frequency: 'weekly' });
    }
    var list = []; if (S.notOffered.indexOf('entertainment') >= 0) list.push({ not_offered: S.notOffered.filter(function(k){ return k !== 'entertainment'; }) });
    list.push({ weekly_nights: out }); saveAll('music', list);
  }
  // "No" answers: clear what the page shows, then say "we don't have one" where the checklist has one.
  function sayNo(step){
    var noKey = { happy: 'happy_hour', specials: 'specials', music: 'entertainment', book: 'pyv_reservations', takeout: 'pyv_takeout', instagram: 'instagram', facebook: 'facebook' }[step];
    var clear = {
      happy: CUR.happy_hour || CUR.happy_hour_deals || (CUR.badges || {}).happy_hour ? { happy_hour: null, happy_hour_deals: null, badges: { happy_hour: false } } : null,
      specials: (CUR.specials || []).length ? { specials: null } : null,
      music: (CUR.weekly_nights || []).length || (CUR.badges || {}).live_music ? { weekly_nights: null, badges: { live_music: false } } : null,
      book: S.visit.reservations || S.badges.takes_reservations ? Object.assign(S.visit.reservations ? { visit_rows: { reservations: '' } } : {}, S.badges.takes_reservations ? { badges: { takes_reservations: false } } : {}) : null,
      takeout: S.visit.takeout || S.badges.takeout ? Object.assign(S.visit.takeout ? { visit_rows: { takeout: '' } } : {}, S.badges.takeout ? { badges: { takeout: false } } : {}) : null,
      groups: S.visit.groups ? { visit_rows: { groups: '' } } : null,
      instagram: CUR.instagram_url ? { instagram_url: '' } : null,
      facebook: CUR.facebook_url ? { facebook_url: '' } : null,
    }[step];
    var list = []; if (clear) list.push(clear); if (noKey) list.push({ not_offered: addNot(noKey) });
    if (step === 'book') S.badges.takes_reservations = false; if (step === 'takeout') S.badges.takeout = false;
    if (!list.length) return progress(step, 'live').then(function(){ go('saved:' + step); });
    saveAll(step, list, 'live');
  }

  // ---------- Wiring ----------
  function act(a){
    var p = a.split(':'), k = p[0], v = p.slice(1).join(':');
    if (k === 'go') return go(v);
    if (k === 'skip') return progress(v, 'skip').then(function(){ after(v); });
    if (k === 'later') return progress(v, 'later').then(function(){ go('saved:' + v); });
    if (k === 'after') return after(v);
    if (k === 'resume') { var f = firstOpen(); return go(f); }
    if (k === 'jump') { S.toFinish = true; return go(v); }
    if (k === 'no') return sayNo(v);
    if (k === 'basicsOk') return progress('basics', 'live').then(function(){ go('saved:basics'); });
    if (k === 'basicsSave') { S.addr = el('suAddr').value; S.phone = el('suPhone').value; var ch = {}; if (S.addr.trim() !== (CUR.address || '')) ch.address = S.addr; if (S.phone.trim() !== (CUR.phone || '')) ch.phone = S.phone; if (!Object.keys(ch).length) { S.nudge = T.noChange; return render(); } return saveAll('basics', [ch]); }
    if (k === 'hoursOk') return saveAll('hours', [{ hours_checked: true }]);
    if (k === 'hoursSave') return hoursSave();
    if (k === 'winter') { readTimes(); S.winter.on = !S.winter.on; return render(); }
    if (k === 'seasonAll') return saveAll('season', [{ open_months: '' }]);
    if (k === 'seasonSave') { var r = monthRun(S.months); if (r.none) { S.nudge = T.monthsNeed; return render(); } if (r.bad) { S.nudge = T.monthsInRow; return render(); } return saveAll('season', [{ open_months: r.all ? '' : r.a + '-' + r.b }]); }
    if (k === 'closuresNone' || k === 'closuresSave') {
      var out = k === 'closuresNone' ? S.extra.slice() : HOL.filter(function(o){ return S.closures.indexOf(o.key) >= 0; }).map(function(o){ return { from: o.date, to: o.date, note: T.holidays[o.key].replace(/[()&<>]/g, '') }; }).concat(S.extra);
      if (k === 'closuresNone') out = S.extra.slice();
      return saveAll('closures', [{ closures: out }]);
    }
    if (k === 'closureAdd') { var cf = el('suCf').value, ct = el('suCt').value, cn = el('suCn').value.trim(); if (!cf) { S.nudge = T.needFirst; return render(); } S.extra.push({ from: cf, to: ct || cf, note: cn.replace(/[()&<>]/g, '').slice(0, 60) }); S.step = S.hist.pop() || 'closures'; S.nudge = ''; return render(); }
    if (k === 'spend') { S.spend = Math.max(5, Math.min(300, S.spend + (+v))); return render(); }
    if (k === 'spendSave') return saveAll('spend', [{ avg_spend: S.spend }]);
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
    if (k === 'menuEmailDone') return progress('menu', 'email').then(function(){ go('saved:menu'); });
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
        .then(function(j){ if (j && j.ok) return progress(v, 'day').then(function(){ S.busy = false; S.webUrl = null; go('saved:' + v); }); S.busy = false; S.error = why(j); render(); });
    }
    if (k === 'offerSave') {
      var dn = el('suDog'); if (dn) S.dogNote = dn.value;
      var badges = {}; C.offerGroups.forEach(function(g){ g.keys.forEach(function(b){ badges[b] = !!S.badges[b]; }); });
      var list = [];
      // A ticked "Takes reservations" / "Takeout" replaces an earlier "we don't" answer (never both).
      var drop = []; if (badges.takes_reservations) drop.push('pyv_reservations'); if (badges.takeout) drop.push('pyv_takeout');
      if (drop.some(function(z){ return S.notOffered.indexOf(z) >= 0; })) list.push({ not_offered: S.notOffered.filter(function(z){ return drop.indexOf(z) < 0; }) });
      list.push({ badges: badges });
      var dogLine = S.badges.dog_friendly ? S.dogNote.trim() : '';
      if (dogLine !== ((CUR.visit_rows || {}).dogs || '')) list.push({ visit_rows: { dogs: dogLine } });
      return saveAll('offer', list);
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
      var list2 = []; var nk = { reservations: 'pyv_reservations', takeout: 'pyv_takeout' }[key];
      if (nk && S.notOffered.indexOf(nk) >= 0) list2.push({ not_offered: S.notOffered.filter(function(z){ return z !== nk; }) });
      list2.push({ visit_rows: vr }); return saveAll(step, list2);
    }
    if (k === 'socialSave') { var val = el('suSoc').value.trim(); if (!val) { S.nudge = fill(T.needValue, { no: v === 'instagram' ? T.igNo : T.fbNo }); return render(); } if (v === 'instagram') S.ig = val; else S.fb = val;
      var ch2 = {}; ch2[v + '_url'] = val; var list3 = []; if (S.notOffered.indexOf(v) >= 0) list3.push({ not_offered: S.notOffered.filter(function(z){ return z !== v; }) }); list3.push(ch2); return saveAll(v, list3); }
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
    Array.prototype.forEach.call(screen.querySelectorAll('[data-hol]'), function(b){ b.onclick = function(){ var k = b.getAttribute('data-hol'), i = S.closures.indexOf(k); if (i >= 0) S.closures.splice(i, 1); else S.closures.push(k); b.setAttribute('aria-pressed', i >= 0 ? 'false' : 'true'); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-xdel]'), function(b){ b.onclick = function(){ S.extra.splice(+b.getAttribute('data-xdel'), 1); render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-cui]'), function(b){ b.onclick = function(){
      var c = b.getAttribute('data-cui'), i = S.cuis.indexOf(c);
      if (i >= 0) S.cuis.splice(i, 1); else if (S.cuis.length >= 3) { S.nudge = T.upTo3; return render(); } else S.cuis.push(c);
      S.nudge = ''; var y = window.scrollY; render(); window.scrollTo(0, y);
    }; });
    var cq = el('suCq'); if (cq) { var filt = function(){ S.cuiQ = cq.value; var tq = cq.value.trim().toLowerCase(), n = 0; Array.prototype.forEach.call(screen.querySelectorAll('[data-cui]'), function(b){ var c = b.getAttribute('data-cui'), on = !tq || c.toLowerCase().indexOf(tq) >= 0 || String(C.cuisineNames[c] || '').toLowerCase().indexOf(tq) >= 0; b.hidden = !on; if (on) n++; }); el('suCuiNone').hidden = n > 0; }; cq.oninput = filt; filt(); }
    Array.prototype.forEach.call(screen.querySelectorAll('[data-place]'), function(b){ b.onclick = function(){ S.place = b.getAttribute('data-place'); S.nudge = ''; render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-off]'), function(b){ b.onclick = function(){
      var k = b.getAttribute('data-off'); S.badges[k] = !S.badges[k]; b.setAttribute('aria-pressed', S.badges[k] ? 'true' : 'false');
      if (k === 'dog_friendly') { var db2 = el('suDogBox'); db2.hidden = !S.badges[k]; if (S.badges[k]) { db2.scrollIntoView({ block: 'center' }); var di = el('suDog'); try { di.focus({ preventScroll: true }); di.setSelectionRange(di.value.length, di.value.length); } catch (e) {} } }
    }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-kind]'), function(b){ b.onclick = function(){ readEntries(); var q2 = b.getAttribute('data-kind').split(':'), e = S.nights[+q2[0]]; e.kind = q2[1]; if (!e.what) e.what = T.kinds[q2[1]]; render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-rm]'), function(b){ b.onclick = function(){ readEntries(); var q2 = b.getAttribute('data-rm').split(':'); S[q2[0]].splice(+q2[1], 1); render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-del]'), function(b){ b.onclick = function(){ S.photos.splice(+b.getAttribute('data-del'), 1); S.error = ''; if (!S.photos.length) { S.step = 'photos'; } render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-main]'), function(b){ b.onclick = function(){ var k = +b.getAttribute('data-main'); S.photos.forEach(function(ph, i){ ph.main = i === k; }); render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-fdel]'), function(b){ b.onclick = function(){ var l = S.step === 'menu:upload' ? S.menuFiles : S.sheetFiles; l.splice(+b.getAttribute('data-fdel'), 1); S.error = ''; render(); }; });
    Array.prototype.forEach.call(screen.querySelectorAll('[data-pdel]'), function(b){ b.onclick = function(){ S.menuPages.splice(+b.getAttribute('data-pdel'), 1); S.error = ''; render(); }; });
    var rt = el('suRights'); if (rt) rt.onchange = function(){ S.rights = rt.checked; if (rt.checked && S.nudge === T.needRights) { S.nudge = ''; render(); } };
    var dr = el('suDoorRights'); if (dr) dr.onchange = function(){ S.door.rights = dr.checked; if (dr.checked && S.nudge === T.doorRightsNeed) { S.nudge = ''; render(); } };
    var st = el('suStory'); if (st) st.oninput = function(){ S.story = st.value; var n = st.value.length, c = el('suCount'); c.textContent = fill(n >= 120 ? T.storyGood : T.storyCount, { n: n }); c.className = 'su-count' + (n >= 120 ? ' su-ok' : ''); };
    // Text never gets wiped: the cursor goes to the end of what's there.
    Array.prototype.forEach.call(screen.querySelectorAll('input[type=text], input[type=tel], input[type=search], textarea'), function(inp){ inp.addEventListener('focus', function(){ var n = inp.value.length; setTimeout(function(){ try { inp.setSelectionRange(n, n); } catch (e) {} }, 0); }); });
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
  if (STEPS.indexOf(startAt) >= 0) { S.hist = ['start']; S.step = startAt; }
  render();
  window.addEventListener('beforeunload', function(e){ if (S.busy || S.photos.length || S.menuFiles.length || S.menuPages.length || S.sheetFiles.length) { e.preventDefault(); e.returnValue = ''; } });
})();
