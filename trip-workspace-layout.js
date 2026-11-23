'use strict';
function tripWorkspaceDay(days, selected) {
  return days.includes(Number(selected)) ? Number(selected) : days.length ? days[0] : null;
}
function tripWorkspaceBooking(id, steps) {
  const valid=(steps||[]).filter(s=>s && s.kind==='venue' && Number(s.id)===Number(id) && /^https?:\/\//i.test(s.url||''));
  return valid.find(s=>!s.affiliate)||valid[0]||null;
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
.tw-share button {min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid #1b303c;background:#1b303c;color:white;font:800 14px Nunito,sans-serif;cursor:pointer;}
@media(max-width:899px){
 .t3-v4.tw-workspace.has-plan {display:block;padding:12px 16px 30px;}
 .t3-v4.tw-workspace .v4-head {padding:6px 0 14px;gap:10px;}
 .t3-v4.tw-workspace .v4-head h2 {font-size:28px;}
 .t3-v4.tw-workspace .tw-plan-actions {width:100%;}
 .t3-v4.tw-workspace .tw-plan-actions button {flex:1;}
 .t3-v4.tw-workspace .tw-day-tabs button {min-width:88px;}
 .t3-v4.tw-workspace .v4-row {grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:0 12px 12px;}
 .t3-v4.tw-workspace .v4-thumb {grid-column:1/-1;width:calc(100% + 24px);max-width:none;margin:0 -12px;height:155px;border-radius:0;}
 .t3-v4.tw-workspace .v4-row:has(.v4-thumb--none) {padding-top:12px;}
 .t3-v4.tw-workspace .v4-agent {margin:0 0 12px;}
 .t3-v4.tw-workspace .tw-book-btn {max-width:none;}
 .t3-v4.tw-workspace .v4-name {font-size:21px;}
 .t3-v4.tw-workspace .tw-links {margin-top:4px;gap:0 12px;}
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
  var twSelectedDay=1,twOptionsOpen=false;
  function twText(en,fr){return lang()==='fr'?fr:en;}
  function tripWorkspaceStopHtml(s,key,counts){
    var v=s.venue,id=key||('s'+v.id),did='v4d-'+id,url=placeUrl(v);
    var steps=typeof t3BookSteps==='function'?t3BookSteps():[],fallback=v4Fallback();
    if(fallback&&fallback.steps)steps=steps.concat(fallback.steps);
    var booking=tripWorkspaceBooking(v.id,steps);
    var reason=t3WhyLines(s).filter(function(w){return !/straight line|ligne droite|listed on|répertorié/i.test(w);})[0]||'';
    var actions=key?(s.noSwap?'':'<button type="button" class="v4-icon" data-t3-swap="'+esc(key)+'" aria-label="'+esc(vt('swap',{name:v.name}))+'">⇄ '+esc(twText('Swap','Changer'))+'</button>')+'<button type="button" class="v4-icon" data-t3-remove="'+esc(key)+'" aria-label="'+esc(vt('remove',{name:v.name}))+'">× '+esc(twText('Remove','Retirer'))+'</button>':'<button type="button" class="v4-icon" data-t3-swap-id="'+esc(v.id)+'" aria-label="'+esc(vt('swap',{name:v.name}))+'">⇄ '+esc(twText('Swap','Changer'))+'</button><button type="button" class="v4-icon" data-v4-remove-id="'+esc(v.id)+'" aria-label="'+esc(vt('remove',{name:v.name}))+'">× '+esc(twText('Remove','Retirer'))+'</button>';
    var links=(url?'<a '+hrefAttr(url)+'>'+esc(twText('View details','Voir les détails'))+'</a>':'');
    if(booking)links+=t3StepLinkHtml(booking,'tw-book-link',twText(booking.affiliate?'Book with provider':'Book with business',booking.affiliate?'Réserver chez le prestataire':'Réserver auprès du lieu'),steps.indexOf(booking));
    else if(v.website&&t3StayExt(v.website))links+='<a '+hrefAttr(t3StayExt(v.website))+' target="_blank" rel="noopener">'+esc(twText('Venue website','Site du lieu'))+' ↗</a>';
    return '<li class="v4-stop" data-venue-id="'+esc(v.id)+'"><div class="v4-row">'+v4Thumb(v)+'<div class="tw-card-info"><button type="button" class="v4-main" aria-expanded="'+(v4.open[id]?'true':'false')+'" aria-controls="'+esc(did)+'" data-v4-toggle="'+esc(did)+'" data-v4-id="'+esc(id)+'"><span class="v4-time">'+esc(v4Start(s,key))+'</span><span class="v4-name">'+esc(v.name)+'</span><span class="v4-line">'+esc(v4Line(s))+'</span></button>'+(reason?'<p class="tw-fit">'+esc(reason)+'</p>':'')+'<div class="tw-links">'+links+'</div></div><div class="v4-acts">'+actions+'</div></div><div class="v4-more" id="'+esc(did)+'"'+(v4.open[id]?'':' hidden')+'>'+v4Details(s,id)+'</div>'+v4TripBtn(v,key)+'</li>';
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
    if(head&&!head.querySelector('.tw-plan-actions')){var actions=document.createElement('div');actions.className='tw-plan-actions';actions.innerHTML='<button type="button" data-v4-save aria-pressed="false"></button><button type="button" data-v4-share>'+esc(twText('Share trip','Partager'))+'</button>';head.appendChild(actions);}
    var save=root.querySelector('[data-v4-save]');if(save){save.textContent=twText(v4.saved?'Saved ✓':'Save trip',v4.saved?'Enregistré ✓':'Enregistrer');save.setAttribute('aria-pressed',String(!!v4.saved));}
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
    var agent=resultEl.querySelector('#v4Agent');if(agent){var old=bar.querySelector('#v4Agent');if(old)old.remove();}
    else agent=bar.querySelector('#v4Agent');
    // The agent's first line and "When are you coming?": in the chat sidebar on a wide screen, at the top of the plan on a phone.
    if(agent){if(window.matchMedia('(min-width:900px)').matches)bar.querySelector('.tw-chat-hint').after(agent);else if(head)head.after(agent);}
    var input=document.getElementById('v4ChatIn');if(input)input.placeholder=twText('Ask for a change…','Demandez un changement…');
    twPad();
  }
  function twPad(){var bar=document.getElementById('v4Bar');if(!bar)return;var mobile=window.matchMedia('(max-width:899px)').matches;document.body.style.paddingBottom=mobile?bar.offsetHeight+'px':'';document.documentElement.style.setProperty('--v4-bar-h',mobile?bar.offsetHeight+'px':'0px');}
  var twBaseRender=v4Render;
  v4Render=function(focus){v4.confirmed=false;v4.saved=false;var old=resultEl.querySelector('.tw-options');if(old)twOptionsOpen=old.open;twBaseRender(focus);tripWorkspaceChrome();};
  var twBaseUpdate=v4UpdateBar;
  v4UpdateBar=function(){v4.confirmed=false;twBaseUpdate();tripWorkspaceChrome();};
  v4Share=function(){
    var list=v4ShareStops();if(!list.length)return;
    var url=v4ShareLink(list),text=v4ShareText(),dlg=document.getElementById('twShare');
    if(!dlg){dlg=document.createElement('dialog');dlg.id='twShare';dlg.className='tw-share';document.body.appendChild(dlg);}
    dlg.innerHTML='<h2>'+esc(twText('Share your trip','Partager votre voyage'))+'</h2><p>'+esc(twText('Send this link to your group chat. It opens a copy of this plan to view: the stops and times, the place to stay and the booking links. It doesn’t change if you edit your plan later, and nothing in it is booked.','Envoyez ce lien à votre groupe. Il ouvre une copie de ce plan à consulter : les étapes et les heures, l’hébergement et les liens de réservation. Elle ne change pas si vous modifiez votre plan, et rien n’y est réservé.'))+'</p><label for="twShareUrl">'+esc(twText('Trip link','Lien du voyage'))+'</label><input id="twShareUrl" readonly value="'+esc(url)+'"><div class="tw-share-actions"><button type="button" data-tw-copy="link">'+esc(twText('Copy link','Copier le lien'))+'</button><button type="button" data-tw-copy="itinerary">'+esc(twText('Copy itinerary','Copier le programme'))+'</button>'+(navigator.share?'<button type="button" data-tw-native>'+esc(twText('Share via…','Partager via…'))+'</button>':'')+'<button type="button" data-tw-close>'+esc(twText('Close','Fermer'))+'</button></div><p role="status" id="twShareStatus"></p>';
    dlg.showModal();
    dlg.onclick=function(e){var b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-tw-close')){dlg.close();return;}if(b.hasAttribute('data-tw-native')){navigator.share({title:text.split('\n')[0],text:text,url:url}).catch(function(){});return;}if(b.hasAttribute('data-tw-copy')){var value=b.dataset.twCopy==='link'?url:text+'\n'+url;var done=function(){document.getElementById('twShareStatus').textContent=twText('Copied — ready to paste into your group chat.','Copié — prêt à envoyer à votre groupe.');track('trip_share',{method:'copy',stop_count:list.length,source:'plan_v4'});};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(value).then(done,function(){document.getElementById('twShareStatus').textContent=twText('Select the link above to copy it.','Sélectionnez le lien pour le copier.');});}};
  };
  var twBaseBar=v4BarHtml;
  v4BarHtml=function(){return v4.ask?twBaseBar():'';};
  var twBasePad=chatPad;chatPad=function(){twBasePad();twPad();};
  var twBaseGlow=chatGlow;
  chatGlow=function(keys){if(keys.indexOf('gh')!==-1){var opt=resultEl.querySelector('.tw-options');if(opt){opt.open=true;twOptionsOpen=true;}}for(var i=0;i<keys.length;i++){var row=chatRow(keys[i]),sec=row&&row.closest('.v4-day[id]');if(sec){twShowDay(sec.id.replace('t3-day-',''));break;}}twBaseGlow(keys);keys.forEach(function(k){var row=chatRow(k),info=row&&row.querySelector('.tw-card-info');if(info&&!info.querySelector('.tw-updated')){var badge=document.createElement('span');badge.className='tw-updated';badge.textContent=twText('Updated','Modifié');info.prepend(badge);}});};
  document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-tw-day]');if(b){twShowDay(b.dataset.twDay);}});
  document.addEventListener('keydown',function(e){var b=e.target.closest&&e.target.closest('[data-tw-day]');if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;var buttons=Array.from(resultEl.querySelectorAll('[data-tw-day]')),i=buttons.indexOf(b);i=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;e.preventDefault();twShowDay(buttons[i].dataset.twDay);buttons[i].focus();});
  window.addEventListener('resize',function(){if(state.last)tripWorkspaceChrome();});
`;
module.exports={tripWorkspaceDay,tripWorkspaceBooking,WORKSPACE_STYLES,WORKSPACE_CLIENT_SRC};
