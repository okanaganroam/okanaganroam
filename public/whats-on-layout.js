(window.__whatsOnReady||function(fn){fn()})(function(){
 const discovery=document.querySelector('.wo-discovery'),controls=document.querySelector('.whatson-controls');
 if(discovery&&controls)discovery.append(controls);
 const intro=document.querySelector('.whatson-intro');
 const shortIntro=()=>{if(intro&&intro.textContent!=='Live music, markets and little adventures. Find your next good day out.')intro.textContent='Live music, markets and little adventures. Find your next good day out.'};
 shortIntro();
 const townLabel=document.querySelector('.wo-town-label');
 const weekly=document.getElementById('whatsOnNights');
 function syncWeekly(selected){
  if(!weekly)return;
  const regions=selected.map(c=>c.dataset.region);
  const names=selected.map(c=>c.textContent.trim().replace(/\s+\d+\s*$/,''));
  const where=names.length?names.join(', '):'the Okanagan';
  let total=0;
  weekly.querySelectorAll('[data-wo-weekly-region]').forEach(li=>{li.hidden=regions.length>0&&!regions.includes(li.dataset.woWeeklyRegion);if(!li.hidden)total++});
  weekly.querySelectorAll('[data-wo-weekly-label]').forEach(group=>{
   const count=group.querySelectorAll('[data-wo-weekly-region]:not([hidden])').length;
   group.hidden=count===0;
   const summary=group.querySelector('[data-wo-weekly-summary]');
   if(summary)summary.textContent=group.dataset.woWeeklyLabel+' at '+count+' place'+(count===1?'':'s');
  });
  weekly.querySelectorAll('.whatson-nights-day').forEach(day=>{day.hidden=!day.querySelector('[data-wo-weekly-label]:not([hidden])')});
  const context=document.getElementById('woWeeklyTown');if(context)context.textContent=names.length?'Regular nights in '+where+'.':'Regular nights across the Okanagan.';
  const empty=document.getElementById('woWeeklyEmpty');if(empty){empty.hidden=total>0;empty.textContent=total?'':'No weekly favourites are listed for '+where+' yet. Try another town.'}
  const fold=weekly.querySelector('.wo-fold');if(fold)fold.hidden=total===0;
 }

 const sync=()=>{
  const selected=[...document.querySelectorAll('#whatsOnRegionsPanel [data-region][aria-pressed="true"]')];
  syncWeekly(selected);
  if(townLabel)townLabel.textContent=selected.length===1?selected[0].textContent.trim().replace(/\s+\d+\s*$/,''):selected.length>1?selected.length+' towns':'Choose a town';
  const active=new URL(location.href).searchParams.get('when')||'';
  document.querySelectorAll('.wo-when [data-when]').forEach(a=>a.setAttribute('aria-pressed',String(a.dataset.when===active)));
  const more=document.querySelector('.wo-more-types');if(more&&more.querySelector('[aria-pressed="true"]'))more.open=true;
  shortIntro();
 };
 document.querySelectorAll('.wo-panel-close').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const panel=b.closest('.whatson-pop-panel');const trigger=document.querySelector('[aria-controls="'+panel.id+'"]');if(trigger){trigger.click();trigger.focus()}}));
 const panel=document.getElementById('whatsOnRegionsPanel');if(panel)new MutationObserver(sync).observe(panel,{subtree:true,attributes:true,attributeFilter:['aria-pressed']});
 const types=document.querySelector('.wo-types');if(types)new MutationObserver(sync).observe(types,{subtree:true,attributes:true,attributeFilter:['aria-pressed']});
 window.addEventListener('popstate',sync);sync();
});

// Return to the same expanded list and scroll position after viewing an event.
(window.__whatsOnReady||function(fn){fn()})(function(){
 const list=document.getElementById('whatsOnResults');if(!list)return;
 const key='roam-whats-on-return';
 const pageUrl=()=>location.pathname+location.search;
 list.addEventListener('click',function(event){
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target.closest('.venue-card-link');if(!link)return;
  try{sessionStorage.setItem(key,JSON.stringify({url:pageUrl(),count:list.querySelectorAll('.whatson-event-card').length,y:scrollY,href:link.getAttribute('href'),top:link.getBoundingClientRect().top,at:Date.now()}))}catch{}
 },true);
 function restore(){
  let saved;try{saved=JSON.parse(sessionStorage.getItem(key)||'null')}catch{return}
  if(!saved||saved.url!==pageUrl()||Date.now()-saved.at>30*60*1000)return;
  const more=document.getElementById('whatsOnShowMore');
  for(let n=0;n<100&&more&&!more.hidden&&list.querySelectorAll('.whatson-event-card').length<saved.count;n++)more.click();
  try{sessionStorage.removeItem(key)}catch{}
  const link=[...list.querySelectorAll('.venue-card-link')].find(a=>a.getAttribute('href')===saved.href);
  if(link&&Number.isFinite(saved.top)){
   // Lazy card rendering can change heights above this event. Restore the
   // event's on-screen position rather than an outdated document pixel.
   link.scrollIntoView({block:'center',behavior:'instant'});
   requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:Math.max(0,scrollY+link.getBoundingClientRect().top-saved.top),behavior:'instant'})));
  }else requestAnimationFrame(()=>window.scrollTo({top:Math.max(0,Number(saved.y)||0),behavior:'instant'}));
 }
 const schedule=()=>requestAnimationFrame(()=>requestAnimationFrame(restore));
 window.addEventListener('pageshow',schedule);schedule();
});
