'use strict';
const {t3FrenchText,t3FrenchEvent,t3FrenchPlan,t3FrenchStory,t3FrenchStopText,FR_MONTHS_BY_EN,FR_SEASON_WORDS,FR_STOP_NOUN}=require('./trip-french-copy');

// ---------- Build My Trip V3 page (Step 2, 2026-09-29) ----------
//
// The redesigned /trip, served only while TRIP_PLANNER_V3 is 'on' (or
// 'preview' for a browser that opted in) -- see tripPlannerV3Mode() in
// server.js. With the flag off nothing here is used and /trip is unchanged.
//
// It is a VIEW over the same deterministic planner: POST /api/trip/plan
// (trip-planner.js) picks every place; this page only shows what the API
// returned -- stop names, types, regions, ratings, review counts, prices,
// verified badges, collections and listed hours exactly as stored -- plus
// straight-line distances computed from the two stops' stored coordinates
// (and only when both have them). No AI, no new data, no invented facts.
//
// Visual language: the new homepage's (tokens.css --ref-* palette, Fraunces
// headings, Nunito text, navy pill buttons, photo cards with a soft bottom
// scrim, the navy "Build your trip" band). Everything is scoped under .t3 so
// no other page can be affected. The shared header, Trip tray and footer are
// the homepage's own (read, never modified), and /scripts/app.js is loaded
// unchanged: its .trip-btn / .fav-btn handlers run Add to Trip / Favorites.

// ---- pure helpers, shared with the browser (see CLIENT_HELPERS_SRC) ----

function t3TimelineRows(p,removed={}){
 const stops=p.days?.length?p.days.flatMap(d=>(d.stops||[]).map(s=>({...s,day:d.day}))):(p.itinerary?.stops||p.outing?.stops||[]).map(s=>({...s,day:1}));
 let previous=null,changedDay=null;
 return (p.schedule||[]).map(item=>{
  const stop=stops.find(s=>s.day===item.day&&(item.notScheduledMeal?s.unscheduledMeal&&s.daypart===item.daypart:item.venueId!=null?s.venue?.id===item.venueId:s.event?.id===item.eventId));
  if(stop&&removed[stop.day+'-'+stop.daypart]){previous=null;changedDay=item.day;return null;}
  if(changedDay===item.day){const row={...item,name:stop?.venue?.name||stop?.event?.name||'',status:'unverified',gapMinutes:null,transferMinutes:undefined,arrivalAllowanceMinutes:undefined};if(item.venueId!=null){row.startMinutes=undefined;row.endMinutes=undefined;delete row.mealWindow;}return row;}
  const gap=previous?.day===item.day&&Number.isFinite(previous.endMinutes)&&Number.isFinite(item.startMinutes)&&Number.isFinite(item.transferMinutes)?Math.max(0,item.startMinutes-previous.endMinutes-item.transferMinutes-(item.arrivalAllowanceMinutes||0)):null;
  const row={...item,name:item.notScheduledMeal?(stop?.label||'Dinner'):stop?.venue?.name||stop?.event?.name||'',gapMinutes:gap};previous=item;return row;
 }).filter(Boolean);
}
// Times as the site's venue pages show them (2026-10-18): English "12 PM – 6 PM" / "7:30 PM", French "12 h–18 h" /
// "19 h 30". The planner API keeps 24-hour clock strings; this changes only the page's text.
function t3LocalTimes(value,language){
 const fr=language==='fr';
 const fmt=(h,m)=>{h=Number(h)%24;m=Number(m||0);if(fr)return h+' h'+(m?' '+String(m).padStart(2,'0'):'');return (h%12||12)+(m?':'+String(m).padStart(2,'0'):'')+(h<12?' AM':' PM');};
 // English ISO dates read as dates (2026-10-19): "Trip starts on 2026-10-24" -> "Trip starts on Sat, Oct 24, 2026".
 const iso=s=>fr?s:s.replace(/\b(20\d\d)-(\d\d)-(\d\d)\b/g,(raw,y,m,d)=>{const t=new Date(Date.UTC(+y,+m-1,+d,12));if(t.getUTCMonth()!==+m-1)return raw;return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][t.getUTCDay()]+', '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]+' '+(+d)+', '+y;});
 const text=s=>iso(String(s)).replace(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi,(raw,h,m,ap)=>{const n=Number(h);if(n<1||n>12)return raw;return fmt(n%12+(ap.toLowerCase()==='pm'?12:0),m);})
  .replace(/\b(0\d|1\d|2[0-3]):([0-5]\d)\b(?!\s*(?:AM|PM|h\b))/g,(_,h,m)=>fmt(h,m))
  .replace(/\b0(\d) h\b/g,'$1 h')
  .replace(fr?/(\d h(?: \d\d)?) ?[–-] ?(\d)/g:/((?:AM|PM)) ?[–-] ?(\d)/g,fr?'$1–$2':'$1 – $2');
 const skip={url:1,photo:1,name:1,address:1,slug:1,query:1,id:1,date:1,startDate:1,endDate:1,startTime:1,endTime:1,region:1,regionLabel:1,venueName:1};
 const walk=(x,key)=>{if(typeof x==='string')return skip[key]?x:text(x);if(Array.isArray(x))return x.map(y=>walk(y,key));if(x&&typeof x==='object'){const o={};for(const k of Object.keys(x))o[k]=walk(x[k],k);return o;}return x;};
 return typeof value==='string'?text(value):walk(value,'');
}
function t3EventPlaceHtml(event,language,esc){
 const venue=String(event?.venueName||'').trim();if(!venue)return '';
 return '<p class="t3-event-place">'+esc(language==='fr'?'Lieu : ':'Venue: ')+esc(venue)+'</p>';
}
function t3VenueCardId(id){
 return 't3-venue-card-'+String(id).replace(/[^A-Za-z0-9_-]/g,'-');
}
function t3ListingGapGroups(p){
 const stops=(p.days||[]).reduce((all,d)=>all.concat(d.stops||[]),[]).concat((p.itinerary||{}).stops||[],(p.outing||{}).stops||[],p.recommendations||[]);
 const groups={hours:[],location:[]},seen={hours:{},location:{}};
 stops.forEach(s=>{
  if(!s||!s.venue)return;
  (s.caveats||[]).forEach(c=>{
   const kind=/No usable hours listed|Aucun horaire utilisable/i.test(c)?'hours':/No map location on file|emplacement.*carte/i.test(c)?'location':null;
   if(!kind)return;
   const v=s.venue,key=v.id!=null?'id:'+v.id:'name:'+String(v.name||'');
   if(seen[kind][key])return;
   seen[kind][key]=true;
   groups[kind].push({id:v.id!=null?v.id:null,name:String(v.name||'Venue'),url:typeof v.url==='string'&&/^\/(?!\/)/.test(v.url)?v.url:null});
  });
 });
 return Object.keys(groups).filter(kind=>groups[kind].length).map(kind=>({kind,venues:groups[kind]}));
}
function t3ListingGapSummaryHtml(p,fr,esc){
 const groups=t3ListingGapGroups(p);
 if(!groups.length)return '';
 const labels=fr?{title:'Détails à confirmer',hours:'Horaires non indiqués',location:'Emplacement sur la carte manquant',confirm:'Confirmez directement auprès de ces lieux.'}:{title:'Details to confirm',hours:'Hours not listed',location:'Map location missing',confirm:'Confirm directly with these venues.'};
 return '<section class="t3-warnings" aria-label="'+esc(labels.title)+'"><h3>'+esc(labels.title)+'</h3>'+groups.map(g=>'<p><strong>'+esc(labels[g.kind])+':</strong> '+g.venues.map(v=>v.id!=null?'<a href="#'+esc(t3VenueCardId(v.id))+'">'+esc(v.name)+'</a>':esc(v.name)).join(', ')+'.</p>').join('')+'<p>'+esc(labels.confirm)+'</p></section>';
}
function t3PlanNextSteps(p) {
  var steps=[],seen={};
  function browseUrl(item){
    var types={restaurant:'restaurants',cafe:'cafes',winery:'wineries',brewery:'breweries',pub:'pubs-bars',cocktail:'cocktail-lounges',distillery:'distilleries',beach:'beaches',golf:'golf',indoor:'indoor',outdoor:'outdoors',sport:'sports-recreation',tour:'tours'};
    var validRegions=['kelowna','west-kelowna','peachland','lake-country','naramata','penticton','kaleden','okanagan-falls','summerland','oliver','osoyoos','vernon','coldstream','lumby','armstrong','enderby','big-white','silverstar','apex','baldy'];
    var regions=p.intent&&Array.isArray(p.intent.regions)?p.intent.regions:[];
    if(item.kind==='event'){
      var categories={festival:'events-festivals',market:'markets-fairs','live-music':'live-music',hockey:'sports-recreation'};
      var params=[];if(regions.length===1&&validRegions.indexOf(regions[0])!==-1)params.push('regions='+regions[0]);
      if(categories[item.eventKind])params.push('categories='+categories[item.eventKind]);
      return '/whats-on'+(params.length?'?'+params.join('&'):'');
    }
    var slug=item.kind==='feature'&&item.value==='dog_friendly'?'dog-friendly':['type','type_count'].indexOf(item.kind)!==-1?types[item.value]:null;
    if(!slug)return null;
    var region=['type','type_count'].indexOf(item.kind)!==-1&&regions.length===1&&validRegions.indexOf(regions[0])!==-1?regions[0]:null;
    return '/'+(region?region+'/':'')+slug;
  }
  (p.requirementResults||[]).forEach(function(i){
    if(i.status!=='unmet'||['type','type_count','venue_kind','venue','activity','event','rainy','feature'].indexOf(i.kind)===-1)return;
    var key=i.kind+':'+i.value;if(seen[key])return;seen[key]=true;
    var eventLabels={hockey:'hockey game','live-music':'live music',festival:'festival',market:'market',comedy:'comedy show',show:'show',concert:'concert'};
    var requestLabels={pottery:'pottery class'};
    // The category word in French too (2026-10-19: "event — Non inclus").
    var labelsFr={'hockey game':'match de hockey','live music':'musique en direct',festival:'festival',market:'marché','comedy show':'spectacle d’humour',show:'spectacle',concert:'concert',event:'événement','sports event':'événement sportif','pottery class':'atelier de poterie',restaurant:'restaurant',cafe:'café',winery:'vignoble',brewery:'microbrasserie',pub:'pub',cocktail:'bar à cocktails',distillery:'distillerie',beach:'plage',golf:'golf',indoor:'lieu intérieur',outdoor:'lieu de plein air',tour:'visite guidée',sport:'sport','dog friendly':'lieu qui accepte les chiens','kid friendly':'lieu adapté aux enfants',hiking:'randonnée',rainy:'activité par temps de pluie'};
    var label=i.kind==='event'?(eventLabels[i.eventKind]||(i.value==='sports-recreation'?'sports event':'event')):i.kind==='venue'?(i.sourceText||String(i.value)):requestLabels[i.value]||String(i.value).replace(/_/g,' ');
    steps.push({kind:i.kind==='event'?'missing_event':'missing',label:label,labelFr:i.kind==='venue'?null:(labelsFr[label]||null),url:browseUrl(i),alternatives:Array.isArray(i.optionalAlternatives)?i.optionalAlternatives.filter(function(a){return a&&typeof a.name==='string'&&typeof a.url==='string'&&/^\/(?!\/)/.test(a.url);}).map(function(a){return {id:a.id,name:a.name,url:a.url,region:a.region,reasonCode:a.reasonCode};}):[]});
  });
  var stops=p.days&&p.days.length?p.days.reduce(function(a,d){return a.concat(d.stops||[]);},[]):((p.itinerary&&p.itinerary.stops)||(p.outing&&p.outing.stops)||[]);
  (p.schedule||[]).forEach(function(i){
    if(i.status==='estimated'||!i.venueId||seen['venue:'+i.venueId])return;
    var stop=stops.find(function(s){return s.venue&&s.venue.id===i.venueId;});if(!stop)return;
    seen['venue:'+i.venueId]=true;
    var url=stop.venue.url;
    steps.push({kind:'timing',name:stop.venue.name,checks:i.confirmationReasons,mealWindow:i.mealWindow,url:typeof url==='string'&&/^\/(?!\/)/.test(url)?url:null});
  });
  (p.schedule||[]).forEach(function(i){
    if(i.status==='estimated'||i.venueId)return;
    var stop=stops.find(function(s){return s.event&&s.event.id===i.eventId;});
    if(!stop){if(!seen.eventFallback){
      var fallbackChecks=[];
      if(!Number.isFinite(i.startMinutes))fallbackChecks.push('event_start');
      if(!Number.isFinite(i.endMinutes))fallbackChecks.push('event_duration');
      if(i.status==='unmet')fallbackChecks.push('event_arrival');
      fallbackChecks.push('event_travel');
      steps.push({kind:'event_timing',checks:fallbackChecks});seen.eventFallback=true;
    }return;}
    var key='event:'+i.eventId;if(seen[key])return;seen[key]=true;
    var checks=[];
    if(!Number.isFinite(i.startMinutes))checks.push('event_start');
    if(!Number.isFinite(i.endMinutes))checks.push('event_duration');
    if(i.status==='unmet')checks.push('event_arrival');
    checks.push('event_travel');
    var url=stop.event.url;
    steps.push({kind:'event_timing',name:stop.event.name,checks:checks,url:typeof url==='string'&&/^\/(?!\/)/.test(url)?url:null});
  });
  return steps;
}

function t3OptionalAlternativesHtml(step,fr,esc){
 const alternatives=(step&&Array.isArray(step.alternatives)?step.alternatives:[]).filter(function(a){return a&&typeof a.name==='string'&&typeof a.url==='string'&&/^\/(?!\/)/.test(a.url);});
 if(!alternatives.length)return '';
 const labels=fr?{intro:'Options facultatives à considérer. Choisissez-en une si vous le souhaitez ; elle ne sera pas ajoutée automatiquement.',similar:'Activité similaire',region:'Autre région',time:'À un autre moment',hours:'Horaires à confirmer',listing:'Autre fiche'}:{intro:'Optional ideas to consider. Choose one if you like; it will not be added automatically.',similar:'Similar activity',region:'Another region',time:'Try another time',hours:'Confirm hours',listing:'Another listing'};
 const reason={similar_activity:labels.similar,different_region:labels.region,different_time:labels.time,confirm_hours:labels.hours,another_listing:labels.listing};
 return '<div class="t3-optional-alternatives"><p>'+esc(labels.intro)+'</p><ul>'+alternatives.map(function(a){return '<li><a href="'+esc(a.url)+'">'+esc(a.name)+'</a>'+(reason[a.reasonCode]?' — '+esc(reason[a.reasonCode]):'')+'</li>';}).join('')+'</ul></div>';
}

function t3TimingChecklist(step,fr){
  var labels=fr?{event_start:'l’heure de début de l’événement',event_duration:'la durée de l’événement',event_arrival:'un départ plus tôt pour arriver avant l’événement',event_travel:'le trajet et l’heure d’arrivée',hours:'les horaires',listing_hours:'les horaires indiqués dans le texte de la fiche',prior_timing:'l’horaire de l’arrêt précédent',sport_access:'l’accès sportif ou les conditions de réservation',visit_duration:'la durée de visite',travel:'le trajet'}:{event_start:'the event’s start time',event_duration:'event duration',event_arrival:'an earlier departure to arrive before the event',event_travel:'travel and arrival time',hours:'opening hours',listing_hours:'hours stated in the listing text',prior_timing:'the preceding stop’s timing',sport_access:'sports access or booking requirements',visit_duration:'visit duration',travel:'travel'};
  var keys=Array.isArray(step.checks)?step.checks:['hours','visit_duration','travel'];
  var parts=keys.filter(function(k,i){return labels[k]&&keys.indexOf(k)===i;}).map(function(k){return labels[k];});
  if(!parts.length)parts=['hours','visit_duration','travel'].map(function(k){return labels[k];});
  return (fr?'Confirmez ':'Confirm ')+(parts.length>1?parts.slice(0,-1).join(', ')+(fr?' et ':' and ')+parts[parts.length-1]:parts[0])+'.';
}

function t3EditLosesMatch(previous,next) {
  var kinds=['type','type_count','venue_kind','venue','activity','event','rainy'];
  return !!previous && (previous.requirementResults || []).some(function(old){
    if(old.status!=='satisfied'||kinds.indexOf(old.kind)===-1)return false;
    return (next.requirementResults || []).some(function(now){return now.id===old.id&&now.kind===old.kind&&now.value===old.value&&now.status==='unmet';});
  });
}

// What the visitor asked for that the plan could not use (2026-10-19): the "not used" words and anything the planner
// reported as unsupported, once each.
// "Drive from Kelowna to Penticton: about 42–50 min (estimate)" (2026-10-19).
function t3DriveText(leg, lang) {
  if (!leg || !leg.fromLabel || !leg.toLabel) return '';
  var fr = lang === 'fr', a = leg.minMinutes, b = leg.maxMinutes;
  var mins = a && b && a !== b ? (fr ? a + ' à ' + b : a + '–' + b) : String(b || a);
  // Round 7: a drive to the other shore of Okanagan Lake goes around it, and says so.
  var lake = leg.aroundLake ? (fr ? ' en contournant le lac' : ' around the lake') : '';
  return fr ? 'Trajet de ' + leg.fromLabel + ' à ' + leg.toLabel + lake + ' : environ ' + mins + ' min (estimation)' : 'Drive from ' + leg.fromLabel + ' to ' + leg.toLabel + lake + ': about ' + mins + ' min (estimate)';
}
function t3DroppedRequests(p) {
  var out = [];
  ((p && p.understood && p.understood.notUsed) || []).concat((p && p.unsupported) || []).forEach(function(w){ w = String(w || '').trim(); if (w && out.indexOf(w) === -1) out.push(w); });
  return out;
}
// Straight-line kilometres between two stored coordinates, or null.
function t3Km(a, b) {
  const ok = (v) => v && typeof v.latitude === 'number' && typeof v.longitude === 'number' && isFinite(v.latitude) && isFinite(v.longitude);
  if (!ok(a) || !ok(b)) return null;
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function t3KmText(km) {
  if (km === null || km === undefined) return null;
  if (km < 1) return 'Under 1 km apart (straight line)';
  return 'About ' + (km < 10 ? Math.round(km * 10) / 10 : Math.round(km)) + ' km (straight line)';
}
// The shareable plan state <-> a query string. Only the request text, the
// seed, the visitor's edits and their kept / removed stops -- never a fact.
//
// Stage 5A (F09, 2026-10-01): a link replays the exact plan request that
// produced the plan on screen -- its seed, settings, skipped stops (skip),
// pinned stops (pin) and avoided stops (avoid) -- and then re-applies the
// visitor's own edits on top: kept stops (keep) and removed stops (rm). The
// planner is deterministic for the same request and the same listings, so
// the recipient sees the sender's plan, including after Swap, Regenerate and
// Regenerate day. Only slot keys and venue ids are added: no names, no facts.
// Keys are written in day / daypart order so the same state is always the
// same link. Links made before Stage 5A (no pin / avoid / rm) restore exactly
// as they did before.
function t3StateToQuery(s) {
  const p = [];
  const add = (k, v) => p.push(k + '=' + encodeURIComponent(v));
  const KEY = /^[1-7]-(morning|midday|afternoon|late|evening|night)$/;
  const PARTS = ['morning', 'midday', 'afternoon', 'late', 'evening', 'night'];
  const byKey = (a, b) => (Number(a[0]) - Number(b[0])) || (PARTS.indexOf(a.slice(2)) - PARTS.indexOf(b.slice(2)));
  const id = (x) => Number.isInteger(x) && x > 0 && x < 1e9;
  const slots = (m) => Object.keys(m || {}).filter((k) => KEY.test(k) && id(m[k])).sort(byKey).map((k) => k + ':' + m[k]);
  if (s.text) add('q', s.text);
  if (s.seed) add('seed', String(s.seed));
  const o = s.overrides || {};
  if (o.days) add('days', String(o.days));
  if (o.pace) add('pace', o.pace);
  if (o.baseRegion) add('base', o.baseRegion);
  if(o.shortWalkVenueIds?.length)add('walk',[...new Set(o.shortWalkVenueIds)].filter(id).sort((a,b)=>a-b).join(','));
  if(o.dayStartMinutes&&Object.keys(o.dayStartMinutes).length)add('starts',Object.keys(o.dayStartMinutes).sort().map(d=>d+':'+o.dayStartMinutes[d]).join(','));
  if(o.startDate)add('date',o.startDate);
  if(o.startMinutes!==undefined)add('start',String(o.startMinutes));
  if (o.budgetMode) add('budget',o.budgetMode);
  if (o.durationMinutes) add('minutes',String(o.durationMinutes));
  if (Number.isSafeInteger(o.eventId) && o.eventId > 0 && o.eventId < 1e9) add('event',String(o.eventId));
  const locks = slots(s.locks);
  if (locks.length) add('keep', locks.join(','));
  const ex = (s.exclude || []).filter(id).slice(-200);
  if (ex.length) add('skip', ex.join(','));
  const pins = slots(s.pinned).slice(0, 28);
  if (pins.length) add('pin', pins.join(','));
  const avoid = (s.avoid || []).filter(id).slice(0, 200);
  if (avoid.length) add('avoid', avoid.join(','));
  const removed = Object.keys(s.removed || {}).filter((k) => KEY.test(k)).sort(byKey);
  if (removed.length) add('rm', removed.join(','));
  return p.length ? '?' + p.join('&') : '';
}
// The reverse: anything malformed is dropped (never guessed) and reported
// through `invalid`, so a damaged link still plans from its request text.
function t3QueryToState(search, regions) {
  const q = {};
  String(search || '').replace(/^\?/, '').split('&').forEach((pair) => {
    if (!pair) return;
    const i = pair.indexOf('=');
    try {
      const k = decodeURIComponent((i < 0 ? pair : pair.slice(0, i)).replace(/\+/g, ' '));
      const v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
      q[k] = v;
    } catch (e) { q.__bad = '1'; }
  });
  const text = typeof q.q === 'string' ? q.q.trim().slice(0, 500) : '';
  if (!text) return null;
  let invalid = !!q.__bad;
  const ID = '[1-9]\\d{0,8}';
  const SLOT = new RegExp('^([1-7]-(?:morning|midday|afternoon|late|evening|night)):(' + ID + ')$');
  const seedOk = /^\d{1,7}$/.test(q.seed || '') && Number(q.seed) <= 1000000;
  const seed = seedOk ? Number(q.seed) : 0;
  if (q.seed !== undefined && !seedOk) invalid = true;
  const overrides = {};
  if (/^[1-7]$/.test(q.days || '')) overrides.days = Number(q.days); else if (q.days !== undefined) invalid = true;
  if (/^[1-9]\d{0,8}$/.test(q.event || '')) overrides.eventId = Number(q.event); else if (q.event !== undefined) invalid = true;
  if (['relaxed', 'standard', 'packed'].indexOf(q.pace) !== -1) overrides.pace = q.pace; else if (q.pace !== undefined) invalid = true;
  if (q.base === 'valley' || (regions || []).indexOf(q.base) !== -1) overrides.baseRegion = q.base; else if (q.base !== undefined) invalid = true;
  if(q.date!==undefined){if(/^\d{4}-\d{2}-\d{2}$/.test(q.date)&&Number.isFinite(Date.parse(q.date+'T12:00:00Z'))&&new Date(q.date+'T12:00:00Z').toISOString().slice(0,10)===q.date)overrides.startDate=q.date;else invalid=true;}
  if(q.walk!==undefined){const ids=q.walk.split(',');if(ids.length<=10&&ids.every(id=>/^[1-9]\d{0,8}$/.test(id))&&new Set(ids).size===ids.length)overrides.shortWalkVenueIds=ids.map(Number);else invalid=true;}
  if(q.starts!==undefined){const entries=q.starts.split(',');if(entries.length<=7&&entries.every(e=>/^[1-7]:\d{1,4}$/.test(e)&&Number(e.split(':')[1])<1440)&&new Set(entries.map(e=>e.split(':')[0])).size===entries.length)overrides.dayStartMinutes=Object.fromEntries(entries.map(e=>e.split(':').map(Number)));else invalid=true;}
  if(q.start!==undefined){if(/^\d{1,4}$/.test(q.start)&&Number(q.start)<1440)overrides.startMinutes=Number(q.start);else invalid=true;}
  if (['full','shorter'].indexOf(q.budget)!==-1) overrides.budgetMode=q.budget; else if(q.budget!==undefined) invalid=true;
  if (/^\d{1,4}$/.test(q.minutes||'') && Number(q.minutes)>=1 && Number(q.minutes)<=1440) overrides.durationMinutes=Number(q.minutes); else if(q.minutes!==undefined) invalid=true;
  const slotMap = (raw, max) => {
    if (raw === undefined) return null;
    const out = {};
    let n = 0;
    String(raw).split(',').forEach((pair) => {
      const m = SLOT.exec(pair);
      if (m && n < max) { if (!(m[1] in out)) n += 1; out[m[1]] = Number(m[2]); } else invalid = true;
    });
    return out;
  };
  const idList = (raw, max) => {
    if (raw === undefined) return [];
    const all = String(raw).split(',');
    const ok = all.filter((x) => new RegExp('^' + ID + '$').test(x)).map(Number);
    if (ok.length !== all.length || ok.length > max) invalid = true;
    return ok.slice(-max);
  };
  const locks = slotMap(q.keep, 28) || {};
  const exclude = idList(q.skip, 200);
  const pinned = slotMap(q.pin, 28);
  const avoid = idList(q.avoid, 200);
  const removed = [];
  if (q.rm !== undefined) String(q.rm).split(',').forEach((k) => { if (/^[1-7]-(morning|midday|afternoon|late|evening|night)$/.test(k)) { if (removed.indexOf(k) === -1) removed.push(k); } else invalid = true; });
  return { text, seed, overrides, locks, exclude, pinned: pinned && Object.keys(pinned).length ? pinned : null, avoid, removed, invalid };
}
// A Google Maps directions link through the given stops, in order, using
// each stop's stored name + address (the same query My Trip's route uses).
function t3MapsUrl(queries) {
  const q = (queries || []).filter(Boolean).slice(0, 10);
  if (!q.length) return null;
  if (q.length === 1) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q[0]);
  let url = 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(q[0]) + '&destination=' + encodeURIComponent(q[q.length - 1]);
  if (q.length > 2) url += '&waypoints=' + encodeURIComponent(q.slice(1, -1).join('|'));
  return url;
}
// The whole-trip map's points (Stage 5G, 2026-10-02): per day, in plan order,
// each shown stop numbered by its place among that day's shown stops. Only a
// stored location inside a generous Okanagan box counts (lat 48.5-51.5, lng
// -121.5 to -117.5); a stop without one -- including every event -- is
// counted as "not on the map". Removed stops and empty slots have no card, so
// they are neither numbered nor counted.
function t3MapPoints(days, removed) {
  const inRange = (n, lo, hi) => typeof n === 'number' && isFinite(n) && n >= lo && n <= hi;
  const out = { days: [], count: 0, skipped: 0 };
  (Array.isArray(days) ? days : []).forEach((d) => {
    if (!d || !Array.isArray(d.stops)) return;
    const points = [];
    let n = 0;
    d.stops.forEach((s) => {
      if (!s || (!s.venue && !(s.kind === 'event' && s.event))) return;
      const key = d.day + '-' + s.daypart;
      if (removed && Object.prototype.hasOwnProperty.call(removed, key)) return;
      n += 1;
      const v = s.venue;
      if (!v || !inRange(v.latitude, 48.5, 51.5) || !inRange(v.longitude, -121.5, -117.5)) { out.skipped += 1; return; }
      points.push({ n, key, label: String(s.label || ''), name: String(v.name || ''), lat: v.latitude, lng: v.longitude });
    });
    if (points.length) { out.days.push({ day: d.day, points }); out.count += points.length; }
  });
  return out;
}
// Day header map pins (2026-10-18): Day 1 said "3 stops · About 20 km" but its map showed one pin (the town).
// Each stop is placed on the pre-rendered map from the image's own centre and zoom (Web Mercator; the images use
// 512px world tiles at their CSS size). fits=false when a stop would fall outside the visible frame, and the page
// then draws a small live map fitted to the day's stops instead.
function t3DayPinLayout(points, assets) {
  const merc = (lat) => { const s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
  const place = (p, a) => {
    const world = 512 * Math.pow(2, a.z);
    return { dx: Math.round(((p.lng - a.view[1]) / 360) * world * 10) / 10, dy: Math.round((merc(p.lat) - merc(a.view[0])) * world * 10) / 10 };
  };
  const ok = (a) => a && Number.isFinite(a.z) && Array.isArray(a.view) && Number.isFinite(a.view[0]) && Number.isFinite(a.view[1]);
  const pts = Array.isArray(points) ? points : [];
  if (!pts.length || !assets || !ok(assets.desktop) || !ok(assets.narrow)) return { fits: false, pins: [] };
  // The visible part of the frame, less a pin's radius: about 300 x 200 on a computer, 300 x 100 on a phone.
  const LIMIT = { desktop: { x: 138, y: 86 }, narrow: { x: 138, y: 40 } };
  const pins = pts.map((p) => ({ n: p.n, d: place(p, assets.desktop), w: place(p, assets.narrow) }));
  const fits = pins.every((q) => Math.abs(q.d.dx) <= LIMIT.desktop.x && Math.abs(q.d.dy) <= LIMIT.desktop.y && Math.abs(q.w.dx) <= LIMIT.narrow.x && Math.abs(q.w.dy) <= LIMIT.narrow.y);
  return { fits, pins };
}
const CLIENT_HELPERS_SRC = [t3LocalTimes, t3DayPinLayout, t3DroppedRequests, t3DriveText, t3Km, t3KmText, t3StateToQuery, t3QueryToState, t3MapsUrl, t3MapPoints, t3EventPlaceHtml, t3VenueCardId, t3ListingGapGroups, t3ListingGapSummaryHtml, t3OptionalAlternativesHtml].map((fn) => fn.toString()).join('\n');

const T3_EXAMPLES = [
  'Plan 3 days in Kelowna this autumn with some vineyards, some easy walks and some great food',
  '2 days in Penticton with the kids — museums, parks and easy food',
  'A romantic autumn weekend in Naramata with wineries and a great dinner',
  'A dog-friendly autumn weekend in Vernon',
  'Coffee, an autumn hike, a winery and dinner in Kelowna',
  'What can we do around Penticton if it rains?',
];

function renderStyles() {
  return `<style>
  /* Build My Trip V3 -- scoped to .t3; homepage reference tokens only. */
  body.page-trip-v3 { background: var(--ref-cream, #F5F3ED); }
  .t3 { color: var(--ref-navy); font-family: 'Nunito', 'Nunito Fallback', sans-serif; }
  .t3 .t3-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .t3 .t3-eyebrow { margin: 0 0 6px; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ref-gold); }
  .t3 .t3-wrap { max-width: 1180px; margin: 0 auto; padding: 0 32px; }
  .t3 button { font-family: inherit; }
  .t3 :focus-visible { outline: 3px solid var(--ref-gold); outline-offset: 2px; }
  .t3 [hidden] { display: none !important; }

  /* Hero: the homepage's photo-with-scrim band, the composer as its focal point. */
  .t3-hero { position: relative; overflow: hidden; background: var(--ref-navy-deep); color: #fff; }
  .t3-hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 40%; opacity: 0.55; }
  .t3-hero-scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(16,27,36,0.35) 0%, rgba(16,27,36,0.72) 70%, rgba(16,27,36,0.9) 100%); }
  .t3-hero-inner { position: relative; z-index: 1; padding-top: 34px; padding-bottom: 44px; }
  .t3-crumb { font-size: 0.8rem; color: rgba(255,255,255,0.75); margin-bottom: 26px; }
  .t3-crumb a { color: #fff; text-decoration: none; } .t3-crumb a:hover { text-decoration: underline; }
  .t3-title { font-family: 'Fraunces', 'Fraunces Fallback', serif; font-weight: 600; font-size: clamp(1.9rem, 4.2vw, 3rem); line-height: 1.08; letter-spacing: 0.01em; margin: 0 0 12px; color: #fff; max-width: 18ch; }
  .t3-lead { font-size: 1.02rem; line-height: 1.55; color: rgba(255,255,255,0.88); max-width: 60ch; margin: 0 0 24px; }
  .t3-composer { background: #fff; border-radius: 18px; padding: 16px 16px 12px 20px; box-shadow: 0 18px 40px -22px rgba(0,0,0,0.6); max-width: 820px; }
  .t3-composer textarea { width: 100%; border: 0; resize: vertical; min-height: 78px; font: 500 1.05rem/1.5 'Nunito', 'Nunito Fallback', sans-serif; color: var(--ref-navy); background: transparent; padding: 4px 0; }
  .t3-composer textarea::placeholder { color: rgba(27,43,58,0.5); }
  .t3-composer textarea:focus { outline: none; }
  .t3-composer:focus-within { box-shadow: 0 0 0 3px var(--ref-gold), 0 18px 40px -22px rgba(0,0,0,0.6); }
  .t3-composer-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid rgba(27,43,58,0.1); padding-top: 10px; margin-top: 6px; }
  .t3-hint { font-size: 0.78rem; color: rgba(27,43,58,0.72); } /* 0.72 (2026-10-18): 0.62 was 4.25:1 on white. */
  .t3-submit, .t3-btn { background: var(--ref-navy); color: #fff; border: 0; border-radius: 999px; padding: 11px 22px; min-height: 44px; font-weight: 800; font-size: 0.9rem; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; }
  .t3-submit:hover, .t3-btn:hover { background: var(--ref-navy-deep); }
  .t3-submit[disabled], .t3-btn[disabled], .t3-btn[aria-disabled="true"] { opacity: 0.55; cursor: default; }
  .t3-btn-ghost { background: transparent; color: var(--ref-navy); border: 1px solid rgba(27,43,58,0.25); }
  .t3-btn-ghost:hover { background: rgba(27,43,58,0.06); }
  .t3-examples { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; max-width: 900px; }
  .t3-examples-label { width: 100%; font-size: 0.8rem; color: rgba(255,255,255,0.72); margin-bottom: 2px; }
  .t3-example { background: rgba(255,255,255,0.12); color: #fff; border: 1px solid rgba(255,255,255,0.28); border-radius: 999px; padding: 8px 14px; min-height: 40px; font-size: 0.84rem; font-weight: 600; cursor: pointer; text-align: left; }
  .t3-example:hover { background: rgba(255,255,255,0.22); }
  /* 2026-10-19: the example chips' height is reserved (measured with the final fonts), so the hero does not grow when the
     web font replaces the fallback and a chip wraps onto another line. */
  .t3-examples { min-height: 216px; }
  html[lang="fr"] .t3-examples { min-height: 264px; }
  @media (max-width: 1023px) { .t3-examples { min-height: 264px; } html[lang="fr"] .t3-examples { min-height: 312px; } }
  @media (max-width: 640px) { .t3-examples { min-height: 396px; } html[lang="fr"] .t3-examples { min-height: 446px; } }
  .t3-status { min-height: 1.4em; margin: 14px 0 0; font-weight: 700; font-size: 0.92rem; color: #fff; }
  .t3-status.is-error { color: #FFD7A8; }
  /* Phones opening a plan link (2026-10-18): the request shrinks to one "Edit request" bar so the plan is on screen
     first, instead of starting about 1,240px down below the form. */
  .t3-editbar { display: flex; align-items: center; gap: 12px; justify-content: space-between; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.28); border-radius: 14px; padding: 10px 12px; }
  .t3-editbar[hidden] { display: none; }
  .t3-editbar-text { margin: 0; min-width: 0; font-size: 0.9rem; line-height: 1.35; color: #fff; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .t3-editbar-label { display: block; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #E0A94E; }
  .t3-editbar-btn { flex: none; min-height: 44px; padding: 8px 14px; border-radius: 999px; border: 0; background: #fff; color: var(--ref-navy-deep, #101B24); font-weight: 800; font-size: 0.86rem; cursor: pointer; }
  .t3.is-compact .t3-hero-inner { padding-top: 12px; padding-bottom: 12px; }
  .t3.is-compact .t3-hero .t3-eyebrow, .t3.is-compact .t3-title, .t3.is-compact .t3-lead, .t3.is-compact .t3-composer, .t3.is-compact .t3-examples { display: none; }
  .t3.is-compact .t3-crumb { margin-bottom: 10px; }
  .t3.is-compact .t3-status:empty { display: none; }
  /* What we understood (the editable chips) belongs to the request, so it folds away with it until "Edit request"
     (2026-10-18): the plan then starts right under the bar instead of about 400px further down. */
  .t3.is-compact .t3-understood { display: none; }
  .t3.is-compact .t3-result { padding-top: 14px; }

  /* How it works (before the first plan). */
  .t3-how { padding: 34px 0 56px; }
  .t3-how h2 { font-family: 'Fraunces', 'Fraunces Fallback', serif; font-size: clamp(1.25rem, 2vw, 1.5rem); color: var(--ref-navy); margin: 0 0 16px; }
  .t3-how-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 0; padding: 0; list-style: none; }
  .t3-how-grid li { background: #fff; border-radius: 12px; padding: 18px; box-shadow: 0 10px 22px -18px rgba(27,43,58,0.45); font-size: 0.92rem; line-height: 1.5; }
  .t3-how-grid strong { display: block; font-family: 'Fraunces', 'Fraunces Fallback', serif; font-size: 1.02rem; margin-bottom: 4px; }
  .t3-how-num { display: inline-flex; width: 26px; height: 26px; border-radius: 999px; background: var(--ref-navy); color: #fff; font-weight: 800; font-size: 0.8rem; align-items: center; justify-content: center; margin-bottom: 8px; }

  /* Result */
  .t3-result { padding: 26px 0 64px; }
  .t3-result[aria-busy="true"] .t3-plan { opacity: 0.45; transition: opacity .15s; }
  .t3-understood { background: #fff; border-radius: 14px; padding: 16px 18px; margin-bottom: 16px; box-shadow: 0 10px 22px -18px rgba(27,43,58,0.45); }
  .t3-understood .t3-eyebrow { color: var(--teal-deep, #1E4F4C); }
  .t3-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; align-items: center; }
  .t3-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--ref-cream); border: 1px solid rgba(27,43,58,0.12); color: var(--ref-navy); border-radius: 999px; padding: 6px 12px; font-size: 0.84rem; font-weight: 700; }
  .t3-chip select { font: inherit; font-weight: 800; color: var(--ref-navy); background: transparent; border: 0; padding: 2px 0; cursor: pointer; min-height: 32px; } /* 2026-10-19: a 32px target */
  /* Tap targets (2026-10-19, round 7): the plan's selects are 44px tall with 16px text (smaller text makes iPhone
     Safari zoom the page when one is tapped). The negative margin keeps the chip itself about 44px tall. */
  .t3-chip select { font-size: 16px; min-height: 44px; margin: -6px 0; }
  .t3-length-ask { margin: 10px 0 0; font-size: 0.88rem; font-weight: 700; color: var(--ref-navy); }
  .t3-length-ask select { font: inherit; font-size: 16px; min-height: 44px; margin-left: 6px; }
  .t3-chip-label { font-weight: 600; opacity: 0.7; }
  .t3-notused { margin: 10px 0 0; font-size: 0.84rem; color: #7A4A2A; }

  /* z-index 0 (2026-10-18): app.css's header rule (sticky, z-index 60) also matches this <header>, so on phones the
     plan card was drawn over the sticky site header. */
  .t3-plan-head { background: var(--ref-navy); color: #fff; border-radius: 18px; padding: 24px 26px 20px; margin-bottom: 18px; position: relative; z-index: 0; overflow: hidden; }
  .t3-plan-head .t3-eyebrow { color: var(--ref-gold); }
  .t3-request { margin: 0 0 6px; font-size: 0.86rem; color: rgba(255,255,255,0.7); overflow-wrap: anywhere; }
  .t3-headline { font-family: 'Fraunces', 'Fraunces Fallback', serif; font-weight: 600; font-size: clamp(1.45rem, 3vw, 2.1rem); line-height: 1.15; margin: 0 0 10px; color: #fff; }
  .t3-headline:focus { outline: none; } .t3-headline:focus-visible { outline: 2px solid rgba(201,162,39,0.8); outline-offset: 6px; border-radius: 4px; }
  .t3-expect { margin: 0 0 16px; font-size: 1rem; line-height: 1.6; color: rgba(255,255,255,0.9); max-width: 70ch; }
  .t3-plan-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .t3-plan-head .t3-btn { background: #fff; color: var(--ref-navy-deep); }
  .t3-plan-head .t3-btn:hover { background: var(--ref-cream); }
  .t3-plan-head .t3-btn-ghost { background: transparent; color: #fff; border-color: rgba(255,255,255,0.4); }
  .t3-plan-head .t3-btn-ghost:hover { background: rgba(255,255,255,0.12); }
  .t3-plan-status { margin: 10px 0 0; font-size: 0.88rem; color: rgba(255,255,255,0.9); min-height: 1.2em; }
  .t3-edit-error { margin: 8px 0; padding: 8px 12px; border-radius: 10px; background: #FFF6E6; border: 1px solid rgba(181,69,43,0.45); color: #7A2E1B; font-size: 0.88rem; font-weight: 700; }
  .t3-rain a { color: inherit; text-decoration: underline; text-underline-offset: 2px; font-weight: 700; }
  .t3-details { margin-top: 12px; font-size: 0.84rem; color: rgba(255,255,255,0.8); }
  .t3-details summary { cursor: pointer; font-weight: 700; }
  .t3-details ul { margin: 8px 0 0; padding-left: 18px; }
  .t3-warnings { background: #FFF6E6; border: 1px solid rgba(201,162,39,0.45); color: #5B4212; border-radius: 12px; padding: 12px 16px; margin: 0 0 16px; font-size: 0.9rem; }
  .t3-event-choices { display: flex; flex-wrap: wrap; gap: 8px; }
  .t3-warnings ul { margin: 0; padding-left: 18px; }

  /* Sticks just under the sticky site header (2026-10-18; at top: 0 it slid under it). --t3-head-h is set below. */
  .t3-daynav { position: sticky; top: var(--t3-head-h, 0px); z-index: 20; display: flex; gap: 8px; overflow-x: auto; padding: 10px 0; margin: 0 0 8px; background: var(--ref-cream); scrollbar-width: none; }
  .t3-daynav::-webkit-scrollbar { display: none; }
  .t3-daynav a { flex: 0 0 auto; text-decoration: none; background: #fff; color: var(--ref-navy); border: 1px solid rgba(27,43,58,0.14); border-radius: 999px; padding: 8px 14px; font-weight: 800; font-size: 0.84rem; min-height: 40px; display: inline-flex; align-items: center; }
  .t3-daynav a:hover { border-color: var(--ref-navy); }

  .t3-day { margin: 0 0 30px; scroll-margin-top: 64px; }
  .t3-day-head { position: relative; border-radius: 16px; overflow: hidden; min-height: 150px; display: flex; align-items: flex-end; background: var(--ref-navy); color: #fff; margin-bottom: 14px; }
  .t3-day-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .t3-day-scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 20%, rgba(16,27,36,0.85) 100%); }
  /* Map day header: a navy panel (same navy as the trip summary), the day's details on the left and a pre-rendered, colour-treated real map (OSM Carto) on the right. */
  .t3-day .t3-day-head--map { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); grid-template-areas: "info map" "actions map"; align-items: end; gap: 0 18px; min-height: 0; padding: 0; background: var(--ref-navy, #1B2B3A); color: #F5F3ED; border: 1px solid var(--ref-navy, #1B2B3A); }
  .t3-dh-info { grid-area: info; align-self: start; padding: 20px 0 0 22px; min-width: 0; }
  .t3-day-head--map .t3-eyebrow { margin: 0 0 4px; color: #E0A94E; }
  .t3-day-head--map .t3-day-title { color: #FBF8F0; }
  .t3-dh-sub { margin: 2px 0 0; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #E0A94E; }
  .t3-dh-meta { margin: 10px 0 0; font-size: 0.88rem; font-weight: 600; color: rgba(245,243,237,0.80); }
  .t3-day-head--map .t3-day-theme { color: var(--ref-gold, #C9A227); }
  .t3-day-head--map .t3-day-actions { grid-area: actions; padding: 14px 0 18px 22px; }
  .t3-day-head--map .t3-day-actions .t3-btn { background: #fff; color: var(--ref-navy-deep, #101B24); border: 1px solid rgba(255,255,255,0.55); }
  .t3-day-head--map .t3-day-actions .t3-btn:hover { background: var(--ref-cream, #F5F3ED); }
  .t3-dh-map { grid-area: map; position: relative; margin: 10px 10px 10px 0; min-height: 200px; border-radius: 12px; overflow: hidden; background: #E8E3D3; }
  /* The map image is centred at its natural CSS size (it is 2x, so never upscaled) and cropped by the frame; the ring is placed from the true marker offset. */
  .t3-dh-frame { position: absolute; inset: 0; background: #E8E3D3; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(245,243,237,0.12); }
  .t3-dh-frame img { position: absolute; left: 50%; top: 50%; width: var(--dw); height: var(--dh); max-width: none; transform: translate(-50%, -50%); display: block; filter: none; }
  /* The destination is a hollow ring so the map's own town label stays readable underneath it. */
  /* A small gold pin just above the town's name, so the name stays readable (2026-10-14: the ring sat over the label). */
  .t3-dh-ring { position: absolute; left: calc(50% + var(--ddx)); top: calc(50% + var(--ddy)); width: 12px; height: 12px; margin: -24px 0 0 -6px; box-sizing: border-box; border-radius: 50%; background: var(--ref-gold, #C9A227); border: 2px solid #fff; box-shadow: 0 1px 4px rgba(16,27,36,0.45); }
  /* The day's stops on the header map (2026-10-18), numbered like the whole-trip map; a wide day gets a live map. */
  .t3-dh-pin { position: absolute; left: calc(50% + var(--pdx)); top: calc(50% + var(--pdy)); width: 22px; height: 22px; margin: -11px 0 0 -11px; box-sizing: border-box; border-radius: 50%; border: 2px solid #fff; color: #fff; font-size: 0.72rem; font-weight: 800; line-height: 18px; text-align: center; box-shadow: 0 1px 4px rgba(16,27,36,0.45); }
  .t3-dh-live { position: absolute; inset: 0; z-index: 2; background: #E8E3D3; }
  .t3-dh-live .t3-pin span { width: 24px; height: 24px; font-size: 0.72rem; }
  .t3-dh-attr { position: absolute; right: 0; bottom: 0; z-index: 800; padding: 1px 6px; font-size: 0.66rem; line-height: 1.5; color: rgba(27,43,58,0.78); background: rgba(245,243,237,0.88); text-decoration: none; border-top-left-radius: 6px; }
  .t3-dh-attr a { color: inherit; text-decoration: none; }
  .t3-dh-attr a:hover, .t3-dh-attr a:focus-visible { text-decoration: underline; }
  .t3-dh-sep { margin: 0 5px; }
  @media (max-width: 720px) {
    .t3-day .t3-day-head--map { grid-template-columns: minmax(0, 1fr); grid-template-areas: "info" "map" "actions"; gap: 0; }
    .t3-dh-info { padding: 10px 16px 0; display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "day sub" "title title" "meta meta" "theme theme"; column-gap: 10px; align-items: baseline; }
    .t3-dh-info .t3-eyebrow { grid-area: day; }
    .t3-dh-info .t3-dh-sub { grid-area: sub; margin: 0; }
    .t3-dh-info .t3-day-title { grid-area: title; }
    .t3-dh-info .t3-dh-meta { grid-area: meta; margin-top: 2px; }
    .t3-dh-info .t3-day-theme { grid-area: theme; }
    .t3-dh-map { margin: 6px 12px 0; min-height: 0; height: auto; overflow: visible; background: none; border-radius: 0; }
    .t3-dh-frame { position: relative; inset: auto; height: 120px; border-radius: 12px; }
    .t3-dh-frame img { width: var(--nw); height: var(--nh); }
    .t3-dh-ring { left: calc(50% + var(--ndx)); top: calc(50% + var(--ndy)); }
    .t3-dh-pin { left: calc(50% + var(--pndx)); top: calc(50% + var(--pndy)); }
    /* Attribution sits in its own quiet strip beneath the map, never over it. */
    .t3-dh-attr { position: static; display: flex; align-items: center; justify-content: flex-end; min-height: 22px; padding: 0 2px; background: none; border-radius: 0; font-size: 0.68rem; color: rgba(245,243,237,0.74); }
    .t3-day-head--map .t3-day-actions { padding: 0 12px 10px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
    .t3-day-head--map .t3-day-actions .t3-btn { justify-content: center; text-align: center; min-height: 44px; padding: 6px 4px; font-size: 0.78rem; line-height: 1.15; }
    .t3-day-head--map .t3-day-actions [data-t3-map-day] { order: -1; }
  }
  @media (max-width: 1099px) {
    .t3-dh-map--wnarrow .t3-dh-frame img { width: var(--nw); height: var(--nh); }
    .t3-dh-map--wnarrow .t3-dh-ring { left: calc(50% + var(--ndx)); top: calc(50% + var(--ndy)); }
    .t3-dh-map--wnarrow .t3-dh-pin { left: calc(50% + var(--pndx)); top: calc(50% + var(--pndy)); }
  }
  /* If a map image cannot load, the card simply drops the map column. */
  .t3-day .t3-day-head--map.t3-dh-nomap { grid-template-columns: minmax(0, 1fr); grid-template-areas: "info" "actions"; }
  .t3-dh-nomap .t3-dh-map { display: none; }
  .t3-day-headin { position: relative; z-index: 1; display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; width: 100%; padding: 18px 20px; }
  .t3-day-title { font-family: 'Fraunces', 'Fraunces Fallback', serif; font-size: clamp(1.3rem, 2.4vw, 1.7rem); margin: 0; color: #fff; }
  .t3-day-theme { margin: 4px 0 0; font-size: 0.88rem; font-weight: 700; color: var(--ref-gold); }
  .t3-day-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .t3-day-actions .t3-btn { background: rgba(255,255,255,0.95); color: var(--ref-navy-deep); padding: 8px 14px; min-height: 40px; font-size: 0.82rem; }
  .t3-day-actions .t3-btn:hover { background: #fff; }

  .t3-stops { list-style: none; margin: 0; padding: 0; }
  .t3-stop { display: grid; grid-template-columns: 110px 1fr; gap: 16px; }
  .t3-when { padding-top: 16px; font-weight: 800; font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--teal-deep, #1E4F4C); position: relative; }
  .t3-when::after { content: ""; position: absolute; left: 6px; top: 40px; bottom: -16px; width: 2px; background: rgba(27,43,58,0.12); }
  .t3-stop:last-child .t3-when::after { display: none; }
  /* Contrast (2026-10-19, round 7): the see-through navy measured 4.11:1 on the cream page; the solid muted navy passes 4.5:1. */
  .t3-leg { list-style: none; margin-left: 126px; font-size: 0.8rem; font-weight: 700; color: var(--ref-navy-muted, #56636E); padding: 8px 0 8px 4px; }
  .t3-leg::before { content: "\\2193  "; }
  .t3-leg-drive { color: rgba(27,43,58,0.78); }
  p.t3-drive-in { margin: 12px 0 0 126px; padding: 0 0 0 4px; }
  .t3-card { background: #fff; border-radius: 14px; padding: 16px 18px 14px; box-shadow: 0 12px 26px -20px rgba(27,43,58,0.5); border: 1px solid rgba(27,43,58,0.06); }
  .t3-card.is-kept { border-color: var(--ref-gold); box-shadow: 0 0 0 1px var(--ref-gold), 0 12px 26px -20px rgba(27,43,58,0.5); }
  .t3-card-top { display: flex; flex-wrap: wrap; gap: 6px 10px; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ref-navy-muted, #56636E); }
  .t3-card h4 { font-family: 'Fraunces', 'Fraunces Fallback', serif; font-weight: 600; font-size: 1.22rem; margin: 4px 0 4px; line-height: 1.25; }
  .t3-card h4 a { color: var(--ref-navy); text-decoration: none; } .t3-card h4 a:hover { text-decoration: underline; }
  .t3-event-place { margin: 0 0 8px; color: rgba(27,43,58,0.78); font-size: 0.92rem; font-weight: 700; }
  .t3-address { margin: 0 0 6px; font-size: 0.84rem; color: rgba(27,43,58,0.72); }
  .t3-facts { margin: 0 0 8px; font-size: 0.88rem; font-weight: 700; color: var(--ref-navy); }
  .t3-star { color: var(--ref-gold); }
  .t3-nowrap { white-space: nowrap; }
  .t3-checks { margin: 0 0 12px; font-size: 0.86rem; color: rgba(27,43,58,0.78); }
  .t3-checks > summary { cursor: pointer; font-weight: 800; color: var(--teal-deep, #1E4F4C); min-height: 32px; display: flex; align-items: center; }
  .t3-checks details { margin: 4px 0 0 4px; }
  /* Dates and trip map: two matching pill buttons; an opened one becomes a card. */
  .t3-tools .t3-map { background: none; box-shadow: none; padding: 0; min-height: 0; }
  .t3-tools .t3-sched { background: none; border: none; box-shadow: none; min-height: 0; }
  .t3-tools .t3-sched > summary { background: #fff; border: 1px solid rgba(27,43,58,0.2); border-radius: 999px; min-height: 44px; padding: 6px 16px; justify-content: center; }
  .t3-tools .t3-sched > summary h3 { font-family: 'Nunito', 'Nunito Fallback', sans-serif; font-weight: 800; font-size: 0.86rem; color: var(--ref-navy); }
  .t3-tools .t3-sched[open] { background: #fff; border: 1px solid rgba(27,43,58,0.08); border-radius: 14px; }
  .t3-tools .t3-sched[open] > summary { border: none; justify-content: flex-start; }
  /* Both tools stretch to the same height, so they match even when a label wraps (French). */
  .t3-tools { align-items: stretch; }
  .t3-tools > .t3-map-slot, .t3-tools .t3-map, .t3-tools .t3-map-bar { height: 100%; box-sizing: border-box; }
  .t3-tools .t3-sched:not([open]) > summary, .t3-tools .t3-map-toggle { height: 100%; min-height: 44px; box-sizing: border-box; line-height: 1.2; text-align: center; }
  .t3-tools .t3-map-bar { align-items: stretch; }
  .t3-tools { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; margin: 0 0 14px; }
  .t3-tools > * { margin: 0; }
  .t3-tools > .t3-sched, .t3-tools > .t3-map-slot { flex: 0 0 auto; }
  .t3-tools > .t3-sched[open], .t3-tools > .t3-map-slot:has(.t3-map-panel:not([hidden])) { flex-basis: 100%; }
  .t3-tools .t3-map { margin: 0; padding: 6px 8px; min-height: 56px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; }
  .t3-sched { background: #fff; border: 1px solid rgba(27,43,58,0.08); border-radius: 14px; box-shadow: 0 10px 22px -18px rgba(27,43,58,0.45); color: var(--ref-navy); font-size: 0.9rem; min-height: 56px; box-sizing: border-box; }
  .t3-sched { padding: 0; }
  .t3-sched > summary { list-style: none; cursor: pointer; padding: 12px 16px; min-height: 44px; display: flex; align-items: center; gap: 8px; }
  .t3-sched > summary::-webkit-details-marker { display: none; }
  .t3-sched > summary::before { content: '\\25B8'; font-size: 0.8rem; transition: transform 0.15s; }
  .t3-sched[open] > summary::before { transform: rotate(90deg); }
  .t3-sched > summary h3 { margin: 0; font-size: 0.95rem; }
  .t3-sched > div, .t3-sched > p { padding: 0 16px; } .t3-sched > p { padding-bottom: 12px; }
  .t3-badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; padding: 0; list-style: none; }
  .t3-badges li { background: rgba(42,107,103,0.1); color: var(--teal-deep, #1E4F4C); border-radius: 999px; padding: 3px 10px; font-size: 0.76rem; font-weight: 800; }
  .t3-badges li.is-more { background: none; padding: 0; }
  .t3-badge-more { background: none; border: 1px dashed rgba(42,107,103,0.45); color: var(--teal-deep, #1E4F4C); border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 0.76rem; font-weight: 800; cursor: pointer; min-height: 28px; }
  .t3-badges li.is-collection { background: rgba(201,162,39,0.16); color: #6B5410; }
  .t3-hours { margin: 0 0 8px; font-size: 0.84rem; color: rgba(27,43,58,0.8); }
  .t3-why { margin: 0 0 6px; padding-left: 18px; font-size: 0.88rem; line-height: 1.5; }
  .t3-caveats { margin: 0 0 8px; padding: 8px 12px; list-style: none; background: #FFF6E6; border-radius: 10px; font-size: 0.82rem; color: #5B4212; }
  .t3-caveats li + li { margin-top: 4px; }
  .t3-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(27,43,58,0.08); }
  .t3-actions .trip-btn, .t3-actions .fav-btn { min-height: 44px; }
  .t3-card.is-swapped { box-shadow: 0 0 0 3px var(--ref-gold, #C9A227); transition: box-shadow 0.4s; }
  .t3-swap-note { margin: 0 0 6px; font-size: 0.78rem; font-weight: 800; color: #6B5410; }
  .t3-more { position: relative; display: inline-block; }
  .t3-more > summary { list-style: none; display: inline-flex; align-items: center; white-space: nowrap; box-sizing: border-box; }
  .t3-more > summary::-webkit-details-marker { display: none; }
  .t3-more > summary::after { content: ' \\25BE'; margin-left: 4px; }
  .t3-more-menu { position: absolute; right: 0; bottom: calc(100% + 6px); z-index: 20; display: flex; flex-direction: column; gap: 6px; min-width: 168px; padding: 8px; background: #fff; border: 1px solid rgba(27,43,58,0.15); border-radius: 12px; box-shadow: 0 12px 28px -12px rgba(27,43,58,0.45); }
  .t3-more-menu > * { justify-content: flex-start; width: 100%; }
  .t3-act { background: transparent; border: 1px solid rgba(27,43,58,0.2); color: var(--ref-navy); border-radius: 999px; padding: 7px 13px; min-height: 44px; font-size: 0.8rem; font-weight: 800; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
  .t3-act:hover { background: rgba(27,43,58,0.06); }
  .t3-act[aria-pressed="true"] { background: var(--ref-gold); border-color: var(--ref-gold); color: var(--ref-navy-deep); }
  .t3-removed { background: transparent; border: 1px dashed rgba(27,43,58,0.3); border-radius: 14px; padding: 14px 18px; font-size: 0.9rem; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .t3-empty { background: #fff; border-radius: 14px; padding: 16px 18px; font-size: 0.92rem; }
  .t3-free p { margin: 6px 0 0; } .t3-free a { color: var(--ref-navy); font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
  .t3-section-title { font-family: 'Fraunces', 'Fraunces Fallback', serif; font-size: 1.25rem; margin: 22px 0 12px; color: var(--ref-navy); }
  .t3-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
  /* Cards in a grid row line up: badges, details and buttons start at the same
     height whatever the title length or badge count. Without subgrid support
     the card is a column with its buttons pinned to the bottom instead. */
  .t3-card { display: flex; flex-direction: column; }
  .t3-card .t3-actions { margin-top: auto; }
  @supports (grid-template-rows: subgrid) {
    .t3-grid { row-gap: 0; }
    .t3-grid > .t3-card { display: grid; grid-row: span 4; grid-template-rows: subgrid; row-gap: 0; margin-bottom: 14px; align-content: start; }
    .t3-grid > .t3-card .t3-actions { margin-top: 0; align-self: end; }
  }
  /* Stop photos (2026-10-14). Plan stops: a photo column on the left on wider screens, a small thumbnail on phones.
     Recommendation grids: a short banner across the top of the card. */
  .t3-card-photo { position: relative; overflow: hidden; background: #E8E3D3; }
  .t3-card-photo img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .t3-photo-tag { position: absolute; left: 6px; bottom: 6px; padding: 1px 6px; border-radius: 6px; background: rgba(16,27,36,0.55); color: #fff; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.02em; opacity: 0.85; }
  .t3-stops .t3-card.has-photo { position: relative; padding-left: calc(200px + 20px); min-height: 172px; overflow: hidden; }
  .t3-stops .t3-card.has-photo .t3-card-photo { position: absolute; left: 0; top: 0; bottom: 0; width: 200px; }
  .t3-grid > .t3-card.has-photo .t3-card-photo { margin: -16px -18px 12px; height: 132px; border-radius: 14px 14px 0 0; }
  @media (max-width: 720px) {
    .t3-stops .t3-card.has-photo { padding-left: 18px; min-height: 0; }
    .t3-stops .t3-card.has-photo .t3-card-photo { position: relative; float: right; width: 84px; height: 84px; margin: 0 0 6px 12px; border-radius: 12px; }
    .t3-stops .t3-card.has-photo .t3-photo-tag { display: none; }
    .t3-stops .t3-card.has-photo .t3-card-tags, .t3-stops .t3-card.has-photo .t3-card-body, .t3-stops .t3-card.has-photo .t3-actions { clear: both; }
  }
  .t3-seeall { display: inline-block; margin-top: 18px; font-weight: 800; color: var(--ref-navy); }

  /* Whole-trip map (Stage 5G): collapsed until opened. The canvas is its own
     stacking context, so Leaflet's internal z-indexes stay below the sticky
     day nav and the Trip tray. */
  .t3-map { background: #fff; border-radius: 14px; padding: 12px 14px; margin: 0 0 16px; box-shadow: 0 10px 22px -18px rgba(27,43,58,0.45); }
  .t3-map-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
  .t3-map-note { margin: 0; font-size: 0.84rem; color: rgba(27,43,58,0.72); }
  .t3-map-panel { margin-top: 12px; }
  .t3-map-days { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 10px; }
  .t3-map-chip { display: inline-flex; align-items: center; gap: 6px; background: #fff; color: var(--ref-navy); border: 1px solid rgba(27,43,58,0.2); border-radius: 999px; padding: 6px 12px; min-height: 36px; font-size: 0.82rem; font-weight: 800; cursor: pointer; }
  .t3-map-chip:hover { border-color: var(--ref-navy); }
  .t3-map-chip[aria-pressed="true"] { background: var(--ref-navy); border-color: var(--ref-navy); color: #fff; }
  .t3-map-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 999px; box-shadow: 0 0 0 1px rgba(255,255,255,0.85); }
  .t3-map-canvas { position: relative; z-index: 0; isolation: isolate; height: 400px; border-radius: 12px; overflow: hidden; background: #E8E4DA; }
  .t3-map-status { margin: 8px 0 0; font-size: 0.84rem; font-weight: 700; color: var(--ref-navy); }
  .t3-map-status:empty { display: none; }
  .t3-pin { background: transparent; border: 0; }
  .t3-pin span { display: flex; box-sizing: border-box; width: 28px; height: 28px; border-radius: 999px; align-items: center; justify-content: center; color: #fff; font: 800 0.8rem/1 'Nunito', 'Nunito Fallback', sans-serif; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.35); }
  .t3-map-pop { font-family: 'Nunito', 'Nunito Fallback', sans-serif; color: var(--ref-navy); }
  .t3-map-pop-when { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(27,43,58,0.62); }
  .t3-map-pop strong { display: block; font-family: 'Fraunces', 'Fraunces Fallback', serif; font-size: 1rem; margin: 2px 0 8px; }

  @media (max-width: 900px) {
    .t3-how-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 640px) {
    /* Phone: dates and the trip map sit side by side until one is opened. */
    .t3-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .t3-tools > .t3-sched[open], .t3-tools > .t3-map-slot:has(.t3-map-panel:not([hidden])) { grid-column: 1 / -1; }
    .t3-tools > .t3-map-slot:only-child, .t3-tools > .t3-sched:only-child { grid-column: 1 / -1; }
    .t3-sched > summary { padding: 8px 12px; min-height: 52px; }
    .t3-sched > summary h3 { font-size: 0.84rem; line-height: 1.2; }
    .t3-tools .t3-map { min-height: 52px; padding: 4px; }
    .t3-tools .t3-map-toggle { width: 100%; min-height: 44px; justify-content: center; font-size: 0.84rem; }
    /* Phone: a stop's four actions sit on one row (2026-10-14). */
    .t3-plan .t3-actions { display: grid; grid-template-columns: 1.35fr 1fr 1fr 1fr; gap: 6px; }
    .t3-plan .t3-actions > button, .t3-plan .t3-actions > a, .t3-plan .t3-actions .t3-more > summary { justify-content: center; text-align: center; padding: 6px 4px; font-size: 0.78rem; line-height: 1.15; width: 100%; box-sizing: border-box; }
    .t3-plan .t3-actions .t3-more { display: block; }
    .t3-plan .t3-actions .t3-more > summary { display: flex; align-items: center; min-height: 44px; }
    .t3-plan .t3-actions .t3-more > summary::after { margin-left: 2px; }
    .t3-dh-frame { height: 100px; }
    .t3 .t3-wrap { padding: 0 16px; }
    .t3-hero-inner { padding-top: 20px; padding-bottom: 30px; }
    .t3-crumb { margin-bottom: 16px; }
    .t3-lead { font-size: 0.95rem; }
    .t3-composer { padding: 12px 12px 10px 14px; border-radius: 14px; }
    .t3-composer-foot { flex-wrap: wrap; }
    .t3-hint { width: 100%; }
    .t3-submit { width: 100%; justify-content: center; }
    .t3-stop { grid-template-columns: 1fr; gap: 6px; }
    .t3-when { padding-top: 6px; }
    .t3-when::after { display: none; }
    .t3-leg { margin-left: 0; } p.t3-drive-in { margin-left: 0; }
    .t3-plan-head { padding: 20px 18px 16px; border-radius: 14px; }
    .t3-plan-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .t3-plan-actions .t3-btn { min-width: 0; padding: 10px 12px; justify-content: center; text-align: center; }
    .t3-plan-actions [data-t3-add-all] { grid-column: 1 / -1; }
    .t3-day-head { min-height: 130px; }
    .t3-day-headin { padding: 14px 14px; }
    .t3-map { padding: 12px; }
    .t3-map-canvas { height: 300px; }
  }
</style>`;
}

function renderBody(d) {
  const esc = d.esc;
  // data-i18n: /scripts/app.js shows these in the visitor's language (the
  // tripv3.* keys); the English below is the same text it shows in English.
  const chips = T3_EXAMPLES.map((e, i) => `<button type="button" class="t3-example" data-t3-example data-i18n="tripv3.example${i + 1}">${esc(e)}</button>`).join('\n          ');
  // Speed pass 6 (2026-10-19): the hero is a dimmed backdrop (opacity 0.55) behind the composer, yet every phone
  // took the 1600px file (127 KB). Phones get an 800px copy, wider screens a 1200px one where it is enough.
  return `<main class="t3" id="tripV3">
  <section class="t3-hero" aria-labelledby="t3Title">
    <picture><source media="(max-width: 640px)" srcset="/images/trip-v3/hero-w800.webp"><img class="t3-hero-img" src="/images/trip-v3/hero.webp" width="1600" height="656" srcset="/images/trip-v3/hero-w1200.webp 1200w, /images/trip-v3/hero.webp 1600w" sizes="100vw" alt="" fetchpriority="high"></picture>
    <div class="t3-hero-scrim"></div>
    <div class="t3-wrap t3-hero-inner">
      <nav class="t3-crumb" aria-label="Breadcrumb"><a href="/" data-i18n="tripv3.crumbHome">Home</a> &rsaquo; <span data-i18n="tripv3.name">Build My Trip</span></nav>
      <p class="t3-eyebrow" data-i18n="tripv3.name">Build My Trip</p>
      <h1 class="t3-title" id="t3Title" data-i18n="tripv3.title">Tell us the trip. We&rsquo;ll map it out.</h1>
      <p class="t3-lead" data-i18n="tripv3.lead">Describe your Okanagan trip in your own words &mdash; how long, who&rsquo;s coming, what you love. We&rsquo;ll plan it day by day from real places on Okanagan Roam, and tell you why each one fits.</p>
      <form class="t3-composer" id="t3Form" novalidate>
        <label class="t3-sr" for="t3Input" data-i18n="tripv3.inputLabel">Describe the trip you want</label>
        <textarea id="t3Input" rows="3" maxlength="500" placeholder="Plan 3 days in Kelowna this autumn with some vineyards, some easy walks and some great food." data-i18n-placeholder="tripv3.placeholder"></textarea>
        <div class="t3-composer-foot">
          <span class="t3-hint" data-i18n="tripv3.hint">Real Okanagan Roam places only &mdash; no invented details.</span>
          <button type="submit" class="t3-submit" id="t3Submit"><span data-i18n="tripv3.submit">Plan my trip</span> <span aria-hidden="true">&rarr;</span></button>
        </div>
      </form>
      <div class="t3-examples">
        <span class="t3-examples-label" id="t3ExamplesLabel" data-i18n="tripv3.examplesLabel">Or start from one of these:</span>
          ${chips}
      </div>
      <div class="t3-editbar" id="t3EditBar" hidden>
        <p class="t3-editbar-text"><span class="t3-editbar-label" id="t3EditLabel">Your request</span> <span id="t3EditText"></span></p>
        <button type="button" class="t3-editbar-btn" id="t3EditBtn" aria-controls="t3Form">Edit request</button>
      </div>
      <p class="t3-status" id="t3Status" role="status" aria-live="polite"></p>
    </div>
  </section>
  <section class="t3-wrap t3-how" id="t3How" aria-labelledby="t3HowTitle">
    <h2 id="t3HowTitle" data-i18n="tripv3.howTitle">How it works</h2>
    <ol class="t3-how-grid">
      <li><span class="t3-how-num">1</span><strong data-i18n="tripv3.how1Title">Say it your way</strong><span data-i18n="tripv3.how1Text">&ldquo;Three days, wineries and a cozy dinner, plus an autumn walk.&rdquo; Days, dates, kids, dogs and occasions all count.</span></li>
      <li><span class="t3-how-num">2</span><strong data-i18n="tripv3.how2Title">Real places, real reasons</strong><span data-i18n="tripv3.how2Text">Every stop is a place listed on Okanagan Roam, chosen from what we actually know about it &mdash; and we tell you why.</span></li>
      <li><span class="t3-how-num">3</span><strong data-i18n="tripv3.how3Title">Make it yours</strong><span data-i18n="tripv3.how3Text">Keep the stops you love, swap or remove the rest, regenerate a day and add it all to My Trip.</span></li>
    </ol>
  </section>
  <section class="t3-wrap t3-result" id="t3Result" hidden aria-labelledby="t3Headline"></section>
</main>`;
}

function renderScript(d) {
  return `<script>
(function(){
  'use strict';
  var form = document.getElementById('t3Form');
  if (!form) return;
  var input = document.getElementById('t3Input');
  var submitBtn = document.getElementById('t3Submit');
  var statusEl = document.getElementById('t3Status');
  var resultEl = document.getElementById('t3Result');
  var howEl = document.getElementById('t3How');
  var REGIONS = ${JSON.stringify(d.regions)};
  var REGION_SLUGS = REGIONS.map(function(r){ return r.slug; });
  var REGION_IMAGES = ${JSON.stringify(d.regionImages)};
  // Day headers that show a pre-rendered map instead of a photograph: { slug: { group: { key, label }, assets: { desktop, narrow } } } (see tripV3MapHeaders in server.js).
  var MAP_HEADERS = ${JSON.stringify(d.mapHeaders || {})};
  var TRIP_MAX_STOPS = 30; // My Trip's own limit (MAX_STOPS in /scripts/app.js; 30 since 2026-10-18)
  ${CLIENT_HELPERS_SRC}
  ${t3EditLosesMatch.toString()}
  ${t3PlanNextSteps.toString()}
  ${t3TimingChecklist.toString()}
  ${t3TimelineRows.toString()}
  // Fix (2026-10-19): the French helpers below read these lookups, so ship them with the functions (a season or month crashed /fr/trip).
  var FR_MONTHS_BY_EN = ${JSON.stringify(FR_MONTHS_BY_EN)};
  var FR_SEASON_WORDS = ${JSON.stringify(FR_SEASON_WORDS)};
  ${t3FrenchText.toString()}
  ${t3FrenchEvent.toString()}
  // Round 8: the written French summary and its lookup ship with t3FrenchPlan, which calls them.
  var FR_STOP_NOUN = ${JSON.stringify(FR_STOP_NOUN)};
  ${t3FrenchStopText.toString()}
  ${t3FrenchStory.toString()}
  ${t3FrenchPlan.toString()}
  var state = { text: '', seed: 0, overrides: {}, locks: {}, exclude: [], removed: {}, last: null, lastReq: null };
  var renderedVenueCardAnchors = {};

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u){ return typeof u === 'string' && u.charAt(0) === '/' && u.charAt(1) !== '/' ? u : null; }
  function setStatus(text, mode){ statusEl.textContent = text || ''; statusEl.className = 't3-status' + (mode ? ' is-' + mode : ''); }
  // Interface text in the visitor's language (2026-10-04): the tripv3.* keys
  // of /scripts/app.js, through its t() and getCurrentLang(). In English every
  // string is the page's original text. Labels the planner sends (badges,
  // types, parts of the day, who is coming, the occasion) keep the planner's
  // own English and are only replaced in French; the plan's sentences
  // (headline, reasons, notes) are shown as the planner wrote them.
  function lang(){ return typeof getCurrentLang === 'function' ? getCurrentLang() : 'en'; }
  function t3LooksFrench(text){
    var words = String(text).toLowerCase().match(/[a-zàâçéèêëîïôûùüÿœ']+/g) || [];
    var fr = { une:1, un:1, avec:1, et:1, pour:1, mon:1, ma:1, mes:1, nous:1, des:1, du:1, le:1, la:1, les:1, 'à':1, jours:1, 'journée':1, souper:1, 'dîner':1, 'déjeuner':1, 'randonnée':1, vignoble:1, vignobles:1, plage:1, plages:1, enfants:1, chien:1, semaine:1, fin:1, bon:1, bonne:1, sur:1, dans:1, voyage:1, 'café':1, 'cafés':1, restaurant:0 };
    var en = { the:1, and:1, with:1, for:1, a:1, in:1, my:1, our:1, we:1, day:1, days:1, weekend:1, to:1, of:1 };
    var f = 0, e = 0;
    words.forEach(function(w){ if (fr[w]) f++; if (en[w]) e++; });
    return f >= 2 && f > e;
  }
  function tx(key, vars){
    var s = typeof t === 'function' ? t(key) : key;
    if (vars) Object.keys(vars).forEach(function(k){ s = s.split('{' + k + '}').join(String(vars[k])); });
    return s;
  }
  function frLabel(key, english){ if (lang() !== 'fr') return english; var s = tx(key); return s === key ? english : s; }
  function num(n){ return lang() === 'fr' ? String(n).replace('.', ',') : String(n); }
  // Strings for the map day header (new; kept here so the shared dictionary in app.js stays untouched).
  var DH_TEXT = { en: { stop1: '1 stop', stopN: '{n} stops', osm: '\u00a9 OpenStreetMap contributors', geo: 'Powered by Geoapify' }, fr: { stop1: '1 arr\u00eat', stopN: '{n} arr\u00eats', osm: '\u00a9 contributeurs OpenStreetMap', geo: 'Fourni par Geoapify' } };
  function dh(key, vars){
    var s = (DH_TEXT[lang()] || DH_TEXT.en)[key] || DH_TEXT.en[key] || key;
    if (vars) Object.keys(vars).forEach(function(k){ s = s.split('{' + k + '}').join(String(vars[k])); });
    return s;
  }
  function kmText(km){
    if (km === null || km === undefined) return null;
    return km < 1 ? tx('tripv3.kmUnder') : tx('tripv3.kmAbout', { n: num(km < 10 ? Math.round(km * 10) / 10 : Math.round(km)) });
  }

  // ---- analytics: the same events and fixed parameters as the V2 view, plus
  // the Stage 5A (F12) V3 events: trip_plan_edit (keep / unkeep / remove /
  // undo), trip_plan_share, outbound_click for "Map this day", and the
  // 'shared_link' request type / 'invalid_share' error. Fixed values only --
  // never the request text, a venue name or a venue id. ----
  function track(name, params){ if (window.trackEvent) window.trackEvent(name, params); }
  function planFacts(p){
    var regions = ((p && p.intent && p.intent.regions) || []).filter(function(r){ return REGION_SLUGS.indexOf(r) !== -1; });
    return {
      plan_kind: (p && /^[a-z_]{1,24}$/.test(p.kind)) ? p.kind : 'unknown',
      region: regions.length === 1 ? regions[0] : (regions.length ? 'multiple' : 'none'),
      day_count: (p && p.days) ? p.days.length : 0,
    };
  }

  // ---- request ----
  // The planner's conflict messages, in French on /fr/trip (2026-10-19).
  function errorText(msg){
    if (lang() !== 'fr') return msg;
    var m = /^A locked stop cannot be kept: (.+) on day ([0-9]+) no longer fits this plan[.] Unlock it, or change the request[.]$/.exec(msg || '');
    return m ? 'Un arrêt conservé ne peut pas être gardé : ' + m[1] + ' (jour ' + m[2] + ') ne convient plus à ce plan. Libérez-le ou modifiez la demande.' : msg;
  }
  function request(extra, opts){
    opts = opts || {};
    var body = { text: state.text, seed: state.seed, excludeVenueIds: state.exclude.slice(-200) };
    var o = state.overrides, ov = {};
    ['days', 'pace', 'baseRegion', 'budgetMode', 'durationMinutes', 'startDate', 'startMinutes', 'dayStartMinutes', 'shortWalkVenueIds', 'eventId'].forEach(function(k){ if (o[k] !== undefined) ov[k] = o[k]; });
    if (Object.keys(ov).length) body.overrides = ov;
    for (var k in extra) body[k] = extra[k];
    var requestType = opts.requestType || 'initial';
    var trigger = opts.trigger || null;
    setStatus(tx('tripv3.planning'), 'loading');
    submitBtn.disabled = true;
    resultEl.setAttribute('aria-busy', 'true');
    if (trigger) { trigger.disabled = true; trigger.setAttribute('aria-busy', 'true'); }
    clearEditError();
    function done(){ submitBtn.disabled = false; resultEl.removeAttribute('aria-busy'); if (trigger) { trigger.disabled = false; trigger.removeAttribute('aria-busy'); } }
    return fetch('/api/trip/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function(res){
        done();
        if (['replace','regenerate','regenerate_day'].indexOf(requestType)!==-1 && t3EditLosesMatch(state.last,res.j)) {
          var message=document.documentElement.lang==='fr' ? 'Aucune nouvelle combinaison ne conserve toutes vos activités. Votre itinéraire actuel est conservé.' : 'No new combination keeps all your matched activities. Your current itinerary has been kept.';
          state.exclude=(state.lastReq && state.lastReq.exclude || []).slice();
          res={ok:false,status:res.status,incomplete:true,j:{error:message}};
        }
        if (!res.ok) {
          // A failed edit leaves the plan as it was (2026-10-19): the stop it tried to swap out is not excluded from
          // the next Swap, which would otherwise fail on the same kept stop, and so on for every other Swap.
          if (['replace','regenerate','regenerate_day'].indexOf(requestType) !== -1 && state.lastReq) state.exclude = (state.lastReq.exclude || []).slice();
          setStatus(res.j && res.j.error ? errorText(res.j.error) : tx('tripv3.error'), 'error');
          showEditError(trigger, statusEl.textContent);
          track('trip_plan_error', { request_type: requestType, error_type: res.incomplete ? 'incomplete_edit' : 'response', http_status: res.status });
          return;
        }
        setStatus('');
        // Swap with nothing else to offer (round 7): the stop is kept, so it is not excluded from later plans.
        if (res.j && res.j.swapKept) state.exclude = state.exclude.filter(function(x){ return x !== res.j.swapKept.id; });
        state.last = res.j;
        state.lastReq = { seed: body.seed, overrides: body.overrides || {}, exclude: body.excludeVenueIds, pinned: body.pinned || null, avoid: body.avoidVenueIds || [] };
        state.removed = {};
        // A shared link's removed stops (rm=): removed again, exactly as the
        // sender left them, and skipped by any later regenerate.
        (opts.removedKeys || []).forEach(function(key){
          var rs = stopAt(key);
          if (!rs) return;
          state.removed[key] = rs.venue.id;
          if (state.exclude.indexOf(rs.venue.id) === -1) state.exclude.push(rs.venue.id);
        });
        // Kept stops the planner could not keep are no longer kept.
        Object.keys(state.locks).forEach(function(key){ if (!stopAt(key) || stopAt(key).venue.id !== state.locks[key]) delete state.locks[key]; });
        render(opts.focus !== false);
        syncUrl();
        var facts = planFacts(res.j);
        facts.request_type = requestType;
        facts.stop_count = planStopButtons().length;
        // The plan's pace (Stage 5H analytics): one of the planner's three fixed values, never text.
        var pace = res.j && res.j.understood && res.j.understood.pace;
        if (pace === 'relaxed' || pace === 'standard' || pace === 'packed') facts.pace = pace;
        track('trip_plan_complete', facts);
      })
      .catch(function(){
        done();
        setStatus(tx('tripv3.error'), 'error');
        showEditError(trigger, statusEl.textContent);
        track('trip_plan_error', { request_type: requestType, error_type: 'exception' });
      });
  }
  // An edit that fails (Swap, Regenerate day, a changed setting, ...) is also
  // shown next to the control that made it: on a phone the hero's status line
  // is far above the plan. The same message; the plan on screen is unchanged,
  // so the note stays until the next request or render. Not a live region --
  // the hero's status line already announces it.
  function clearEditError(){ Array.prototype.forEach.call(resultEl.querySelectorAll('.t3-edit-error'), function(el){ el.parentNode.removeChild(el); }); }
  function showEditError(trigger, text){
    if (!trigger || !text || !resultEl.contains(trigger)) return;
    var host = trigger.closest('.t3-day-head, .t3-actions, .t3-removed, .t3-chips, .t3-plan-actions') || trigger;
    var note = document.createElement('p');
    note.className = 't3-edit-error';
    note.textContent = text;
    host.parentNode.insertBefore(note, host.nextSibling);
    try { note.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
  }
  // The address bar always holds the link to the plan on screen (replaceState:
  // no extra history entries, so Back leaves the page as before). It is built
  // from the request that produced that plan -- not from a later request that
  // failed -- plus the visitor's kept and removed stops.
  function syncUrl(){
    var r = state.lastReq;
    var s = r ? { text: state.text, seed: r.seed, overrides: r.overrides, locks: state.locks, exclude: r.exclude, pinned: r.pinned, avoid: r.avoid, removed: state.removed }
      : { text: state.text, seed: state.seed, overrides: state.overrides, locks: state.locks, exclude: state.exclude };
    // French (2026-10-18): a plan made on /fr/trip keeps its French address, so a reload or a shared link stays French.
    var base = (location.pathname + '/').indexOf('/fr/') === 0 ? '/fr/trip' : '/trip';
    try { history.replaceState(null, '', base + t3StateToQuery(s)); } catch (e) {}
  }

  // ---- plan helpers ----
  function days(){ return (state.last && state.last.days) || []; }
  // The same place on an earlier day of this plan (2026-10-19: a ski trip's resort every day). That copy goes into
  // My Trip as its own stop for this day (data-trip-slot), instead of being dropped as a duplicate.
  function repeatDay(id, day){ return days().some(function(d){ return d.day < day && d.stops.some(function(s){ return s.venue && s.venue.id === id; }); }); }
  function tripKey(b){ var r = b.getAttribute('data-trip-ref'), sl = b.getAttribute('data-trip-slot'); return r ? r + (sl ? '@' + sl : '') : null; }
  function stopAt(key){
    var parts = key.split('-'), d = Number(parts[0]), dp = parts[1];
    var day = days().filter(function(x){ return x.day === d; })[0];
    var s = day && day.stops.filter(function(x){ return x.daypart === dp; })[0];
    return s && s.venue ? s : null;
  }
  function currentPins(exceptKeys){
    var pins = {};
    days().forEach(function(d){ d.stops.forEach(function(s){ var k = d.day + '-' + s.daypart; if (s.venue && !state.removed[k] && (exceptKeys || []).indexOf(k) === -1) pins[k] = s.venue.id; }); });
    return pins;
  }
  function shownIds(){
    var ids = [], p = state.last || {};
    days().forEach(function(d){ d.stops.forEach(function(s){ if (s.venue) ids.push(s.venue.id); }); });
    ((p.outing && p.outing.stops) || []).forEach(function(s){ if (s.venue) ids.push(s.venue.id); });
    ((p.itinerary && p.itinerary.stops) || []).forEach(function(s){ if (s.kind !== 'event' && s.venue) ids.push(s.venue.id); });
    (p.recommendations || []).forEach(function(s){ if (s.venue) ids.push(s.venue.id); });
    return ids.slice(0, 200);
  }
  function tripQuery(v){ return v.address ? (v.name + ', ' + v.address) : (v.name + ', ' + v.regionLabel + ', Okanagan Valley, BC'); }
  function nameCounts(){
    var c = {}, p = state.last || {};
    var all = [];
    days().forEach(function(d){ d.stops.forEach(function(s){ if (s.venue) all.push(s.venue); }); });
    ((p.outing && p.outing.stops) || []).forEach(function(s){ if (s.venue) all.push(s.venue); });
    ((p.itinerary && p.itinerary.stops) || []).forEach(function(s){ if (s.venue) all.push(s.venue); });
    all.forEach(function(v){ c[v.name] = (c[v.name] || 0) + 1; });
    return c;
  }

  // ---- whole-trip map (Stage 5G, 2026-10-02) ----
  // One map for the day plan on screen, collapsed until the visitor opens it:
  // Leaflet (cdnjs, pinned by integrity hash) and the OpenStreetMap tiles load
  // only then. The map lives in one element kept outside render(): render()
  // detaches it before rewriting the result and puts it back into the new
  // plan's map slot, so an open map, its chosen day and its Leaflet instance
  // survive every edit -- only the markers and day lines are redrawn. A view
  // only: no analytics, no URL state, no request to Okanagan Roam.
  var LEAFLET_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
  var LEAFLET_JS_SRI = 'sha512-puJW3E/qXDqYp9IfhAI54BJEaWIfloJ7JWs7OeD5i6ruC9JZL1gERT1wjtwXFlh7CjE7ZJ+/vcRZRkIYIb6p4g==';
  var LEAFLET_CSS_SRI = 'sha512-h9FcoyWjHcOcmEVkxOfTLnmZFWIH0iZhZT1H2TbOq55xssQGEJHEaIm+PgoUaZbRvQTNTluNOEfb1ZRy6D3BOw==';
  var MAP_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var MAP_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
  var DAY_COLORS = ['#1F5C5C', '#B5452B', '#3B5BA5', '#7B4B94', '#8A6A00', '#2F7A3D', '#A3325A'];
  var tripMap = { box: null, open: false, day: null, leaflet: null, layer: null, data: null };
  var leafletWaiting = null, leafletReady = false;
  function dayColor(day){ return DAY_COLORS[(Number(day) - 1) % DAY_COLORS.length] || DAY_COLORS[0]; }
  function mapBox(){
    if (tripMap.box) return tripMap.box;
    var box = document.createElement('section');
    box.className = 't3-map';
    box.setAttribute('aria-label', tx('tripv3.map.label'));
    box.innerHTML = '<div class="t3-map-bar"><button type="button" class="t3-btn t3-btn-ghost t3-map-toggle" aria-expanded="false" aria-controls="t3MapPanel">' + esc(tx('tripv3.map.show')) + '</button><p class="t3-map-note" hidden></p></div>'
      + '<div class="t3-map-panel" id="t3MapPanel" hidden><div class="t3-map-days" role="group" aria-label="' + esc(tx('tripv3.map.daysLabel')) + '" hidden></div>'
      + '<div class="t3-map-canvas"></div><p class="t3-map-status" role="status" aria-live="polite"></p></div>';
    box.querySelector('.t3-map-toggle').addEventListener('click', function(){ setMapOpen(!tripMap.open); });
    box.querySelector('.t3-map-days').addEventListener('click', function(e){
      var b = e.target.closest ? e.target.closest('[data-t3-map-only]') : null;
      if (!b) return;
      var v = b.getAttribute('data-t3-map-only');
      tripMap.day = v === 'all' ? null : Number(v);
      drawMap(true);
    });
    tripMap.box = box;
    return box;
  }
  function mapStatus(text){ if (tripMap.box) tripMap.box.querySelector('.t3-map-status').textContent = text || ''; }
  function detachMap(){ if (tripMap.box && tripMap.box.parentNode) tripMap.box.parentNode.removeChild(tripMap.box); }
  // After every render(): the map goes into the new plan's slot (day plans
  // with at least one mappable stop only) and is redrawn if it is open.
  function placeMap(){
    var slot = resultEl.querySelector('[data-t3-map-slot]');
    tripMap.data = slot ? t3MapPoints(days(), state.removed) : null;
    if (!slot || !tripMap.data.count) return;
    var box = mapBox();
    slot.appendChild(box);
    var data = tripMap.data;
    if (tripMap.day !== null && !data.days.some(function(d){ return d.day === tripMap.day; })) tripMap.day = null;
    var note = box.querySelector('.t3-map-note');
    note.textContent = data.skipped === 1 ? tx('tripv3.map.skippedOne') : tx('tripv3.map.skippedMany', { n: data.skipped });
    // The box is kept across renders, so its own labels follow the language.
    box.setAttribute('aria-label', tx('tripv3.map.label'));
    box.querySelector('.t3-map-toggle').textContent = tripMap.open ? tx('tripv3.map.hide') : tx('tripv3.map.show');
    box.querySelector('.t3-map-days').setAttribute('aria-label', tx('tripv3.map.daysLabel'));
    note.hidden = !data.skipped;
    var chips = box.querySelector('.t3-map-days');
    chips.hidden = data.days.length < 2;
    chips.innerHTML = data.days.length < 2 ? '' : '<button type="button" class="t3-map-chip" data-t3-map-only="all" aria-pressed="false">' + esc(tx('tripv3.map.allDays')) + '</button>'
      + data.days.map(function(d){ return '<button type="button" class="t3-map-chip" data-t3-map-only="' + esc(d.day) + '" aria-pressed="false"><span class="t3-map-swatch" style="background:' + dayColor(d.day) + '" aria-hidden="true"></span>' + esc(tx('tripv3.day', { n: d.day })) + '</button>'; }).join('');
    if (tripMap.open) { if (tripMap.leaflet) drawMap(true); else openMap(); }
  }
  function setMapOpen(open){
    var box = mapBox(), btn = box.querySelector('.t3-map-toggle');
    tripMap.open = open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.textContent = open ? tx('tripv3.map.hide') : tx('tripv3.map.show');
    box.querySelector('.t3-map-panel').hidden = !open;
    if (open) openMap();
  }
  function openMap(){
    if (tripMap.leaflet) { drawMap(true); return; }
    mapStatus(tx('tripv3.map.loading'));
    loadLeaflet(function(ok){
      if (!tripMap.open || tripMap.leaflet || !tripMap.box.parentNode) return;
      if (!ok) { mapStatus(tx('tripv3.map.failed')); return; }
      try {
        tripMap.leaflet = L.map(tripMap.box.querySelector('.t3-map-canvas'), { scrollWheelZoom: false, maxZoom: 15 }).setView([49.75, -119.55], 9);
        L.tileLayer(MAP_TILES, { maxZoom: 15, attribution: MAP_ATTRIBUTION }).addTo(tripMap.leaflet);
        tripMap.layer = L.layerGroup().addTo(tripMap.leaflet);
      } catch (e) { tripMap.leaflet = null; mapStatus(tx('tripv3.map.failed')); return; }
      mapStatus('');
      drawMap(true);
    });
  }
  // Leaflet's stylesheet and script, once, on first open. A failure or a
  // 15-second stall removes them, so the next open tries again.
  function loadLeaflet(done){
    if (leafletReady) { done(true); return; }
    if (leafletWaiting) { leafletWaiting.push(done); return; }
    leafletWaiting = [done];
    var pending = 2, settled = false, timer;
    var css = document.createElement('link'), js = document.createElement('script');
    function finish(ok){
      if (settled) return;
      settled = true; clearTimeout(timer);
      leafletReady = ok;
      if (!ok) { [css, js].forEach(function(el){ if (el.parentNode) el.parentNode.removeChild(el); }); }
      var w = leafletWaiting; leafletWaiting = null;
      w.forEach(function(f){ f(ok); });
    }
    function loaded(){ pending -= 1; if (!pending) finish(!!(window.L && window.L.map)); }
    css.rel = 'stylesheet'; css.href = LEAFLET_BASE + 'leaflet.min.css'; css.integrity = LEAFLET_CSS_SRI; css.crossOrigin = 'anonymous';
    js.src = LEAFLET_BASE + 'leaflet.min.js'; js.integrity = LEAFLET_JS_SRI; js.crossOrigin = 'anonymous'; js.async = true;
    css.onload = loaded; js.onload = loaded;
    css.onerror = js.onerror = function(){ finish(false); };
    timer = setTimeout(function(){ finish(false); }, 15000);
    document.head.appendChild(css);
    document.head.appendChild(js);
  }
  function drawMap(fit){
    var lf = tripMap.leaflet, data = tripMap.data;
    if (!lf || !tripMap.open || !data || !tripMap.box.parentNode) return;
    Array.prototype.forEach.call(tripMap.box.querySelectorAll('[data-t3-map-only]'), function(b){
      var v = b.getAttribute('data-t3-map-only');
      b.setAttribute('aria-pressed', (v === 'all' ? tripMap.day === null : Number(v) === tripMap.day) ? 'true' : 'false');
    });
    tripMap.layer.clearLayers();
    var bounds = [];
    data.days.forEach(function(d){
      if (tripMap.day !== null && d.day !== tripMap.day) return;
      var color = dayColor(d.day), line = [];
      d.points.forEach(function(p){
        var at = [p.lat, p.lng];
        line.push(at); bounds.push(at);
        var label = tx('tripv3.map.marker', { day: d.day, n: p.n, name: p.name });
        var marker = L.marker(at, { title: label, riseOnHover: true, icon: L.divIcon({ className: 't3-pin', html: '<span style="background:' + color + '">' + p.n + '</span>', iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14] }) });
        marker.bindPopup(mapPopup(d.day, p));
        marker.on('add', function(){ var el = this.getElement(); if (el) el.setAttribute('aria-label', label); });
        tripMap.layer.addLayer(marker);
      });
      if (line.length > 1) tripMap.layer.addLayer(L.polyline(line, { color: color, weight: 3, opacity: 0.8, interactive: false }));
    });
    requestAnimationFrame(function(){
      lf.invalidateSize();
      if (!fit || !bounds.length) return;
      if (bounds.length === 1) lf.setView(bounds[0], 13);
      else lf.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
    });
  }
  function mapPopup(day, p){
    var el = document.createElement('div');
    el.className = 't3-map-pop';
    var when = document.createElement('div');
    when.className = 't3-map-pop-when';
    when.textContent = tx('tripv3.day', { n: day }) + ' · ' + p.n + (p.label ? ' · ' + p.label : '');
    var name = document.createElement('strong');
    name.textContent = p.name;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 't3-act'; btn.textContent = tx('tripv3.map.showInPlan');
    btn.addEventListener('click', function(){ showInPlan(p.key); });
    el.appendChild(when); el.appendChild(name); el.appendChild(btn);
    return el;
  }
  function showInPlan(key){
    var keep = resultEl.querySelector('[data-t3-keep="' + key + '"]');
    var card = keep && keep.closest('.t3-card');
    if (!card) return;
    if (tripMap.leaflet) tripMap.leaflet.closePopup();
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var target = card.querySelector('h4 a') || keep;
    try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
  }

  // ---- rendering ----
  function factsLine(v){
    var parts = [];
    if (v.rating != null) parts.push('<span class="t3-star" aria-hidden="true">★</span> ' + esc(num(v.rating)) + (v.reviews ? ' <span class="t3-sr">' + esc(tx('tripv3.from')) + '</span>' + esc(tx('tripv3.reviews', { n: Number(v.reviews).toLocaleString(lang() === 'fr' ? 'fr-CA' : 'en-CA') })) : ''));
    if (v.price) parts.push('<span aria-label="' + esc(tx('tripv3.priceLevel', { n: v.price })) + '">' + new Array(v.price + 1).join('$') + '</span>');
    return parts.length ? '<p class="t3-facts">' + parts.join(' · ') + '</p>' : '';
  }
  // The site's own badge names (the same keys as /browse).
  var BADGE_KEYS = { dog_friendly: 'badge.dogFriendly', vegan: 'badge.vegan', vegetarian: 'badge.vegetarian', gluten_free: 'badge.glutenFree', patio: 'badge.patio', kid_friendly: 'badge.kidFriendly', lake_view: 'badge.lakeView', nonalcoholic: 'badge.nonalcoholic', sports_tv: 'badge.sportsTv', live_music: 'badge.liveMusic', great_groups: 'badge.greatGroups', happy_hour: 'badge.happyHour' };
  // The hours-derived badges have no key in app.js's frozen dictionary, so
  // their French names live here (same approach as DH_TEXT above).
  var BADGE_FR_EXTRA = { open_early: 'Ouvert t\u00f4t', open_late: 'Ouvert tard' };
  var DAYPARTS = { morning: 'Morning', midday: 'Midday', afternoon: 'Afternoon', late: 'Late afternoon', evening: 'Evening', night: 'Night' };
  // A day plan's slot label is the planner's fixed daypart name; any other label is the planner's own wording.
  function whenLabel(s){ return DAYPARTS[s.daypart] === s.label ? frLabel('tripv3.daypart.' + s.daypart, s.label) : s.label; }
  // Stop photos: each card in a plan gets a different photo where we have more than one for that kind of place, and a
  // dog trip uses the dog photos first (2026-10-14: two restaurants showed the same photo).
  var STOP_PHOTO_ALTS = { restaurant: ['restaurant', 'restaurant-2', 'restaurant-3'], winery: ['winery', 'winery-2', 'winery-3'], hiking: ['hiking', 'hiking-2', 'hiking-3'], beach: ['beach', 'beach-2', 'outdoor-2'], outdoor: ['outdoor', 'outdoor-2', 'viewpoints'], cocktail: ['cocktail', 'cocktail-2'], 'tour-farm': ['tour-farm', 'tour'], viewpoints: ['viewpoints', 'outdoor-2'], cafe: ['cafe', 'restaurant-3'] };
  var STOP_PHOTO_DOG = { restaurant: 'dog-restaurant', 'restaurant-2': 'dog-restaurant', cafe: 'dog-cafe', brewery: 'dog-brewery', winery: 'dog-winery', pub: 'dog-pub', cocktail: 'dog-cocktail', distillery: 'dog-distillery', beach: 'dog-outdoor', outdoor: 'dog-outdoor', hiking: 'dog-outdoor' };
  var renderedPhotos = {};
  function stopPhotoUrl(v){
    var url = safeUrl(v.photo);
    var prefix = '/images/trip-v3/stops/stop-', suffix = '-480.jpg';
    if (!url || url.indexOf(prefix) !== 0 || url.slice(-suffix.length) !== suffix) return url;
    var key = url.slice(prefix.length, -suffix.length);
    var dog = /dog/.test(((state.last && state.last.understood && state.last.understood.party) || []).join(' '));
    var options = (dog && STOP_PHOTO_DOG[key] ? [STOP_PHOTO_DOG[key]] : []).concat(STOP_PHOTO_ALTS[key] || [key]);
    var pick = options.filter(function(k){ return !renderedPhotos[k]; })[0] || options[0];
    renderedPhotos[pick] = true;
    return '/images/trip-v3/stops/stop-' + pick + '-480.jpg';
  }
  function badgesHtml(v){
    // The badges that answer the request come first: the party's (dog, kids), then Okanagan Roam's own lists.
    var party = ((state.last && state.last.understood && state.last.understood.party) || []).join(' ');
    var wanted = function(b){ return (/dog/.test(party) && b.key === 'dog_friendly') || (/kid/.test(party) && b.key === 'kid_friendly') ? 0 : 1; };
    var badges = (v.badges || []).slice().sort(function(a, b){ return wanted(a) - wanted(b); });
    var lead = badges.filter(function(b){ return wanted(b) === 0; }), rest = badges.filter(function(b){ return wanted(b) === 1; });
    var badgeLi = function(b){ return '<li>' + esc(BADGE_FR_EXTRA[b.key] ? (lang() === 'fr' ? BADGE_FR_EXTRA[b.key] : b.label) : frLabel(BADGE_KEYS[b.key], b.label)) + '</li>'; };
    var items = lead.map(badgeLi)
      .concat((v.collections || []).map(function(c){ return '<li class="is-collection">' + esc(frLabel('tripv3.collection.' + c.key, c.label)) + '</li>'; }))
      .concat(rest.map(badgeLi));
    // Three badges show; the rest open with "+N more", so a card stays short on a phone (2026-10-14).
    if (items.length > 4) {
      var extra = items.length - 3;
      items = items.slice(0, 3).concat(items.slice(3).map(function(li){ return li.replace('<li', '<li hidden data-t3-badge-extra'); }))
        .concat('<li class="is-more"><button type="button" class="t3-badge-more" data-t3-badges-more aria-expanded="false">' + esc(lang() === 'fr' ? '+' + extra + ' de plus' : '+' + extra + ' more') + '</button></li>');
    }
    return items.length ? '<ul class="t3-badges" aria-label="' + esc(tx('tripv3.verified')) + '">' + items.join('') + '</ul>' : '';
  }
  function cardHtml(stop, key, opts){
    opts = opts || {};
    var v = stop.venue, url = safeUrl(v.url), counts = opts.counts || {};
    var cardAnchor = v.id != null && !renderedVenueCardAnchors[v.id] ? ' id="' + esc(t3VenueCardId(v.id)) + '"' : '';
    if (v.id != null) renderedVenueCardAnchors[v.id] = true;
    var kept = key && state.locks[key] === v.id;
    // The listed hours are shown once, as the fact line above the reasons (in French too, 2026-10-18).
    var why = (stop.why || []).filter(function(w){ return !(v.listedHours && /^(Listed hours|Horaires indiqu\u00e9s)/.test(w)) && !/\(straight line\)/.test(w); }).slice(0, 2).map(function(w){ return '<li>' + esc(w) + '</li>'; }).join('');
    // A dated plan's timing ("Provisional visit 09:00–10:00 ...") is already in the timeline and the Before you go list.
    var cav = (stop.caveats || []).filter(function(c){ return !/No usable hours listed|Aucun horaire utilisable|No map location on file|emplacement.*carte|^Provisional visit|^Visite provisoire/i.test(c); }).map(function(c){ return '<li>' + esc(c) + '</li>'; }).join('');
    var same = counts[v.name] > 1;
    // The venue's own photo when it has one; otherwise a photo of the kind of place (beach, winery, café...),
    // tagged as an example so nobody takes it for this business.
    var photoUrl = stopPhotoUrl(v);
    var photoTag = v.ownPhoto ? '' : '<span class="t3-photo-tag">' + esc(lang() === 'fr' ? 'Photo d’exemple' : 'Example photo') + '</span>';
    var photoHtml = photoUrl ? '<div class="t3-card-photo"><img src="' + esc(photoUrl) + '" alt="' + (v.ownPhoto ? esc(v.name) : '') + '" width="480" height="320" loading="lazy" decoding="async">' + photoTag + '</div>' : '';
    var html = '<article class="t3-card' + (kept ? ' is-kept' : '') + (photoUrl ? ' has-photo' : '') + '"' + cardAnchor + ' data-venue-id="' + esc(v.id) + '">'
      // Four groups (head / tags / body / actions) so that cards in the same
      // grid row can share row tracks (see .t3-grid) and line up. Each group
      // is always present, empty or not.
      + '<div class="t3-card-head">' + photoHtml
      + '<div class="t3-card-top"><span>' + esc(frLabel('tripv3.type.' + v.type, v.typeLabel)) + '</span><span aria-hidden="true">·</span><span>' + esc(v.regionLabel) + '</span></div>'
      + '<h4>' + (url ? '<a href="' + esc(url) + '">' + esc(v.name) + '</a>' : esc(v.name)) + '</h4>'
      + (same && v.address ? '<p class="t3-address">' + esc(v.address) + '</p>' : '')
      + factsLine(v)
      + '</div>'
      + '<div class="t3-card-tags">' + badgesHtml(v) + '</div>'
      + '<div class="t3-card-body">'
      + (v.listedHours ? '<p class="t3-hours">' + esc(v.listedHours) + (/venue page|page du lieu/i.test(v.listedHours) ? '' : ' <span class="t3-nowrap"><span class="t3-sr">(</span>' + esc(tx('tripv3.checkBeforeGo')) + '<span class="t3-sr">)</span></span>') + '</p>' : '')
      + (why ? '<ul class="t3-why" aria-label="' + esc(tx('tripv3.whyFits')) + '">' + why + '</ul>' : '')
      + (cav ? '<ul class="t3-caveats" aria-label="' + esc(tx('tripv3.goodToKnow')) + '">' + cav + '</ul>' : '')
      + '</div>'
      + '<div class="t3-actions">'
      + '<button type="button" class="trip-btn" data-trip-name="' + esc(v.name) + '" data-trip-query="' + esc(tripQuery(v)) + '" data-trip-region="' + esc(v.region) + '"' + (v.id ? ' data-trip-ref="venue:' + esc(v.id) + '"' : '') + (opts.planStop ? ' data-plan-stop' + (key ? ' data-plan-day="' + esc(key.split('-')[0]) + '"' : datedOneDay() ? ' data-plan-day="1"' : '') : '') + (opts.planStop && key && v.id && repeatDay(v.id, Number(key.split('-')[0])) ? ' data-trip-slot="' + esc(key.split('-')[0]) + '"' : '') + '>Add to trip</button>'
    // The list cards' Favorite button (2026-10-19): named for the place, with its pressed state.
    var favHtml = '<button type="button" class="card-action fav-btn" data-fav-name="' + esc(v.name) + '" aria-pressed="false" aria-label="' + esc(lang() === 'fr' ? 'Ajouter ' + v.name + ' aux favoris' : 'Favorite ' + v.name) + '">Favorite</button>';
    var detailsHtml = url ? '<a class="t3-act" href="' + esc(url) + '">' + esc(tx('tripv3.viewDetails')) + '</a>' : '';
    if (key) {
      // A plan stop: the everyday actions show; Keep, Favorite and View details sit under "More" (2026-10-14).
      var keepHtml = '<button type="button" class="t3-act" data-t3-keep="' + esc(key) + '" aria-pressed="' + (kept ? 'true' : 'false') + '" aria-label="' + esc(tx('tripv3.keepLabel', { name: v.name })) + '">' + esc(kept ? tx('tripv3.kept') : tx('tripv3.keep')) + '</button>';
      html += (stop.noSwap ? '' : '<button type="button" class="t3-act" data-t3-swap="' + esc(key) + '" aria-label="' + esc(tx('tripv3.swapLabel', { name: v.name })) + '">' + esc(tx('tripv3.swap')) + '</button>')
        + '<button type="button" class="t3-act" data-t3-remove="' + esc(key) + '" aria-label="' + esc(tx('tripv3.removeLabel', { name: v.name })) + '">' + esc(tx('tripv3.remove')) + '</button>'
        + (kept ? keepHtml : '')
        + '<details class="t3-more"><summary class="t3-act" aria-label="' + esc(lang() === 'fr' ? 'Plus d’options pour ' + v.name : 'More options for ' + v.name) + '">' + esc(lang() === 'fr' ? 'Plus' : 'More') + '</summary><div class="t3-more-menu">'
        + (kept ? '' : keepHtml) + favHtml + detailsHtml + '</div></details>';
      return html + '</div></article>';
    }
    html += favHtml;
    if (opts.swapId) html += '<button type="button" class="t3-act" data-t3-swap-id="' + esc(v.id) + '" aria-label="' + esc(tx('tripv3.swapLabel', { name: v.name })) + '">' + esc(tx('tripv3.swap')) + '</button>';
    html += detailsHtml;
    return html + '</div></article>';
  }
  // The planner's fixed occasion and party labels (trip-planner.js).
  var OCCASION_KEYS = { 'date night': 'tripv3.occasion.date_night', 'romantic outing': 'tripv3.occasion.romantic', 'family trip': 'tripv3.occasion.family', 'rainy day': 'tripv3.occasion.rainy_day', celebration: 'tripv3.occasion.celebration', 'group getaway': 'tripv3.occasion.group_getaway', 'relaxing getaway': 'tripv3.occasion.relaxing', adventure: 'tripv3.occasion.adventure', 'adults-only trip': 'tripv3.occasion.adults' };
  var PARTY_KEYS = { 'with kids': 'tripv3.party.kids', 'with a dog': 'tripv3.party.dog' };
  function understoodHtml(p){
    var u = p.understood;
    if (!u) return '';
    var chips = [];
    var planKinds = p.kind === 'multi_day' || p.kind === 'day_plan';
    if (planKinds) {
      var dOpts = '';
      for (var n = 1; n <= 7; n++) dOpts += '<option value="' + n + '"' + (n === (p.days || []).length ? ' selected' : '') + '>' + esc(tx(n === 1 ? 'tripv3.dayOne' : 'tripv3.dayMany', { n: n })) + '</option>';
      chips.push('<li class="t3-chip"><span class="t3-chip-label">' + esc(tx('tripv3.length')) + '</span><select data-t3-override="days" aria-label="' + esc(tx('tripv3.lengthLabel')) + '">' + dOpts + '</select></li>');
    }
    if (!(u.route && u.route.to) && ['events', 'navigate', 'unknown'].indexOf(p.kind) === -1) {
      var cur = u.base.length === 1 ? u.base[0].slug : (u.base.length ? '' : 'valley');
      var bOpts = (u.base.length > 1 ? '<option value="" selected>' + esc(u.base.map(function(b){ return b.label; }).join(' & ')) + '</option>' : '')
        + '<option value="valley"' + (cur === 'valley' ? ' selected' : '') + '>' + esc(tx('tripv3.anywhere')) + '</option>'
        + REGIONS.map(function(r){ return '<option value="' + esc(r.slug) + '"' + (cur === r.slug ? ' selected' : '') + '>' + esc(r.label) + '</option>'; }).join('');
      chips.push('<li class="t3-chip"><span class="t3-chip-label">' + esc(tx('tripv3.where')) + '</span><select data-t3-override="baseRegion" aria-label="' + esc(tx('tripv3.whereLabel')) + '">' + bOpts + '</select></li>');
    }
    if (planKinds) {
      var paces = ['relaxed', 'standard', 'packed'];
      chips.push('<li class="t3-chip"><span class="t3-chip-label">' + esc(tx('tripv3.pace')) + '</span><select data-t3-override="pace" aria-label="' + esc(tx('tripv3.pace')) + '">' + paces.map(function(x){ return '<option value="' + x + '"' + (u.pace === x ? ' selected' : '') + '>' + esc(tx('tripv3.pace.' + x)) + '</option>'; }).join('') + '</select></li>');
    }
    if (u.season) chips.push('<li class="t3-chip"><span class="t3-chip-label">' + esc(tx('tripv3.when')) + '</span>' + esc(u.season.label) + '</li>');
    else if (u.when) chips.push('<li class="t3-chip"><span class="t3-chip-label">' + esc(tx('tripv3.when')) + '</span>' + esc(u.when) + '</li>');
    if (u.budget) chips.push('<li class="t3-chip">' + esc(lang() === 'fr' ? ({ budget: 'Petit budget', moderate: 'Prix moyens', upscale: 'Haut de gamme' }[u.budget] || u.budget) : ({ budget: 'On a budget', moderate: 'Mid-range prices', upscale: 'Upscale' }[u.budget] || u.budget)) + '</li>');
    if (u.occasion) chips.push('<li class="t3-chip">' + esc(frLabel(OCCASION_KEYS[u.occasion], u.occasion.charAt(0).toUpperCase() + u.occasion.slice(1))) + '</li>');
    (u.party || []).forEach(function(x){ chips.push('<li class="t3-chip">' + esc(frLabel(PARTY_KEYS[x], x.charAt(0).toUpperCase() + x.slice(1))) + '</li>'); });
    // A word the visitor typed (“pizza”) shows as a plain chip, “Pizza”, like the others.
    (u.interests || []).forEach(function(x){ var w = String(x).replace(/^[“"«]\s*|\s*[”"»]$/g, ''); chips.push('<li class="t3-chip">' + esc(w.charAt(0).toUpperCase() + w.slice(1)) + '</li>'); });
    (u.themes || []).forEach(function(x){ chips.push('<li class="t3-chip"><span class="t3-chip-label">' + esc(tx('tripv3.oneDay')) + '</span>' + esc(x) + '</li>'); });
    // No length given (2026-10-19): ask for one, with the same Length control.
    var lengthAsk = '';
    if (u.lengthAsked === false && ['recommendations', 'discover', 'day_plan', 'multi_day'].indexOf(p.kind) !== -1) {
      var lfr = lang() === 'fr', lOpts = '<option value="">' + esc(lfr ? 'Choisir une durée' : 'Choose a length') + '</option>';
      for (var ln = 1; ln <= 7; ln++) lOpts += '<option value="' + ln + '">' + esc(tx(ln === 1 ? 'tripv3.dayOne' : 'tripv3.dayMany', { n: ln })) + '</option>';
      lengthAsk = '<p class="t3-length-ask">' + esc(planKinds ? (lfr ? 'Vous n’avez pas indiqué de durée : voici un plan de ' + (p.days || []).length + ' jour' + ((p.days || []).length > 1 ? 's' : '') + '. Changez la durée ci-dessus.' : 'You didn’t say how long, so this is a ' + (p.days || []).length + '-day plan. Change the length above.') : (lfr ? 'Combien de temps dure votre voyage? Choisissez une durée pour un plan jour par jour.' : 'How long is your trip? Choose a length for a day-by-day plan.'))
        + (planKinds ? '' : ' <select data-t3-override="days" aria-label="' + esc(tx('tripv3.lengthLabel')) + '">' + lOpts + '</select>') + '</p>';
    }
    var notUsed = (u.notUsed || []).length ? '<p class="t3-notused">' + esc(tx('tripv3.notUsed', { list: '\u0001' })).split('\u0001').join(u.notUsed.map(function(w){ return (lang() === 'fr' ? '«\u00a0' : '“') + esc(w) + (lang() === 'fr' ? '\u00a0»' : '”'); }).join(', ')) + '</p>' : '';
    return '<div class="t3-understood"><p class="t3-eyebrow">' + esc(tx('tripv3.understood')) + '</p><ul class="t3-chips">' + chips.join('') + '</ul>' + lengthAsk + notUsed + '</div>';
  }
  function stopsListHtml(stops, keyFor, counts){
    var html = '<ol class="t3-stops">', prev = null;
    stops.forEach(function(s){
      var key = keyFor ? keyFor(s) : null;
      if (key && state.removed[key]) {
        html += '<li class="t3-stop"><div class="t3-when">' + esc(whenLabel(s)) + '</div><div class="t3-removed">' + esc(tx('tripv3.removedStop')) + ' <button type="button" class="t3-act" data-t3-undo="' + esc(key) + '">' + esc(tx('tripv3.undo')) + '</button><button type="button" class="t3-act" data-t3-swap="' + esc(key) + '">' + esc(tx('tripv3.suggestAnother')) + '</button></div></li>';
        return;
      }
      if (s.unscheduledMeal) {
        var mealFr=lang()==='fr';
        html += '<li class="t3-stop"><div class="t3-when">' + esc(whenLabel(s)) + '</div><div class="t3-empty"><strong>' + (mealFr?'Souper non planifié':'Dinner not scheduled') + '</strong><p>' + (mealFr?'Aucun restaurant selon les horaires indiqués ne convient avant l’événement et la marge d’arrivée.':'No listed restaurant fits before the event and arrival allowance.') + '</p></div></li>';
        return;
      }
      if (!s.venue) {
        if (s.kind === 'event' && s.event) {
          var e = s.event, u = safeUrl(e.url);
          html += '<li class="t3-stop"><div class="t3-when">' + esc(whenLabel(s)) + '</div><div><article class="t3-card"><div class="t3-card-top"><span>' + esc(tx('tripv3.event')) + '</span><span aria-hidden="true">·</span><span>' + esc([e.dateLabel, e.time, e.regionLabel].filter(Boolean).join(' · ')) + '</span></div><h4>' + (u ? '<a href="' + esc(u) + '">' + esc(e.name) + '</a>' : esc(e.name)) + '</h4>'
            // Round 8: an event says why it is in the plan, like every other stop.
            + ((s.why || []).length ? '<ul class="t3-why" aria-label="' + esc(tx('tripv3.whyFits')) + '">' + s.why.slice(0, 2).map(function(w){ return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>' : '')
            + t3EventPlaceHtml(e,lang(),esc)
            + ((s.caveats || []).length ? '<ul class="t3-caveats">' + s.caveats.map(function(c){ return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' : '')
            + '<div class="t3-actions">' + (e.name ? '<button type="button" class="trip-btn" data-plan-stop' + (key ? ' data-plan-day="' + esc(key.split('-')[0]) + '"' : datedOneDay() ? ' data-plan-day="1"' : '') + ' data-trip-name="' + esc(e.name) + '" data-trip-query="' + esc(e.name + ', ' + (e.regionLabel || 'Okanagan') + ', Okanagan Valley, BC') + '" data-trip-region="' + esc(e.region || '') + '"' + (e.id ? ' data-trip-ref="event:' + esc(e.id) + '"' : '') + '>Add to trip</button>' : '') + (u ? '<a class="t3-act" href="' + esc(u) + '">' + esc(tx('tripv3.viewEvent')) + '</a>' : '') + '</div></article></div></li>';
          return;
        }
        // Round 7: a long wait before dinner with nothing nearby that fits is labelled free time, not left blank.
        if (s.freeTime && s.freeTime.minutes > 0) {
          var ftFr = lang() === 'fr', ftH = Math.round(s.freeTime.minutes / 30) / 2;
          var ftLen = ftFr ? String(ftH).replace('.', ',') + ' h' : ftH + (ftH === 1 ? ' hour' : ' hours');
          html += '<li class="t3-stop"><div class="t3-when">' + esc(whenLabel(s)) + '</div><div class="t3-empty t3-free"><strong>' + (ftFr ? 'Temps libre' : 'Free time') + '</strong><p>' + esc(ftFr ? 'Environ ' + ftLen + ' avant le souper pour flâner, vous reposer ou revenir à un endroit préféré.' : 'About ' + ftLen + ' before dinner to wander, rest or go back to a favourite spot.') + '</p></div></li>';
          return;
        }
        if ((s.freeEvening || []).length) {
          // One dinner was asked for: this evening is free on purpose, with a couple of places in case they want to eat out.
          var feFr = lang() === 'fr';
          var feLinks = s.freeEvening.map(function(x){ var u = safeUrl(x.url); return u ? '<a href="' + esc(u) + '">' + esc(x.name) + '</a>' : esc(x.name); }).join(feFr ? ' ou ' : ' or ');
          html += '<li class="t3-stop"><div class="t3-when">' + esc(whenLabel(s)) + '</div><div class="t3-empty t3-free"><strong>' + (feFr ? 'Soirée libre' : 'Free evening') + '</strong><p>' + esc(feFr ? 'Vous avez demandé un seul souper, alors cette soirée reste libre. Si vous voulez sortir manger : ' : 'You asked for one dinner, so this evening is yours. If you’d like to eat out: ') + feLinks + '.</p></div></li>';
          return;
        }
        html += '<li class="t3-stop"><div class="t3-when">' + esc(whenLabel(s)) + '</div><div class="t3-empty">' + esc(tx('tripv3.noStop')) + '</div></li>';
        return;
      }
      if (prev) {
        // The straight line across the lake says nothing about the drive (round 7), so it is left out then.
        var km = s.driveFrom && s.driveFrom.aroundLake ? null : kmText(t3Km(prev.venue, s.venue));
        // A stop in another town shows the drive there (2026-10-19), not only the straight-line distance.
        var drive = s.driveFrom ? t3DriveText(s.driveFrom, lang()) : '';
        if (km || drive) html += '<li class="t3-leg' + (drive ? ' t3-leg-drive' : '') + '" aria-label="' + esc(tx('tripv3.distanceLabel')) + '">' + esc(drive ? drive + (km ? ' \u00b7 ' + km : '') : km) + '</li>';
      }
      html += '<li class="t3-stop"><div class="t3-when">' + esc(whenLabel(s)) + '</div><div>' + cardHtml(s, key, { planStop: true, counts: counts, swapId: !key }) + '</div></li>';
      prev = s;
    });
    return html + '</ol>';
  }
  // ---- real-map day header ----
  // The header's map is a pre-rendered OSM Carto image, not a live map: no Leaflet, tile or API
  // request is made for it (the whole-trip map below still uses Leaflet). One <picture> loads only
  // the matching file. It is decorative (the day's name is text; "Map this day" is the way into a
  // real map), so it is hidden from assistive technology, while its two required credits are real,
  // keyboard-reachable links right next to it. The ring is placed from the true marker offset.
  function staticMapHtml(a, first, d){
    var dk = a.desktop, nw = a.narrow;
    var style = '--dw:' + dk.w + 'px;--dh:' + dk.h + 'px;--ddx:' + dk.dx + 'px;--ddy:' + dk.dy + 'px;--nw:' + nw.w + 'px;--nh:' + nw.h + 'px;--ndx:' + nw.dx + 'px;--ndy:' + nw.dy + 'px';
    // The day's own stops as numbered pins; a day spread wider than the picture gets a live map fitted to its stops.
    var pts = d ? (((t3MapPoints([d], state.removed).days[0] || {}).points) || []) : [];
    var layout = t3DayPinLayout(pts, a);
    var pinsHtml = layout.fits ? layout.pins.map(function(q){ return '<span class="t3-dh-pin" style="--pdx:' + q.d.dx + 'px;--pdy:' + q.d.dy + 'px;--pndx:' + q.w.dx + 'px;--pndy:' + q.w.dy + 'px;background:' + dayColor(d.day) + '">' + q.n + '</span>'; }).join('') : '';
    var cls = 't3-dh-map t3-dh-map--static' + (nw.below > 721 ? ' t3-dh-map--wnarrow' : '') + (layout.fits ? ' t3-dh-map--pins' : '');
    return '<div class="' + cls + '" style="' + style + '"' + (!layout.fits && pts.length > 1 ? ' data-t3-fit-day="' + esc(d.day) + '"' : '') + '><div class="t3-dh-frame" aria-hidden="true"><picture>'
      + '<source media="(max-width: ' + (nw.below - 1) + 'px)" srcset="' + esc(nw.src) + '">'
      + '<img src="' + esc(dk.src) + '" alt="" width="' + dk.w + '" height="' + dk.h + '" decoding="async" loading="' + (first ? 'eager' : 'lazy') + '"></picture>'
      + (layout.fits ? pinsHtml : '<span class="t3-dh-ring"></span>') + '</div>'
      + '<span class="t3-dh-attr"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">' + esc(dh('osm')) + '</a><span class="t3-dh-sep" aria-hidden="true">\u00b7</span><a href="https://www.geoapify.com/" target="_blank" rel="noopener">' + esc(dh('geo')) + '</a></span></div>';
  }
  // "N stops · About N km" for a day (2026-10-18: every day shows it, not only the first day in a town).
  function dayMeta(d){
    var shown = d.stops.filter(function(s){ return (s.venue || (s.kind === 'event' && s.event)) && !state.removed[d.day + '-' + s.daypart]; }).length;
    var pts = ((t3MapPoints([d], state.removed).days[0] || {}).points) || [];
    var km = 0;
    for (var i = 1; i < pts.length; i++) km += t3Km({ latitude: pts[i - 1].lat, longitude: pts[i - 1].lng }, { latitude: pts[i].lat, longitude: pts[i].lng }) || 0;
    // Straight-line distance, and only when every shown stop has a location.
    var meta = [shown === 1 ? dh('stop1') : dh('stopN', { n: shown })];
    if (shown > 1 && pts.length === shown) meta.push(kmText(km));
    return shown ? meta : [];
  }
  function mapHeadHtml(d, mh, maps){
    var meta = dayMeta(d);
    var group = mh.group ? (lang() === 'fr' ? tx(mh.group.key) : mh.group.label) : '';
    return '<div class="t3-day-head t3-day-head--map" data-t3-map-header>'
      + '<div class="t3-dh-info"><p class="t3-eyebrow">' + esc(tx('tripv3.day', { n: d.day })) + '</p><h3 class="t3-day-title" id="t3-day-title-' + d.day + '"><span class="t3-sr">' + esc(tx('tripv3.day', { n: d.day })) + ' \u00b7 </span>' + esc(d.regionLabel || tx('tripv3.theOkanagan')) + '</h3>'
      + (group ? '<p class="t3-dh-sub">' + esc(group) + '</p>' : '')
      + '<p class="t3-dh-meta">' + meta.map(esc).join(' \u00b7 ') + '</p>'
      + (d.theme && d.theme.label ? '<p class="t3-day-theme">' + esc(tx('tripv3.plannedAround', { theme: d.theme.label })) + '</p>' : '') + '</div>'
      + '<div class="t3-day-actions"><button type="button" class="t3-btn" data-t3-regen-day="' + d.day + '">' + esc(tx('tripv3.regenDay')) + '</button>'
      + '<button type="button" class="t3-btn" data-t3-add-day="' + d.day + '">' + esc(tx('tripv3.addDay')) + '</button>'
      + (maps ? '<a class="t3-btn" href="' + esc(maps) + '" target="_blank" rel="noopener" data-t3-map-day>' + esc(tx('tripv3.mapDay')) + '</a>' : '') + '</div>'
      + staticMapHtml(mh.assets, d.day === 1, d)
      + '</div>';
  }
  // A day whose stops spread wider than its header picture: a small live map fitted to all of them, drawn once the
  // header scrolls near the screen (Leaflet and OpenStreetMap tiles, the same free map as the whole-trip map). If it
  // cannot load, the picture stays.
  var fitObserver = null;
  function fitDayMaps(){
    var boxes = resultEl.querySelectorAll('[data-t3-fit-day]');
    if (!boxes.length) return;
    function draw(box){
      if (box.getAttribute('data-t3-fit-drawn')) return;
      box.setAttribute('data-t3-fit-drawn', '1');
      loadLeaflet(function(ok){
        if (!ok || !box.isConnected) return;
        var day = Number(box.getAttribute('data-t3-fit-day'));
        var d = days().filter(function(x){ return x.day === day; })[0];
        var pts = d ? (((t3MapPoints([d], state.removed).days[0] || {}).points) || []) : [];
        if (pts.length < 2) return;
        var frame = box.querySelector('.t3-dh-frame');
        var holder = document.createElement('div');
        holder.className = 't3-dh-live';
        frame.appendChild(holder);
        try {
          var m = L.map(holder, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, tap: false });
          L.tileLayer(MAP_TILES, { maxZoom: 15 }).addTo(m);
          var color = dayColor(day), line = [];
          pts.forEach(function(p){
            line.push([p.lat, p.lng]);
            L.marker([p.lat, p.lng], { interactive: false, keyboard: false, icon: L.divIcon({ className: 't3-pin', html: '<span style="background:' + color + '">' + p.n + '</span>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(m);
          });
          L.polyline(line, { color: color, weight: 3, opacity: 0.8, interactive: false }).addTo(m);
          m.fitBounds(line, { padding: [22, 22], maxZoom: 14 });
          box.classList.add('t3-dh-map--live');
        } catch (e) { if (holder.parentNode) holder.parentNode.removeChild(holder); }
      });
    }
    if (fitObserver) fitObserver.disconnect();
    if (!('IntersectionObserver' in window)) { Array.prototype.forEach.call(boxes, draw); return; }
    fitObserver = new IntersectionObserver(function(entries){ entries.forEach(function(en){ if (en.isIntersecting) { fitObserver.unobserve(en.target); draw(en.target); } }); }, { rootMargin: '200px 0px' });
    Array.prototype.forEach.call(boxes, function(b){ fitObserver.observe(b); });
  }
  // If a map image fails to load, the card drops its map column instead of showing a broken image.
  function watchStaticMaps(){
    Array.prototype.forEach.call(resultEl.querySelectorAll('.t3-dh-map--static img'), function(img){
      function fail(){ var h = img.closest ? img.closest('.t3-day-head--map') : null; if (h) h.classList.add('t3-dh-nomap'); }
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) fail();
      else img.addEventListener('error', fail, { once: true });
    });
  }
  function dayHtml(d, counts){
    var img = REGION_IMAGES[d.region];
    // The day header spans the content width (16px / 32px side padding, at
    // most 1116px), so the browser picks the 640px thumbnail on phones and
    // the full-size photo on wider screens.
    var imgHtml = img ? '<img class="t3-day-img" src="' + esc(img.src) + '"' + (img.srcset ? ' srcset="' + esc(img.srcset) + '" sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1180px) calc(100vw - 64px), 1116px"' : '') + ' alt="" loading="lazy" decoding="async">' : '';
    var dayStops = d.stops.filter(function(s){ return s.venue && !state.removed[d.day + '-' + s.daypart]; });
    var maps = t3MapsUrl(dayStops.map(function(s){ return tripQuery(s.venue); }));
    // Every day gets the same header (2026-10-18): its own map with its stops, and "N stops · km". A later day in the same
    // town used to show the town photo with neither. A region without a map keeps the photo header, with the same line.
    var meta = dayMeta(d);
    var head = MAP_HEADERS[d.region] && MAP_HEADERS[d.region].assets ? mapHeadHtml(d, MAP_HEADERS[d.region], maps) : ('<div class="t3-day-head">' + imgHtml + '<div class="t3-day-scrim"></div>'
      + '<div class="t3-day-headin"><div><p class="t3-eyebrow">' + esc(tx('tripv3.day', { n: d.day })) + '</p><h3 class="t3-day-title" id="t3-day-title-' + d.day + '"><span class="t3-sr">' + esc(tx('tripv3.day', { n: d.day })) + ' \u00b7 </span>' + esc(d.regionLabel || tx('tripv3.theOkanagan')) + '</h3>'
      + (meta.length ? '<p class="t3-dh-meta">' + meta.map(esc).join(' \u00b7 ') + '</p>' : '')
      + (d.theme && d.theme.label ? '<p class="t3-day-theme">' + esc(tx('tripv3.plannedAround', { theme: d.theme.label })) + '</p>' : '') + '</div>'
      + '<div class="t3-day-actions"><button type="button" class="t3-btn" data-t3-regen-day="' + d.day + '">' + esc(tx('tripv3.regenDay')) + '</button>'
      + '<button type="button" class="t3-btn" data-t3-add-day="' + d.day + '">' + esc(tx('tripv3.addDay')) + '</button>'
      + (maps ? '<a class="t3-btn" href="' + esc(maps) + '" target="_blank" rel="noopener" data-t3-map-day>' + esc(tx('tripv3.mapDay')) + '</a>' : '') + '</div></div></div>');
    // A label of its own for each day (2026-10-19): "Day 1 · Kelowna", not "Kelowna" twice.
    return '<section class="t3-day" id="t3-day-' + d.day + '" aria-label="' + esc(tx('tripv3.day', { n: d.day }) + ' \u00b7 ' + (d.regionLabel || tx('tripv3.theOkanagan'))) + '">'
      + head
      + (d.driveIn ? '<p class="t3-leg t3-leg-drive t3-drive-in">' + esc(t3DriveText(d.driveIn, lang())) + '</p>' : '')
      + stopsListHtml(d.stops, function(s){ return d.day + '-' + s.daypart; }, counts)
      + '</section>';
  }
  function warningSummaryHtml(p){
    var stops=(p.days||[]).reduce(function(all,d){return all.concat(d.stops||[]);},[]).concat((p.itinerary||{}).stops||[],(p.outing||{}).stops||[],p.recommendations||[]);
    var missingEvents=t3PlanNextSteps(p).filter(function(step){return step.kind==='missing_event';});
    var visible=[], repeated=[];
    (p.warnings||[]).forEach(function(w){
      if(missingEvents.some(function(step){return w.indexOf('Not met: '+step.label)===0||w.indexOf('Non satisfait : '+t3FrenchText(step.label))===0;}))return;
      var duplicate=stops.some(function(s){
        var name=s.venue?s.venue.name:s.event?s.event.name:null;
        var prefix=name?name+': ':'';
        var body=w.slice(prefix.length);
        return prefix && w.indexOf(prefix)===0 && (body.indexOf('Provisional visit')===0 || body.indexOf('Visite provisoire')===0) && s.scheduleNote && s.scheduleNote.indexOf(body)===0;
      });
      (duplicate?repeated:visible).push(w);
    });
    var list=function(items){return '<ul>'+items.map(function(w){return '<li>'+esc(w)+'</li>';}).join('')+'</ul>';};
    var html=visible.length?'<div class="t3-warnings" role="note">'+list(visible)+'</div>':'';
    if(repeated.length)html+='<details class="t3-warnings"><summary>'+(lang()==='fr'?'Détails horaires déjà indiqués avec vos arrêts':'Timing details already shown with your stops')+' ('+repeated.length+')</summary>'+list(repeated)+'</details>';
    return html;
  }
  function droppedHtml(p, fr){
    var dropped = t3DroppedRequests(p);
    if (!dropped.length) return '';
    var q = function(w){ return (fr ? '«\u00a0' : '“') + esc(w) + (fr ? '\u00a0»' : '”'); };
    return '<details open><summary>' + esc(fr ? 'Non utilisé' : 'Not used') + ' (' + dropped.length + ')</summary><ul>' + dropped.map(function(w){ return '<li>' + q(w) + ' — ' + esc(fr ? 'le planificateur n’a pas pu l’appliquer à ce plan' : 'the planner couldn’t apply this to the plan') + '</li>'; }).join('') + '</ul></details>';
  }
  // When every request matched, the check is good news, not a warning: one quiet line that opens to the details.
  function requirementSummaryBlock(p){
    var html = requirementSummaryHtml(p);
    var checks = p.requirementResults || [];
    // A request the planner could not use (2026-10-19) means it is not "all matched": the checks stay open and list it.
    if (html && t3DroppedRequests(p).length) return html.slice(0, html.length - ('</' + 'section>').length) + droppedHtml(p, lang() === 'fr') + '</' + 'section>';
    if (!html || !checks.every(function(i){ return i.status === 'satisfied'; })) return html;
    var fr = lang() === 'fr';
    var h3End = html.indexOf('</' + 'h3>');
    var inner = html.slice(h3End + 5, html.length - ('</' + 'section>').length);
    return '<details class="t3-checks"><summary>' + esc(checks.length === 1 ? (fr ? '✓ Votre demande correspond à une fiche' : '✓ Your request matched a listing') : (fr ? '✓ Vos ' + checks.length + ' demandes correspondent à des fiches' : '✓ All ' + checks.length + ' of your requests matched a listing')) + '</summary>' + inner + '</details>';
  }
  function requirementSummaryHtml(p){
    var checks = p.requirementResults || [];
    if (!checks.length) return '';
    var fr = lang() === 'fr';
    var titles = fr ? ['Demandes vérifiées', 'Correspondances', 'Manquant', 'À confirmer'] : ['Requests checked', 'Matched', 'Missing', 'Needs confirmation'];
    var names = fr ? {museum:'musée', gallery:'galerie', pottery:'atelier de poterie', spa:'spa', easy_walk:'promenade facile', walk:'promenade', sunset:'point de vue au coucher du soleil', cafe:'café', restaurant:'restaurant', winery:'vignoble', rainy:'activité intérieure', duration:'durée', price_limit:'coût total', 'exact budget':'budget exact', 'party size':'taille du groupe', 'age suitability':'âge des enfants', accessibility:'accessibilité'} : {pottery:'pottery class', easy_walk:'easy walk', sunset:'sunset viewpoint', cafe:'coffee', rainy:'indoor suitability', duration:'visit duration', price_limit:'total cost'};
    var statuses = ['satisfied', 'unmet', 'unverified'];
    return '<section class="t3-warnings" aria-label="' + esc(titles[0]) + '"><h3>' + esc(titles[0]) + '</h3><p>' + esc(fr ? 'Les correspondances concernent les fiches du site. Les disponibilités, les réservations et le temps de trajet restent à confirmer.' : 'Matches refer to listing information. Availability, reservations and travel timing still need confirmation.') + '</p>' + statuses.map(function(status, n){
      var items = checks.filter(function(i){ return i.status === status; });
      if (!items.length) return '';
      return '<details><summary>' + esc(titles[n + 1]) + ' (' + items.length + ')</summary><ul>' + items.map(function(i){
        var value = i.kind === 'duration' || i.kind === 'price_limit' || i.kind === 'rainy' ? i.kind : i.value;
        var label = names[value] || String(value).replace(/_/g, ' ');
        if (i.kind === 'days') label = i.value + (fr ? ' jour(s)' : ' day(s)');
        if (i.kind === 'venue') label = i.sourceText || label;
        if (i.kind.indexOf('excluded_') === 0) label = (fr ? 'Sans ' : 'No ') + label;
        return '<li>' + esc(label) + (i.reason ? ' — ' + esc(i.reason) : '') + '</li>';
      }).join('') + '</ul></details>';
    }).join('') + '</section>';
  }
  function render(focus){
    var p = t3LocalTimes(lang()==='fr' ? t3FrenchPlan(state.last) : state.last, lang());
    renderedVenueCardAnchors = {};
    renderedPhotos = {};
    var counts = nameCounts();
    var planKinds = p.kind === 'multi_day' || p.kind === 'day_plan';
    var hasStops = planKinds || (p.kind === 'outing' && p.outing) || (p.kind === 'itinerary' && p.itinerary && (p.itinerary.stops || []).length);
    var regen = hasStops ? tx('tripv3.regenPlan') : ((p.kind === 'recommendations' || p.kind === 'discover') && (p.recommendations || []).length ? tx('tripv3.showOthers') : null);
    // The rainy-day backups are shown up front with links, so their note is not repeated under "How this plan was made".
    var rainNote = /^(?:If it rains:|S’il pleut :)/;
    var notes = (p.notes || []).filter(function(n){ return (p.contextNotes || []).indexOf(n) === -1 && !((p.rainBackup || []).length && rainNote.test(n)); });
    var rainHtml = (p.rainBackup || []).length ? '<p class="t3-expect t3-rain">' + esc(lang() === 'fr' ? 'S’il pleut : ' : 'If it rains: ') + p.rainBackup.map(function(v){ var u = safeUrl(v.url); return u ? '<a href="' + esc(u) + '">' + esc(v.name) + '</a>' : esc(v.name); }).join(lang() === 'fr' ? ' ou ' : ' or ') + esc(lang() === 'fr' ? ' — des options intérieures à proximité pour remplacer une plage ou une sortie en plein air.' : ' — indoor backups nearby, to swap in for a beach or outdoor stop.') + '</p>' : '';
    var html = understoodHtml(p)
      + '<div class="t3-plan"><header class="t3-plan-head"><p class="t3-eyebrow">' + esc(tx('tripv3.yourPlan')) + '</p>'
      + (state.text ? '<p class="t3-request">' + esc(tx('tripv3.youAsked', { text: state.text })) + '</p>' : '')
      + (p.eventAmbiguity ? '<section class="t3-warnings" role="alert" aria-live="polite"><p>' + esc(lang()==='fr' ? 'Plusieurs événements correspondent à «'+p.eventAmbiguity.phrase+'». Choisissez celui que vous voulez ajouter à votre sortie :' : 'More than one listed event matches “'+p.eventAmbiguity.phrase+'”. Choose the one you want to add to your outing:') + '</p><div class="t3-event-choices">' + p.eventAmbiguity.candidates.map(function(name,i){var id=p.eventAmbiguity.candidateIds&&p.eventAmbiguity.candidateIds[i];return Number.isSafeInteger(id)&&id>0?'<button type="button" class="t3-btn t3-btn-ghost" data-t3-event-choice="'+id+'">'+esc(name)+'</button>':'';}).join('') + '</div></section>' : '')
      + '<h2 class="t3-headline" id="t3Headline" tabindex="-1">' + esc(p.headline || p.summary) + '</h2>'
      + (p.experience && p.experience.text ? '<p class="t3-expect">' + esc(p.experience.text) + '</p>' : '')
      + ((p.contextNotes || []).length ? '<p class="t3-expect">' + p.contextNotes.map(esc).join(' ') + '</p>' : '')
      + rainHtml
      + '<div class="t3-plan-actions">'
      + (hasStops ? '<button type="button" class="t3-btn" data-t3-add-all aria-describedby="t3PlanStatus">' + esc(tx('tripv3.addAll')) + '</button>' : '')
      + (regen ? '<button type="button" class="t3-btn t3-btn-ghost" data-t3-regen>' + esc(regen) + '</button>' : '')
      + '<button type="button" class="t3-btn t3-btn-ghost" data-t3-share>' + esc(tx('tripv3.share')) + '</button>'
      + '<button type="button" class="t3-btn t3-btn-ghost" data-t3-view-trip hidden>' + esc(tx('tripv3.viewTrip')) + '</button>'
      + '</div><p class="t3-plan-status" id="t3PlanStatus" role="status" aria-live="polite"></p>'
      + (notes.length ? '<details class="t3-details"><summary>' + esc(tx('tripv3.howMade')) + '</summary><ul>' + notes.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></details>' : '')
      + '</header>';
    if(p.timeBudget){
      var budget=p.timeBudget, fr=document.documentElement.lang==='fr';
      html+='<section class="t3-warnings" aria-label="'+(fr?'Options de durée':'Time budget options')+'"><h3>'+(fr?'Adaptez la sortie à votre temps':'Make this outing fit your time')+'</h3>';
      if(budget.shorter){
        html+='<p>'+esc((fr?'Option plus courte : ':'Shorter option: ')+budget.shorter.stops.join(', '))+'. '+budget.shorter.estimate.minMinutes+'–'+budget.shorter.estimate.maxMinutes+' '+(fr?'minutes estimées.':'estimated minutes.')+'</p><p>'+esc((fr?'Activités retirées : ':'Left out: ')+budget.shorter.omitted.join(', '))+'.</p>';
        html+='<button type="button" class="t3-btn" data-t3-budget="'+(budget.selected?'full':'shorter')+'">'+(fr?(budget.selected?'Revenir au plan complet':'Choisir cette option'):(budget.selected?'Return to full plan':'Use shorter option'))+'</button> ';
      }else html+='<p>'+(fr?'Aucune option plus courte ne peut être estimée sans retirer une priorité ou utiliser une durée inconnue.':'No shorter option can be estimated while keeping your priorities and using known timing allowances.')+'</p>';
      if(budget.extensionMinutes && budget.extensionMinutes<=1440)html+='<button type="button" class="t3-btn t3-btn-ghost" data-t3-time="'+budget.extensionMinutes+'">'+(fr?'Prévoir ':'Allow ')+budget.extensionMinutes+' '+(fr?'minutes pour le plan complet':'minutes for the full plan')+'</button>';
      html+='<p>'+(fr?'Estimations uniquement : trajets réels et horaires restent à confirmer.':'Estimates only: actual routes and opening-hour sequencing still need confirmation.')+'</p></section>';
    }
    var timeline=t3TimelineRows(p,state.removed);
    if(timeline.length){
      var french=lang()==='fr',clock=function(m){return t3LocalTimes(String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),lang())+(m>=1440?(french?' (+1 jour)':' (+1 day)'):'');};
      // One "Confirm times before you go" line per day (2026-10-18), not "Provisional timing" on every row.
      var confirmDays={};timeline.forEach(function(row){if(!row.notScheduledMeal&&(row.status==='provisional'||row.status==='unverified'))confirmDays[row.day]=true;});
      html+='<section class="t3-warnings" aria-label="'+(french?'Horaire du voyage':'Trip timeline')+'"><h3>'+(french?'Votre horaire':'Your timeline')+'</h3><p>'+(french?'Visites et trajets estimés; heures des événements indiquées par les fiches. Confirmez avant de partir.':'Visits and travel are estimates; event times come from listings. Confirm before visiting.')+'</p><ol>'+timeline.map(function(row,n){
        var time=row.notScheduledMeal?(french?'Non planifié':'Not scheduled'):Number.isFinite(row.startMinutes)?clock(row.startMinutes)+(Number.isFinite(row.endMinutes)?'–'+clock(row.endMinutes):' · '+(french?'fin inconnue':'end unknown')):(french?'Horaire à confirmer':'Timing unverified');
        if(row.mealWindow)time=(french?'Arrivée possible pour le souper : ':'Possible dinner arrival: ')+clock(row.mealWindow.earliestStartMinutes)+'–'+clock(row.mealWindow.latestStartMinutes);
        var detail=[];
        if(row.mealWindow)detail.push(french?'Fenêtre conditionnelle selon les horaires indiqués; trajet et service en cuisine à confirmer. Aucun horaire de visite fixé.':'Conditional window based on listed hours; travel and kitchen service need confirmation. No visit time is scheduled.');
        if(Number.isFinite(row.transferMinutes)&&row.transferMinutes>0)detail.push((french?'Trajet estimé : ':'Estimated travel: ')+row.transferMinutes+' min');
        if(row.arrivalAllowanceMinutes>0)detail.push((french?'Marge d’arrivée : ':'Arrival allowance: ')+row.arrivalAllowanceMinutes+' min');
        if(row.gapMinutes>0)detail.push((row.status==='provisional'?(french?'Intervalle libre provisoire : ':'Provisional free interval: '):(french?'Intervalle libre avant cet arrêt : ':'Free interval before this stop: '))+row.gapMinutes+' min');
        if(row.shortWalkSelected)detail.push(french?'Promenade courte · durée estimée de 30 à 60 min':'Short walk · allow 30–60 min');
        if(row.daylight){
          if(Number.isFinite(row.daylight.sunriseMinutes))detail.push((french?'Lumière du jour estimée : ':'Estimated daylight: ')+clock(row.daylight.sunriseMinutes)+'–'+clock(row.daylight.sunsetMinutes));
          if(row.daylight.marginMinutes)detail.push((french?'Marge avant le coucher du soleil : ':'Margin before sunset: ')+row.daylight.marginMinutes+' min');
          if(row.daylight.status!=='estimated')detail.push(row.daylight.status==='conflict'?(french?'Conflit avec la lumière du jour · partez plus tôt':'Daylight conflict · start earlier'):(french?'Lumière du jour à confirmer':'Daylight unverified'));
        }
        if(row.notScheduledMeal)detail.push(french?'Aucun restaurant ne convient avant l’événement.':'No restaurant fits before the event.');
        else if(row.status==='unmet')detail.push(french?'Conflit d’horaire':'Timing conflict');
        var nextRow=timeline[n+1],lastOfDay=!nextRow||nextRow.day!==row.day;
        // The drive from the last town opens a road-trip day (2026-10-19), with when to leave when the first stop is timed.
        var dayRow=(n===0||timeline[n-1].day!==row.day)?(p.days||[]).filter(function(x){return x.day===row.day;})[0]:null;
        var driveLi=dayRow&&dayRow.driveIn?'<li style="margin:0 0 1rem;overflow-wrap:anywhere"><strong>'+esc((french?'Jour ':'Day ')+row.day+' · '+(Number.isFinite(row.startMinutes)&&!row.notScheduledMeal?(french?'départ vers ':'leave about ')+clock(Math.max(0,row.startMinutes-dayRow.driveIn.maxMinutes)):(french?'avant le premier arrêt':'before the first stop')))+'</strong><br>'+esc(t3DriveText(dayRow.driveIn,lang()))+'</li>':'';
        return driveLi+'<li style="margin:0 0 1rem;overflow-wrap:anywhere"><strong>'+esc((french?'Jour ':'Day ')+row.day+' · '+time)+'</strong><br>'+esc(row.notScheduledMeal?(french?'Souper non planifié':'Dinner not scheduled'):row.name)+(detail.length?'<br><small>'+esc(detail.join(' · '))+'</small>':'')+'</li>'
          +(lastOfDay&&confirmDays[row.day]?'<li class="t3-confirm-day" style="margin:0 0 1rem;list-style:none"><small>'+esc(french?'Jour '+row.day+' : confirmez les heures avant de partir.':'Day '+row.day+': Confirm times before you go.')+'</small></li>':'');
      }).join('')+'</ol></section>';
    }
    var schedHtml='';
    if(['itinerary','outing','multi_day','day_plan'].indexOf(p.kind)!==-1){
      var timingFr=lang()==='fr',selectedDate=state.overrides.startDate||(p.schedule||[])[0]?.date||'',selectedMinutes=state.overrides.startMinutes;
      var timeValue=selectedMinutes!==undefined?String(Math.floor(selectedMinutes/60)).padStart(2,'0')+':'+String(selectedMinutes%60).padStart(2,'0'):'';
      // Closed until a date or time is set, so the plan's stops come first on a phone (2026-10-14).
      var schedOpen=!!(state.overrides.startDate||selectedMinutes!==undefined);
      schedHtml='<details class="t3-sched"'+(schedOpen?' open':'')+' aria-label="'+(timingFr?'Date et départ':'Date and departure')+'"><summary><h3>'+(timingFr?'Dates et heure de départ':'Dates & start time')+'</h3></summary><div style="display:flex;flex-wrap:wrap;gap:1rem"><label>'+(timingFr?'Date de départ':'Trip start date')+'<br><input type="date" data-t3-override="startDate" aria-label="'+(timingFr?'Date de départ':'Trip start date')+'" value="'+esc(selectedDate)+'"></label><label>'+(timingFr?'Heure de départ':'Start time')+'<br><input type="time" data-t3-override="startMinutes" aria-label="'+(timingFr?'Heure de départ':'Start time')+'" value="'+esc(timeValue)+'"></label></div><p>'+(timingFr?'Heure locale de l’Okanagan. Les événements conservent leurs heures indiquées.':'Okanagan local time. Events keep their listed times.')+'</p></details>';
    }
    if(p.shortWalkRepairs && !Object.keys(state.removed).length){
      var swFr=lang()==='fr';
      html+='<section class="t3-warnings" aria-label="'+(swFr?'Une promenade plus courte':'A shorter walk')+'"><h3>'+(swFr?'Gardez votre heure de départ':'Keep your departure time')+'</h3><p>'+(swFr?'Choisissez une promenade facile au même endroit. Durée estimée de 30 à 60 minutes; confirmez le sentier, les horaires et les conditions. Les autres journées restent inchangées.':'Choose an easy walk at the same place. Allow 30–60 minutes; confirm the route, hours and conditions. The other days stay unchanged.')+'</p>'+p.shortWalkRepairs.map(function(sw){return '<button type="button" data-t3-short-walk="'+sw.venueId+'">'+esc((swFr?'Jour ':'Day ')+sw.day+(swFr?' : promenade courte à ':' — short walk at ')+sw.name)+'</button>';}).join(' ')+'</section>';
    }
    if(p.dayDepartureRepairs && !Object.keys(state.removed).length){
      var drFr=lang()==='fr';
      html+='<section class="t3-warnings" aria-label="'+(drFr?'Ajuster une journée':'Adjust an individual day')+'"><h3>'+(drFr?'Corriger la lumière du jour':'Fix a daylight conflict')+'</h3><p>'+(drFr?'Conservez les mêmes arrêts et les autres journées. Horaires provisoires : confirmez les durées et les conditions.':'Keep the same stops and the other days. Provisional times: confirm durations and conditions.')+'</p>'+p.dayDepartureRepairs.map(function(dr){var drTime=String(Math.floor(dr.startMinutes/60)).padStart(2,'0')+':'+String(dr.startMinutes%60).padStart(2,'0');return '<button type="button" data-t3-day-start="'+dr.day+'" data-t3-minutes="'+dr.startMinutes+'">'+(drFr?'Jour ':'Day ')+dr.day+(drFr?' : essayer un départ à ':' — try departing at ')+drTime+'</button>';}).join(' ')+'</section>';
    }
    if(p.earlierDeparture && !Object.keys(state.removed).length){
      var ed=p.earlierDeparture,edFr=lang()==='fr',edTime=String(Math.floor(ed.startMinutes/60)).padStart(2,'0')+':'+String(ed.startMinutes%60).padStart(2,'0');
      html+='<section class="t3-warnings" aria-label="'+(edFr?'Ajuster pour la lumière du jour':'Adjust for daylight')+'"><h3>'+(edFr?'Partez plus tôt pour cette activité':'Start earlier for this activity')+'</h3><p>'+(edFr?'Les mêmes arrêts, dans le même ordre, avec des horaires compatibles avec la lumière du jour estimée.':'The same stops, in the same order, with times that fit the estimated daylight window.')+' '+(ed.provisional?(edFr?'Suggestion provisoire : confirmez les horaires, les durées et les conditions.':'Provisional suggestion: confirm hours, durations and conditions.'):(edFr?'Durées et trajets estimés; confirmez avant de partir.':'Durations and travel are estimates; confirm before visiting.'))+'</p><button type="button" data-t3-later-start="'+ed.startMinutes+'">'+(edFr?'Essayer un départ à ':'Try departing at ')+edTime+'</button></section>';
    }
    if(p.laterDeparture && !Object.keys(state.removed).length){
      var ld=p.laterDeparture,ldFr=lang()==='fr',ldTime=String(Math.floor(ld.startMinutes/60)).padStart(2,'0')+':'+String(ld.startMinutes%60).padStart(2,'0');
      html+='<section class="t3-warnings" aria-label="'+(ldFr?'Moins d’attente':'Less waiting')+'"><h3>'+(ldFr?'Évitez une longue pause':'Avoid a long gap')+'</h3><p>'+(ldFr?'Les mêmes arrêts avec environ '+ld.savedMinutes+' minutes d’attente en moins.':'The same stops with about '+ld.savedMinutes+' fewer minutes waiting.')+' '+(ld.provisional?(ldFr?'Suggestion provisoire : confirmez les horaires et durées.':'Provisional suggestion: confirm hours and durations.'):(ldFr?'Horaires indiqués vérifiés; durées et trajets estimés.':'Checked against listed hours; durations and travel are estimates.'))+'</p><button type="button" data-t3-later-start="'+ld.startMinutes+'">'+(ldFr?'Essayer un départ à ':'Try departing at ')+ldTime+'</button></section>';
    }
    // Dates read as dates (2026-10-19), never 2026-10-21.
    var niceIso=function(iso){ return /^\\d{4}-\\d{2}-\\d{2}$/.test(iso||'') ? new Date(iso+'T12:00:00Z').toLocaleDateString(lang()==='fr'?'fr-CA':'en-CA',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}) : String(iso||''); };
    if(p.eventAlternatives && p.eventAlternatives.length){
      var eaFr=lang()==='fr';
      html+='<section class="t3-warnings" aria-label="'+(eaFr?'Événements à d’autres dates':'Events on nearby dates')+'"><h3>'+(eaFr?'Si vos dates sont flexibles':'If your dates are flexible')+'</h3><p>'+(eaFr?'Ces événements du même type sont en dehors des dates du voyage. Ils ne sont pas ajoutés au programme. Consultez la fiche, puis choisissez une date pour refaire le programme en gardant votre demande.':'These events of the requested type fall outside your trip dates. They are not added to your itinerary. Check the listing, then choose a date to replan while keeping your request.')+'</p><ul>'+p.eventAlternatives.map(function(e){var eventDate=String(e.startDate||''),planDate=String(e.suggestedDate||eventDate),eventUrl=typeof e.url==='string'&&e.url.charAt(0)==='/'&&e.url.charAt(1)!=='/'?e.url:null,planDateLabel=/^\\d{4}-\\d{2}-\\d{2}$/.test(planDate)?new Date(planDate+'T12:00:00Z').toLocaleDateString(eaFr?'fr-CA':'en-CA',{month:'short',day:'numeric'}):'',choose=/^\\d{4}-\\d{2}-\\d{2}$/.test(planDate)?'<button type="button" class="t3-act" data-t3-event-date="'+esc(planDate)+'">'+(eaFr?'Planifier le ':'Plan for ')+esc(planDateLabel)+'</button>':'';return '<li>'+(eventUrl?'<a href="'+esc(eventUrl)+'">'+esc(e.name)+'</a>':esc(e.name))+(eventDate?' — '+esc(niceIso(eventDate)+(e.endDate&&e.endDate!==eventDate?' – '+niceIso(e.endDate):'')):'')+(e.time?' · '+esc(e.time):'')+' '+choose+'</li>';}).join('')+'</ul></section>';
    }
    if(p.accessConflicts && p.accessConflicts.length){
      var acFr=lang()==='fr';
      html+='<section class="t3-warnings" aria-label="'+(acFr?'Accès à confirmer':'Potential access conflict')+'"><h3>'+(acFr?'L’accès du matin est à confirmer':'Morning access needs confirmation')+'</h3><p>'+(acFr?'La fiche limite l’accès les jours d’école. La date demandée est en semaine; nous ne savons pas si l’école est ouverte ce jour-là. Cet arrêt n’est pas programmé. Confirmez avec l’exploitant ou choisissez une autre heure.':'The listing limits access on school days. Your requested date is a weekday; we do not know whether school is in session that day. This stop is not scheduled. Confirm with the operator or choose a different time.')+'</p>'+p.accessConflicts.map(function(a){return '<p><strong>'+esc(a.name)+'</strong> — '+esc(a.source)+(safeUrl(a.url)?' <a href="'+esc(a.url)+'">'+(acFr?'Consulter la fiche':'Check access details')+'</a>':'')+'</p>'+(a.alternatives&&a.alternatives.length?'<p>'+(acFr?'Autres lieux pour cette activité, non ajoutés au programme; confirmez leur accès et leurs horaires :':'Other places for this activity, not added to the itinerary; confirm their access and hours:')+'</p><ul>'+a.alternatives.filter(function(v){return safeUrl(v.url);}).map(function(v){return '<li><a href="'+esc(v.url)+'">'+esc(v.name)+'</a></li>';}).join('')+'</ul>':'');}).join('')+'</section>';
    }
    var nextSteps=t3PlanNextSteps(p);
    if(nextSteps.length){
      var nextFr=lang()==='fr';
      html+='<section class="t3-warnings" aria-label="'+(nextFr?'Avant de partir':'Before you go')+'"><h3>'+(nextFr?'Avant de partir':'Before you go')+'</h3><ul>'+nextSteps.map(function(step){
        if(step.kind==='timing')return '<li>'+esc(step.name)+' — '+esc(t3TimingChecklist(step,nextFr))+(step.url?' <a href="'+esc(step.url)+'">'+(nextFr?'Voir la fiche':'Check venue details')+'</a>':'')+'</li>';
        if(step.kind==='event_timing'&&step.name)return '<li>'+esc(step.name)+' — '+esc(t3TimingChecklist(step,nextFr))+(step.url?' <a href="'+esc(step.url)+'">'+(nextFr?'Voir l’événement':'Check event details')+'</a>':'')+'</li>';
        if(step.kind==='event_timing')return '<li>'+esc(t3TimingChecklist(step,nextFr))+' <a href="/whats-on">'+(nextFr?'Voir les événements':'Check events')+'</a></li>';
        return '<li>'+esc(nextFr?(step.labelFr||t3FrenchText(step.label)):step.label)+' — '+(nextFr?'Non inclus. Essayez une autre date ou destination, ou modifiez votre demande.':'Not included. Try another date or destination, or edit your request.')+(step.url&&safeUrl(step.url)?' <a href="'+esc(step.url)+'">'+(nextFr?'Voir les fiches':'Browse listings')+'</a>':'')+(step.kind==='missing_event'?' <a href="/whats-on">'+(nextFr?'Voir les événements':'Check events')+'</a>':'')+t3OptionalAlternativesHtml(step,nextFr,esc)+'</li>';
      }).join('')+'</ul></section>';
    }
    html += requirementSummaryBlock(p);
    if(p.sparseRecovery){
      var sr=p.sparseRecovery, srFr=lang()==='fr';
      html+='<section class="t3-warnings" aria-label="'+(srFr?'Options pour les journées libres':'Options for activity gaps')+'"><h3>'+(srFr?'Adapter ce voyage':'Make this trip fit')+'</h3><p>'+(srFr?'Certaines journées n’ont aucune autre activité correspondante. Choisissez une option; votre plan ne change pas automatiquement.':'Some days have no additional matching activity. Choose an option; your plan stays unchanged until you do.')+'</p>';
      if(sr.shorterDays)html+='<button type="button" class="t3-btn" data-t3-shorten="'+sr.shorterDays+'">'+(srFr?'Essayer '+sr.shorterDays+' jour(s)':'Try '+sr.shorterDays+' day(s)')+'</button> ';
      if(sr.region&&REGIONS.some(function(r){return r.slug===sr.region;})){var regionHref='/'+esc(sr.region);html+='<a class="t3-btn t3-btn-ghost" href="'+regionHref+'">'+(srFr?'Voir les lieux de cette région':'Review local places')+'</a>';}
      html+='</section>';
    }
    html += t3ListingGapSummaryHtml(p,lang()==='fr',esc);
    html += warningSummaryHtml(p);
    // Dates and the trip map share one tidy row of tools above the days (2026-10-14).
    if (planKinds && days().length) {
      html += '<div class="t3-tools">' + schedHtml + '<div class="t3-map-slot" data-t3-map-slot></div></div>';
      if (days().length > 1) html += '<nav class="t3-daynav" aria-label="' + esc(tx('tripv3.jumpLabel')) + '">' + days().map(function(d){ return '<a href="#t3-day-' + d.day + '">' + esc(tx('tripv3.day', { n: d.day })) + (d.regionLabel ? ' · ' + esc(d.regionLabel) : '') + '</a>'; }).join('') + '</nav>';
      html += (p.days || []).map(function(d){ return dayHtml(d, counts); }).join('');
    } else if (p.kind === 'outing' && p.outing) {
      html += schedHtml ? '<div class="t3-tools">' + schedHtml + '</div>' : '';
      html += '<h3 class="t3-section-title">' + esc(tx('tripv3.yourOuting')) + '</h3>' + stopsListHtml(p.outing.stops, function(s){ return null; }, counts);
      if ((p.outing.alternates || []).length) html += '<h3 class="t3-section-title">' + esc(tx('tripv3.otherOptions')) + '</h3><div class="t3-grid">' + p.outing.alternates.map(function(a){ return cardHtml(a, null, { counts: {} }); }).join('') + '</div>';
    } else if (p.kind === 'itinerary' && p.itinerary) {
      html += schedHtml ? '<div class="t3-tools">' + schedHtml + '</div>' : '';
      var it = p.itinerary;
      html += '<h3 class="t3-section-title">' + esc(tx('tripv3.yourItinerary')) + '</h3>';
      if (it.route && it.route.regions && it.route.regions.length > 1) html += '<p class="t3-hours">' + it.route.regions.map(function(r){ return esc(r.label); }).join(' → ') + '</p>';
      html += (it.stops || []).length ? stopsListHtml(it.stops, null, counts) : '<p class="t3-empty">' + esc(tx('tripv3.noMatchParts')) + '</p>';
      (it.stops || []).forEach(function(s){ if ((s.alternates || []).length) html += '<h3 class="t3-section-title">' + esc(tx('tripv3.optionsFor', { label: String(s.label || '').toLowerCase() })) + '</h3><div class="t3-grid">' + s.alternates.map(function(a){ return cardHtml(a, null, { counts: {} }); }).join('') + '</div>'; });
    } else if ((p.kind === 'recommendations' || p.kind === 'discover') && (p.recommendations || []).length) {
      html += '<h3 class="t3-section-title">' + esc(tx('tripv3.placesFit')) + '</h3><div class="t3-grid">' + p.recommendations.map(function(s){ return cardHtml(s, null, { counts: {} }); }).join('') + '</div>';
    } else if (p.kind === 'events') {
      var ev = p.events || [];
      html += '<h3 class="t3-section-title">' + esc(tx('tripv3.whatsOn')) + '</h3>' + (ev.length ? '<div class="t3-grid">' + ev.map(function(e){ var u = safeUrl(e.url); return '<article class="t3-card"><div class="t3-card-top"><span>' + esc(e.dateLabel) + (e.time ? ' · ' + esc(e.time) : '') + '</span></div><h4>' + (u ? '<a href="' + esc(u) + '">' + esc(e.name) + '</a>' : esc(e.name)) + '</h4>' + (u ? '<div class="t3-actions"><a class="t3-act" href="' + esc(u) + '">' + esc(tx('tripv3.viewEvent')) + '</a></div>' : '') + '</article>'; }).join('') + '</div>' : '<p class="t3-empty">' + esc(tx('tripv3.nothingListed')) + '</p>');
    } else if (p.kind === 'navigate' && p.venue && safeUrl(p.venue.url)) {
      html += '<p class="t3-empty">' + esc(tx('tripv3.placeIs')) + ' <a class="t3-seeall" href="' + esc(p.venue.url) + '">' + esc(tx('tripv3.openPage')) + '</a></p>';
    } else {
      html += '<p class="t3-empty">' + esc(tx('tripv3.tryTelling')) + '</p>';
    }
    if (p.seeAll && safeUrl(p.seeAll.url)) html += '<a class="t3-seeall" href="' + esc(p.seeAll.url) + '">' + esc(tx('tripv3.seeAll')) + '</a>';
    html += '</div>';
    detachMap();
    resultEl.innerHTML = html;
    resultEl.hidden = false;
    placeMap();
    watchStaticMaps();
    fitDayMaps();
    if (howEl) howEl.hidden = true;
    if (window.__syncFavButtons) window.__syncFavButtons();
    if (window.__syncTripButtons) window.__syncTripButtons();
    refreshAddAll();
    if (focus) {
      // On a phone the plan itself comes into view (what we understood stays just above it).
      var compact = !!(mainEl && mainEl.classList.contains('is-compact'));
      var scrollTarget = (window.matchMedia && window.matchMedia('(max-width: 640px)').matches && resultEl.querySelector('.t3-plan')) || resultEl;
      // A plan link on a phone (2026-10-18): the "Edit request" bar stays on screen just above the plan, and nothing
      // lands under the sticky site header.
      if (compact && editBar && !editBar.hidden) scrollTarget = editBar;
      var siteHead = document.querySelector('header#top');
      var headH = siteHead && getComputedStyle(siteHead).position === 'sticky' ? siteHead.getBoundingClientRect().height : 0;
      var top = scrollTarget.getBoundingClientRect().top + (window.pageYOffset || 0) - headH - 8;
      // A compact (plan link) page jumps straight there; a smooth scroll can be cut short while photos load.
      try { window.scrollTo({ top: Math.max(0, top), behavior: compact ? 'auto' : 'smooth' }); } catch (e) { window.scrollTo(0, Math.max(0, top)); }
      var t = document.getElementById('t3Headline');
      if (t) { try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }
    }
  }

  // ---- My Trip (tray) -- driven through each stop's own Add to trip button ----
  function tripSize(){
    var c = document.getElementById('tripTrayCount');
    var n = c ? parseInt(c.textContent, 10) : NaN;
    if (!isNaN(n)) return n;
    try { var t = JSON.parse(window.localStorage.getItem('okanaganTrip') || '[]'); return Array.isArray(t) ? t.length : 0; } catch (e) { return 0; }
  }
  function planStopButtons(day){
    var seen = {}, out = [];
    Array.prototype.forEach.call(resultEl.querySelectorAll('.trip-btn[data-plan-stop]'), function(b){
      if (day && b.getAttribute('data-plan-day') !== String(day)) return;
      // Stage 5C: one stop per ref -- two same-name places are two stops.
      var n = tripKey(b) || b.getAttribute('data-trip-name');
      if (!n || seen[n]) return;
      seen[n] = true; out.push(b);
    });
    return out;
  }
  function stopsText(n){ return n === 1 ? tx('tripv3.stopOne') : tx('tripv3.stopMany', { n: n }); }
  function addState(day){
    var stops = planStopButtons(day);
    var missing = stops.filter(function(b){ return !b.classList.contains('in-trip'); }).length;
    var room = Math.max(0, TRIP_MAX_STOPS - tripSize());
    return { total: stops.length, missing: missing, room: room, state: !stops.length ? 'empty' : !missing ? 'added' : !room ? 'full' : 'ready' };
  }
  function refreshAddAll(){
    var btn = resultEl.querySelector('[data-t3-add-all]');
    if (btn) {
      var st = addState();
      btn.textContent = st.state === 'added' ? tx('tripv3.addedAll') : st.state === 'full' ? tx('tripv3.full') : st.missing < st.total ? tx('tripv3.addRemaining', { stops: stopsText(st.missing) }) : (st.total > st.room ? tx('tripv3.addSome', { stops: stopsText(st.room), max: TRIP_MAX_STOPS }) : tx('tripv3.addAll'));
      btn.setAttribute('aria-disabled', st.state === 'ready' ? 'false' : 'true');
    }
    Array.prototype.forEach.call(resultEl.querySelectorAll('[data-t3-add-day]'), function(b){
      var st = addState(b.getAttribute('data-t3-add-day'));
      b.textContent = st.state === 'added' ? tx('tripv3.addedDay') : st.state === 'full' ? tx('tripv3.full') : tx('tripv3.addDay');
      b.setAttribute('aria-disabled', st.state === 'ready' ? 'false' : 'true');
    });
  }
  function announce(text){
    var s = document.getElementById('t3PlanStatus');
    if (!s) return;
    s.textContent = '';
    setTimeout(function(){ s.textContent = text; }, 40);
  }
  // My Trip keeps the plan's days (2026-10-18): each stop's day goes in okanaganTripDays (ref -> day), the same store
  // the older planner used, so /my-trip groups the stops by day with a directions link per day. Saved trips without
  // days still show as one list.
  // A dated one-day outing (an itinerary: "brewery crawl Penticton afternoon" on Sat, Oct 24) has no day list, so its
  // stops are Day 1 of My Trip and keep that date (round 7: they were saved with no date at all).
  // Round 8 (2026-10-19): the date test needs a doubled backslash inside this template; a single one became "d" and
  // never matched, so a dated one-day outing still lost its date and times in My Trip.
  function datedOneDay(){
    var p = state.last;
    return !!(p && !(p.days || []).length && (p.schedule || []).some(function(r){ return r && r.day === 1 && /^\\d{4}-\\d{2}-\\d{2}$/.test(r.date || ''); }));
  }
  function readDays(){
    try { var m = JSON.parse(localStorage.getItem('okanaganTripDays') || '{}') || {}; return typeof m === 'object' && !Array.isArray(m) ? m : {}; } catch (e) { return {}; }
  }
  // offset: "Add to it" puts this plan's days after the days already in My Trip (Day 1 of a second trip is Day 3).
  function rememberDays(buttons, offset){
    try {
      var dayMap = readDays();
      buttons.forEach(function(b){
        var ref = tripKey(b), d = parseInt(b.getAttribute('data-plan-day'), 10);
        if (ref && d > 0 && b.classList.contains('in-trip') && !(offset && dayMap[ref] > 0)) dayMap[ref] = d + (offset || 0);
      });
      localStorage.setItem('okanaganTripDays', JSON.stringify(dayMap));
      // The plan's dates and times go with them (2026-10-19): ref -> { d: date, s: start, e: end } (minutes), so
      // /my-trip shows "Day 1 · Sat, Oct 24" and each stop's planned time.
      var timeMap = {};
      try { timeMap = JSON.parse(localStorage.getItem('okanaganTripTimes') || '{}') || {}; } catch (e2) { timeMap = {}; }
      if (typeof timeMap !== 'object' || Array.isArray(timeMap)) timeMap = {};
      var rows = (state.last && state.last.schedule) || [];
      buttons.forEach(function(b){
        var ref = tripKey(b), d = parseInt(b.getAttribute('data-plan-day'), 10);
        if (!ref || !(d > 0) || !b.classList.contains('in-trip') || (offset && timeMap[ref])) return;
        var m = /^(venue|event):(\\d+)(?:@\\d+)?$/.exec(ref);
        var row = m && rows.filter(function(r){ return r.day === d && (m[1] === 'venue' ? r.venueId : r.eventId) === Number(m[2]); })[0];
        var date = row && row.date || ((state.last && state.last.days) || []).filter(function(x){ return x.day === d; }).map(function(x){ return x.date; })[0];
        if (!date && !row) return;
        var t = {};
        if (/^\\d{4}-\\d{2}-\\d{2}$/.test(date || '')) t.d = date;
        if (row && Number.isFinite(row.startMinutes) && row.status !== 'unmet') { t.s = row.startMinutes; if (Number.isFinite(row.endMinutes)) t.e = row.endMinutes; }
        if (t.d || t.s != null) timeMap[ref] = t;
      });
      localStorage.setItem('okanaganTripTimes', JSON.stringify(timeMap));
      // Drive legs between towns (2026-10-19) go with their day: day -> { f, t, a, b } (from, to, min and max minutes),
      // shown on /my-trip as a row of their own, never as a stop or a map pin.
      var driveMap = {};
      try { driveMap = JSON.parse(localStorage.getItem('okanaganTripDrives') || '{}') || {}; } catch (e3) { driveMap = {}; }
      if (typeof driveMap !== 'object' || Array.isArray(driveMap)) driveMap = {};
      var planDays = {};
      buttons.forEach(function(b){ var d = parseInt(b.getAttribute('data-plan-day'), 10); if (d > 0 && b.classList.contains('in-trip')) planDays[d] = true; });
      days().forEach(function(x){
        var leg = x.driveIn, at = x.day + (offset || 0);
        if (planDays[x.day] && leg && leg.fromLabel && leg.toLabel && !(offset && driveMap[at])) driveMap[at] = { f: String(leg.fromLabel), t: String(leg.toLabel), a: leg.minMinutes || null, b: leg.maxMinutes || null };
      });
      localStorage.setItem('okanaganTripDrives', JSON.stringify(driveMap));
    } catch (e) {}
    if (window.__roamTripRender) window.__roamTripRender();
  }
  // The last day already used by stops in My Trip that are not in this plan (0 when none has a day).
  function tripDayOffset(){
    var days = readDays(), plan = {}, max = 0;
    planStopButtons().forEach(function(b){ var r = tripKey(b); if (r) plan[r] = true; });
    try {
      (JSON.parse(localStorage.getItem('okanaganTrip') || '[]') || []).forEach(function(x){ var k = x && (x.key || x.ref); if (k && !plan[k] && days[k] > max) max = Number(days[k]); });
    } catch (e) {}
    return max;
  }
  // "Add whole trip" when My Trip already holds other stops (2026-10-18: an old Vernon stop and a new 12-stop plan were
  // mixed into one list): ask first whether to replace the current trip or add to it.
  function askReplaceOrAdd(){
    var st = addState();
    var others = tripSize() - (st.total - st.missing);
    if (st.state !== 'ready' || others <= 0 || !window.__roamTripReplace) { addStops(null, { offset: tripDayOffset() }); return; }
    var box = resultEl.querySelector('[data-t3-replace-ask]');
    if (box) { box.hidden = false; var f = box.querySelector('button'); if (f) f.focus(); return; }
    var btn = resultEl.querySelector('[data-t3-add-all]');
    if (!btn) return;
    box = document.createElement('div');
    box.className = 't3-replace-ask';
    box.setAttribute('data-t3-replace-ask', '');
    box.setAttribute('role', 'group');
    box.style.cssText = 'grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:4px 0 0';
    box.innerHTML = '<p style="flex-basis:100%;margin:0">' + esc(tx('tripv3.replaceAsk', { stops: stopsText(others) })) + '</p>'
      + '<button type="button" class="t3-btn" data-t3-replace="replace">' + esc(tx('tripv3.replace')) + '</button>'
      + '<button type="button" class="t3-btn" data-t3-replace="add">' + esc(tx('tripv3.addToIt')) + '</button>'
      + '<button type="button" class="t3-btn t3-btn-ghost" data-t3-replace="cancel">' + esc(tx('tripv3.cancel')) + '</button>';
    btn.parentNode.insertBefore(box, btn.nextSibling);
    box.querySelector('button').focus();
  }
  function answerReplace(choice){
    var box = resultEl.querySelector('[data-t3-replace-ask]');
    if (box) box.parentNode.removeChild(box);
    if (choice === 'replace') { window.__roamTripReplace(); refreshAddAll(); addStops(null); }
    else if (choice === 'add') addStops(null, { offset: tripDayOffset() });
    var btn = resultEl.querySelector('[data-t3-add-all]');
    if (btn && btn.focus) btn.focus();
  }
  function addStops(day, opts){
    var st = addState(day);
    if (st.state !== 'ready') {
      announce(st.state === 'added' ? tx('tripv3.alreadyAll') : st.state === 'full' ? tx('tripv3.fullMsg', { max: TRIP_MAX_STOPS }) : tx('tripv3.noStops'));
      return;
    }
    var added = 0, already = 0, noRoom = 0, failed = 0;
    // Each stop is added by clicking its own Add to trip button, so app.js
    // stores it and reports add_to_trip, tagged with where it came from.
    window.__roamTripSource = day ? 'plan_day' : 'whole_trip';
    try {
      planStopButtons(day).forEach(function(b){
        if (b.classList.contains('in-trip')) { already += 1; return; }
        if (tripSize() >= TRIP_MAX_STOPS) { noRoom += 1; return; }
        var before = tripSize();
        b.click();
        if (b.classList.contains('in-trip') || tripSize() > before) added += 1; else failed += 1;
      });
    } finally { window.__roamTripSource = null; }
    rememberDays(planStopButtons(day), opts && opts.offset);
    if (added && !day) track('add_whole_trip', { added_count: added, already_in_trip_count: already, no_room_count: noRoom, failed_count: failed, trip_size: tripSize(), plan_kind: planFacts(state.last).plan_kind });
    refreshAddAll();
    var msg = tx('tripv3.added', { stops: stopsText(added) });
    if (already) msg += ' ' + (already === 1 ? tx('tripv3.alreadyOne') : tx('tripv3.alreadyMany', { n: already }));
    if (noRoom) msg += ' ' + tx('tripv3.noRoom', { stops: stopsText(noRoom), max: TRIP_MAX_STOPS });
    if (failed) msg += ' ' + tx('tripv3.failed', { stops: stopsText(failed) });
    announce(msg);
    var view = resultEl.querySelector('[data-t3-view-trip]');
    if (view && added) view.hidden = false;
  }
  document.addEventListener('click', function(e){
    if (e.target.closest && e.target.closest('.trip-btn, .trip-remove, #tripClearBtn, [data-trip-undo]')) setTimeout(refreshAddAll, 0);
    // One stop added from its own card keeps its day too.
    var one = e.target.closest && e.target.closest('.trip-btn[data-plan-day]');
    if (one && resultEl.contains(one)) setTimeout(function(){ rememberDays([one]); }, 0);
  });
  window.addEventListener('storage', function(ev){ if (ev.key === 'okanaganTrip') refreshAddAll(); });

  // ---- interactions ----
  // An open "More" menu closes when you click elsewhere or press Escape.
  // Keyboard (2026-10-19, round 7): Favorite is a toggle, so the menu stays open after it and focus stays on it (it used
  // to close the menu and drop focus to the page). Any other item that closes the menu hands focus back to "More".
  document.addEventListener('click', function(e){
    Array.prototype.forEach.call(document.querySelectorAll('details.t3-more[open]'), function(d){
      var item = d.contains(e.target) && e.target.closest ? e.target.closest('.t3-more-menu > *') : null;
      if (d.contains(e.target) && (!item || item.classList.contains('fav-btn'))) return;
      var had = d.contains(document.activeElement);
      d.removeAttribute('open');
      if (item && had) { var sm = d.querySelector('summary'); if (sm) { try { sm.focus({ preventScroll: true }); } catch (err) { sm.focus(); } } }
    });
  });
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape') return;
    Array.prototype.forEach.call(document.querySelectorAll('details.t3-more[open]'), function(d){ d.removeAttribute('open'); var sm = d.querySelector('summary'); if (sm) sm.focus(); });
  });
  resultEl.addEventListener('click', function(e){
    var t = e.target.closest ? e.target : null;
    if (!t) return;
    var b;
    if ((b=t.closest('[data-t3-badges-more]'))) {
      var list=b.closest('.t3-badges');
      Array.prototype.forEach.call(list.querySelectorAll('[data-t3-badge-extra]'),function(li){ li.hidden=false; });
      b.parentNode.parentNode.removeChild(b.parentNode);
      return;
    }
    if ((b=t.closest('[data-t3-event-date]'))) {
      var eventDate=b.getAttribute('data-t3-event-date');
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(eventDate || '')) return;
      state.overrides.startDate=eventDate;
      delete state.overrides.eventId;
      if (!(state.last && state.last.requirementResults)) state.locks={};
      state.removed={};
      request(Object.keys(state.locks).length ? { pinned: state.locks } : {}, { requestType: 'refine', trigger: b, focus: false });
      return;
    }
    if ((b=t.closest('[data-t3-event-choice]'))) {
      var eventId=Number(b.getAttribute('data-t3-event-choice'));
      if (!Number.isSafeInteger(eventId) || eventId < 1) return;
      state.overrides.eventId=eventId;state.locks={};state.removed={};
      request({}, { requestType: 'refine', trigger: b, focus: false });return;
    }
    if((b=t.closest('[data-t3-shorten]'))){
      state.overrides.days=Number(b.getAttribute('data-t3-shorten'));state.removed={};
      request(Object.keys(state.locks).length?{pinned:state.locks}:{},{requestType: 'refine',trigger:b,focus:false});return;
    }
    if ((b=t.closest('[data-t3-short-walk]'))) {
      state.overrides.shortWalkVenueIds=Array.from(new Set((state.overrides.shortWalkVenueIds||[]).concat(Number(b.getAttribute('data-t3-short-walk')))));
      var walkPins=Object.assign({},state.locks);
      (state.last.days||[]).forEach(function(day){(day.stops||[]).forEach(function(stop){if(stop.venue&&stop.daypart)walkPins[day.day+'-'+stop.daypart]=stop.venue.id;});});
      request({pinned:walkPins},{ requestType: 'refine', trigger: b, focus: false });return;
    }
    if ((b=t.closest('[data-t3-day-start]'))) {
      var repairDay=b.getAttribute('data-t3-day-start');
      state.overrides.dayStartMinutes=Object.assign({},state.overrides.dayStartMinutes||{});
      state.overrides.dayStartMinutes[repairDay]=Number(b.getAttribute('data-t3-minutes'));
      var preserved=Object.assign({},state.locks);
      (state.last.days||[]).forEach(function(day){(day.stops||[]).forEach(function(stop){if(stop.venue&&stop.daypart)preserved[day.day+'-'+stop.daypart]=stop.venue.id;});});
      request({pinned:preserved},{ requestType: 'refine', trigger: b, focus: false });return;
    }
    if ((b=t.closest('[data-t3-later-start]'))) { state.overrides.startMinutes=Number(b.getAttribute('data-t3-later-start')); request(Object.keys(state.locks).length?{pinned:state.locks}:{},{ requestType: 'refine', trigger: b, focus: false }); return; }
    if ((b = t.closest('[data-t3-add-all]'))) { askReplaceOrAdd(); return; }
    if ((b = t.closest('[data-t3-replace]'))) { answerReplace(b.getAttribute('data-t3-replace')); return; }
    if ((b = t.closest('[data-t3-add-day]'))) { addStops(b.getAttribute('data-t3-add-day')); return; }
    if ((b = t.closest('[data-t3-view-trip]'))) {
      var panel = document.getElementById('tripTrayPanel'), toggle = document.getElementById('tripTrayToggle');
      // Opened after this click has finished: app.js closes the tray on any
      // click outside it, which would otherwise include this one.
      if (panel && !panel.classList.contains('open')) { track('open_my_trip', { trip_size: tripSize(), open_source: 'plan_view_trip' }); if (toggle) setTimeout(function(){ toggle.click(); }, 0); }
      return;
    }
    if ((b = t.closest('[data-t3-map-day]'))) {
      track('outbound_click', { link_type: 'trip_day_map', surface: 'trip_planner' });
      return;
    }
    if ((b = t.closest('[data-t3-share]'))) {
      syncUrl();
      var link = location.href;
      var shared = function(method){ var f = planFacts(state.last); track('trip_plan_share', { share_method: method, plan_kind: f.plan_kind, day_count: f.day_count }); };
      var ok = function(){ announce(tx('tripv3.copied')); shared('clipboard'); };
      var manual = function(){ announce(tx('tripv3.copyThis', { link: link })); shared('manual'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(ok, manual);
      else manual();
      return;
    }
    if ((b = t.closest('[data-t3-budget]'))) {
      state.overrides.budgetMode=b.getAttribute('data-t3-budget');
      request(Object.keys(state.locks).length ? {pinned:state.locks} : {}, { requestType: 'refine', trigger: b });return;
    }
    if ((b = t.closest('[data-t3-time]'))) {
      state.overrides.durationMinutes=Number(b.getAttribute('data-t3-time'));state.overrides.budgetMode='full';
      request(Object.keys(state.locks).length ? {pinned:state.locks} : {}, { requestType: 'refine', trigger: b });return;
    }
    if ((b = t.closest('[data-t3-keep]'))) {
      var key = b.getAttribute('data-t3-keep'), s = stopAt(key);
      if (!s) return;
      if (state.locks[key] === s.venue.id) delete state.locks[key]; else state.locks[key] = s.venue.id;
      var on = state.locks[key] === s.venue.id;
      track('trip_plan_edit', { edit_action: on ? 'keep' : 'unkeep', plan_kind: planFacts(state.last).plan_kind });
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.textContent = on ? tx('tripv3.kept') : tx('tripv3.keep');
      var card = b.closest('.t3-card'); if (card) card.classList.toggle('is-kept', on);
      announce(on ? tx('tripv3.willStay', { name: s.venue.name }) : tx('tripv3.noLongerKept', { name: s.venue.name }));
      syncUrl();
      return;
    }
    if ((b = t.closest('[data-t3-remove]'))) {
      var rk = b.getAttribute('data-t3-remove'), rs = stopAt(rk);
      if (!rs) return;
      state.removed[rk] = rs.venue.id;
      delete state.locks[rk];
      track('trip_plan_edit', { edit_action: 'remove', plan_kind: planFacts(state.last).plan_kind });
      if (state.exclude.indexOf(rs.venue.id) === -1) state.exclude.push(rs.venue.id);
      render(false);
      syncUrl();
      var undo = resultEl.querySelector('[data-t3-undo="' + rk + '"]');
      if (undo) undo.focus();
      announce(tx('tripv3.wasRemoved', { name: rs.venue.name }));
      return;
    }
    if ((b = t.closest('[data-t3-undo]'))) {
      var uk = b.getAttribute('data-t3-undo'), id = state.removed[uk];
      delete state.removed[uk];
      track('trip_plan_edit', { edit_action: 'undo', plan_kind: planFacts(state.last).plan_kind });
      state.exclude = state.exclude.filter(function(x){ return x !== id; });
      render(false);
      syncUrl();
      var back = resultEl.querySelector('[data-t3-remove="' + uk + '"]');
      if (back) back.focus();
      return;
    }
    if ((b = t.closest('[data-t3-swap]'))) {
      var sk = b.getAttribute('data-t3-swap'), ss = stopAt(sk);
      if (ss && state.exclude.indexOf(ss.venue.id) === -1) state.exclude.push(ss.venue.id);
      delete state.locks[sk];
      delete state.removed[sk];
      var oldName = ss && ss.venue ? ss.venue.name : null;
      // The kind of place goes with it (2026-10-19), so a winery is swapped for a winery.
      // Round 8: only the stops the visitor locked must stay; the rest are kept where they fit (no false "locked stop").
      var swapped = request(ss && ss.venue && ss.venue.type ? { pinned: currentPins([sk]), swap: { key: sk, type: ss.venue.type, id: ss.venue.id, locked: Object.keys(state.locks).filter(function(k){ return k !== sk; }) } } : { pinned: currentPins([sk]) }, { requestType: 'replace', trigger: b, focus: false });
      // Say what changed and show where: "Swapped Lachi for Poplar Grove", with the new card briefly highlighted.
      if (swapped && swapped.then) swapped.then(function(){
        var ns = stopAt(sk);
        var fr = lang() === 'fr';
        // Nothing else fits (round 7): the stop stays, and the visitor is told so rather than seeing nothing happen.
        if (state.last && state.last.swapKept && state.last.swapKept.key === sk) {
          var keptMsg = fr ? 'Aucune autre option à proximité ne convient à ce moment de la journée : ' + state.last.swapKept.name + ' reste dans votre plan.' : (state.last.swapNote || ('Nothing else nearby fits here, so ' + state.last.swapKept.name + ' stays in your plan.'));
          announce(keptMsg);
          var kb = resultEl.querySelector('[data-t3-swap="' + sk + '"]');
          var kc = kb && kb.closest('.t3-card');
          if (kc) { var kn = document.createElement('p'); kn.className = 't3-swap-note'; kn.textContent = keptMsg; kc.insertBefore(kn, kc.firstChild); try { kb.focus({ preventScroll: true }); } catch (e) {} }
          return;
        }
        if (!ns || !ns.venue || ns.venue.name === oldName) return;
        announce(oldName ? (fr ? oldName + ' a été remplacé par ' + ns.venue.name + '.' : 'Swapped ' + oldName + ' for ' + ns.venue.name + '.') : (fr ? 'Nouvelle suggestion : ' + ns.venue.name + '.' : 'New suggestion: ' + ns.venue.name + '.'));
        var nb = resultEl.querySelector('[data-t3-swap="' + sk + '"]');
        var card = nb && nb.closest('.t3-card');
        if (card) {
          var note = document.createElement('p');
          note.className = 't3-swap-note';
          note.textContent = oldName ? (fr ? 'Remplace ' + oldName : 'Replaces ' + oldName) : (fr ? 'Nouvelle suggestion' : 'New suggestion');
          card.insertBefore(note, card.firstChild);
          card.classList.add('is-swapped');
          try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
          try { nb.focus({ preventScroll: true }); } catch (e) {}
          setTimeout(function(){ card.classList.remove('is-swapped'); }, 2400);
        }
      });
      return;
    }
    if ((b = t.closest('[data-t3-swap-id]'))) {
      var sid = Number(b.getAttribute('data-t3-swap-id'));
      if (state.exclude.indexOf(sid) === -1) state.exclude.push(sid);
      request({}, { requestType: 'replace', trigger: b, focus: false });
      return;
    }
    if ((b = t.closest('[data-t3-regen-day]'))) {
      var dayN = Number(b.getAttribute('data-t3-regen-day'));
      var others = [], avoid = [];
      days().forEach(function(d){ d.stops.forEach(function(s){ var k = d.day + '-' + s.daypart; if (d.day !== dayN) others.push(k); else if (s.venue && state.locks[k] !== s.venue.id) avoid.push(s.venue.id); }); });
      var pins = currentPins([]);
      Object.keys(pins).forEach(function(k){ if (Number(k.split('-')[0]) === dayN && state.locks[k] !== pins[k]) delete pins[k]; });
      track('trip_plan_regenerate', { plan_kind: planFacts(state.last).plan_kind });
      state.seed += 1;
      request({ pinned: pins, avoidVenueIds: avoid }, { requestType: 'regenerate_day', trigger: b, focus: false });
      return;
    }
    if ((b = t.closest('[data-t3-regen]'))) {
      track('trip_plan_regenerate', { plan_kind: planFacts(state.last).plan_kind });
      state.seed += 1;
      var locks = {}; Object.keys(state.locks).forEach(function(k){ locks[k] = state.locks[k]; });
      var keptIds = Object.keys(locks).map(function(k){ return locks[k]; });
      var extra = { avoidVenueIds: shownIds().filter(function(id){ return keptIds.indexOf(id) === -1; }) };
      if (Object.keys(locks).length) extra.pinned = locks;
      request(extra, { requestType: 'regenerate', trigger: b });
    }
  });
  resultEl.addEventListener('change', function(e){
    var sel = e.target.closest ? e.target.closest('[data-t3-override]') : null;
    if (!sel) return;
    var k = sel.getAttribute('data-t3-override'), v = sel.value;
    if(k==='startDate'){if(!v)return;state.overrides.startDate=v;delete state.overrides.eventId;}
    else if(k==='startMinutes'){if(!/^\\d{2}:\\d{2}$/.test(v))return;state.overrides.startMinutes=Number(v.slice(0,2))*60+Number(v.slice(3));}
    else if (k === 'days') { if (!v) return; state.overrides.days = Number(v); }
    else if (k === 'pace') state.overrides.pace = v;
    else if (k === 'baseRegion') { if (v) state.overrides.baseRegion = v; else delete state.overrides.baseRegion; delete state.overrides.eventId; }
    // Complex plans keep locks through settings edits. The server reports
    // incompatible locks instead of silently replacing the visitor's choices.
    // Preserve the existing fresh-plan behavior for ordinary requests.
    if (k !== 'pace' && !(state.last && state.last.requirementResults)) state.locks = {};
    state.removed = {};
    request(Object.keys(state.locks).length ? { pinned: state.locks } : {}, { requestType: 'refine', trigger: sel, focus: false });
  });
  var exampleSubmit = false;
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var text = input.value.trim();
    var fromExample = exampleSubmit; exampleSubmit = false;
    if (!text) { setStatus(tx('tripv3.emptyRequest'), 'error'); input.focus(); return; }
    state = { text: text, seed: 0, overrides: {}, locks: {}, exclude: [], removed: {}, last: null };
    tripMap.day = null;
    // A request written in French is answered in French (the EN / FR switch can change it back).
    if (lang() !== 'fr' && !document.documentElement.getAttribute('data-page-lang') && t3LooksFrench(text) && typeof setLanguage === 'function') setLanguage('fr');
    track('trip_plan_start', { input_method: fromExample ? 'example' : 'typed' });
    request({}, { requestType: 'initial' });
  });
  input.addEventListener('keydown', function(e){
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); }
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-t3-example]'), function(chip){
    chip.addEventListener('click', function(){ input.value = chip.textContent; exampleSubmit = true; form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); });
  });
  // A shared link (/trip?q=...) restores the same plan: it replays the
  // sender's plan request (pin / avoid; an older link without them pins its
  // kept stops, as before), then removes the stops the sender removed. A link
  // that cannot be read at all leaves the page exactly as a plain /trip.
  // Analytics only (Stage 5H): a page reloading its own plan (refresh, or
  // Back / Forward loading it again) is reported as 'restore'; any other
  // arrival with a plan link stays 'link' / 'shared_link'.
  var restored = t3QueryToState(location.search, REGION_SLUGS);
  // Phones (2026-10-18): a plan link shows the plan first; the request becomes an "Edit request" bar.
  var EDIT_TEXT = { en: { label: 'Your request', edit: 'Edit request' }, fr: { label: 'Votre demande', edit: 'Modifier la demande' } };
  var mainEl = document.getElementById('tripV3'), editBar = document.getElementById('t3EditBar');
  // The day bar's sticky offset: the site header's height (it is sticky too), kept up to date on resize.
  function syncHeadH(){
    var h = document.querySelector('header#top');
    var px = h && getComputedStyle(h).position === 'sticky' ? Math.round(h.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--t3-head-h', px + 'px');
  }
  syncHeadH();
  window.addEventListener('resize', syncHeadH);
  function editText(k){ return (EDIT_TEXT[lang()] || EDIT_TEXT.en)[k]; }
  function setCompact(on){
    if (!mainEl || !editBar) return;
    mainEl.classList.toggle('is-compact', !!on);
    editBar.hidden = !on;
    if (on) {
      document.getElementById('t3EditText').textContent = state.text || input.value;
      document.getElementById('t3EditLabel').textContent = editText('label');
      document.getElementById('t3EditBtn').textContent = editText('edit');
    }
  }
  var editBtn = document.getElementById('t3EditBtn');
  // The bar's words in the page's language from the start (2026-10-19: "Edit request" on /fr/trip).
  if (editBtn) { editBtn.textContent = editText('edit'); var editLabelEl = document.getElementById('t3EditLabel'); if (editLabelEl) editLabelEl.textContent = editText('label'); }
  if (editBtn) editBtn.addEventListener('click', function(){
    setCompact(false);
    try { form.scrollIntoView({ block: 'center' }); } catch (e) {}
    try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
  });
  var phone = !!(window.matchMedia && window.matchMedia('(max-width: 720px)').matches);
  if (restored) {
    var arrival = 'link';
    try { var nav = performance.getEntriesByType('navigation')[0]; if (nav && (nav.type === 'reload' || nav.type === 'back_forward')) arrival = 'restore'; } catch (e) {}
    input.value = restored.text;
    // A shared link to a French request opens in French too (a reload keeps whatever language was chosen).
    if (arrival !== 'restore' && lang() !== 'fr' && !document.documentElement.getAttribute('data-page-lang') && t3LooksFrench(restored.text) && typeof setLanguage === 'function') setLanguage('fr');
    state = { text: restored.text, seed: restored.seed, overrides: restored.overrides, locks: restored.locks, exclude: restored.exclude, removed: {}, last: null, lastReq: null };
    if (phone) { setCompact(true); if (howEl) howEl.hidden = true; }
    track('trip_plan_start', { input_method: arrival });
    if (restored.invalid) track('trip_plan_error', { request_type: 'shared_link', error_type: 'invalid_share' });
    var replay = {};
    if (restored.pinned) replay.pinned = restored.pinned;
    else if (Object.keys(restored.locks).length) replay.pinned = restored.locks;
    if (restored.avoid.length) replay.avoidVenueIds = restored.avoid;
    request(replay, { requestType: arrival === 'restore' ? 'restore' : 'shared_link', removedKeys: restored.removed });
  } else if (/(?:^|[?&])(?:q|seed|days|pace|base|keep|skip|pin|avoid|rm)=/.test(location.search)) {
    track('trip_plan_error', { request_type: 'shared_link', error_type: 'invalid_share' });
  }
  // The header's EN / FR switch: /scripts/app.js has already translated the
  // static text by the time this runs, so the plan on screen is redrawn in
  // the new language (same plan, same kept and removed stops).
  var langToggle = document.getElementById('langToggle');
  if (langToggle) langToggle.addEventListener('click', function(){ setTimeout(function(){ if (state.last) render(false); if (editBar && !editBar.hidden) setCompact(true); }, 0); });
})();
</script>`;
}

// The whole page. deps: { esc, title, description, canonical, breadcrumbJson,
// headerHtml, tripTrayHtml, footerHtml, footerStyles, analyticsHead, regions,
// regionImages, preview, appScriptSrc }. appScriptSrc is the versioned
// /scripts/app.js URL from server.js (plain /scripts/app.js when absent).
function renderTripPlannerV3Page(d) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${d.esc(d.title)}</title>
<meta name="description" content="${d.esc(d.description)}">
<link rel="canonical" href="${d.canonical}">
${d.preview ? '<meta name="robots" content="noindex">\n' : ''}${d.faviconLink || ''}
<meta property="og:site_name" content="Okanagan Roam">
<meta property="og:title" content="${d.esc(d.title)}">
<meta property="og:description" content="${d.esc(d.description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${d.canonical}">
<meta property="og:image" content="https://okanaganroam.com/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
${d.breadcrumbJson}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Nunito:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles/tokens.css">
<link rel="stylesheet" href="/styles/app.css">
<style>${d.footerStyles}</style>
${renderStyles()}
${d.analyticsHead}
</head>
<body class="page-trip page-trip-v3">
${d.tripTrayHtml}
<div id="floatingTooltip"></div>
${d.headerHtml}

${renderBody(d)}

${d.footerHtml}

<script src="${d.esc(d.appScriptSrc || '/scripts/app.js')}"></script>
${renderScript(d)}
</body>
</html>`;
}

module.exports = { t3LocalTimes, t3DayPinLayout, t3DroppedRequests, t3DriveText, t3TimingChecklist, t3TimelineRows, t3EventPlaceHtml, t3ListingGapGroups, t3ListingGapSummaryHtml, t3VenueCardId, t3PlanNextSteps, t3OptionalAlternativesHtml, t3EditLosesMatch, renderTripPlannerV3Page, t3Km, t3KmText, t3StateToQuery, t3QueryToState, t3MapsUrl, t3MapPoints, T3_EXAMPLES };
