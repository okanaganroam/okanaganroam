'use strict';
// Pure planner-only interpretation and verification. No writes, network or AI.
const norm = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const DINING = new Set(['restaurant','cafe','pub','cocktail','brewery']);
const KINDS = {
  museum: /\bmuseums?\b/,
  gallery: /\b(?:galler(?:y|ies)|art warehouse|arts? centre|arts? center)\b/,
  escape: /\bescape rooms?\b/,
  bowling: /\b(?:bowling|bowling alley|lanes)\b/,
  climbing: /\b(?:climbing gyms?|bouldering)\b/,
  arcade: /\b(?:arcades?|laser tag)\b/,
  theatre: /\b(?:theatres?|theaters?|cinema|performing arts)\b/,
  spa: /\b(?:spas?|thermal spa|sauna experience)\b/,
  wine_tour: /\b(?:wine tours?|winery tours?|vineyard tours?)\b/,
  boat_tour: /\b(?:boat tours?|lake cruises?|cruises?)\b/,
  guided_hike: /\b(?:guided hikes?|guided hiking|hiking tours?)\b/,
  cooking: /\bcooking class(?:es)?\b/,
  park: /\bparks?\b/,
  horseback: /\b(?:horseback riding|horseback|horse riding|horse riding tours?)\b/,
  sunset: /\b(?:sunset|sunsets)\b/,
  snow_tour: /\b(?:sleigh rides?|dog sledding|dog sled tours?)\b/,
};
const LABELS = {park:'park',horseback:'horseback riding',sunset:'sunset viewpoint',museum:'museum',gallery:'gallery',escape:'escape room',bowling:'bowling',climbing:'climbing gym',arcade:'arcade',theatre:'theatre',spa:'spa',wine_tour:'wine tour',boat_tour:'boat tour',guided_hike:'guided hike',cooking:'cooking class',snow_tour:'snow experience'};
const DAYS = ['sun','mon','tue','wed','thu','fri','sat'];
const WORD_DAYS = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7};
// Taxonomies are rebuilt for every edit; reuse only name normalization,
// keyed by the actual stored name so listing edits cannot leave stale matches.
const venueNames = new Map();
function venueName(name) {
  if (!venueNames.has(name)) { if (venueNames.size >= 4096) venueNames.clear(); venueNames.set(name, norm(name)); }
  return venueNames.get(name);
}
function inferPlannerKinds(v) {
  const text = norm([v.name,v.description,v.textName,v.textDesc].filter(Boolean).join(' '));
  const name = norm(v.name);
  return Object.entries(KINDS).filter(([kind,re]) => {
    if (!re.test(text)) return false;
    if (kind === 'park') {
      if (!['outdoor','beach'].includes(v.type) || /\b(?:arena|ice rink|skating rink|rv|resort|camp|campground|water park)\b/.test(name)) return false;
      return /\bparks?\b/.test(name) || /\b(?:regional|provincial|community|city|public|adventure) park\b/.test(text);
    }
    if (kind === 'sunset') return v.type === 'outdoor';
    return ['indoor','tour'].includes(v.type) || kind.includes('tour') || ['cooking','guided_hike','snow_tour','horseback'].includes(kind);
  }).map(([kind])=>kind);
}
function inferPlannerActivities(v) {
  if (!['outdoor','tour','beach'].includes(v.type)) return [];
  const patterns = {skiing:/\b(?:skiing|ski resort|cross country ski)\b/g,snowshoeing:/\bsnowshoe(?:ing)?\b/g,hiking:/\b(?:hiking|hikes?|walking trails?|lookout trail)\b/g,winter:/\b(?:skiing|ski resort|snowshoe(?:ing)?|nordic trails?|cross country ski)\b/g,viewpoints:/\b(?:viewpoints?|lookouts?|sunset stop)\b/g};
  const clauses=String(v.description||v.textDesc||'').split(/[.;!]|\b(?:but|however|yet)\b/i).map(norm);
  const name=norm(v.name||v.textName);
  return Object.entries(patterns).filter(([,re])=>{
    const family=term=>/ski/.test(term)?'skiing':/snowshoe/.test(term)?'snowshoeing':term;
    const mentions=clauses.flatMap(c=>[...c.matchAll(re)].map(m=>({clause:c,match:m})));
    const denied=new Set(mentions.filter(({clause,match})=>/\b(?:no|not|without|cannot|does not offer)\b[^,]*$/.test(clause.slice(0,match.index))).map(({match})=>family(match[0])));
    return [...name.matchAll(re)].some(m=>!denied.has(family(m[0]))) || mentions.some(({clause,match})=>!denied.has(family(match[0])) && ! /\b(?:near|nearby|beside|opposite|overlooks?|views? of|towards?|across from|close to)\b.{0,60}$/.test(clause.slice(0,match.index)) && !/^(?: trails?)? (?:is|are|located|situated|can be found) (?:nearby|near|beside|across from|close to)\b/.test(clause.slice(match.index+match[0].length)));
  }).map(([key])=>key);
}
function scope(clause) {
  const day = /\bday\s+([1-7]|one|two|three|four|five|six|seven)\b/.exec(clause);
  const weekday = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(clause);
  return {dayIndex:day ? Number(day[1]) || WORD_DAYS[day[1]] : null,weekday:weekday ? weekday[1].slice(0,3) : null};
}
function extractTripRequirements({text,intent={},trip={},taxonomy={}}) {
  const items=[],conflicts=[];
  let startDate=null;
  const dateMatch=/\b(20\d{2}-\d{2}-\d{2})\b/.exec(String(text||''));
  if(dateMatch){const date=new Date(`${dateMatch[1]}T12:00:00Z`);if(Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===dateMatch[1])startDate=dateMatch[1];else conflicts.push('The calendar date is invalid; choose a real date.');}
  const add=(kind,value,clause,extra={})=>{
    const sc=scope(clause),strength=/\b(?:prefer|preferably|ideally|if possible)\b/.test(clause)?'prefer':'must';
    if (!items.some(i=>i.kind===kind&&i.value===value&&i.dayIndex===sc.dayIndex&&i.weekday===sc.weekday)) items.push({id:`r${items.length+1}`,kind,value,strength,sourceText:clause,...sc,...extra});
  };
  // Keep sentence/semicolon boundaries and carry explicit day headers across
  // comma-separated clauses. Negation applies within its clause, never across a sentence.
  let dayHeader='';
  const clauses=String(text||'').split(/[.;\n]/).flatMap(sentence=>{
    dayHeader='';return sentence.split(/[,]/).map(part=>{const c=norm(part);if(/\bday\s+[1-7]\b|\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/.test(c))dayHeader=c;return {c,scopeText:dayHeader&&dayHeader!==c?`${dayHeader} ${c}`:c};});
  });
  for(const {c,scopeText} of clauses){
    for(const [kind,re] of Object.entries(KINDS)) {
      const m=re.exec(c);if(!m)continue;
      const before=c.slice(0,m.index), neg=/\b(?:no|not|without|avoid|skip|exclude)\b(?:(?!\b(?:but|include|with)\b).)*$/.test(before);
      add(neg?'excluded_kind':'venue_kind',kind,scopeText);
    }
    for(const [value,re] of Object.entries({restaurant:/\b(?:dinner|lunch|restaurants?|meals?)\b/,cafe:/\b(?:cafes?|coffee)\b/,breakfast:/\bbreakfast\b/,winery:/\b(?:wineries|winery|vineyards?|wine tasting)\b/,golf:/\bgolf\b/,beach:/\bbeach(?:es)?\b/,outdoor:/\b(?:hiking|skiing|ski|snowshoeing|outdoor)\b/,tour:/\b(?:tours?|cruise|guided)\b/})) {
      const m=re.exec(c);if(m&&!/\b(?:no|not|without|avoid|skip|exclude)\b(?:(?!\b(?:but|include|with)\b).)*$/.test(c.slice(0,m.index)))add('type',value,scopeText);
    }
    for (const count of c.matchAll(/\b([1-7]|one|two|three|four|five|six|seven)\s+(wineries|winery|vineyards?|cafes?|restaurants?|breweries|distilleries)\b/g)) {
      if (/\b(?:no|not|without|avoid|skip|exclude)\b.*$/.test(c.slice(0,count.index))) continue;
      const type=/win|vineyard/.test(count[2])?'winery':/cafe/.test(count[2])?'cafe':/restaurant/.test(count[2])?'restaurant':/brewer/.test(count[2])?'brewery':'distillery';
      add('type_count',type,scopeText,{count:Number(count[1])||WORD_DAYS[count[1]]});
    }
    if (/\b(?:[2-9]\d*|two|three|four|five|six|seven)\s+(?:people|adults|children|kids|guests)\b/.test(c)) add('unsupported','party size',scopeText);
    for (const event of c.matchAll(/\b(?:concerts?|live music|hockey|events?|festivals?|markets?)\b/g)) {
      if(!/\b(?:no|not|without|avoid|skip|exclude)\b(?:(?!\b(?:but|include|with)\b).)*$/.test(c.slice(0,event.index)))add('event',/concert|music/.test(event[0])?'live-music':/hockey/.test(event[0])?'sports-recreation':'any',scopeText,{eventKind:/hockey/.test(event[0])?'hockey':/concert|music/.test(event[0])?'live-music':null});
    }
    for (const [activity,re] of Object.entries({skiing:/\b(?:ski|skiing)\b/,snowshoeing:/\b(?:snowshoeing|snowshoe)\b/,winter:/\b(?:ski|skiing|snowshoeing|snowshoe|winter activities?)\b/,hiking:/\b(?:hike|hiking|hikes)\b/,viewpoints:/\b(?:viewpoints?|lookouts?|sunset)\b/})) {
      const m=re.exec(c);if(m&&!/\b(?:no|not|without|avoid|skip|exclude)\b(?:(?!\b(?:but|include|with)\b).)*$/.test(c.slice(0,m.index)))add('activity',activity,scopeText);
    }
    if(/\b(?:rainy|rains?|indoors|indoor|wet weather)\b/.test(c)&&!/\b(?:no|avoid|without)\s+(?:rain|rainy|indoor)/.test(c)) add('rainy',true,scopeText,{activityOnly:!!trip.multi&&/^(?:a |an )?rainy day(?: activities| activity| option)?$/.test(c)});
    for(const [feature,re] of Object.entries({vegetarian:/\bvegetarian\b/,vegan:/\bvegan\b/,gluten_free:/\bgluten free\b/})) {
      if(re.test(c)&&!/\b(?:not|no)\s+(?:vegetarian|vegan|gluten free)/.test(c))add('feature',feature,scopeText);
    }
    if(/\b(?:dog friendly|with (?:my |our |a )?dog|bring (?:my |our |a )?dog)\b/.test(c))add('feature','dog_friendly',scopeText);
    if(/\b(?:only|must|verified)\b.*\b(?:kid friendly|family friendly)\b/.test(c))add('feature','kid_friendly',scopeText);
    if(/\b(?:limited driving|keep driving limited|minimi[sz]e driving|nearby stops|short drives)\b/.test(c))add('distance',30,scopeText);
    const km=/\b(?:under|within|maximum|max|less than)\s+(\d+)\s*(?:km|kilomet(?:er|re)s?)\b/.exec(c);
    if(km)add('distance',Number(km[1]),scopeText);
    if(/\$\s*\d+/.test(String(text))&&/\b(?:budget|under|spend|cost|dollars|trip)\b/.test(c))add('unsupported','exact budget',scopeText);
    if(/\b(?:wheelchair|accessible|accessibility)\b/.test(c))add('unsupported','accessibility',scopeText);
    if(/\b(?:ages?|aged)\s*\d+\b|\b\d+\s*year olds?\b/.test(c))add('unsupported','age suitability',scopeText);
    for(const length of c.matchAll(/\b([1-7]|one|two|three|four|five|six|seven)\s+days?\b/g)) add('days',Number(length[1])||WORD_DAYS[length[1]],scopeText,{dayIndex:null,weekday:null});
    const base=/\b(?:based|staying|stay)\s+(?:in|at)\s+(.+)/.exec(c);
    if(base){const region=(taxonomy.regions||[]).find(r=>base[1].startsWith(norm((taxonomy.regionLabels||{})[r]||r)));if(region)add('base',region,scopeText);}
    for(const type of ['beach','golf','winery','brewery','tour','outdoor']) {
      const re=new RegExp(`\\b(?:no|not|without|avoid|skip|exclude)\\b(?:(?!\\b(?:but|include|with)\\b).)*\\b${type==='winery'?'(?:wine|wineries|winery)':type==='beach'?'beaches?':type+'s?'}\\b`);
      if(re.test(c))add('excluded_type',type,scopeText);
    }
  }
  // Only full stored names mentioned as destinations are accepted. Ambiguous
  // names are explained; don't guess using substring "cores".
  const normalized=norm(text),names=new Map();
  for(const v of taxonomy.venues||[]) {
    if(v.redirect_to||!v.name)continue;
    const name=venueName(v.name);if(name.length<4)continue;
    const mention=clauses.find(({c})=>` ${c} `.includes(` ${name} `)&&!/\b(?:no|not|without|avoid|skip|exclude)\b.*$/.test(c.slice(0,c.indexOf(name))));
    if(!mention)continue;
    if(!names.has(name))names.set(name,[]);names.get(name).push({...v,scopeText:mention.scopeText});
  }
  for(const [name,vs] of names){if(vs.length===1)add('venue',vs[0].id,vs[0].scopeText);else conflicts.push(`More than one listing is named “${vs[0].name}”; choose a specific venue.`);}
  const lengths=new Set(items.filter(i=>i.kind==='days').map(i=>i.value));
  if(lengths.size>1)conflicts.push('Different trip lengths were requested; confirm the number of days.');
  for(const i of items.filter(i=>i.kind==='venue_kind'))if(items.some(j=>j.kind==='excluded_kind'&&j.value===i.value&&j.dayIndex===i.dayIndex))conflicts.push(`Both requested and excluded: ${LABELS[i.value]}.`);
  return {items:items.filter(i=>i.kind!=='event'||i.value!=='any'||!items.some(j=>j.kind==='event'&&j.value!=='any'&&j.sourceText===i.sourceText)),conflicts,startDate};
}
// Words covered by verified requirement grammar must not also become
// unmatched cuisine searches. Unknown terms still reach the old interpreter.
function consumedTerms(requirements) {
  const terms = new Set();
  const add = text => norm(text).split(' ').forEach(w => terms.add(w));
  if (requirements?.startDate) add('starting start begins beginning');
  for (const i of requirements?.items || []) {
    if (i.kind === 'distance') add('keep driving limited minimize minimise nearby stops short drives under within maximum max less than km kilometers kilometres');
    if (i.kind === 'feature') add(`${i.value.replace(/_/g, ' ')} meals meal only must verified`);
    if (i.kind === 'activity') add(i.value==='viewpoints'?'sunset viewpoints viewpoint watch place to':i.value);
    if (i.kind === 'venue_kind') add(`${LABELS[i.value]} ${i.value==='sunset'?'watch place to':i.value==='cooking'?'classes':i.value==='horseback'?'horse riding':''}`);
  }
  return terms;
}
// Keep standalone activities as their own stops in a mixed itinerary.
// A rainy-day option is not an instruction to keep every other stop indoors.
function expandTripComponents(trip,requirements) {
  if (!trip?.multi) return trip;
  const components=trip.components.slice();
  for (const item of (requirements.items||[]).filter(i=>i.kind==='venue_kind'&&i.strength==='must'&&['sunset','horseback'].includes(i.value))) {
    const existing=components.findIndex(c=>c.kind==='venue'&&((c.plannerKinds||[]).includes(item.value)||item.value==='sunset'&&(c.activities||[]).includes('viewpoints')));
    if (existing>=0) {
      components[existing]={...components[existing],plannerKinds:[...new Set([...(components[existing].plannerKinds||[]),item.value])],daypart:item.value==='sunset'?'evening':components[existing].daypart};
      continue;
    }
    components.push({kind:'venue',types:['outdoor'],plannerKinds:[item.value],activities:item.value==='sunset'?['viewpoints']:[],features:[],collections:[],cuisines:[],dog:!!trip.party?.dog,kids:!!trip.party?.kids,meal:null,daypart:item.value==='sunset'?'evening':null,generic:false,phrase:item.sourceText});
  }
  if (requirements.items.some(i=>i.kind==='rainy'&&i.activityOnly) && !components.some(c=>c.rainyOption||c.kind==='venue'&&c.types.includes('indoor'))) components.push({kind:'venue',types:['indoor'],plannerKinds:[],activities:[],features:[],collections:[],cuisines:[],dog:!!trip.party?.dog,kids:!!trip.party?.kids,meal:null,daypart:'morning',generic:true,rainyOption:true,phrase:'rainy-day activity'});
  const consumed=consumedTerms(requirements);
  return {...trip,components,leftoverTerms:(trip.leftoverTerms||[]).filter(w=>!consumed.has(w))};
}
function requirementDay(item,date) {
  if(item.dayIndex)return item.dayIndex;
  if(item.weekday&&/^\d{4}-\d{2}-\d{2}$/.test(date||'')) {const d=new Date(`${date}T12:00:00Z`);return (DAYS.indexOf(item.weekday)-d.getUTCDay()+7)%7+1;}
  return null;
}
function applicable(item,day,date){const wanted=requirementDay(item,date);return wanted==null||wanted===day;}
function matches(v,i){
  if(i.kind==='venue_kind'||i.kind==='excluded_kind')return (v.plannerKinds||inferPlannerKinds(v)).includes(i.value);
  if(i.kind==='venue')return v.id===i.value;
  if(i.kind==='type'||i.kind==='type_count'||i.kind==='excluded_type')return i.value==='breakfast'?['cafe','restaurant'].includes(v.type):v.type===i.value||(v.fdTypes||[]).includes(i.value)||i.value==='tour'&&(v.plannerKinds||inferPlannerKinds(v)).some(k=>['boat_tour','wine_tour','guided_hike','snow_tour','cooking'].includes(k));
  if(i.kind==='activity')return (v.activities||[]).includes(i.value);
  if(i.kind==='feature')return !!(v.features||{})[i.value]||(i.value==='dog_friendly'&&(v.collections||[]).includes('dog_friendly'));
  if(i.kind==='rainy')return v.indoorEvidence==='explicit'||v.type==='indoor'||v.indoorGolf===true;
  return false;
}
function venueAllowed(v,requirements,day,date){
  for(const i of requirements?.items||[]){
    if(i.strength==='prefer'||!applicable(i,day,date))continue;
    if((i.kind==='excluded_kind'||i.kind==='excluded_type')&&matches(v,i))return false;
    if(i.kind==='feature'&&(i.value==='dog_friendly'||i.value==='kid_friendly'||DINING.has(v.type))&&!matches(v,i))return false;
    if(i.kind==='rainy'&&!i.activityOnly&&(v.type==='beach'||v.type==='outdoor'||v.type==='golf'&&!v.indoorGolf))return false;
  }return true;
}
function requirementScore(v,requirements,day,date,covered=new Set()){
  let score=0;
  for(const i of requirements?.items||[]){if(!applicable(i,day,date)||covered.has(i.id))continue;
    if(['venue_kind','venue','type','activity'].includes(i.kind)&&matches(v,i))score+=i.strength==='must'?100:25;
    if(i.kind==='rainy'&&matches(v,i))score+=35;
  }return score;
}
function eventMatches(event,item) {
  if(item.value !== 'any' && !(event.categories || []).includes(item.value)) return false;
  if(item.eventKind === 'hockey') return /\b(?:hockey|nhl|whl|bchl)\b/.test(norm(`${event.name || ''} ${event.description || ''}`));
  return true;
}
function selectedStops(plan){
  if(plan.days?.length)return plan.days.flatMap(d=>d.stops.map(s=>({...s,day:d.day})));
  return [...(plan.itinerary?.stops||[]),...(plan.outing?.stops||[]),...(plan.recommendations||[])].map(s=>({...s,day:1}));
}
function km(a,b){const rad=x=>x*Math.PI/180;const dlat=rad(b.lat-a.lat),dlon=rad(b.lng-a.lng);return 6371*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2)));}
function evaluateTripRequirements({requirements,plan,facts,tripDate}){
  const byId=new Map(facts.map(v=>[v.id,v]));const selected=selectedStops(plan).filter(s=>s.venue&&byId.has(s.venue.id)).map(s=>({day:s.day,v:byId.get(s.venue.id)}));
  return (requirements?.items||[]).map(i=>{
    const pool=selected.filter(s=>applicable(i,s.day,tripDate));let status='unmet',reason='';
    if(i.kind==='event'){const events=[...selectedStops(plan),...(plan.kind==='events'?(plan.events||[]).map(event=>({kind:'event',event,day:1})):[])].filter(s=>s.kind==='event'&&s.event&&applicable(i,s.day,tripDate));status=events.some(s=>eventMatches(s.event,i))?'satisfied':'unmet';reason=status==='satisfied'?'Matched a dated event occurrence.':'No matching event was scheduled for the requested dates.';}
    else if(i.kind==='type_count'){const found=pool.filter(s=>matches(s.v,i)).length;status=found===i.count?'satisfied':'unmet';reason=`Requested ${i.count} ${i.value} stop${i.count===1?'':'s'}; scheduled ${found}.`;}
    else if(i.kind==='unsupported'){status='unverified';reason=`Okanagan Roam cannot verify ${i.value} from its listing data.`;}
    else if(i.weekday&&!tripDate){status='unverified';reason='A trip start date is needed to apply the weekday instruction.';}
    else if(i.kind==='days'){status=plan.days?.length===i.value?'satisfied':'unmet';reason=status==='satisfied'?`${i.value} days planned.`:'The requested trip length was not met.';}
    else if(i.kind==='base'){status='unverified';reason='The named base guides geography; accommodation and return journeys are not scheduled.';}
    else if(i.kind==='distance'){
      let unknown=pool.length<2,bad=false;
      for(let k=1;k<pool.length;k++){const a=pool[k-1],b=pool[k];if(a.day!==b.day)continue;if(![a.v.lat,a.v.lng,b.v.lat,b.v.lng].every(Number.isFinite)){unknown=true;continue;}if(km(a.v,b.v)>i.value)bad=true;}
      status=bad?'unmet':unknown?'unverified':'satisfied';reason=`Checked consecutive stops against ${i.value} km straight-line distance. Road distance and driving time are not verified.`;
    } else if(i.kind.startsWith('excluded_')){status=pool.some(s=>matches(s.v,i))?'unmet':'satisfied';reason=status==='satisfied'?'No selected stop matches this exclusion.':'A selected stop conflicts with this exclusion.';}
    else if(i.kind==='feature'){
      const relevant=i.value==='dog_friendly'||i.value==='kid_friendly'?pool:pool.filter(s=>DINING.has(s.v.type));
      status=relevant.length&&relevant.every(s=>matches(s.v,i))?'satisfied':'unmet';reason=status==='satisfied'?'Confirmed from stored badges or curated memberships.':'No complete set of verified matching stops was found.';
    } else if(i.kind==='rainy'){
      const activities=pool.filter(s=>!DINING.has(s.v.type));const target=activities.length?activities:pool;
      status=(i.activityOnly?pool.some(s=>matches(s.v,i)):target.length&&target.every(s=>matches(s.v,i)))?'satisfied':'unverified';reason=status==='satisfied'?'Activity stops are listed as indoor experiences.':'Indoor suitability is not verified for every stop; check before visiting.';
    } else {status=pool.some(s=>matches(s.v,i))?'satisfied':'unmet';reason=status==='satisfied'?'Matched an actual listing.':`No selected stop meets ${LABELS[i.value]||i.sourceText}.`;}
    return {...i,status,reason};
  });
}
module.exports={expandTripComponents,inferPlannerKinds,inferPlannerActivities,consumedTerms,eventMatches,extractTripRequirements,evaluateTripRequirements,requirementDay,venueAllowed,requirementScore,matches,LABELS,selectedStops};
