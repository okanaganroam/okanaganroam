'use strict';
// Build My Trip travel agent chat, the page side (2026-11-22, Dayton; server side in trip-chat.js).
//
// On top of the V4 plan view, only with d.chat (TRIP_CHAT=on, or the /trip?chat=1 preview). After the first plan, the
// sticky bar at the bottom gets a chat bar like a messaging app: "Tell me what to change…", three tap-chips (Cheaper,
// More for kids, Slower pace) until the first message, then the last exchange (what they said, our short reply, Undo).
// The plan stays on screen; the stops that changed glow for ~2 s and scroll into view. Swap ⇄ and Remove ✕ stay.
// One fixed region at the bottom: the chat sits above Confirm / Book / Share in the same bar, so nothing covers anything.
// The chat stays open after Confirm too (Dayton, 2026-11-22: "there is no ai chat box now"): a slim box above Book /
// Share / Save, no chips; a change sent then un-confirms the plan as before. Only Save's Replace / Add question hides it.

const CHAT_STYLES = `<style>
  /* Travel agent chat (2026-11-22), inside the V4 sticky bar. */
  .t3-v4 .v4-chat { margin: 0 0 8px; }
  .t3-v4 .v4-bar.v4-chat-off .v4-chat { display: none; }
  .t3-v4 .v4-bar.is-confirmed .v4-chips { display: none; } /* after Confirm: just the box, Book / Share / Save under it */
  .t3-v4 .v4-bar.has-chat { background: #fff; }
  .t3-v4 .v4-bar.has-chat .v4-disc { display: none; }
  .t3-v4 .v4-bar.has-chat [data-v4-confirm] { min-height: 44px; }
  .t3-v4 .v4-chat-reply { margin: 0 0 8px; font-size: 0.86rem; line-height: 1.35; max-height: 7em; overflow-y: auto; }
  .t3-v4 .v4-chat-reply[hidden] { display: none; }
  .t3-v4 .v4-chat-you { margin: 0; font-weight: 700; color: var(--ref-navy-muted, #56636E); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .t3-v4 .v4-chat-agent { margin: 2px 0 0; font-weight: 700; color: var(--ref-navy); overflow-wrap: anywhere; }
  .t3-v4 .v4-chat.is-busy .v4-chat-agent { color: var(--ref-navy-muted, #56636E); font-style: italic; }
  .t3-v4 .v4-chat-undo { border: 0; background: none; padding: 6px 4px; margin: -6px 0; min-height: 0; font: inherit; font-weight: 800; color: var(--ref-navy); text-decoration: underline; cursor: pointer; }
  .t3-v4 .v4-chat-form { display: flex; gap: 8px; margin: 0; }
  .t3-v4 .v4-chat-form input { flex: 1; min-width: 0; min-height: 46px; box-sizing: border-box; padding: 0 16px; border-radius: 999px; border: 1px solid rgba(27,43,58,0.28); background: #fff; color: var(--ref-navy); font: inherit; font-size: 16px; }
  .t3-v4 .v4-chat-form input:focus { outline: 2px solid var(--ref-navy); outline-offset: 1px; }
  .t3-v4 .v4-chat-send { flex: none; width: 46px; height: 46px; border-radius: 999px; border: 0; background: var(--ref-navy); color: #fff; font-size: 1.2rem; font-weight: 800; cursor: pointer; }
  .t3-v4 .v4-chat.is-busy .v4-chat-send, .t3-v4 .v4-chat.is-busy input { opacity: 0.55; }
  .t3-v4 .v4-chips { display: flex; gap: 6px; margin: 8px 0 0; overflow-x: auto; scrollbar-width: none; }
  .t3-v4 .v4-chips::-webkit-scrollbar { display: none; }
  .t3-v4 .v4-chips[hidden] { display: none; }
  .t3-v4 .v4-chips button { flex: none; min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid rgba(27,43,58,0.2); background: var(--ref-cream, #F5F3ED); color: var(--ref-navy); font-weight: 800; font-size: 0.8rem; cursor: pointer; }
  .t3-v4 .v4-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .t3-v4 .v4-stop { scroll-margin: 90px 0 240px; }
  .t3-v4 .v4-stop.v4-glow, .t3-v4 .v4-card.v4-glow { animation: v4glow 2.2s ease-out; }
  @keyframes v4glow { 0%, 45% { background: rgba(201,162,39,0.30); box-shadow: inset 4px 0 0 var(--ref-gold, #C9A227); } 100% { background: transparent; box-shadow: inset 0 0 0 transparent; } }
  @media (prefers-reduced-motion: reduce) { .t3-v4 .v4-stop.v4-glow { animation: none; background: rgba(201,162,39,0.18); } }
  /* Agent round (2026-11-22, Dayton: "it works but it isn't that user friendly"): the agent speaks first and above the
     plan; the place to stay and getting here are in the plan; the bar is the chat (Confirm is at the end of the plan). */
  .t3-v4.v4-chat-mode .v4-edit, .t3-v4.v4-chat-mode .v4-tip:not(.v4-picked), .t3-v4.v4-chat-mode .t3-editbar { display: none !important; }
  .t3-v4.v4-chat-mode .t3-lead, .t3-v4.v4-chat-mode .t3-hint, .t3-v4.v4-chat-mode #t3StayIn, .t3-v4.v4-chat-mode .t3-examples-label { display: none; }
  .t3-v4.v4-chat-mode .t3-examples .t3-example:nth-of-type(n+5) { display: none; }
  .t3-v4 .v4-agent-hi { margin: 4px 0 12px; max-width: 34rem; padding: 12px 14px; border-radius: 18px 18px 18px 6px; background: #fff; color: var(--ref-navy); font-weight: 700; font-size: 1.02rem; line-height: 1.35; box-shadow: 0 8px 22px -18px rgba(0,0,0,0.6); }
  .t3-v4 .v4-agent-who { display: block; margin: 0 0 2px; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ref-gold-ink, #8A6A0F); }
  .t3-v4 .v4-agent { margin: 0 0 12px; padding: 10px 14px; border-radius: 18px 18px 18px 6px; background: #fff; color: var(--ref-navy); font-weight: 700; font-size: 0.95rem; line-height: 1.4; box-shadow: 0 8px 22px -18px rgba(0,0,0,0.6); }
  .t3-v4 .v4-agent p { margin: 0; }
  .t3-v4 .v4-ask { margin: 10px 0 0; }
  .t3-v4 .v4-ask-q { margin: 0 0 6px; }
  .t3-v4 .v4-ask-btns { display: flex; flex-wrap: wrap; gap: 6px; }
  .t3-v4 .v4-ask-btns button { min-height: 38px; padding: 0 12px; border-radius: 999px; border: 1px solid rgba(27,43,58,0.22); background: var(--ref-cream, #F5F3ED); color: var(--ref-navy); font-weight: 800; font-size: 0.84rem; cursor: pointer; }
  .t3-v4 .v4-ask-dates { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 0 0; }
  .t3-v4 .v4-ask-dates input { min-height: 40px; font: inherit; font-size: 16px; border: 1px solid rgba(27,43,58,0.25); border-radius: 10px; padding: 0 8px; }
  .t3-v4 .v4-card { margin: 0 0 14px; background: #fff; border-radius: 16px; padding: 12px; box-shadow: 0 1px 0 rgba(27,43,58,0.06), 0 8px 24px -18px rgba(16,27,36,0.35); }
  .t3-v4 .v4-card-h { margin: 0 0 8px; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ref-navy-muted, #56636E); }
  .t3-v4 .v4-stay-row { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 12px; align-items: center; }
  .t3-v4 .v4-stay-img { width: 64px; height: 64px; border-radius: 12px; object-fit: cover; display: block; background: var(--ref-cream-deep, #EAE6D9); }
  .t3-v4 .v4-stay-name { display: block; font-weight: 800; font-size: 1rem; line-height: 1.25; color: var(--ref-navy); overflow-wrap: anywhere; }
  .t3-v4 .v4-stay-facts { display: block; margin-top: 2px; font-size: 0.82rem; color: var(--ref-navy-muted, #56636E); }
  .t3-v4 .v4-stay-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 10px 0 0; }
  .t3-v4 .v4-stay-acts .v4-btn { min-height: 42px; padding: 0 16px; font-size: 0.9rem; }
  .t3-v4 .v4-link { border: 0; background: none; padding: 0; min-height: 40px; font: inherit; font-weight: 800; font-size: 0.86rem; color: var(--ref-navy); text-decoration: underline; cursor: pointer; }
  .t3-v4 .v4-stay-alts { list-style: none; margin: 8px 0 0; padding: 0; border-top: 1px solid rgba(27,43,58,0.08); }
  .t3-v4 .v4-stay-alts li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 0; font-size: 0.86rem; }
  .t3-v4 .v4-stay-alts b { display: block; }
  .t3-v4 .v4-disc-line { margin: 8px 0 0; font-size: 0.72rem; line-height: 1.35; color: var(--ref-navy-muted, #56636E); }
  .t3-v4 .v4-gh-row { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 2px 12px; font-size: 0.9rem; font-weight: 700; color: var(--ref-navy); }
  .t3-v4 .v4-gh-row + .v4-gh-row { margin-top: 6px; }
  .t3-v4 .v4-gh-row a { font-weight: 800; color: var(--ref-navy); white-space: nowrap; min-height: 32px; display: inline-flex; align-items: center; }
  .t3-v4 .v4-confirm-end { margin: 18px 0 6px; text-align: center; }
  .t3-v4 .v4-bar.has-chat:not(.is-confirmed) .v4-bar-main { display: none; }
  /* Fix round (2026-11-22): after Confirm the last reply is one line, the price line is short, the toast sits above the bar. */
  .t3-v4 .v4-bar.has-chat.is-confirmed .v4-chat-you { display: none; }
  .t3-v4 .v4-bar.has-chat.is-confirmed .v4-chat-agent { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .t3-v4 .v4-bar.has-chat.is-confirmed .v4-chat-reply { margin: 0 0 6px; }
  .t3-v4 .v4-bar.has-chat .v4-bar-top { margin: 0 0 6px; }
  .t3-v4 .v4-bar.has-chat .v4-est { visibility: hidden; height: 0; } /* the estimate is in the Book sheet */
  .t3-v4 .v4-bar.has-chat .v4-bar-top { justify-content: flex-end; margin: -4px 0 2px; }
  .t3-v4 .v4-bar.has-chat .v4-est small { display: none; }
  .t3-v4.v4-chat-mode .v4-toast { bottom: calc(var(--v4-bar-h, 160px) + 12px); }
  .t3-v4 .v4-bar.has-chat:not(.is-confirmed) .v4-chat { margin: 0; }
</style>`;

// Browser code, inside the V3 page script after V4_CLIENT_SRC (same scope: state, render, syncUrl, v4, v4UpdateBar...).
// "This weekend" (fix round 2026-11-22: on a Sunday it meant today to Monday): Friday or Saturday count from today; any
// other day is the coming Saturday. The stay is the plan's nights (days - 1, at least one). Shared with the tests.
function chatWeekendDates(now, planDays) {
  var wd = now.getDay(), add = wd === 5 || wd === 6 ? 0 : (6 - wd + 7) % 7;
  var a = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add), n = Math.max(1, (planDays || 2) - 1);
  var b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + n);
  var iso = function(x){ return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  return [iso(a), iso(b)];
}
function chatClientSrc(d) {
  const qs = [d.stays === 'preview' ? 'stays=1' : '', d.v4 ? 'v=4' : '', d.chat === 'preview' ? 'chat=1' : ''].filter(Boolean).join('&');
  return String.raw`
  // ---------- Travel agent chat (trip-chat-page.js) ----------
  var CHAT_URL = '/api/trip/chat${qs ? `?${qs}` : ''}';
  var CHAT_T = {
    en: { label: 'Tell us what to change', ph: 'Tell me what to change…', send: 'Send', thinking: 'Thinking…', undo: 'Undo', undone: 'Undone. Your plan is back.', err: 'Something went wrong. Your plan is unchanged.', you: 'You: ',
      chips: [['cheaper', 'Cheaper'], ['kids', 'More for kids'], ['slower', 'Slower pace']] },
    fr: { label: 'Dites-nous quoi changer', ph: 'Dites-moi quoi changer…', send: 'Envoyer', thinking: 'Je regarde…', undo: 'Annuler', undone: 'Annulé. Votre plan est revenu.', err: 'Un problème est survenu. Votre plan n’a pas changé.', you: 'Vous : ',
      chips: [['cheaper', 'Moins cher'], ['kids', 'Plus pour les enfants'], ['slower', 'Plus relax']] }
  };
  var chat = { busy: false, undo: null, used: false };
  function ct(k){ return (CHAT_T[lang()] || CHAT_T.en)[k]; }
  function v4ChatHtml(){
    return '<div class="v4-chat-reply" id="v4ChatReply" role="status" aria-live="polite" hidden><p class="v4-chat-you"></p><p class="v4-chat-agent"><span></span> <button type="button" class="v4-chat-undo" data-v4-chat-undo hidden>' + esc(ct('undo')) + '</button></p></div>'
      + '<form class="v4-chat-form" id="v4ChatForm" autocomplete="off"><label class="v4-sr" for="v4ChatIn">' + esc(ct('label')) + '</label>'
      + '<input id="v4ChatIn" type="text" maxlength="400" enterkeyhint="send" placeholder="' + esc(ct('ph')) + '">'
      + '<button type="submit" class="v4-chat-send" aria-label="' + esc(ct('send')) + '">↑</button></form>'
      + '<div class="v4-chips" id="v4Chips"' + (chat.used ? ' hidden' : '') + '>' + ct('chips').map(function(c){ return '<button type="button" data-v4-chip="' + c[0] + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>';
  }
  // Called by v4UpdateBar: the chat part is made once and kept (what is typed survives every re-render of the bar).
  function v4ChatMount(bar){
    var box = document.getElementById('v4Chat');
    if (!box || box.parentNode !== bar) {
      bar.innerHTML = '';
      box = document.createElement('div'); box.id = 'v4Chat'; box.className = 'v4-chat'; box.innerHTML = v4ChatHtml();
      var main = document.createElement('div'); main.className = 'v4-bar-main';
      bar.appendChild(box); bar.appendChild(main);
    }
    bar.classList.add('has-chat');
    // Hidden only while Save asks Replace / Add; after Confirm the travel agent stays one tap away.
    bar.classList.toggle('v4-chat-off', !!v4.ask);
    bar.classList.toggle('is-confirmed', !!(v4.confirmed || v4.ask));
    setTimeout(chatPad, 0); // the bar's height for the toast (it sits above the bar)
    // Fix round (2026-11-22): Confirm updates the agent's line without a re-render.
    var agentP = document.querySelector('#v4Agent p'); if (agentP && v4.confirmed && typeof ag === 'function') { agentP.textContent = ag('ready'); var ask = document.querySelector('#v4Agent .v4-ask'); if (ask) ask.hidden = true; }
    return bar.querySelector('.v4-bar-main');
  }
  function chatPad(){ var bar = document.getElementById('v4Bar'); if (bar) { document.body.style.paddingBottom = bar.offsetHeight + 'px'; document.documentElement.style.setProperty('--v4-bar-h', bar.offsetHeight + 'px'); } }
  function chatShow(you, agent, opts){
    opts = opts || {};
    var box = document.getElementById('v4ChatReply'); if (!box) return;
    box.hidden = false;
    box.querySelector('.v4-chat-you').textContent = you ? ct('you') + you : '';
    box.querySelector('.v4-chat-agent span').textContent = agent || '';
    var u = box.querySelector('[data-v4-chat-undo]'); if (u) u.hidden = !opts.undo;
    var chips = document.getElementById('v4Chips'); if (chips && chat.used) chips.hidden = true;
    var c = document.getElementById('v4Chat'); if (c) c.classList.toggle('is-busy', !!opts.busy);
    chatPad();
  }
  function chatStart(day, id){
    var rows = (state.last && state.last.schedule) || [];
    for (var i = 0; i < rows.length; i++) if ((day === null || rows[i].day === day) && rows[i].venueId === id && typeof rows[i].startMinutes === 'number') return Math.round(rows[i].startMinutes);
    return null;
  }
  // The stops on screen: slot, venue id and start only (the server names them from our own listings).
  function chatStops(){
    var out = [];
    if (days().length) days().forEach(function(d){ d.stops.forEach(function(s){ var k = d.day + '-' + s.daypart; if (s.venue && !state.removed[k]) out.push({ key: k, id: s.venue.id, start: chatStart(d.day, s.venue.id) }); }); });
    else shortStops().forEach(function(s, i){ if (s.venue && s.kind !== 'event' && !v4.gone[s.venue.id]) out.push({ key: 'it-' + i, id: s.venue.id, start: chatStart(null, s.venue.id) }); });
    return out.slice(0, 40).map(function(x){ if (x.start === null) delete x.start; return x; });
  }
  // The same request fields as request() sends for the plan on screen.
  function chatPlanBody(){
    var body = { text: state.text, seed: state.seed, excludeVenueIds: state.exclude.slice(-200) };
    var o = state.overrides, ov = {};
    ['days', 'pace', 'baseRegion', 'budgetMode', 'durationMinutes', 'startDate', 'startMinutes', 'dayStartMinutes', 'shortWalkVenueIds', 'eventId'].forEach(function(k){ if (o[k] !== undefined) ov[k] = o[k]; });
    if (Object.keys(ov).length) body.overrides = ov;
    if (state.lastReq && (state.lastReq.avoid || []).length) body.avoidVenueIds = state.lastReq.avoid.slice(0, 200);
    if (typeof t3StayInput === 'function') { var st = t3StayInput(); if (st) body.stay = st; }
    return body;
  }
  function chatSnapshot(){ return JSON.stringify({ last: state.last, lastReq: state.lastReq, text: state.text, seed: state.seed, overrides: state.overrides, locks: state.locks, exclude: state.exclude, removed: state.removed, gone: v4.gone, stayPref: chat.stayPref, noStay: chat.noStay, transport: chat.transport }); }
  function chatRestore(snap){
    var o = JSON.parse(snap);
    state.last = o.last; state.lastReq = o.lastReq; state.text = o.text; state.seed = o.seed; state.overrides = o.overrides || {}; state.locks = o.locks || {}; state.exclude = o.exclude || []; state.removed = o.removed || {}; v4.gone = o.gone || {};
    chat.stayPref = o.stayPref; chat.noStay = !!o.noStay; chat.transport = o.transport || null;
    v4.confirmed = false; v4.saved = false;
    chat.rendering = true; try { render(false); } finally { chat.rendering = false; } syncUrl();
  }
  function chatRow(key){
    if (key === 'gh') return resultEl.querySelector('.v4-gh');
    if (key === 'stay') return resultEl.querySelector('.v4-stay-card');
    if (/^it-\d+$/.test(key)) { var s = shortStops()[Number(key.slice(3))]; return s && s.venue ? resultEl.querySelector('.v4-stop[data-venue-id="' + s.venue.id + '"]') : null; }
    var b = resultEl.querySelector('[data-t3-swap="' + key + '"], [data-t3-remove="' + key + '"], [data-t3-undo="' + key + '"]');
    return b ? b.closest('.v4-stop') : null;
  }
  function chatGlow(keys){
    var rows = [];
    keys.forEach(function(k){ var r = chatRow(k); if (r && rows.indexOf(r) === -1) rows.push(r); });
    rows.forEach(function(r){ r.classList.remove('v4-glow'); void r.offsetWidth; r.classList.add('v4-glow'); setTimeout(function(){ r.classList.remove('v4-glow'); }, 2400); });
    if (rows[0]) { try { rows[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { rows[0].scrollIntoView(); } }
  }
  function chatSend(message, chip, label){
    if (chat.busy || !state.last) return;
    var snap = chatSnapshot(), you = message || label || '';
    chat.busy = true; chat.used = true;
    if (window.__roamTripFunnel) window.__roamTripFunnel.step('chat');
    chatShow(you, ct('thinking'), { busy: true });
    resultEl.setAttribute('aria-busy', 'true');
    var inEl = document.getElementById('v4ChatIn'); if (inEl) inEl.disabled = true;
    var body = { lang: lang() === 'fr' ? 'fr' : 'en', plan: chatPlanBody(), locks: state.locks, removed: Object.keys(state.removed), stops: chatStops() };
    if (chip) body.chip = chip; else body.message = message;
    function done(){ chat.busy = false; resultEl.removeAttribute('aria-busy'); if (inEl) { inEl.disabled = false; } }
    return fetch(CHAT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function(r){ return r.json().catch(function(){ return {}; }); })
      .then(function(j){
        done();
        j = j || {};
        var acts = j.actions || {}, changed = (j.changed || []).slice(), touched = false;
        // Fix round (2026-11-22): a new plan only when a stop changed ("The plan already fits that" changes nothing and
        // shows no Undo); the place to stay alone comes back as stayBlock and never touches the stops.
        if (j.plan && j.req && changed.length) {
          state.text = j.req.text; state.seed = j.req.seed; state.overrides = j.req.overrides || {}; state.exclude = (j.req.excludeVenueIds || []).slice(); state.locks = j.req.locks || {};
          state.removed = {}; v4.gone = {}; state.last = j.plan;
          state.lastReq = { seed: j.req.seed, overrides: j.req.overrides || {}, exclude: (j.req.excludeVenueIds || []).slice(), pinned: j.req.pinned || null, avoid: j.req.avoidVenueIds || [] };
          touched = true;
        }
        // Remove and keep: the same as the Remove ✕ button and a kept stop (no new plan needed).
        (acts.remove || []).forEach(function(k){
          if (/^it-\d+$/.test(k)) { var s = shortStops()[Number(k.slice(3))]; if (s && s.venue) { v4.gone[s.venue.id] = 1; touched = true; } return; }
          var rs = stopAt(k); if (!rs) return;
          state.removed[k] = rs.venue.id; delete state.locks[k];
          if (state.exclude.indexOf(rs.venue.id) === -1) state.exclude.push(rs.venue.id);
          touched = true; changed.push(k);
        });
        (acts.keep || []).forEach(function(k){ var ks = /^it-/.test(k) ? null : stopAt(k); if (ks) { state.locks[k] = ks.venue.id; touched = true; changed.push(k); } });
        // The place to stay and getting here (agent round): the visitor's stay preference rides along with every later
        // request (t3StayInput below); the Getting here card follows "rental car" / "driving" / "no car".
        if (j.stayBlock && state.last) {
          ['whereToStay', 'v4Booking', 'gettingHere'].forEach(function(k){ if (j.stayBlock[k]) state.last[k] = j.stayBlock[k]; else delete state.last[k]; });
          stayChoice = null; touched = true; changed.push('stay');
        }
        if (j.stayPref !== undefined) { chat.stayPref = j.stayPref; chat.noStay = !!(j.stayPref && j.stayPref.none); touched = true; if (changed.indexOf('stay') === -1) changed.push('stay'); }
        if (acts.transport) { chat.transport = acts.transport; touched = true; if (acts.transport === 'rental') changed.push('gh'); }
        if (touched) { v4.confirmed = false; v4.saved = false; chat.rendering = true; try { render(false); } finally { chat.rendering = false; } syncUrl(); }
        chat.undo = touched ? snap : null;
        chatShow(you, j.reply || ct('err'), { undo: touched });
        if (touched) chatGlow(changed);
        track('trip_chat', { chat_source: /^(ai|rules|chip)$/.test(j.source || '') ? j.source : 'other', changed: touched ? 'yes' : 'no' });
      })
      .catch(function(){ done(); chatShow(you, ct('err'), {}); });
  }
  document.addEventListener('submit', function(e){
    if (!e.target || e.target.id !== 'v4ChatForm') return;
    e.preventDefault();
    var inEl = document.getElementById('v4ChatIn'), text = inEl ? inEl.value.replace(/\s+/g, ' ').trim() : '';
    if (!text) { if (inEl) inEl.focus(); return; }
    // Fix round (2026-11-22: the next message was typed onto the last one): cleared as soon as it is sent.
    if (inEl) inEl.value = '';
    chatSend(text.slice(0, 400), null);
  });
  document.addEventListener('click', function(e){
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    var b;
    if ((b = t.closest('[data-v4-chip]'))) { chatSend(null, b.getAttribute('data-v4-chip'), b.textContent); return; }
    if ((b = t.closest('[data-v4-chat-undo]')) && chat.undo) { var snap = chat.undo; chat.undo = null; chatRestore(snap); chatShow('', ct('undone'), {}); track('trip_chat', { chat_source: 'undo', changed: 'yes' }); }
  });

  // ---------- Agent round (2026-11-22): the agent speaks; stay and getting here in the plan; Confirm at the end ----------
  var AG = {
    en: { who: 'Trip agent', hi: 'Hi! Where are you headed, and what do you love doing?', day: 'Here’s a day in {town}{for}.', days: 'Here’s a {n}-day {town} plan{for}{stay}.', plan: 'Here’s your plan{for}.', more: ' Want me to change anything?',
      fam: ' for your family', dog: ' for you and your dog', stay: ', with a place to stay', when: 'When are you coming?', weekend: 'This weekend', pick: 'Pick dates', notSure: 'Not sure yet', done: 'Done', from: 'Arrive', to: 'Leave',
      datesSet: 'Planned for {a} – {b}.', ready: 'Your trip is ready. Book it, share it, or tell me what to change.', noCarNone: 'No shuttle listed for this trip.', wine: 'Wine tour (no driving)',
      stayH: 'Where you’ll stay', rates: 'Check rates', seeMore: 'See {n} more', fewer: 'Hide', choose: 'Choose', ghH: 'Getting here', seeCars: 'See cars', book: 'Book', confirm: 'Confirm plan', sleeps: 'Sleeps {n}' },
    fr: { who: 'Agent de voyage', hi: 'Bonjour! Où allez-vous, et qu’aimez-vous faire?', day: 'Voici une journée à {town}{for}.', days: 'Voici un plan de {n} jours à {town}{for}{stay}.', plan: 'Voici votre plan{for}.', more: ' Voulez-vous changer quelque chose?',
      fam: ' pour votre famille', dog: ' pour vous et votre chien', stay: ', avec un logement', when: 'Quand venez-vous?', weekend: 'Ce week-end', pick: 'Choisir les dates', notSure: 'Pas encore sûr', done: 'OK', from: 'Arrivée', to: 'Départ',
      datesSet: 'Plan pour le {a} – {b}.', ready: 'Votre voyage est prêt. Réservez-le, partagez-le ou dites-moi quoi changer.', noCarNone: 'Aucune navette pour ce voyage.', wine: 'Tour des vignobles (sans conduire)',
      stayH: 'Où vous logerez', rates: 'Voir les tarifs', seeMore: 'Voir {n} autres', fewer: 'Masquer', choose: 'Choisir', ghH: 'Pour venir', seeCars: 'Voir les voitures', book: 'Réserver', confirm: 'Confirmer le plan', sleeps: 'Jusqu’à {n} pers.' }
  };
  function ag(k, vars){ var x = (AG[lang()] || AG.en)[k]; if (vars) Object.keys(vars).forEach(function(v){ x = x.split('{' + v + '}').join(String(vars[v])); }); return x; }
  var chatMain = document.getElementById('tripV3'); if (chatMain) chatMain.classList.add('v4-chat-mode');
  // The first screen: one message from the agent, the request box under it, four example chips.
  (function(){
    var f = document.getElementById('t3Form'); if (!f || document.getElementById('v4AgentHi')) return;
    var hi = document.createElement('p'); hi.className = 'v4-agent-hi'; hi.id = 'v4AgentHi';
    hi.innerHTML = '<span class="v4-agent-who">' + esc(ag('who')) + '</span>' + esc(ag('hi'));
    f.parentNode.insertBefore(hi, f);
    var ta = document.getElementById('t3Input'); if (ta) ta.rows = 2;
  })();
  // The visitor's stay preference ("somewhere cheaper", "with a pool", "we already have a place") goes with every request.
  var t3StayInputBase = t3StayInput;
  // "we don't have a car" / "we're driving": no "Rent a car" in the Book sheet either.
  if (typeof t3BookSteps === 'function') { var t3BookStepsBase = t3BookSteps; t3BookSteps = function(){ var l = t3BookStepsBase(); return chat.transport === 'no_car' || chat.transport === 'driving' ? l.filter(function(x){ return !(x && x.link === 'discovercars'); }) : l; }; }
  // Enter sends the first request (Shift+Enter is a new line).
  (function(){ var ta = document.getElementById('t3Input'); if (ta) ta.addEventListener('keydown', function(e){ if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); } }); })();
  // Only the page's language is read out (the other language's spans are hidden from screen readers too).
  Array.prototype.forEach.call(document.querySelectorAll(lang() === 'fr' ? '.t3 .t3-en' : '.t3 .t3-fr'), function(el){ el.setAttribute('aria-hidden', 'true'); });
  t3StayInput = function(){ var o = t3StayInputBase() || {}; if (chat.stayPref) o.pref = chat.stayPref; return Object.keys(o).length ? o : null; };
  function chatOvernight(){ var st = t3StayInputBase() || {}; return days().length > 1 || !!(st.arrive && st.leave); }
  function chatPartyFor(){
    var u = (state.last && state.last.understood) || {}, party = (u.party || []).join(' ') + ' ' + String(state.text || '');
    if (/\b(?:kids?|children|family|toddlers?|teens?|enfants?|famille)\b/i.test(party)) return ag('fam');
    if (/\b(?:dogs?|pup|chiens?)\b/i.test(party)) return ag('dog');
    return '';
  }
  function chatAgentHtml(){
    var p = state.last || {}, n = days().length, town = n ? (days()[0].regionLabel || '') : '';
    var stay = chatOvernight() && !chat.noStay && t3StayData() ? ag('stay') : '';
    var line = n > 1 ? ag('days', { n: n, town: town, for: chatPartyFor(), stay: stay }) : n === 1 && town ? ag('day', { town: town, for: chatPartyFor() }) : ag('plan', { for: chatPartyFor() });
    var html = '<div class="v4-agent" id="v4Agent"><span class="v4-agent-who">' + esc(ag('who')) + '</span><p>' + esc(v4.confirmed ? ag('ready') : line + ag('more')) + '</p>';
    // One short follow-up, with tap answers: the dates of an overnight trip, when none were given.
    var st = t3StayInputBase() || {};
    if (chatOvernight() && !st.arrive && !chat.askedWhen && !v4.confirmed) {
      html += '<div class="v4-ask"><p class="v4-ask-q">' + esc(ag('when')) + '</p><div class="v4-ask-btns"><button type="button" data-v4-when="weekend">' + esc(ag('weekend')) + '</button><button type="button" data-v4-when="pick">' + esc(ag('pick')) + '</button><button type="button" data-v4-when="later">' + esc(ag('notSure')) + '</button></div>'
        + (chat.pickDates ? '<div class="v4-ask-dates"><label>' + esc(ag('from')) + ' <input type="date" id="v4WhenA"></label><label>' + esc(ag('to')) + ' <input type="date" id="v4WhenB"></label><button type="button" class="v4-link" data-v4-when="set">' + esc(ag('done')) + '</button></div>' : '') + '</div>';
    }
    return html + '</div>';
  }
  function chatImg(u){ return typeof u === 'string' && (/^\/[^\/]/.test(u) || /^https:\/\/[^\s"'<>]+$/.test(u)) ? u : null; }
  var chatDiscShown = false;
  function chatStayHtml(){
    if (!chatOvernight() || chat.noStay) return '';
    var d = t3StayData(); if (!d) return '';
    var s = d.chosen, fr = lang() === 'fr';
    var step = (s.bookingSteps || d.w.bookingSteps || []).filter(function(x){ return x && x.kind === 'stay' && t3StayExt(x.url); })[0];
    var facts = [fr ? (s.kindFr || s.kind) : s.kind, s.regionLabel, s.priceBand, s.sleeps ? ag('sleeps', { n: s.sleeps }) : ''].filter(Boolean).join(' · ');
    var trip = t3StayTripLine(d.w.trip || {}, fr), img = chatImg(s.photo);
    var html = '<section class="v4-card v4-stay-card t3-stay" aria-label="' + esc(ag('stayH')) + '"><p class="v4-card-h">' + esc(ag('stayH')) + (trip ? ' · ' + esc(trip) : '') + '</p>'
      + '<div class="v4-stay-row">' + (img ? '<img class="v4-stay-img" src="' + esc(img) + '" alt="" width="64" height="64" loading="lazy">' : '<span class="v4-stay-img" aria-hidden="true"></span>')
      + '<div><span class="v4-stay-name">' + esc(s.name) + '</span><span class="v4-stay-facts">' + esc(facts) + '</span></div></div>'
      + '<div class="v4-stay-acts">' + (step ? t3StayLinkHtml(s, { url: step.url, rel: step.rel, key: step.link, affiliate: step.affiliate }, 'v4-btn', ag('rates')) : '')
      + (d.others.length ? '<button type="button" class="v4-link" data-v4-stay-more aria-expanded="' + (chat.stayMore ? 'true' : 'false') + '">' + esc(chat.stayMore ? ag('fewer') : ag('seeMore', { n: d.others.length })) + '</button>' : '') + '</div>';
    if (chat.stayMore && d.others.length) html += '<ul class="v4-stay-alts">' + d.others.map(function(o){ return '<li><span><b>' + esc(o.name) + '</b>' + esc([fr ? (o.kindFr || o.kind) : o.kind, o.regionLabel, o.priceBand].filter(Boolean).join(' · ')) + '</span><button type="button" class="v4-link" data-v4-stay-choose="' + esc(o.id) + '">' + esc(ag('choose')) + '</button></li>'; }).join('') + '</ul>';
    if (step && step.affiliate) { html += '<p class="v4-disc-line">' + esc(T3_STAY_DISCLOSURE[fr ? 'fr' : 'en'] || T3_STAY_DISCLOSURE.en) + '</p>'; chatDiscShown = true; }
    return html + '</section>';
  }
  function chatGhHtml(){
    var g = state.last && state.last.gettingHere;
    if (!g || !chatOvernight() || chat.transport === 'driving') return '';
    var fr = lang() === 'fr', L = fr ? 'fr' : 'en', rows = [];
    if (g.noDrive && g.wineTour && /^https:\/\//.test(g.wineTour.url)) rows.push('<div class="v4-gh-row"><span>' + esc((fr && g.wineTour.nameFr) || g.wineTour.name || ag('wine')) + '</span><a ' + hrefAttr(g.wineTour.url) + ' rel="sponsored noopener" target="_blank" data-track="booking" data-link="viator">' + esc(ag('book')) + ' <span aria-hidden="true">↗</span></a></div>');
    if (g.car && g.carLabel && chat.transport !== 'no_car') rows.push('<div class="v4-gh-row"><span>' + esc(g.carLabel[L]) + '</span><a ' + hrefAttr(g.car) + ' rel="sponsored noopener" target="_blank" data-track="booking" data-link="discovercars" data-gh-step="car-' + esc(g.airport.key) + '">' + esc(ag('seeCars')) + ' <span aria-hidden="true">↗</span></a></div>');
    (g.shuttles || []).forEach(function(x){ if (x && x.url && /^https:\/\//.test(x.url) && x.label) rows.push('<div class="v4-gh-row"><span>' + esc(x.label[L] || x.label.en) + '</span><a ' + hrefAttr(x.url) + ' rel="sponsored noopener" target="_blank" data-track="booking" data-link="viator">' + esc(ag('book')) + ' <span aria-hidden="true">↗</span></a></div>'); });
    if (!rows.length) return '';
    return '<section class="v4-card v4-gh" aria-label="' + esc(ag('ghH')) + '"><p class="v4-card-h">' + esc(ag('ghH')) + '</p>' + rows.join('') + (chatDiscShown ? '' : '<p class="v4-disc-line">' + esc(T3_STAY_DISCLOSURE[L] || T3_STAY_DISCLOSURE.en) + '</p>') + '</section>';
  }
  function chatDecorate(){
    var root = resultEl.querySelector('.v4'); if (!root) return;
    chatDiscShown = false;
    var head = root.querySelector('.v4-head');
    if (head) head.insertAdjacentHTML('beforebegin', chatAgentHtml());
    var daysEl = root.querySelector('.v4-days');
    if (daysEl) {
      daysEl.insertAdjacentHTML('beforebegin', chatStayHtml() + chatGhHtml());
      if (!v4.confirmed) daysEl.insertAdjacentHTML('afterend', '<div class="v4-confirm v4-confirm-end"><button type="button" class="v4-btn v4-wide" data-v4-confirm>' + esc(ag('confirm')) + '</button></div>');
    }
  }
  var v4RenderBase = v4Render;
  v4Render = function(focus){
    v4RenderBase(focus);
    try { chatDecorate(); } catch (e) { if (window.console) console.error('[trip chat]', e); }
    // Fix round (2026-11-22): the plan changed by the buttons or a new request -> the chat's last reply (and its Undo)
    // no longer describes it. A dates answer shows its own line once the plan is back.
    if (!chat.rendering && !chat.busy) {
      chat.undo = null;
      var box = document.getElementById('v4ChatReply');
      if (box) { if (chat.pendingNote) chatShow('', chat.pendingNote, {}); else box.hidden = true; }
      chat.pendingNote = null;
      chatPad();
    }
  };
  // "This weekend": Friday or Saturday counts from today; any other day (Sunday too) is the coming Saturday.
  ${chatWeekendDates.toString()}
  function chatWeekend(){ return chatWeekendDates(new Date(), days().length); }
  function chatSetDates(a, b){
    var ea = document.getElementById('t3Arrive'), eb = document.getElementById('t3Leave');
    if (!ea || !eb || !/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b) || b <= a) return false;
    ea.value = a; eb.value = b; chat.askedWhen = true; chat.pickDates = false;
    // The same stops (and kept stops), planned for those days (hours and the place to stay follow the dates); the agent
    // says which dates (fix round 2026-11-22: "This weekend" rebuilt the plan with no word).
    var fmt = function(x){ return new Date(x + 'T12:00:00Z').toLocaleDateString(lang() === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); };
    chat.pendingNote = ag('datesSet', { a: fmt(a), b: fmt(b) });
    var pins = currentPins([]); Object.keys(state.locks || {}).forEach(function(k){ pins[k] = state.locks[k]; });
    request({ pinned: pins }, { requestType: 'refine', focus: false });
    return true;
  }
  document.addEventListener('click', function(e){
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    var b;
    if ((b = t.closest('[data-v4-when]'))) {
      var w = b.getAttribute('data-v4-when');
      if (w === 'weekend') { var ab = chatWeekend(); chatSetDates(ab[0], ab[1]); }
      // Pick dates: the two date boxes stay on screen until Done (the date picker opens on the first tap of a box).
      else if (w === 'pick') { chat.pickDates = true; chat.rendering = true; try { render(false); } finally { chat.rendering = false; } var ia = document.getElementById('v4WhenA'); if (ia) { try { ia.scrollIntoView({ block: 'center' }); } catch (err) {} } }
      else if (w === 'set') { var A = document.getElementById('v4WhenA'), B = document.getElementById('v4WhenB'); if (A && B && !chatSetDates(A.value, B.value)) B.focus(); }
      else { chat.askedWhen = true; chat.rendering = true; try { render(false); } finally { chat.rendering = false; } }
      track('trip_chat', { chat_source: 'when_' + w, changed: 'no' });
      return;
    }
    if ((b = t.closest('[data-v4-stay-more]'))) { chat.stayMore = !chat.stayMore; render(false); return; }
    if ((b = t.closest('[data-v4-stay-choose]'))) { stayChoice = Number(b.getAttribute('data-v4-stay-choose')); chat.stayMore = false; render(false); chatGlow(['stay']); return; }
  });
  // The chips only while nothing is typed and the box is not in use (the bar stays small).
  document.addEventListener('focusin', function(e){ if (e.target && e.target.id === 'v4ChatIn') { var c = document.getElementById('v4Chips'); if (c) c.hidden = true; chatPad(); } });
  document.addEventListener('focusout', function(e){ if (e.target && e.target.id === 'v4ChatIn' && !e.target.value && !chat.used) { var c = document.getElementById('v4Chips'); if (c) c.hidden = false; chatPad(); } });
`;
}

module.exports = { CHAT_STYLES, chatClientSrc, chatWeekendDates };
