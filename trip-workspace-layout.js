'use strict';
function tripWorkspaceDay(days, selected) {
  return days.includes(Number(selected)) ? Number(selected) : days.length ? days[0] : null;
}
function tripWorkspaceBooking(id, steps) {
  const valid=(steps||[]).filter(s=>s && s.kind==='venue' && Number(s.id)===Number(id) && /^https?:\/\//i.test(s.url||''));
  return valid.find(s=>!s.affiliate)||valid[0]||null;
}
// The short facts under the plan's title (2026-11-22, Dayton: "make the itinerary quicker to reach… a concise summary and
// expandable details"). Every fact is read from the plan's own data: the party as given (ctx.party), the dates when none
// are set, and one short item per ask in plan.evidence. An ask that is unmet, partial or unknown is a flagged item here,
// in the summary itself; the full sentences are under "Details". Asks that are met come last (at most four, then "+N").
function tripSummaryFacts(plan, fr, ctx) {
  var p = plan || {}, c = ctx || {}, out = [], flags = [], ok = [], sep = fr ? ' : ' : ': ', said = {}, gone = c.removed || {};
  if (c.party) out.push({ kind: 'party', text: String(c.party) });
  if (c.datesUnset) out.push({ kind: 'dates', text: fr ? 'Dates à choisir' : 'Dates not set' });
  (Array.isArray(p.evidence) ? p.evidence : []).forEach(function (e) {
    var label = e && ((fr && e.labelFr) || e.label);
    if (!e || !label || !e.status) return;
    if (e.text) said[e.text] = 1;
    var all = Array.isArray(e.stops) ? e.stops : [], t, status = e.status, count = e.count;
    // A stop the visitor removed no longer counts (ctx.removed: venue ids): "Wineries: 2 ✓" is not said of one winery.
    var stops = /^stay:/.test(e.ask || '') ? all : all.filter(function (x) { return x && !gone[x.id]; }), yes = stops.filter(function (x) { return x && x.has === true; }).length;
    if (stops.length < all.length && status === 'verified') {
      if (e.asked > 0) { count = yes; if (count < e.asked) status = count ? 'partial' : 'unmet'; }
      else if (!yes) status = 'unmet';
    }
    // No car (2026-11-23, trip-transport-need.js): how many hops between the stops still on the plan are more than a
    // short walk. Never a tick: no ride or route is checked.
    if (e.ask === 'no_car') {
      var rides = stops.filter(function (x) { return x && x.check; }).length;
      if (rides) flags.push({ kind: 'flag', status: 'unknown', ask: e.ask, text: label + sep + (fr ? rides + (rides > 1 ? ' trajets à vérifier' : ' trajet à vérifier') : rides + (rides > 1 ? ' rides to check' : ' ride to check')) });
      else flags.push({ kind: 'flag', status: 'partial', ask: e.ask, text: label + sep + (fr ? (stops.length ? 'courtes marches (approx.)' : 'transports non vérifiés') : (stops.length ? 'short walks (approx.)' : 'rides not checked')) });
      return;
    }
    // One person does not drink (2026-11-23; the summary said "Non-drinker: 1 of 4 stops"): say what the four are (the
    // plan's wineries and bars) and keep "options listed" apart from "the listing doesn't say". A listing without the
    // badge is unknown (has: null), never "has none".
    if (e.ask === 'nonalcoholic' && stops.length) {
      var un = stops.length - yes, nl = label;
      var u = e.unit || {}, place = fr ? (u.fr || 'vignobles et bars') : (u.en || 'wineries & bars');
      if (!un) { ok.push({ kind: 'ok', ask: e.ask, text: nl + (fr ? ' : indiquées partout ✓' : ': listed at all ' + stops.length + ' ✓') }); return; }
      if (!yes) t = fr ? 'non précisé (' + stops.length + ' ' + place + ')' : 'none of the ' + stops.length + ' ' + place + (stops.length > 1 ? ' say' : ' says');
      else t = fr ? yes + ' des ' + stops.length + ' ' + place + (yes > 1 ? ' en indiquent' : ' en indique') + ' · ' + un + (un > 1 ? ' ne le précisent pas' : ' ne le précise pas') : yes + ' of ' + stops.length + ' ' + place + (yes > 1 ? ' list them' : ' lists them') + ' · ' + un + (un > 1 ? ' don’t say' : ' doesn’t say');
      flags.push({ kind: 'flag', status: yes ? 'partial' : 'unknown', ask: e.ask, text: nl + sep + t });
      return;
    }
    // A wheelchair user (2026-11-24): its own item, counted from each listing's own data. "Lists it" is kept apart from
    // "doesn't say" (has: null) and from a listing whose own line says no (has: false); never "accessible" on its own.
    if (e.ask === 'accessible' && stops.length) {
      // (2026-11-23) Graded: "confirmed" is only a listing whose own words say wheelchair access for the place itself
      // (level 'wheelchair'); a section or feature, or a mobility note, is a "partial note"; never a ✓ unless all are.
      var lv = function (x) { return x.level || (x.has === true ? 'wheelchair' : x.has === false ? 'no' : 'unknown'); };
      var aw = stops.filter(function (x) { return x && lv(x) === 'wheelchair'; }).length, an = stops.filter(function (x) { return x && lv(x) === 'no'; }).length;
      var ap = stops.filter(function (x) { return x && (lv(x) === 'wheelchair_part' || lv(x) === 'mobility'); }).length, aq = stops.length - aw - an - ap;
      if (aw === stops.length) { ok.push({ kind: 'ok', ask: e.ask, text: label + (fr ? ' : indiqué partout (' + stops.length + ') ✓' : ': listed at all ' + stops.length + ' ✓') }); return; }
      var bits = [];
      if (aw) bits.push(fr ? aw + ' sur ' + stops.length + (aw > 1 ? ' confirmés' : ' confirmé') : aw + ' of ' + stops.length + ' confirmed');
      else if (ap) bits.push(fr ? 'aucun confirmé' : 'none fully confirmed');
      else if (aq) { var au = e.unit || {}, aun = fr ? (au.fr || 'arrêts') : (au.en || 'stops'); bits.push(fr ? 'non précisé (' + stops.length + ' ' + aun + ')' : 'none of the ' + stops.length + ' ' + aun + (stops.length > 1 ? ' say' : ' says')); }
      if (ap) bits.push(fr ? ap + (ap > 1 ? ' notes partielles' : ' note partielle') : ap + (ap > 1 ? ' partial notes' : ' partial note'));
      if (aq && (aw || ap)) bits.push(fr ? aq + (aq > 1 ? ' non précisés' : ' non précisé') : aq + (aq > 1 ? ' don’t say' : ' doesn’t say'));
      if (an) bits.push(fr ? an + (an > 1 ? ' disent non' : ' dit non') : an + (an > 1 ? ' say no' : ' says no'));
      flags.push({ kind: 'flag', status: aw || ap ? 'partial' : an && !aq ? 'unmet' : 'unknown', ask: e.ask, text: label + sep + bits.join(' · ') });
      return;
    }
    // A dog (2026-11-23): "yes" is a listing that says where the dog can go (a trail's own Dogs line, "inside"); a
    // Dog-Friendly badge at a place with an indoors doesn't say inside or patio only: "badges to confirm".
    if (e.ask === 'dog_friendly' && stops.some(function (x) { return x && (x.where || x.open); })) {
      var dy = stops.filter(function (x) { return x && x.has === true && (!x.where || x.where === 'outdoors' || x.where === 'inside'); });
      var db = stops.filter(function (x) { return x && x.has === true && x.where === 'unsaid'; }).length, dn = stops.filter(function (x) { return x && x.has === false; }).length;
      var dc = stops.filter(function (x) { return x && x.has === true; }).length - dy.length - db, du = stops.length - dy.length - db - dc - dn;
      if (dy.length === stops.length) { ok.push({ kind: 'ok', ask: e.ask, text: label + ' ✓' }); return; }
      var walks = dy.length && dy.every(function (x) { return x.open; }), dbits = [];
      if (dy.length) dbits.push(fr ? dy.length + (walks ? (dy.length > 1 ? ' sorties' : ' sortie') : (dy.length > 1 ? ' arrêts' : ' arrêt')) + ' oui' : dy.length + (walks ? (dy.length > 1 ? ' walks' : ' walk') : (dy.length > 1 ? ' stops' : ' stop')) + ' yes');
      if (dc) dbits.push(fr ? dc + ' avec limites' : dc + ' with limits');
      if (db) dbits.push(fr ? db + (db > 1 ? ' badges à confirmer' : ' badge à confirmer') : db + (db > 1 ? ' badges to confirm' : ' badge to confirm'));
      if (du) dbits.push(fr ? du + (du > 1 ? ' non précisés' : ' non précisé') : du + (du > 1 ? ' don’t say' : ' doesn’t say'));
      if (dn) dbits.push(fr ? dn + (dn > 1 ? ' disent non' : ' dit non') : dn + (dn > 1 ? ' say no' : ' says no'));
      flags.push({ kind: 'flag', status: dy.length || dc || db ? 'partial' : dn ? 'unmet' : 'unknown', ask: e.ask, text: label + sep + dbits.join(' · ') });
      return;
    }
    // An entry that words its own short item (the place to stay for a need: "Stay lists accessible rooms ✓").
    if (e.short) { var st = (fr && e.shortFr) || e.short; if (status === 'verified') ok.push({ kind: 'ok', ask: e.ask, text: st }); else flags.push({ kind: 'flag', status: status, ask: e.ask, text: st }); return; }
    if (status === 'verified') { ok.push({ kind: 'ok', ask: e.ask, text: label + (e.asked > 0 && count > 0 ? sep + count : '') + ' ✓' }); return; }
    if (status === 'unmet') t = fr ? 'pas dans ce plan' : 'not in this plan';
    else if (e.needsDates) t = fr ? 'selon vos dates' : 'needs dates';
    else if (status === 'partial' && e.asked > 0 && count >= 0) t = fr ? count + ' sur ' + e.asked : count + ' of ' + e.asked;
    else if (status === 'partial' && stops.length) t = fr ? yes + ' sur ' + stops.length + (stops.length > 1 ? ' arrêts' : ' arrêt') : yes + ' of ' + stops.length + (stops.length > 1 ? ' stops' : ' stop');
    else if (status === 'partial') t = fr ? 'en partie' : 'partly';
    else t = fr ? 'non confirmé' : 'not confirmed';
    flags.push({ kind: 'flag', status: status, ask: e.ask, text: label + sep + t });
  });
  // What the plan says it left out, or a note for one person, that no evidence entry already covers: still flagged.
  // In English the kind left out is named ("Spa: not in this plan"); the kinds have no French word here, so a count.
  var left = 0;
  (Array.isArray(p.notIncluded) ? p.notIncluded : []).forEach(function (x) {
    if (!x || !x.text || said[x.text]) return;
    var k = typeof x.kind === 'string' && /^[a-z][a-z_ ]{1,30}$/.test(x.kind) ? x.kind.replace(/_/g, ' ') : '';
    if (k && !fr) flags.push({ kind: 'flag', status: 'unmet', ask: 'not_included:' + x.kind, text: k.charAt(0).toUpperCase() + k.slice(1) + ': not in this plan' });
    else left++;
  });
  if (left) flags.push({ kind: 'flag', status: 'unmet', ask: 'not_included', text: fr ? left + (left > 1 ? ' demandes non incluses' : ' demande non incluse') : left + (left > 1 ? ' asks not included' : ' ask not included') });
  if (p.partyNote && p.partyNote.text && !said[p.partyNote.text]) flags.push({ kind: 'flag', status: 'partial', ask: 'party_note', text: fr ? 'Note pour une personne du groupe' : 'Note for one of you' });
  // The traveller's budget (2026-11-23, trip-budget.js): the limit beside the estimate, in the server's own words
  // (ctx.budget: the chosen stay's). Never a tick: the figures are estimates. A plan with no budget has no such fact.
  if (c.budget && (fr ? c.budget.textFr : c.budget.text) && (fr ? c.budget.textFr : c.budget.text).summary) flags.unshift({ kind: 'flag', status: c.budget.status === 'over' ? 'unmet' : c.budget.status === 'under' || c.budget.status === 'under_priced' ? 'partial' : 'unknown', ask: 'budget', text: (fr ? c.budget.textFr : c.budget.text).summary });
  // A food allergy leads the summary (2026-11-23, trip-allergy-need.js): said before anything else about the plan.
  flags.sort(function (a, b) { return (b.ask === 'allergy' ? 1 : 0) - (a.ask === 'allergy' ? 1 : 0); });
  if (ok.length > 4) { var more = ok.length - 3; ok = ok.slice(0, 3); ok.push({ kind: 'ok', ask: 'more', text: fr ? '+' + more + ' autres ✓' : '+' + more + ' more ✓' }); }
  return out.concat(flags, ok);
}
const WORKSPACE_STYLES=`<style id="trip-workspace-layout">
.t3-v4.tw-workspace.has-plan {display:grid;grid-template-columns:minmax(0,1fr) 350px;gap:26px;max-width:1320px;margin:0 auto;padding:26px 32px 48px;box-sizing:border-box;align-items:start;}
.t3-v4.tw-workspace.has-plan .t3-result {grid-column:1;min-width:0;width:100%;max-width:none;padding:0;}
.t3-v4.tw-workspace .v4 {max-width:none;}
.t3-v4.tw-workspace .v4-head {display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;padding:14px 0 18px;margin-bottom:12px;}
.t3-v4.tw-workspace .v4-head h2 {flex:1 1 100%;font-size:clamp(26px,3vw,36px);}
.t3-v4.tw-workspace .v4-sub {flex:1;margin:0;}
.t3-v4.tw-workspace .tw-plan-actions {display:flex;gap:8px;flex-wrap:wrap;}
.t3-v4.tw-workspace .tw-plan-actions button {min-height:44px;padding:9px 16px;border:1px solid #1b303c;border-radius:12px;background:#fffdf8;color:#1b303c;font:800 14px Nunito,sans-serif;cursor:pointer;}
.t3-v4.tw-workspace .tw-plan-actions [data-v4-share] {color:#fff;background:#1b303c;}
.t3-v4.tw-workspace .tw-day-tabs {display:flex;gap:8px;overflow:auto;padding:3px 1px 10px;margin-bottom:8px;}
.t3-v4.tw-workspace .tw-day-tabs button {flex:0 0 auto;min-height:44px;min-width:92px;border:1px solid #d8d5cc;border-radius:11px;background:#fffdf8;font:800 14px Nunito,sans-serif;color:#1b303c;cursor:pointer;}
.t3-v4.tw-workspace .tw-day-tabs [aria-selected="true"] {background:#1b303c;color:white;border-color:#1b303c;}
.t3-v4.tw-workspace .v4-day[hidden] {display:none!important;}
.t3-v4.tw-workspace .v4-day-title {font:600 24px/1.3 Fraunces,serif;margin:12px 0;}
.t3-v4.tw-workspace .v4-stops {background:transparent;box-shadow:none;overflow:visible;display:grid;gap:12px;}
.t3-v4.tw-workspace .v4-stop {border:1px solid #e1ddd2;border-radius:18px;background:#fffdf8;overflow:hidden;}
.t3-v4.tw-workspace .v4-row {grid-template-columns:150px minmax(0,1fr) auto;gap:14px;padding:12px;align-items:start;}
.t3-v4.tw-workspace .v4-thumb {width:150px;height:128px;border-radius:12px;}
.t3-v4.tw-workspace .v4-main {padding:0;}
.t3-v4.tw-workspace .v4-name {font:600 22px/1.2 Fraunces,serif;margin:6px 0;}
.t3-v4.tw-workspace .v4-line {white-space:normal;font-size:13px;}
.t3-v4.tw-workspace .v4-time {display:inline-block;padding:3px 8px;border-radius:12px;background:#fff0cc;color:#745319;}
.t3-v4.tw-workspace .tw-fit {font-size:13px;line-height:1.45;color:#52665e;margin:7px 0;}
.t3-v4.tw-workspace .tw-need {font-weight:700;overflow-wrap:anywhere;}
/* One line per need (a long note wraps inside the card). */
.t3-v4.tw-workspace .tw-need span {display:block;}
.t3-v4.tw-workspace .v4-note+.tw-need {margin-top:-3px;}
.t3-v4.tw-workspace .v4-note {font-size:13px;line-height:1.45;font-weight:700;color:#52665e;margin:7px 0;padding:0;}
.t3-v4.tw-workspace .v4-note a {color:#1b303c;}
.t3-v4.tw-workspace .v4-acts {display:flex;flex-direction:column;gap:6px;}
.t3-v4.tw-workspace .v4-icon {width:auto;min-width:76px;height:38px;border:1px solid #d9d5ca;border-radius:10px;font:800 12px Nunito,sans-serif;padding:6px 10px;}
.t3-v4.tw-workspace .tw-links {display:flex;gap:8px 12px;flex-wrap:wrap;margin-top:8px;font-size:13px;font-weight:800;}
.t3-v4.tw-workspace .tw-links a {min-height:36px;display:inline-flex;align-items:center;color:#1b303c;text-decoration:underline;text-underline-offset:3px;}
.t3-v4.tw-workspace .v4-more {padding:0 14px 14px;}
.t3-v4.tw-workspace .tw-book-note {background:#edf3e4;border-radius:12px;padding:10px 14px;font-size:13px;color:#43584b;line-height:1.5;}
.t3-v4.tw-workspace .tw-options {margin:18px 0;background:#fffdf8;border:1px solid #e1ddd2;border-radius:14px;padding:12px;}
.t3-v4.tw-workspace .tw-options summary {font-weight:800;cursor:pointer;min-height:36px;}
.t3-v4.tw-workspace .tw-options .v4-gh {margin:8px 0 0;padding:0;background:transparent;box-shadow:none;}
.t3-v4.tw-workspace .tw-options .v4-gh .v4-card-h {display:none;}
.t3-v4.tw-workspace .v4-stay-card {margin:0 0 14px;padding:12px;border:1px solid #e1ddd2;border-radius:18px;background:#fffdf8;box-shadow:none;}
.t3-v4.tw-workspace .v4-stay-card .v4-stay-acts {margin-top:8px;}
.t3-v4.tw-workspace .tw-book {margin:16px 0 10px;}
.t3-v4.tw-workspace .tw-book-btn {width:100%;max-width:360px;min-height:50px;border:0;border-radius:14px;background:#1b303c;color:#fff;font:800 16px Nunito,sans-serif;cursor:pointer;}
.t3-v4.tw-workspace .tw-sum {margin:0 0 12px;}
.t3-v4.tw-workspace .tw-facts {list-style:none;margin:0;padding:0;font-size:13px;line-height:22px;font-weight:700;color:#3d4c57;}
.t3-v4.tw-workspace .tw-facts li {display:inline;}
.t3-v4.tw-workspace .tw-facts li>span {white-space:nowrap;}
.t3-v4.tw-workspace .tw-facts li+li::before {content:"· ";color:#8a949b;}
.t3-v4.tw-workspace .tw-facts .tw-fact-flag span {background:#fff0cc;color:#6b4a12;border-radius:8px;padding:2px 7px;font-weight:800;white-space:normal;-webkit-box-decoration-break:clone;box-decoration-break:clone;}
.t3-v4.tw-workspace .tw-facts .tw-fact-more::before {content:"";}
.t3-v4.tw-workspace .tw-sum-toggle {position:relative;z-index:1;display:inline-flex;align-items:center;gap:4px;min-height:44px;min-width:44px;margin:-10px 0 -10px 2px;padding:0 6px;border:0;background:none;color:#1b303c;font:800 13px Nunito,sans-serif;text-decoration:underline;text-underline-offset:3px;cursor:pointer;vertical-align:middle;}
.t3-v4.tw-workspace .tw-sum-toggle::after {content:"▾";text-decoration:none;display:inline-block;}
.t3-v4.tw-workspace .tw-sum-toggle[aria-expanded="true"]::after {transform:rotate(180deg);}
.t3-v4.tw-workspace .tw-sum-toggle:focus-visible {outline:2px solid #1b303c;outline-offset:-6px;border-radius:10px;}
.t3-v4.tw-workspace .tw-sum-more {margin:8px 0 0;padding:12px 14px 4px;border-radius:14px;background:#f3f0e7;}
.t3-v4.tw-workspace .tw-sum-more[hidden] {display:none;}
.t3-v4.tw-workspace .tw-sum-more p {margin:0 0 8px;font-size:13px;line-height:1.5;color:#1b303c;font-weight:600;}
.t3-v4.tw-workspace .tw-sum-agent:empty,.t3-v4.tw-workspace .tw-sum-stay:empty {display:none;}
.t3-v4.tw-workspace .tw-sum-stay {display:flex;align-items:center;gap:6px;margin:-4px 0 4px;font-size:13px;font-weight:600;color:#1b303c;}
.t3-v4.tw-workspace .tw-sum-stay .v4-link {min-height:44px;}
.t3-v4.tw-workspace .v4-thumb--none {display:none;}
.t3-v4.tw-workspace .v4-row:has(.v4-thumb--none) {grid-template-columns:minmax(0,1fr) auto;}
.t3-v4.tw-workspace .v4-gone .v4-row {align-items:center;}
.t3-v4.tw-workspace .v4-gone .v4-acts {flex-direction:row;flex-wrap:wrap;justify-content:flex-end;}
.t3-v4.tw-workspace .v4-gone .v4-name {font-size:17px;margin:4px 0 0;}
.t3-v4.tw-workspace .tw-updated {display:inline-block;font-size:11px;font-weight:800;background:#e5efd4;color:#3c672d;padding:3px 8px;border-radius:12px;margin:4px 0;}
.t3-v4.tw-workspace .v4-bar.has-chat {grid-column:2;grid-row:1;position:sticky;top:96px;bottom:auto;left:auto;right:auto;width:100%;box-sizing:border-box;background:#fffdf8;border:1px solid #e1ddd2;border-radius:20px;box-shadow:0 6px 24px #1b303c0a;padding:18px;z-index:20;max-height:calc(100dvh - 115px);overflow:auto;}
.t3-v4.tw-workspace .v4-bar .tw-chat-title {font:600 24px Fraunces,serif;margin:0 0 8px;}
.t3-v4.tw-workspace .v4-bar .tw-chat-hint {font-size:14px;line-height:1.5;margin:0 0 20px;}
.t3-v4.tw-workspace .v4-agent {box-shadow:none;background:#f3f0e7;padding:12px;margin-bottom:18px;font-size:13px;}
.t3-v4.tw-workspace .v4-chat-reply {max-height:36dvh;font-size:14px;line-height:1.5;}
.t3-v4.tw-workspace .v4-chat-you {white-space:normal;padding:12px;background:#fbe8d9;border-radius:16px;margin-bottom:12px;font-weight:600;}
.t3-v4.tw-workspace .v4-chat-you:empty {display:none;}
.t3-v4.tw-workspace .v4-chat-agent {background:#edf1e2;border-radius:16px;padding:12px;margin-bottom:18px;font-weight:600;}
.t3-v4.tw-workspace .v4-chat-undo {display:block;margin-top:7px;min-height:32px;}
.t3-v4.tw-workspace .v4-chat-undo[hidden] {display:none;}
.t3-v4.tw-workspace .v4-chat-form {margin-top:18px;}
.t3-v4.tw-workspace .v4-chat-form input {border-radius:12px;padding:0 12px;font-size:14px;}
.t3-v4.tw-workspace .v4-chat-send {border-radius:12px;}
.t3-v4.tw-workspace .v4-bar-main:empty {display:none;}
.t3-v4.tw-workspace .v4-bar-main:has([data-v4-replace]) {margin-top:14px;}
.t3-v4.tw-workspace .v4-options {font-size:13px;}
.tw-share {max-width:480px;width:calc(100% - 40px);box-sizing:border-box;border:1px solid #ded8cb;border-radius:20px;padding:24px;background:#fffdf8;color:#1b303c;font-family:Nunito,sans-serif;}
.tw-share::backdrop {background:#1b303c66;}
.tw-share h2 {font:600 26px Fraunces,serif;margin:0 0 12px;}
.tw-share input {width:100%;box-sizing:border-box;padding:12px;border:1px solid #ccc;border-radius:10px;margin:8px 0;font-size:16px;}
.tw-share-actions {display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}
.tw-share .tw-share-al {display:flex;gap:10px;align-items:center;min-height:44px;margin:4px 0 0;font-weight:800;cursor:pointer;}
.tw-share .tw-share-al input {width:22px;height:22px;flex:0 0 auto;margin:0;padding:0;}
.tw-share .tw-share-al-note {margin:0 0 10px;font-size:13px;line-height:1.4;color:#52665e;}
.tw-share button {min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid #1b303c;background:#1b303c;color:white;font:800 14px Nunito,sans-serif;cursor:pointer;}
@media(max-width:899px){
 .t3-v4.tw-workspace.has-plan {display:block;padding:12px 16px 30px;}
 .t3-v4.tw-workspace .v4-head {padding:6px 0 14px;gap:10px;}
 .t3-v4.tw-workspace .v4-head h2 {font-size:28px;}
 .t3-v4.tw-workspace .tw-day-tabs button {min-width:88px;}
 .t3-v4.tw-workspace .v4-row {grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:0 12px 12px;}
 .t3-v4.tw-workspace .v4-thumb {grid-column:1/-1;width:calc(100% + 24px);max-width:none;margin:0 -12px;height:clamp(112px,33vw,128px);border-radius:0;}
 .t3-v4.tw-workspace .v4-row:has(.v4-thumb--none) {padding-top:12px;}
 .t3-v4.tw-workspace .v4-head {padding:4px 0 8px;margin-bottom:8px;gap:6px 8px;}
 .t3-v4.tw-workspace .v4-head h2 {font-size:clamp(20px,5.9vw,24px);line-height:1.2;}
 .t3-v4.tw-workspace .v4-sub {flex:1 1 0;min-width:110px;font-size:13px;line-height:1.35;}
 .t3-v4.tw-workspace .v4-head .tw-plan-actions {width:auto;flex:0 0 auto;flex-wrap:nowrap;gap:6px;}
 .t3-v4.tw-workspace .v4-head .tw-plan-actions button {flex:0 0 auto;padding:9px 12px;font-size:13px;}
 /* The summary first, then the dates question as one row, then the place to stay as one row: the days start sooner. */
 .t3-v4.tw-workspace .tw-sum {margin:0 0 6px;}
 .t3-v4.tw-workspace .v4-agent {margin:0 0 12px;}
 .t3-v4.tw-workspace .tw-has-sum .v4-agent {margin:0 0 6px;padding:0;background:none;border-radius:0;}
 .t3-v4.tw-workspace .v4-agent.tw-agent-empty,.t3-v4.tw-workspace .tw-has-sum .v4-agent>.v4-agent-who {display:none;}
 .t3-v4.tw-workspace .tw-has-sum .v4-ask {display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin:0;}
 .t3-v4.tw-workspace .tw-has-sum .v4-ask-q {margin:0;font:800 13px Nunito,sans-serif;color:#1b303c;}
 .t3-v4.tw-workspace .tw-has-sum .v4-ask-full {position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;}
 .t3-v4.tw-workspace .tw-has-sum .v4-ask-short {display:inline;}
 .t3-v4.tw-workspace .tw-has-sum .v4-ask-btns {flex:1;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;}
 .t3-v4.tw-workspace .tw-has-sum .v4-ask-btns::-webkit-scrollbar {display:none;}
 .t3-v4.tw-workspace .tw-has-sum .v4-ask-btns button {flex:none;min-height:44px;padding:0 10px;font-size:13px;}
 @media(max-width:379px){.t3-v4.tw-workspace .tw-has-sum .v4-ask-btns button {padding:0 8px;font-size:12.5px;}}
 .t3-v4.tw-workspace .tw-has-sum .v4-ask-dates {flex:1 1 100%;margin:2px 0 0;}
 .t3-v4.tw-workspace .tw-has-sum .v4-ask-dates input {min-height:44px;}
 .t3-v4.tw-workspace .tw-has-sum .v4-ask-dates .v4-link {min-height:44px;min-width:44px;}
 .t3-v4.tw-workspace .v4-stay-card {display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:0 8px;align-items:center;margin:0 0 8px;padding:8px;border-radius:14px;}
 .t3-v4.tw-workspace .v4-stay-card .v4-stay-row {display:contents;}
 .t3-v4.tw-workspace .v4-stay-card .v4-card-h {grid-column:2;grid-row:1;margin:0;font-size:10.5px;line-height:14px;letter-spacing:0.03em;}
 .t3-v4.tw-workspace .v4-stay-card .v4-stay-img {grid-column:1;grid-row:1/3;width:44px;height:44px;border-radius:10px;}
 .t3-v4.tw-workspace .v4-stay-card .v4-stay-row>div {grid-column:2;grid-row:2;min-width:0;}
 .t3-v4.tw-workspace .v4-stay-card .v4-stay-name {font-size:14px;line-height:1.25;}
 .t3-v4.tw-workspace .v4-stay-card .v4-h-full {position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;}
 .t3-v4.tw-workspace .v4-stay-card .v4-h-short {display:inline;}
 .t3-v4.tw-workspace .v4-stay-card .v4-stay-facts {display:inline;margin:0 6px 0 0;font-size:12px;}
 .t3-v4.tw-workspace .v4-stay-card .v4-stay-chips {display:inline-flex;margin:2px 0 0;vertical-align:middle;}
 .t3-v4.tw-workspace .v4-stay-card .v4-stay-chip {min-height:20px;padding:0 7px;font-size:11px;}
 .t3-v4.tw-workspace .v4-stay-card .v4-chip-extra {display:none;}
 .t3-v4.tw-workspace .v4-stay-card .v4-stay-acts {grid-column:3;grid-row:1/3;margin:0;}
 .t3-v4.tw-workspace .v4-stay-card .v4-stay-acts .v4-btn {min-height:44px;padding:0 10px;font-size:13px;white-space:nowrap;gap:4px;}
 .t3-v4.tw-workspace .v4-stay-card .v4-stay-acts .v4-btn>span[aria-hidden] {display:none;}
 .t3-v4.tw-workspace .v4-stay-card .v4-stay-acts:empty {display:none;}
 .t3-v4.tw-workspace .v4-stay-card .v4-stay-alts,.t3-v4.tw-workspace .v4-stay-card .v4-disc-line {grid-column:1/-1;}
 .t3-v4.tw-workspace .v4-stay-card .v4-stay-alts .v4-link {min-height:44px;}
 .t3-v4.tw-workspace .v4-stay-card .v4-disc-line {margin:5px 0 0;font-size:10.5px;line-height:1.3;}
 .t3-v4.tw-workspace .v4-stay-card .v4-rooms {grid-column:1/-1;margin:3px 0 0;font-size:12px;}
 .t3-v4.tw-workspace .v4-stay-card .t3-stayd {grid-column:1/-1;margin:5px 0 0;padding:6px 8px;border-radius:10px;font-size:12px;line-height:1.3;display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;}
 .t3-v4.tw-workspace .v4-stay-card .t3-stayd[data-t3-stayd="confirmed"] {padding:0;}
 .t3-v4.tw-workspace .v4-stay-card .t3-stayd-line {flex:1 1 100%;}
 .t3-v4.tw-workspace .v4-stay-card .t3-stayd[data-t3-stayd="confirmed"] .t3-stayd-line {flex:0 1 auto;}
 .t3-v4.tw-workspace .v4-stay-card .t3-stayd-btns {margin:0;gap:6px;}
 .t3-v4.tw-workspace .v4-stay-card .t3-stayd-btn {position:relative;min-height:32px;height:32px;padding:0 12px;font-size:12.5px;}
 .t3-v4.tw-workspace .v4-stay-card .t3-stayd-btn::after {content:"";position:absolute;inset:-6px 0;}
 .t3-v4.tw-workspace .v4-stay-card .t3-stayd-note {flex:1 1 90px;margin:0;font-size:10.5px;line-height:1.3;}
 .t3-v4.tw-workspace .v4-stay-card .v4-rooms button {height:28px;font-size:16px;}
 .t3-v4.tw-workspace .v4-stay-card .v4-rooms button::after {inset:-9px 0;}
 .t3-v4.tw-workspace .tw-day-tabs {padding:2px 1px 5px;margin-bottom:2px;}
 .t3-v4.tw-workspace .tw-day-tabs+.v4-days .v4-day-title {font:800 14px/1.3 Nunito,sans-serif;margin:0 0 6px;color:#3d4c57;}
 .t3-v4.tw-workspace .tw-book-btn {max-width:none;}
 .t3-v4.tw-workspace .v4-name {font-size:21px;}
 .t3-v4.tw-workspace .tw-links {margin-top:4px;gap:0 12px;}
 /* The suggested-time note stays on one line on a phone: it may run under Swap / Remove (the name block is at least as tall as they are), never past the card. */
 .t3-v4.tw-workspace .v4-stop.tw-timed {container-type:inline-size;}
 .t3-v4.tw-workspace .tw-timed .v4-main {min-height:86px;}
 .t3-v4.tw-workspace .v4-note {width:max-content;max-width:calc(100vw - 58px);max-width:calc(100cqw - 24px);overflow-wrap:anywhere;}
 /* The need notes use the card's width the same way (they may run under Swap / Remove, never past the card). */
 .t3-v4.tw-workspace .v4-stop.tw-needs {container-type:inline-size;}
 .t3-v4.tw-workspace .tw-needs .v4-main {min-height:86px;}
 .t3-v4.tw-workspace .tw-needs .tw-need {width:max-content;max-width:calc(100vw - 58px);max-width:calc(100cqw - 24px);font-size:12.5px;}
 .t3-v4.tw-workspace .v4-icon {min-width:68px;min-height:40px;}
 .t3-v4.tw-workspace .v4-bar.has-chat {position:fixed;top:auto;bottom:0;left:0;right:0;width:100%;max-height:42dvh;border-radius:18px 18px 0 0;padding:10px 16px calc(10px + env(safe-area-inset-bottom));box-shadow:0 -5px 24px #1b303c12;z-index:100;}
 .t3-v4.tw-workspace .tw-chat-title,.t3-v4.tw-workspace .tw-chat-hint,.t3-v4.tw-workspace .v4-chat-you {display:none;}
 .t3-v4.tw-workspace .v4-chat-reply {max-height:130px;font-size:13px;}
 .t3-v4.tw-workspace .v4-chat-you:empty {display:none;}
.t3-v4.tw-workspace .v4-chat-agent {padding:8px 12px;margin-bottom:6px;}
 .t3-v4.tw-workspace .v4-chat-undo {display:inline-block;min-height:32px;margin-left:8px;}
 .t3-v4.tw-workspace .v4-chat-form {margin-top:0;}
 .t3-v4.tw-workspace .v4-chat-form input {font-size:16px;}
 .t3-v4.tw-workspace .v4-chips {margin-top:6px;}
 .t3-v4.tw-workspace .v4-chips button {min-height:32px;}
}
</style>`;
const WORKSPACE_CLIENT_SRC=String.raw`
  ${tripWorkspaceDay.toString()}
  ${tripWorkspaceBooking.toString()}
  ${tripSummaryFacts.toString()}
  var twSelectedDay=1,twOptionsOpen=false,twSumOpen=false;
  function twText(en,fr){return lang()==='fr'?fr:en;}
  function tripWorkspaceStopHtml(s,key,counts){
    var v=s.venue,id=key||('s'+v.id),did='v4d-'+id,url=placeUrl(v);
    var steps=typeof t3BookSteps==='function'?t3BookSteps():[],fallback=v4Fallback();
    if(fallback&&fallback.steps)steps=steps.concat(fallback.steps);
    var booking=tripWorkspaceBooking(v.id,steps);
    var reason=t3WhyLines(s).filter(function(w){return !/straight line|ligne droite|listed on|répertorié/i.test(w);})[0]||'';
    var actions=key?(s.noSwap?'':'<button type="button" class="v4-icon" data-t3-swap="'+esc(key)+'" aria-label="'+esc(vt('swap',{name:v.name}))+'">⇄ '+esc(twText('Swap','Changer'))+'</button>')+'<button type="button" class="v4-icon" data-t3-remove="'+esc(key)+'" aria-label="'+esc(vt('remove',{name:v.name}))+'">× '+esc(twText('Remove','Retirer'))+'</button>':'<button type="button" class="v4-icon" data-t3-swap-id="'+esc(v.id)+'" aria-label="'+esc(vt('swap',{name:v.name}))+'">⇄ '+esc(twText('Swap','Changer'))+'</button><button type="button" class="v4-icon" data-v4-remove-id="'+esc(v.id)+'" aria-label="'+esc(vt('remove',{name:v.name}))+'">× '+esc(twText('Remove','Retirer'))+'</button>';
    var note=v4Note(s,key);
    // Trip needs (2026-11-23): a stop whose listing covers one section or feature for a wheelchair, or has only a
    // mobility note, says so in one short line ("Access: Deleenheer Rd access · check ahead") in place of the generic
    // "Matches your request…" line (still under "Why it fits" once opened), so the card does not grow.
    // (2026-11-23, the owner's report: "A good walk with your dog" stood alone on a walk whose wheelchair access is
    // unknown.) Every stop of a plan with a wheelchair or dog need says its note for each need; with a suggested time
    // the time note comes first and the needs follow in their shorter forms on one more line. The generic line shows
    // only when there is neither.
    var need=typeof v4NeedHtml==='function'?v4NeedHtml(s,!!note):'';
    var links=(url?'<a '+hrefAttr(url)+'>'+esc(twText('View details','Voir les détails'))+'</a>':'');
    if(booking)links+=t3StepLinkHtml(booking,'tw-book-link',twText(booking.affiliate?'Book with provider':'Book with business',booking.affiliate?'Réserver chez le prestataire':'Réserver auprès du lieu'),steps.indexOf(booking));
    // A suggested time (a session, showtime, lane or booked slot we do not hold) says so in one short line under the
    // name, with the step to check it: "Suggested time · Check sessions ↗". It stands in for the generic "Matches your
    // request…" line (still under "Why it fits" once opened), and for "Venue website" when that is the same link.
    else if(v.website&&t3StayExt(v.website)&&!(note&&note.url===t3StayExt(v.website)))links+='<a '+hrefAttr(t3StayExt(v.website))+' target="_blank" rel="noopener">'+esc(twText('Venue website','Site du lieu'))+' ↗</a>';
    return '<li class="v4-stop'+(note?' tw-timed':'')+(need?' tw-needs':'')+'" data-venue-id="'+esc(v.id)+'"><div class="v4-row">'+v4Thumb(v)+'<div class="tw-card-info"><button type="button" class="v4-main" aria-expanded="'+(v4.open[id]?'true':'false')+'" aria-controls="'+esc(did)+'" data-v4-toggle="'+esc(did)+'" data-v4-id="'+esc(id)+'"><span class="v4-time">'+esc(v4Start(s,key))+'</span><span class="v4-name">'+esc(v.name)+'</span><span class="v4-line">'+esc(v4Line(s))+'</span></button>'+(note||need?(note?note.html:'')+need:reason?'<p class="tw-fit">'+esc(reason)+'</p>':'')+'<div class="tw-links">'+links+'</div></div><div class="v4-acts">'+actions+'</div></div><div class="v4-more" id="'+esc(did)+'"'+(v4.open[id]?'':' hidden')+'>'+v4Details(s,id)+'</div>'+v4TripBtn(v,key)+'</li>';
  }
  // An event on the plan is a card like any stop: photo, time, name, "View details" and Remove; once removed it is the
  // same "Removed … Undo" row as a venue (it used to vanish with no word, and the count stayed).
  function tripWorkspaceEventHtml(s,key){
    var e=s.event,eu=placeUrl(e),eid='v4d-e'+esc(e.id),day=key?key.split('-')[0]:'';
    if(chat.goneEvents[e.id])return '<li class="v4-stop v4-gone"><div class="v4-row">'+v4Thumb(null)+'<div class="v4-main"><span class="v4-time">'+esc(vt('removed'))+'</span><span class="v4-name">'+esc(e.name)+'</span></div><div class="v4-acts"><button type="button" class="v4-text" data-v4-event-undo="'+esc(e.id)+'">'+esc(vt('undo'))+'</button></div></div></li>';
    var why=(s.why||[])[0]||'',more=t3EventPlaceHtml(e,lang(),esc);
    var links=eu?'<a '+hrefAttr(eu)+'>'+esc(twText('View details','Voir les détails'))+'</a>':'';
    return '<li class="v4-stop tw-event" data-event-id="'+esc(e.id)+'"><div class="v4-row">'+v4Thumb(e.photo?{photo:e.photo}:null)+'<div class="tw-card-info"><button type="button" class="v4-main" aria-expanded="false" aria-controls="'+eid+'" data-v4-toggle="'+eid+'"><span class="v4-time">'+esc(v4Start(s,key)||e.time||'')+'</span><span class="v4-name">'+esc(e.name)+'</span><span class="v4-line">'+esc([vt('event'),e.regionLabel].filter(Boolean).join(' · '))+'</span></button>'+(why?'<p class="tw-fit">'+esc(why)+'</p>':'')+'<div class="tw-links">'+links+'</div></div><div class="v4-acts"><button type="button" class="v4-icon" data-v4-event-x="'+esc(e.id)+'" aria-label="'+esc(vt('remove',{name:e.name}))+'">× '+esc(twText('Remove','Retirer'))+'</button></div></div><div class="v4-more" id="'+eid+'" hidden>'+more+'</div><button type="button" class="trip-btn" hidden data-plan-stop'+(day?' data-plan-day="'+esc(day)+'"':'')+' data-trip-name="'+esc(e.name)+'" data-trip-query="'+esc(e.name)+'" data-trip-region="'+esc(e.region||'')+'"'+(e.id?' data-trip-ref="event:'+esc(e.id)+'"':'')+' aria-pressed="false">+</button></li>';
  }
  // "Book my trip" (one button under the plan) opens the checklist sheet: the stay, each stop's own booking link, the
  // meals to reserve by phone, tours and the estimate in one place. Only once the plan has dates or a place to stay.
  function twCanBook(){
    try{var st=typeof t3StayInputBase==='function'?(t3StayInputBase()||{}):{};var stay=typeof t3StayData==='function'&&!chat.noStay&&t3StayData();return v4CanBook()&&!!(stay||st.arrive||chatHasDates());}catch(e){return false;}
  }
  function twShowDay(day){
    twSelectedDay=Number(day);
    resultEl.querySelectorAll('.v4-day[id]').forEach(function(sec){var n=Number(sec.id.replace('t3-day-',''));sec.hidden=n!==twSelectedDay;});
    resultEl.querySelectorAll('[data-tw-day]').forEach(function(b){var on=Number(b.dataset.twDay)===twSelectedDay;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
  }
  function tripWorkspaceChrome(){
    var root=resultEl.querySelector('.v4'),main=v4Main(),bar=document.getElementById('v4Bar');if(!root||!main||!bar)return;
    main.classList.add('tw-workspace');bar.setAttribute('aria-label',twText('Trip helper','Assistant voyage'));
    var head=root.querySelector('.v4-head');
    if(head&&!head.querySelector('.tw-plan-actions')){var actions=document.createElement('div');actions.className='tw-plan-actions';actions.innerHTML='<button type="button" data-v4-save aria-pressed="false"></button><button type="button" data-v4-share></button>';head.appendChild(actions);}
    // On a phone Save and Share sit on the line under the title ("3 days · Kelowna · 12 stops"), with short labels.
    var phone=!window.matchMedia('(min-width:900px)').matches;
    var save=root.querySelector('[data-v4-save]');if(save){save.textContent=twText(v4.saved?'Saved ✓':(phone?'Save':'Save trip'),v4.saved?'Enregistré ✓':'Enregistrer');save.setAttribute('aria-label',twText('Save trip','Enregistrer le voyage'));save.setAttribute('aria-pressed',String(!!v4.saved));}
    var share=head&&head.querySelector('[data-v4-share]');if(share){share.textContent=twText(phone?'Share':'Share trip','Partager');share.setAttribute('aria-label',twText('Share trip','Partager le voyage'));}
    root.querySelectorAll('.v4-confirm,.v4-tip:not(.v4-picked)').forEach(function(el){el.remove();});
    var sections=Array.from(root.querySelectorAll('.v4-day[id]')),dayNumbers=sections.map(function(s){return Number(s.id.replace('t3-day-',''));});
    twSelectedDay=tripWorkspaceDay(dayNumbers,twSelectedDay);
    var daysEl=root.querySelector('.v4-days');
    if(sections.length>1&&!root.querySelector('.tw-day-tabs')){var tabs=document.createElement('div');tabs.className='tw-day-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',twText('Choose a day','Choisir un jour'));tabs.innerHTML=dayNumbers.map(function(n){return '<button type="button" role="tab" data-tw-day="'+n+'" aria-controls="t3-day-'+n+'">'+esc(twText('Day ','Jour ')+n)+'</button>';}).join('');daysEl.before(tabs);sections.forEach(function(sec){sec.setAttribute('role','tabpanel');});}
    if(twSelectedDay!==null)twShowDay(twSelectedDay);
    if(!root.querySelector('.tw-book-note')){var note=document.createElement('p');note.className='tw-book-note';note.textContent=twText('Book directly with each business. Your saved trip is a plan, not a reservation.','Réservez auprès de chaque lieu. Votre voyage enregistré est un plan, pas une réservation.');daysEl.after(note);}
    var bookBox=root.querySelector('.tw-book'),canBook=twCanBook();
    if(canBook&&!bookBox){bookBox=document.createElement('div');bookBox.className='tw-book';bookBox.innerHTML='<button type="button" class="tw-book-btn" data-v4-book>'+esc(vt('book'))+'</button>';daysEl.after(bookBox);}
    else if(!canBook&&bookBox)bookBox.remove();
    // The place to stay stays in the plan (above the days). Only the car, shuttle and tour links fold away.
    var options=root.querySelector('.tw-options'),gh=root.querySelector('.v4-gh');
    if(gh&&!options){options=document.createElement('details');options.className='tw-options';options.innerHTML='<summary>'+esc(twText('Getting here & tours','Pour venir et excursions'))+'</summary>';options.open=twOptionsOpen;root.querySelector('.tw-book-note').after(options);}
    if(gh&&gh.parentNode!==options)options.appendChild(gh);
    var stayCard=root.querySelector('.v4-stay-card'),stayAt=root.querySelector('.tw-day-tabs')||daysEl;
    if(stayCard&&stayCard.nextElementSibling!==stayAt)stayAt.before(stayCard);
    if(!bar.querySelector('.tw-chat-title')){var heading=document.createElement('h2');heading.className='tw-chat-title';heading.textContent=twText('✨ Your trip helper','✨ Votre assistant voyage');var hint=document.createElement('p');hint.className='tw-chat-hint';hint.textContent=twText('Tell me what to change. Your plan stays right here.','Dites-moi quoi changer. Votre plan reste ici.');bar.prepend(hint);bar.prepend(heading);}
    twSummary(root,head);
    var agent=resultEl.querySelector('#v4Agent');if(agent){var old=bar.querySelector('#v4Agent');if(old)old.remove();}
    else agent=bar.querySelector('#v4Agent');
    // The agent's first line and "When are you coming?": in the chat sidebar on a wide screen, at the top of the plan on a phone.
    if(agent){if(window.matchMedia('(min-width:900px)').matches)bar.querySelector('.tw-chat-hint').after(agent);else if(head)head.after(agent);}
    twSummaryPlace(root,agent);
    var input=document.getElementById('v4ChatIn');if(input)input.placeholder=twText('Ask for a change…','Demandez un changement…');
    twPad();
  }
  // The summary under the title: one line of short facts from the plan's own data (tripSummaryFacts) and a "Details"
  // button. The sentences the plan view prints (what was left out, the note for one person, the asks the listings only
  // partly support, no driving, the town we picked) move under Details, closed until asked for; on a phone the agent's
  // first line, its caveat and "See N more" places to stay are there too. Nothing is dropped; an ask that is not fully
  // met stays flagged in the line itself.
  function twSummaryFacts(){
    var fr=lang()==='fr',party='',unset=false;
    try{var d=typeof t3StayData==='function'?t3StayData():null,t=(d&&d.w&&d.w.trip)||null;// The party is on the stay card ("Where you’ll stay · 6 adults"); said here only when that card is not shown.
      if(t&&(!chatOvernight()||chat.noStay))party=t3StayTripLine({adults:t.adults,adultsAssumed:t.adultsAssumed,kids:t.kids,dog:t.dog},fr);
      // "Dates not set" only once the dates question is gone ("Not sure yet"); while it is asked, the question says it.
      unset=chatOvernight()&&!chatHasDates()&&!((t3StayInputBase()||{}).arrive)&&!!chat.askedWhen;}catch(e){}
    var gone={};try{gone=v4RemovedIds();}catch(e){}
    var bg=null;try{bg=typeof v4Budget==='function'?v4Budget():null;}catch(e){bg=null;}
    return tripSummaryFacts(state.last,fr,{party:party,datesUnset:unset,removed:gone,budget:bg});
  }
  function twSummary(root,head){
    if(!head||root.querySelector('.tw-sum'))return;
    var facts=[];try{facts=twSummaryFacts();}catch(e){facts=[];}
    if(!facts.length)return;
    var notes=Array.from(root.children).filter(function(el){return el.matches('p.v4-tip.v4-picked');});
    var sum=document.createElement('section');sum.className='tw-sum';sum.setAttribute('aria-label',twText('Trip summary','Résumé du voyage'));
    sum.innerHTML='<ul class="tw-facts">'+facts.map(function(f){return '<li class="tw-fact-'+esc(f.kind)+'"'+(f.status?' data-status="'+esc(f.status)+'"':'')+'><span>'+esc(f.text)+'</span></li>';}).join('')
      +'<li class="tw-fact-more"><button type="button" class="tw-sum-toggle" id="twSumToggle" aria-expanded="'+(twSumOpen?'true':'false')+'" aria-controls="twSumMore">'+esc(twText('Details','Détails'))+'</button></li></ul>'
      +'<div class="tw-sum-more" id="twSumMore"'+(twSumOpen?'':' hidden')+'><div class="tw-sum-agent"></div><div class="tw-sum-notes"></div><div class="tw-sum-stay"></div></div>';
    head.after(sum);
    var box=sum.querySelector('.tw-sum-notes');notes.forEach(function(el){box.appendChild(el);});
    root.classList.add('tw-has-sum');
  }
  // Where the agent's first line and "See N more" sit: under Details on a phone (the dates question stays in the plan,
  // as one row); in the chat sidebar and on the stay card on a wide screen. Run again on resize.
  function twSummaryPlace(root,agent){
    var sum=root.querySelector('.tw-sum');if(!sum)return;
    var mobile=!window.matchMedia('(min-width:900px)').matches,slot=sum.querySelector('.tw-sum-agent'),staySlot=sum.querySelector('.tw-sum-stay');
    if(agent){
      if(mobile){
        var said=Array.from(agent.children).filter(function(el){return el.tagName==='P';});said.forEach(function(el){slot.appendChild(el);});
        // A sentence the agent's line already says is not printed twice under Details.
        var text=slot.textContent.replace(/\s+/g,' ');Array.from(sum.querySelectorAll('.tw-sum-notes p')).forEach(function(el){var t=el.textContent.replace(/\s+/g,' ').trim();el.hidden=!!t&&text.indexOf(t)!==-1;});
        sum.after(agent);
      }else{
        var ask=agent.querySelector('.v4-ask');Array.from(slot.children).forEach(function(el){if(ask)ask.before(el);else agent.appendChild(el);});
        Array.from(sum.querySelectorAll('.tw-sum-notes p')).forEach(function(el){el.hidden=false;});
      }
      agent.classList.toggle('tw-agent-empty',mobile&&!agent.querySelector('.v4-ask'));
    }
    var card=root.querySelector('.v4-stay-card'),acts=card&&card.querySelector('.v4-stay-acts'),more=root.querySelector('[data-v4-stay-more]');
    if(more&&acts){if(mobile&&more.parentNode!==staySlot){staySlot.innerHTML='<span>'+esc(twText('Place to stay:','Hébergement :'))+'</span>';staySlot.appendChild(more);}else if(!mobile&&more.parentNode!==acts){acts.appendChild(more);staySlot.innerHTML='';}}
    // Nothing to open (a wide screen with no notes): no Details button.
    var any=Array.from(sum.querySelectorAll('.tw-sum-more p, .tw-sum-more button')).some(function(el){return !el.hidden;}),li=sum.querySelector('.tw-fact-more');
    if(li)li.hidden=!any;if(!any)sum.querySelector('.tw-sum-more').hidden=true;
  }
  function twSumSet(open){
    twSumOpen=!!open;var b=document.getElementById('twSumToggle'),box=document.getElementById('twSumMore');if(!b||!box)return;
    b.setAttribute('aria-expanded',twSumOpen?'true':'false');box.hidden=!twSumOpen;twPad();
  }
  // Keyboard focus survives a redraw of the plan (a chat change, Swap, "See N more"): the same control is focused again.
  function twFocusKey(){
    var a=document.activeElement;if(!a||!resultEl.contains(a))return null;
    if(a.id)return '#'+a.id;
    if(a.hasAttribute('data-tw-day'))return '[data-tw-day="'+a.getAttribute('data-tw-day')+'"]';
    if(a.hasAttribute('data-v4-stay-more'))return '[data-v4-stay-more]';
    return null;
  }
  function twFocusBack(sel){
    if(!sel||(document.activeElement&&document.activeElement!==document.body&&document.contains(document.activeElement)))return;
    var el=null;try{el=resultEl.querySelector(sel);}catch(e){}
    if(el){try{el.focus({preventScroll:true});}catch(e){el.focus();}}
  }
  function twPad(){var bar=document.getElementById('v4Bar');if(!bar)return;var mobile=window.matchMedia('(max-width:899px)').matches;document.body.style.paddingBottom=mobile?bar.offsetHeight+'px':'';document.documentElement.style.setProperty('--v4-bar-h',mobile?bar.offsetHeight+'px':'0px');}
  var twBaseRender=v4Render;
  v4Render=function(focus){v4.confirmed=false;v4.saved=false;var old=resultEl.querySelector('.tw-options');if(old)twOptionsOpen=old.open;var at=focus?null:twFocusKey();twBaseRender(focus);tripWorkspaceChrome();twFocusBack(at);};
  var twBaseUpdate=v4UpdateBar;
  v4UpdateBar=function(){v4.confirmed=false;twBaseUpdate();tripWorkspaceChrome();};
  v4Share=function(){
    var list=v4ShareStops();if(!list.length)return;
    var url=v4ShareLink(list),text=v4ShareText(),dlg=document.getElementById('twShare');
    if(!dlg){dlg=document.createElement('dialog');dlg.id='twShare';dlg.className='tw-share';document.body.appendChild(dlg);}
    // A food allergy (2026-11-23, trip-allergy-need.js): health details are the traveller's to share. One tick, off by
    // default: off, the link and the copied itinerary say only that allergies are not checked (no allergen is named,
    // none is in the link); on, they name it. Shown only on a plan that names an allergen.
    var alE=typeof v4AllergyEntry==='function'?v4AllergyEntry():null,alRow='';
    if(alE&&alE.share){var alName=(lang()==='fr'&&alE.labelFr)||alE.label;alRow='<label class="tw-share-al" for="twShareAl"><input type="checkbox" id="twShareAl"'+(v4.shareAllergy===alE.share?' checked':'')+'><span>'+esc(twText('Include “'+alName+'”','Inclure « '+alName+' »'))+'</span></label><p class="tw-share-al-note">'+esc(twText('Off: the link and itinerary only say allergies aren’t checked.','Décoché : le lien et le programme disent seulement que les allergies ne sont pas vérifiées.'))+'</p>';}
    dlg.onchange=function(e){if(!e.target||e.target.id!=='twShareAl'||!alE)return;v4.shareAllergy=e.target.checked?alE.share:null;url=v4ShareLink(list);text=v4ShareText();var box=document.getElementById('twShareUrl');if(box)box.value=url;document.getElementById('twShareStatus').textContent='';};
    dlg.innerHTML='<h2>'+esc(twText('Share your trip','Partager votre voyage'))+'</h2><p>'+esc(twText('Send this link to your group chat. It opens a copy of this plan to view: the stops and times, the place to stay and the booking links. It doesn’t change if you edit your plan later, and nothing in it is booked.','Envoyez ce lien à votre groupe. Il ouvre une copie de ce plan à consulter : les étapes et les heures, l’hébergement et les liens de réservation. Elle ne change pas si vous modifiez votre plan, et rien n’y est réservé.'))+'</p>'+alRow+'<label for="twShareUrl">'+esc(twText('Trip link','Lien du voyage'))+'</label><input id="twShareUrl" readonly value="'+esc(url)+'"><div class="tw-share-actions"><button type="button" data-tw-copy="link">'+esc(twText('Copy link','Copier le lien'))+'</button><button type="button" data-tw-copy="itinerary">'+esc(twText('Copy itinerary','Copier le programme'))+'</button>'+(navigator.share?'<button type="button" data-tw-native>'+esc(twText('Share via…','Partager via…'))+'</button>':'')+'<button type="button" data-tw-close>'+esc(twText('Close','Fermer'))+'</button></div><p role="status" id="twShareStatus"></p>';
    dlg.showModal();
    dlg.onclick=function(e){var b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-tw-close')){dlg.close();return;}if(b.hasAttribute('data-tw-native')){navigator.share({title:text.split('\n')[0],text:text,url:url}).catch(function(){});return;}if(b.hasAttribute('data-tw-copy')){var value=b.dataset.twCopy==='link'?url:text+'\n'+url;var done=function(){document.getElementById('twShareStatus').textContent=twText('Copied — ready to paste into your group chat.','Copié — prêt à envoyer à votre groupe.');track('trip_share',{method:'copy',stop_count:list.length,source:'plan_v4'});};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(value).then(done,function(){document.getElementById('twShareStatus').textContent=twText('Select the link above to copy it.','Sélectionnez le lien pour le copier.');});}};
  };
  var twBaseBar=v4BarHtml;
  v4BarHtml=function(){return v4.ask?twBaseBar():'';};
  var twBasePad=chatPad;chatPad=function(){twBasePad();twPad();};
  var twBaseGlow=chatGlow;
  chatGlow=function(keys){if(keys.indexOf('gh')!==-1){var opt=resultEl.querySelector('.tw-options');if(opt){opt.open=true;twOptionsOpen=true;}}for(var i=0;i<keys.length;i++){var row=chatRow(keys[i]),sec=row&&row.closest('.v4-day[id]');if(sec){twShowDay(sec.id.replace('t3-day-',''));break;}}twBaseGlow(keys);keys.forEach(function(k){var row=chatRow(k),info=row&&row.querySelector('.tw-card-info');if(info&&!info.querySelector('.tw-updated')){var badge=document.createElement('span');badge.className='tw-updated';badge.textContent=twText('Updated','Modifié');info.prepend(badge);}});};
  document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-tw-day]');if(b){twShowDay(b.dataset.twDay);}});
  document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('#twSumToggle');if(b)twSumSet(b.getAttribute('aria-expanded')!=='true');});
  document.addEventListener('keydown',function(e){var b=e.target.closest&&e.target.closest('[data-tw-day]');if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;var buttons=Array.from(resultEl.querySelectorAll('[data-tw-day]')),i=buttons.indexOf(b);i=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;e.preventDefault();twShowDay(buttons[i].dataset.twDay);buttons[i].focus();});
  window.addEventListener('resize',function(){if(state.last)tripWorkspaceChrome();});
`;
module.exports={tripWorkspaceDay,tripWorkspaceBooking,tripSummaryFacts,WORKSPACE_STYLES,WORKSPACE_CLIENT_SRC};
