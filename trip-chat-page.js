'use strict';
// Build My Trip travel agent chat, the page side (2026-11-22, Dayton; server side in trip-chat.js).
//
// On top of the V4 plan view, only with d.chat (TRIP_CHAT=on, or the /trip?chat=1 preview). After the first plan, the
// sticky bar at the bottom gets a chat bar like a messaging app: "Tell me what to change…", three tap-chips (Cheaper,
// More for kids, Slower pace) until the first message, then the last exchange (what they said, our short reply, Undo).
// The plan stays on screen; the stops that changed glow for ~2 s and scroll into view. Swap ⇄ and Remove ✕ stay.
// One fixed region at the bottom: the chat sits above Confirm / Book / Share in the same bar, so nothing covers anything.
// After Confirm the chat is hidden ("Edit plan" brings it back), like Swap and Remove.

const CHAT_STYLES = `<style>
  /* Travel agent chat (2026-11-22), inside the V4 sticky bar. */
  .t3-v4 .v4-chat { margin: 0 0 8px; }
  .t3-v4 .v4-bar.v4-chat-off .v4-chat { display: none; }
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
  .t3-v4 .v4-stop.v4-glow { animation: v4glow 2.2s ease-out; }
  @keyframes v4glow { 0%, 45% { background: rgba(201,162,39,0.30); box-shadow: inset 4px 0 0 var(--ref-gold, #C9A227); } 100% { background: transparent; box-shadow: inset 0 0 0 transparent; } }
  @media (prefers-reduced-motion: reduce) { .t3-v4 .v4-stop.v4-glow { animation: none; background: rgba(201,162,39,0.18); } }
</style>`;

// Browser code, inside the V3 page script after V4_CLIENT_SRC (same scope: state, render, syncUrl, v4, v4UpdateBar...).
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
    // Hidden once the plan is confirmed or while Save asks Replace / Add (like Swap and Remove).
    bar.classList.toggle('v4-chat-off', !!(v4.confirmed || v4.ask));
    return bar.querySelector('.v4-bar-main');
  }
  function chatPad(){ var bar = document.getElementById('v4Bar'); if (bar) document.body.style.paddingBottom = bar.offsetHeight + 'px'; }
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
  function chatSnapshot(){ return JSON.stringify({ last: state.last, lastReq: state.lastReq, text: state.text, seed: state.seed, overrides: state.overrides, locks: state.locks, exclude: state.exclude, removed: state.removed, gone: v4.gone }); }
  function chatRestore(snap){
    var o = JSON.parse(snap);
    state.last = o.last; state.lastReq = o.lastReq; state.text = o.text; state.seed = o.seed; state.overrides = o.overrides || {}; state.locks = o.locks || {}; state.exclude = o.exclude || []; state.removed = o.removed || {}; v4.gone = o.gone || {};
    v4.confirmed = false; v4.saved = false;
    render(false); syncUrl();
  }
  function chatRow(key){
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
        if (j.plan && j.req) {
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
        if (touched) { v4.confirmed = false; v4.saved = false; render(false); syncUrl(); }
        chat.undo = touched ? snap : null;
        chatShow(you, j.reply || ct('err'), { undo: touched });
        if (touched) chatGlow(changed);
        if (inEl && touched) inEl.value = '';
        track('trip_chat', { chat_source: /^(ai|rules|chip)$/.test(j.source || '') ? j.source : 'other', changed: touched ? 'yes' : 'no' });
      })
      .catch(function(){ done(); chatShow(you, ct('err'), {}); });
  }
  document.addEventListener('submit', function(e){
    if (!e.target || e.target.id !== 'v4ChatForm') return;
    e.preventDefault();
    var inEl = document.getElementById('v4ChatIn'), text = inEl ? inEl.value.replace(/\s+/g, ' ').trim() : '';
    if (!text) { if (inEl) inEl.focus(); return; }
    chatSend(text.slice(0, 400), null);
  });
  document.addEventListener('click', function(e){
    var t = e.target && e.target.closest ? e.target : null; if (!t) return;
    var b;
    if ((b = t.closest('[data-v4-chip]'))) { chatSend(null, b.getAttribute('data-v4-chip'), b.textContent); return; }
    if ((b = t.closest('[data-v4-chat-undo]')) && chat.undo) { var snap = chat.undo; chat.undo = null; chatRestore(snap); chatShow('', ct('undone'), {}); track('trip_chat', { chat_source: 'undo', changed: 'yes' }); }
  });
`;
}

module.exports = { CHAT_STYLES, chatClientSrc };
