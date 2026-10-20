'use strict';
// Pure planner-only interpretation and verification. No writes, network or AI.
const norm = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const DINING = new Set(['restaurant','cafe','pub','cocktail','brewery']);
const SPORT_KINDS = {bmx:/\bbmx\b/,skatepark:/\bskate ?parks?\b/,disc_golf:/\bdisc golf\b/,tennis:/\btennis\b/,pickleball:/\bpickleball\b/};
const KINDS = {
  challenging_hike: /\b(?:challenging|strenuous|steep|difficult)(?: \w+){0,2} (?:hikes?|hiking|trails?)\b/,
  easy_walk: /\b(?:easy|gentle|flat|short) (?:walk|walks|walking trail|walking path|hikes?|hiking trail)\b/,
  walk: /\b(?:walk|walks|walking trails?|walking paths?|promenade|walkway|stroll|boardwalk|seawall)\b/,
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
  pottery: /\b(?:pottery|ceramics?) (?:classes?|workshops?|studio)?\b/,
  park: /\bparks?\b/,
  horseback: /\b(?:horseback riding|horseback|horse riding|horse riding tours?)\b/,
  sunset: /\b(?:sunset|sunsets)\b/,
  snow_tour: /\b(?:sleigh rides?|dog sledding|dog sled tours?)\b/,
};
const LABELS = {bmx:'BMX',skatepark:'skate park',disc_golf:'disc golf',tennis:'tennis',pickleball:'pickleball',challenging_hike:'challenging hike',walk:'walk',easy_walk:'easy walk',park:'park',horseback:'horseback riding',sunset:'sunset viewpoint',museum:'museum',gallery:'gallery',escape:'escape room',bowling:'bowling',climbing:'climbing gym',arcade:'arcade',theatre:'theatre',spa:'spa',wine_tour:'wine tour',boat_tour:'boat tour',guided_hike:'guided hike',cooking:'cooking class',pottery:'pottery class',snow_tour:'snow experience'};
const WALKING_TRANSPORT = /\b(?:no car|without (?:a |our |my )?car|do not have (?:a |our |my )?car|don t have (?:a |our |my )?car|no driving|car free|on foot|walkable|(?:walk|walking) between (?:the )?(?:stops|places|venues))\b/g;
// "No driving after 6pm", "no driving at night" (2026-10-18): only the evening is on foot, so it is an evening rule,
// not a car-free trip (it used to plan one winery a day inside a 1.5 km walking radius).
const EVENING_NO_DRIVE = /\b(?:no|not|don t|do not|won t|will not|avoid|without)\s+(?:want to\s+)?(?:driving|drive|car)\s+(?:after|past|once it s|at|in the)\s+(?:(2[0-3]|1\d|0?[1-9])(?:\s*h)?(?:\s*([0-5]\d))?\s*(am|pm|h)?|dark|night|nightfall|sunset|dinner|evening|the evening)\b/;
const WINERY_LUNCH = /\b(?:lunch(?:es)?|eat|meal) (?:at|in) (?:a |an |one |the )?(?:winery|wineries|vineyard|vineyards|estate)\b/;
const DAYS = ['sun','mon','tue','wed','thu','fri','sat'];
const WORD_DAYS = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7};
const PER_DAY_MAX = 4; // the most tastings (wineries, breweries) one day can hold (2026-10-18)
// Taxonomies are rebuilt for every edit; reuse only name normalization,
// keyed by the actual stored name so listing edits cannot leave stale matches.
const venueNames = new Map();
function venueName(name) {
  if (!venueNames.has(name)) { if (venueNames.size >= 4096) venueNames.clear(); venueNames.set(name, norm(name)); }
  return venueNames.get(name);
}
// Interpret a uniquely named sports destination as its sport, not words within its name.
// Keep the original request for named-venue requirements and quoted customer text.
function sportsVenueInterpretationText(text,taxonomy){
 const names=new Map();
 for(const v of taxonomy.venues||[]){
  if(v.redirect_to||!v.name)continue;
  const name=venueName(v.name);if(name.length<4)continue;
  if(!names.has(name))names.set(name,[]);names.get(name).push(v);
 }
 let clean=' '+norm(text)+' ',changed=false;
 for(const [name,vs]of [...names].sort((a,b)=>b[0].length-a[0].length)){
  if(vs.length!==1||vs[0].type!=='sport'||!clean.includes(' '+name+' '))continue;
  const kind=Object.entries(SPORT_KINDS).find(([,re])=>re.test(name))?.[0];
  const phrase=kind?kind.replace(/_/g,' '):'sports venues';
  clean=clean.split(' '+name+' ').join(' '+phrase+' ');changed=true;
 }
 return changed?clean.trim():text;
}
// "Pizza one night", "sushi once": a food asked for one time; onceEvening are the ones asked for at night.
function onceFoods(normalizedText){
  const onceTerms=[...String(normalizedText||'').matchAll(/\b([a-z]{3,})\s+(?:one|1)\s+(?:night|evening|day|dinner|lunch|meal|time)\b|\b([a-z]{3,})\s+once\b/g)].map(m=>m[1]||m[2]).filter(w=>!/^(?:just|only|for|and|with|the|out|day|night|trip)$/.test(w));
  const onceEvening=[...String(normalizedText||'').matchAll(/\b([a-z]{3,})\s+(?:one|1)\s+(?:night|evening|dinner)\b/g)].map(m=>m[1]).filter(w=>onceTerms.includes(w));
  return {onceTerms,onceEvening};
}
function inferPlannerKinds(v) {
  const text = norm([v.name,v.description,v.textName,v.textDesc].filter(Boolean).join(' '));
  const name = norm(v.name);
  return Object.entries(v.type==='sport'?{...KINDS,...SPORT_KINDS}:KINDS).filter(([kind,re]) => {
    if (kind==='challenging_hike') {
      if(v.type!=='outdoor')return false;
      return String(v.description||v.textDesc||'').split(/[.;!]/).map(norm).some(c=>re.test(c)&&! /\b(?:near|nearby|no|not|without)\b/.test(c));
    }
    if (['walk','easy_walk'].includes(kind)) {
      if (!['outdoor','beach'].includes(v.type) || !/\b(?:walks?|walking|promenade|path|trail|hikes?|hiking|walkway|stroll|boardwalk|seawall)\b/.test(text)) return false;
      if (/\b(?:no|not|without) (?:easy |flat |walking )?(?:walk|walks|path|trail)\b/.test(text)) return false;
      // Accommodation access and nearby trails are not walking experiences.
      if (/\b(?:rv|resort|campground|glamping)\b/.test(name)) return false;
      const clauses = String(v.description || v.textDesc || v.name || '').split(/[.;!]/).map(norm);
      return clauses.some(clause => {
        const walk = /\b(?:walks?|walking|promenade|path|trail|boardwalk|hikes?|hiking|walkway|stroll|seawall)\b/.exec(clause);
        if (!walk || /\b(?:near|nearby|beside|from|close to|minutes from)\b.{0,65}$/.test(clause.slice(0,walk.index))) return false;
        if (kind === 'walk') return true;
        return /\b(?:easy|flat|paved|level|gentle)\b/.test(clause) && !/\b(?:steep|challenging|strenuous|pump tracks?|bike|cycling|riders|dirt jump)\b/.test(clause);
      });
    }
    if (!re.test(text)) return false;
    if (SPORT_KINDS[kind]) return v.type==='sport' && re.test(name);
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

// Parse calendar facts separately from activity/length grammar. UTC noon is
// only a stable representation of the visitor's local calendar date.
function tripCalendar(text, referenceDate=null) {
  const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
  const month='('+months.map(m=>m+'|'+m.slice(0,3)).join('|')+')';
  const day='(\\d{1,2})(?:st|nd|rd|th)?';
  const join='\\s*(?:and|to|through|until|[-–—])\\s*';
  const patterns=[
    new RegExp('\\b'+month+'\\.?\\s+'+day+'(?:'+join+'(?:'+month+'\\.?\\s+)?'+day+')?(?:\\s*,?\\s*(20\\d{2}))?\\b','i'),
    new RegExp('\\b'+day+'(?:'+join+day+')?\\s+'+month+'\\.?(?:\\s*,?\\s*(20\\d{2}))?\\b','i'),
  ];
  let startDate=null,endDate=null,source=null,conflict=null;
  const iso=[...String(text).matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)];
  const real=(y,m,d)=>{const v=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const n=new Date(v+'T12:00:00Z');return Number.isFinite(n.getTime())&&n.toISOString().slice(0,10)===v?v:null;};
  if(iso.length){
    const read=v=>real(...v.split('-').map(Number));
    startDate=read(iso[0][1]);
    if(iso.length>1 && /^\s*(?:to|through|until|and|[-–—])\s*$/.test(String(text).slice(iso[0].index+iso[0][0].length,iso[1].index))){endDate=read(iso[1][1]);source=String(text).slice(iso[0].index,iso[1].index+iso[1][0].length);if(!endDate)conflict='The calendar date is invalid; choose a real date.';}
    else source=iso[0][0];
    if(!startDate)conflict='The calendar date is invalid; choose a real date.';
  }else{
    const fullMonth=new RegExp('\\b'+month+'\\.?\\s+'+day+'\\s*,?\\s*(20\\d{2})'+join+month+'\\.?\\s+'+day+'\\s*,?\\s*(20\\d{2})\\b','i').exec(text);
    const fullDay=!fullMonth&&new RegExp('\\b'+day+'\\s+'+month+'\\.?\\s*(20\\d{2})'+join+day+'\\s+'+month+'\\.?\\s*(20\\d{2})\\b','i').exec(text);
    const full=fullMonth||fullDay;
    if(full){
      const monthNo=v=>months.findIndex(x=>x.startsWith(v.toLowerCase()))+1;
      startDate=real(Number(full[3]),monthNo(full[fullMonth?1:2]),Number(full[fullMonth?2:1]));
      endDate=real(Number(full[6]),monthNo(full[fullMonth?4:5]),Number(full[fullMonth?5:4]));
      source=full[0];if(!startDate||!endDate)conflict='The calendar date is invalid; choose a real date.';
    }
    const a=!full&&patterns[0].exec(text),b=!full&&!a&&patterns[1].exec(text);
    const m=a||b;
    if(m){
      const monthNo=v=>months.findIndex(x=>x.startsWith(v.toLowerCase()))+1;
      let year=Number(m[a?5:4]) || Number(String(referenceDate || '').slice(0,4));
      const firstMonth=monthNo(m[a?1:3]),firstDay=Number(m[a?2:1]);
      if(!year) {conflict='The calendar date needs a year; include the travel year.';}
      startDate=year ? real(year,firstMonth,firstDay) : null;
      if(!m[a?5:4] && startDate && referenceDate && startDate<referenceDate) {year++;startDate=real(year,firstMonth,firstDay);}
      const lastDay=m[a?4:2];
      if(lastDay)endDate=real(year,a&&m[3]?monthNo(m[3]):firstMonth,Number(lastDay));
      source=m[0];if(!conflict&&(!startDate||lastDay&&!endDate))conflict='The calendar date is invalid; choose a real date.';
    }
  }
  // 2026-10-14: "next weekend" is the Saturday after the coming one (the one after today's, on a weekend).
  if(!startDate&&!conflict&&referenceDate&&/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)){
    const next=/\bnext weekend\b/i.exec(text);
    if(next){const ref=new Date(referenceDate+'T12:00:00Z'),wd=ref.getUTCDay();startDate=new Date(ref.getTime()+(wd===0?6:(6-wd)+7)*86400000).toISOString().slice(0,10);source=next[0];}
  }
  if(startDate && source) {
    const before=String(text).slice(0,String(text).indexOf(source));
    const weekday=/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*,?\s*$/i.exec(before);
    if(weekday && weekday[1].slice(0,3).toLowerCase()!==DAYS[new Date(startDate+'T12:00:00Z').getUTCDay()]) conflict='The calendar date conflicts with the named weekday; confirm the travel date.';
  }
  let days=null;
  if(startDate&&endDate){days=Math.round((new Date(endDate+'T12:00:00Z')-new Date(startDate+'T12:00:00Z'))/86400000)+1;if(days<1)conflict='The calendar date range ends before it starts; confirm the travel dates.';else if(days>7)conflict='The calendar date range exceeds seven days; the planner supports up to seven days.';}
  return {startDate,endDate,days,source,conflict,cleanText:source?String(text).replace(source,' '):String(text)};
}
// 2026-10-14: "something indoors if it rains", "in case it rains", "a rainy-day backup" is a fallback, not the
// trip's weather. Like "a rainy day option", it adds one indoor option and leaves the rest of the plan as asked
// (a family who wants the beach "if it's nice" kept getting an all-indoor trip with "no beaches in Penticton").
// Only a fallback when the rest of the request is about something else; "what can we do if it rains?" is a rainy-day
// request outright.
const RAIN_BACKUP_CONTEXT=/\b(?:beach|beaches|hike|hikes|hiking|walk|walks|park|parks|lake|outdoors?|outside|golf|swim|swimming|sunny|nice weather|if it s nice|weekend|nights?|[2-7] days?|two days|three days|four days|five days)\b/;
const CONDITIONAL_RAIN=/\b(?:if|in case|incase|should|when) (?:it|the weather) (?:rains?|is (?:raining|rainy|bad|wet|crappy|lousy)|turns(?: bad| wet)?|gets (?:bad|wet|rainy))\b|\bin case of (?:rain|bad weather)\b|\b(?:back ?up|plan b|fallback|rain option)\b/;
function extractTripRequirements({text,intent={},trip={},taxonomy={},referenceDate=null}) {
  const items=[],conflicts=[];let explicitMealCount=null;
  const original=String(text||''), normalizedText=norm(original);
  const duration=/\b(\d+(?:\.\d+)?)\s*[- ]?\s*(hours?|hrs?|minutes?|mins?)\b/i.exec(original);
  const durationMinutes=duration ? Number(duration[1])*(/^h/i.test(duration[2])?60:1) : null;
  if (durationMinutes>0 && durationMinutes<=1440) items.push({id:'duration',kind:'duration',value:durationMinutes,strength:'must',sourceText:duration[0],dayIndex:null,weekday:null});
  const deadline=/\b(?:back|return|finish|finished|done|home)?\s*(?:by|before|no later than)\s+(noon|midday|(?:1[0-2]|[1-9])(?::[0-5]\d)?\s*(?:am|pm))\b/.exec(original.toLowerCase());
  const startClock=/\b(?:starting|start|begin|leave|depart)(?:ing)?\s+(?:at\s+)?(1[0-2]|[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i.exec(original);
  const startMinutes=startClock?(Number(startClock[1])%12)*60+Number(startClock[2]||0)+(startClock[3].toLowerCase()==='pm'?720:0):null;
  let deadlineMinutes=null;
  if(deadline){
    const clock=/^(\d+)(?::(\d+))?\s*(am|pm)$/.exec(deadline[1]);
    deadlineMinutes=clock?(Number(clock[1])%12)*60+Number(clock[2]||0)+(clock[3]==='pm'?720:0):720;
    items.push({id:'deadline',kind:'deadline',value:deadlineMinutes,strength:'must',sourceText:deadline[0].trim(),dayIndex:null,weekday:null});
  }
  const calendar=tripCalendar(original,referenceDate),startDate=calendar.startDate;
  if(calendar.conflict)conflicts.push(calendar.conflict);
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
  for(const {c:clauseText,scopeText} of clauses){
    let rawClause=clauseText;
    const eveningDrive=EVENING_NO_DRIVE.exec(rawClause);
    if(eveningDrive){
      // 2026-10-19: 24-hour times too ("pas de conduite après 18 h" arrives as "no driving after 18 h").
      const hr=Number(eveningDrive[1]);
      const h=!eveningDrive[1]?18:hr>=13?hr:hr%12+(eveningDrive[3]==='am'?0:12);
      add('evening_walk',h*60+Number(eveningDrive[2]||0),scopeText,{limitKm:1.5,phrase:eveningDrive[0]});
      rawClause=rawClause.replace(eveningDrive[0],' ');
    }
    const transport=rawClause.match(WALKING_TRANSPORT);
    if(transport)add('transport','walking',scopeText,{limitKm:1.5});
    const c=sportsVenueInterpretationText(rawClause,taxonomy).replace(WALKING_TRANSPORT,' ').replace(/\s+/g,' ').trim();
    for(const [kind,re] of Object.entries(taxonomy?.types?.includes('sport')?{...KINDS,...SPORT_KINDS}:KINDS)) {
      let matchText=c;
      if(kind==='park'&&taxonomy?.types?.includes('sport')) {
        for(const v of taxonomy.venues||[])if(v.type==='sport')matchText=matchText.split(venueName(v.name)).join(' '.repeat(venueName(v.name).length));
        matchText=matchText.replace(/\bskate ?parks?\b/g,x=>' '.repeat(x.length));
      }
      const m=re.exec(matchText);if(!m)continue;
      const before=c.slice(0,m.index), neg=/\b(?:no|not|without|avoid|skip|exclude)\b(?:(?!\b(?:but|include|with)\b).)*$/.test(before);
      add(neg?'excluded_kind':'venue_kind',kind,scopeText);
    }
    for(const [value,re] of Object.entries({restaurant:/\b(?:dinner|lunch|restaurants?|meals?)\b/,cafe:/\b(?:cafes?|coffee)\b/,breakfast:/\b(?:breakfast|brunch)\b/,winery:/\b(?:wineries|winery|vineyards?|wine tasting)\b/,golf:/\bgolf\b/,beach:/\bbeach(?:es)?\b/,outdoor:/\b(?:hiking|skiing|ski|snowshoeing|outdoor)\b/,tour:/\b(?:tours?|cruise|guided)\b/})) {
      const m=re.exec(value==='golf'&&taxonomy?.types?.includes('sport')?c.replace(/\bdisc golf\b/g,x=>' '.repeat(x.length)):c);if(m&&!/\b(?:no|not|without|avoid|skip|exclude)\b(?:(?!\b(?:but|include|with)\b).)*$/.test(c.slice(0,m.index)))add('type',value,scopeText,value==='cafe'&&/\bcoffee\b/.test(c)?{servesCoffee:true}:value==='restaurant'&&WINERY_LUNCH.test(c)?{wineryLunch:true}:{});
    }
    // "3 wineries a day" / "two breweries per day" is a count for every day (2026-10-18), capped at
    // PER_DAY_MAX (more tastings than that do not fit a day); "3 wineries" alone is a count for the trip.
    for (const count of c.matchAll(/\b([1-9]|one|two|three|four|five|six|seven|eight|nine)\s+(wineries|winery|vineyards?|cafes?|restaurants?|breweries|brewery|distilleries|distillery)\b/g)) {
      if (/\b(?:no|not|without|avoid|skip|exclude)\b.*$/.test(c.slice(0,count.index))) continue;
      const type=/win|vineyard/.test(count[2])?'winery':/cafe/.test(count[2])?'cafe':/restaurant/.test(count[2])?'restaurant':/brewer/.test(count[2])?'brewery':'distillery';
      const n=Number(count[1])||WORD_DAYS[count[1]]||{eight:8,nine:9}[count[1]];
      const perDay=/^\s*(?:a|per|each|every)\s+(?:day|days)\b|^\s*daily\b/.test(c.slice(count.index+count[0].length));
      if(perDay)add('type_count',type,scopeText,{count:Math.min(n,PER_DAY_MAX),perDay:true,...(n>PER_DAY_MAX?{requestedCount:n}:{})});
      else if(n<=7)add('type_count',type,scopeText,{count:n});
    }
    const singleDinner=/\b(?:a|an|one)\s+(?:(?:relaxed|casual|romantic|special|easygoing|quiet|nice|great)\s+){0,2}(?:dinner|supper)\b/.exec(c);
    // "A nice dinner each night" is a dinner every night, not one dinner (2026-10-18).
    // Round 9 (2026-10-19): "a romantic weekend ... and a great dinner" wants a good dinner, not one dinner in two days
    // (Day 2 had none). On a romantic trip of more than one day only "one dinner" counts the meals.
    const multiDay=(intent.days||0)>1||/\b(?:weekend|getaway|[2-7] days?|two days|three days|four days|five days|[2-7] nights|two nights|three nights)\b/.test(normalizedText);
    const romanticTrip=intent.occasion==='romantic'||intent.occasion==='date_night'||/\b(?:romantic|romance|honeymoon|anniversary)\b/.test(normalizedText);
    const looseDinner=!!singleDinner&&/^(?:a|an)\s/.test(singleDinner[0])&&multiDay&&romanticTrip&&!/\b(?:only|just)\s+(?:a|an)\s/.test(c);
    if(singleDinner&&!looseDinner&&!/\b(?:lunch|breakfast|meals?|dinners?|suppers?)\b/.test(c.replace(singleDinner[0],''))&&!/\b(?:each|every|per) (?:night|evening|day)\b|\bnightly\b|\bnights? in a row\b/.test(c))explicitMealCount=1;
    // 2026-10-14: only a large group is worth a note (seating and bookings); "our two kids" was reported as an
    // unverifiable party size on every family trip.
    if (/\b(?:[89]|[1-9]\d+|eight|nine|ten|eleven|twelve|fifteen|twenty)\s+(?:people|adults|guests|of us|friends|guys|girls|ladies)\b/.test(c)) add('unsupported','party size',scopeText);
    for (const event of c.matchAll(/\b(?:concerts?|live music|hockey|events?|festivals?|markets?)\b/g)) {
      if(!/\b(?:no|not|without|avoid|skip|exclude)\b(?:(?!\b(?:but|include|with)\b).)*$/.test(c.slice(0,event.index))){
        const word=event[0].toLowerCase();
        const eventKind=/hockey/.test(word)?'hockey':/concert|music/.test(word)?'live-music':/festivals?/.test(word)?'festival':/markets?/.test(word)?'market':null;
        const value=eventKind==='hockey'?'sports-recreation':eventKind==='live-music'?'live-music':eventKind==='festival'?'events-festivals':eventKind==='market'?'markets-fairs':'any';
        // Round 10 (2026-10-19): "Christmas markets" are the holiday markets, not any market.
        add('event',value,scopeText,eventKind==='market'&&/\b(?:christmas|xmas|holiday|festive)\s+(?:craft\s+)?markets?\b/.test(c)?{eventKind,holiday:true}:{eventKind});
      }
    }
    // "A comedy show", "dinner and a show" (2026-10-19): comedy is an event whose listing says comedy; a show is any
    // listed performance.
    const comedy=/\b(?:comedy|comedians?|improv|stand ?up)\b/.exec(c), show=/\b(?:a|the|some|any) (?:\w+ )?shows?\b|\bshows\b/.exec(c);
    // Round 10: "shows and live music" asks for both (the show was dropped once live music was read).
    if((comedy||show)&&!items.some(i=>i.kind==='event'&&i.sourceText===scopeText&&!['live-music','hockey','festival','market'].includes(i.eventKind))&&!/\b(?:no|not|without|avoid|skip|exclude)\b(?:(?!\b(?:but|include|with)\b).)*$/.test(c.slice(0,(comedy||show).index))&&!/\b(?:show (?:me|us)|shows? (?:me|us))\b/.test(c))add('event','any',scopeText,comedy?{eventKind:'comedy',textTerms:['comedy']}:{eventKind:'show'});
    for (const [activity,re] of Object.entries({skiing:/\b(?:ski|skiing)\b/,snowshoeing:/\b(?:snowshoeing|snowshoe)\b/,winter:/\b(?:ski|skiing|snowshoeing|snowshoe|winter activities?)\b/,hiking:/\b(?:hike|hiking|hikes)\b/,viewpoints:/\b(?:viewpoints?|lookouts?|sunset)\b/})) {
      const m=re.exec(c);if(m&&!/\b(?:no|not|without|avoid|skip|exclude)\b(?:(?!\b(?:but|include|with)\b).)*$/.test(c.slice(0,m.index)))add('activity',activity,scopeText);
    }
    if(/\b(?:rainy|rains?|indoors|indoor|wet weather)\b/.test(c)&&!/\b(?:no|avoid|without)\s+(?:rain|rainy|indoor)/.test(c)) add('rainy',true,scopeText,{activityOnly:/\brainy day (?:option|activity|activities)\b/.test(c)||!!trip.multi&&/^(?:a |an )?rainy day$/.test(c)||CONDITIONAL_RAIN.test(c)&&RAIN_BACKUP_CONTEXT.test(normalizedText),conditional:CONDITIONAL_RAIN.test(c)&&RAIN_BACKUP_CONTEXT.test(normalizedText)});
    for(const [feature,re] of Object.entries({vegetarian:/\bvegetarian\b/,vegan:/\bvegan\b/,gluten_free:/\bgluten free\b/})) {
      if(re.test(c)&&!/\b(?:not|no)\s+(?:vegetarian|vegan|gluten free)/.test(c))add('feature',feature,scopeText);
    }
    const dogRequest=/\b(?:dog friendly|with (?:my |our |a )?dog|bring (?:my |our |a )?dog|(?:my|our) dog)\b/.exec(c);
    if(dogRequest&&!/\b(?:no|not|without|avoid|skip|exclude)\s*$/.test(c.slice(0,dogRequest.index)))add('feature','dog_friendly',scopeText);
    if(/\b(?:only|must|verified)\b.*\b(?:kid friendly|family friendly)\b/.test(c))add('feature','kid_friendly',scopeText);
    if(/\b(?:limited driving|keep driving limited|minimi[sz]e driving|nearby stops|short drives)\b/.test(c))add('distance',30,scopeText);
    const km=/\b(?:under|within|maximum|max|less than)\s+(\d+)\s*(?:km|kilomet(?:er|re)s?)\b/.exec(c);
    if(km)add('distance',Number(km[1]),scopeText);
    if(/\$\s*\d+/.test(String(text))&&/\b(?:budget|under|spend|cost|dollars|trip)\b/.test(c))add('unsupported','exact budget',scopeText);
    if(/\b(?:wheelchair|accessible|accessibility)\b/.test(c))add('unsupported','accessibility',scopeText);
    if(/\b(?:ages?|aged)\s*\d+\b|\b\d+\s*year olds?\b/.test(c))add('unsupported','age suitability',scopeText);
    // 2026-10-14: "one day trip to Penticton" inside a longer stay is a day trip, not a second trip length.
    const longerStay=/\b(?:[2-7]|two|three|four|five|six|seven)\s+days?\b|\bweekend\b|\bnights?\b|\bweek\b/.test(normalizedText);
    for(const length of c.matchAll(/\b([1-7]|one|two|three|four|five|six|seven)\s+days?\b/g)) {
      if(longerStay&&/^(?:1|one)$/.test(length[1])&&/^\s*trips?\b/.test(c.slice(length.index+length[0].length)))continue;
      // Round 8 (2026-10-19): "2 days: West Kelowna wineries one day, Naramata wineries the next" -- "one day" is which day, not a length.
      if(longerStay&&/^(?:1|one)$/.test(length[1])&&/\b(?:the next|the other|the second|next day|another day|day two|the day after|the following day)\b/.test(normalizedText))continue;
      add('days',Number(length[1])||WORD_DAYS[length[1]],scopeText,{dayIndex:null,weekday:null});
    }
    const dayTrip=/\bday trips? (?:to|into|over to|down to|up to|out to) (.+)/.exec(c);
    if(dayTrip&&longerStay){const region=(taxonomy.regions||[]).find(r=>dayTrip[1].startsWith(norm((taxonomy.regionLabels||{})[r]||r)));if(region)add('day_trip',region,scopeText);}
    const base=/\b(?:based|staying|stay)\s+(?:in|at)\s+(.+)/.exec(c);
    if(base){const region=(taxonomy.regions||[]).find(r=>base[1].startsWith(norm((taxonomy.regionLabels||{})[r]||r)));if(region)add('base',region,scopeText);}
    for(const type of ['beach','golf','winery','brewery','tour','outdoor','restaurant','pub']) {
      const re=new RegExp(`\\b(?:no|not|without|avoid|skip|exclude)\\b(?:(?!\\b(?:but|include|with)\\b).)*\\b${type==='winery'?'(?:wine|wineries|winery|vineyards?)':type==='beach'?'beaches?':type+'s?'}\\b`);
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
  for(const [name,vs] of names){if(vs.length===1)add('venue',vs[0].id,vs[0].scopeText,{venueType:vs[0].type,venueName:vs[0].name});else conflicts.push(`More than one listing is named “${vs[0].name}”; choose a specific venue.`);}
  // Budget bands guide suggestions; they never verify a total dollar cost.
  if (/\b(?:under|budget of|maximum|max)\s*\$\s*(?:100|[1-9]\d?)\b/i.test(original) || /\b(?:easy|simple|casual) (?:food|meals|dining)\b/.test(normalizedText)) add('price_limit',2,'Prefer lower price bands; total cost remains unverified.');
  if (items.some(i=>i.value==='easy_walk')) {for(let n=items.length-1;n>=0;n--)if(items[n].kind==='venue_kind'&&items[n].value==='walk'&&items.some(i=>i.kind==='venue_kind'&&i.value==='easy_walk'&&i.dayIndex===items[n].dayIndex&&i.weekday===items[n].weekday&&i.strength===items[n].strength))items.splice(n,1);}
  if(deadlineMinutes!=null && deadlineMinutes<=18*60 && items.some(i=>i.kind==='type'&&i.value==='restaurant'&&/\b(?:dinner|supper)\b/.test(i.sourceText))) conflicts.push('Dinner conflicts with the requested return deadline; choose an earlier meal or a later deadline.');
  if(calendar.days>0&&calendar.days<=7)add('days',calendar.days,calendar.source,{dayIndex:null,weekday:null});
  const lengths=new Set(items.filter(i=>i.kind==='days').map(i=>i.value));
  if(lengths.size>1)conflicts.push(calendar.days?'The calendar date range conflicts with the requested trip length; confirm the dates or number of days.':'Different trip lengths were requested; confirm the number of days.');
  for(const i of items.filter(i=>i.kind==='venue_kind'))if(items.some(j=>j.kind==='excluded_kind'&&j.value===i.value&&j.dayIndex===i.dayIndex))conflicts.push(`Both requested and excluded: ${LABELS[i.value]}.`);
  for (const item of items) if (item.kind === 'event') {
    const named = (trip.components || []).filter(c => c.kind === 'event' && c.event.nameTerms?.length
      && c.event.nameTerms.every(term => norm(item.sourceText).split(' ').includes(term)));
    if (named.length === 1) item.nameTerms = named[0].event.nameTerms.slice();
  }
  // 2026-10-14: "pizza one night", "sushi once" -- that food is wanted on one meal, not every day (a 3-day family trip
  // planned pizza for all three dinners). The word just before the frequency phrase is kept; the planner uses it once.
  const {onceTerms,onceEvening}=onceFoods(normalizedText);
  return bareTimeWindow({onceTerms,onceEvening,occasion:intent.occasion||null,items:items.filter(i=>i.kind!=='event'||i.value!=='any'||['show','comedy'].includes(i.eventKind)||!items.some(j=>j.kind==='event'&&j.value!=='any'&&j.sourceText===i.sourceText)),conflicts,startMinutes,startDate,endDate:calendar.endDate,dateSource:calendar.source,text:normalizedText,planDays:intent.days||null,explicitMealCount,outingScope:durationMinutes>0&&durationMinutes<=1440?'short':null,onlyRequested:/\b(?:only|just)\s+(?:a |an |one )?(?:coffee|cafes?|museums?|galler(?:y|ies)|dinner|lunch|winery|wineries|walk)\b|\b(?:coffee|cafes?|museums?|dinner|lunch|winery|wineries|walk)\s+only\b/.test(normalizedText),daypart:deadlineMinutes!=null?(deadlineMinutes<=720?'morning':deadlineMinutes<=1020?'afternoon':'evening'):/\b(?<!no )(?<!without )(?<!skip )morning\b/.test(normalizedText)?'morning':/\b(?<!no )(?<!without )(?<!skip )afternoon\b/.test(normalizedText)?'afternoon':/\b(?:evening|date night|night out|a night|tonight)\b/.test(normalizedText)?'evening':null},intent,trip,referenceDate);
}
// Time windows (2026-10-20, round 11): a request that names only a town and a time -- "this weekend in Penticton",
// "Saturday evening in Penticton", "an afternoon in Kelowna", "morning in Peachland" -- is a plan for that time, not
// an Ideas list. "This weekend" is the coming Saturday and Sunday (only Sunday on a Sunday); a morning, afternoon or
// evening is a one-day plan for that window (timeWindow, read by explicitOutingComponents), on the named day.
const WINDOW_START={morning:540,afternoon:780,evening:1020};
function isoAdd(iso,n){return new Date(new Date(`${iso}T12:00:00Z`).getTime()+n*86400000).toISOString().slice(0,10);}
function bareTimeWindow(out,intent={},trip={},referenceDate=null){
  const i=intent||{},when=i.when||null;
  const empty=k=>!(i[k]||[]).length;
  if(i.mode!=='find'||(i.regions||[]).length!==1||trip?.route||trip?.multi||out.items.length||out.conflicts.length||out.startDate||out.onlyRequested||out.outingScope)return out;
  // Round 12 (2026-10-20): "this weekend in Kelowna with kids / with the family" keeps the window (kid-friendly picks).
  const familyOnly=(i.features||[]).every(f=>f==='kid_friendly')&&(!i.occasion||i.occasion==='family');
  if(!['types','collections','activities','cuisines','foodTerms','textTerms','eventCategories'].every(empty)||!familyOnly||i.budget||i.lake)return out;
  if((i.excluded?.types||[]).length||(i.excluded?.concepts||[]).length)return out;
  const ref=/^\d{4}-\d{2}-\d{2}$/.test(referenceDate||'')?referenceDate:null;
  const wd=ref?new Date(`${ref}T12:00:00Z`).getUTCDay():null;
  const weekday=when?.weekday?DAYS.indexOf(String(when.weekday).slice(0,3)):-1;
  // Only the words morning, afternoon or evening ("tonight" at 7 PM keeps the Ideas list, timed by the clock).
  // Round 12 (2026-10-20): "tonight in Kelowna" and "Friday night / Saturday night in Kelowna" (« ce soir », « vendredi
  // soir ») are an evening too; "tonight at 7 pm" keeps the Ideas list, timed by the clock.
  // "What can we do in Kelowna tonight" asks for ideas, and keeps the Ideas list.
  const night=out.startMinutes==null&&(!out.daypart||out.daypart==='evening')&&/\b(?:tonight|(?:mon|tues|wednes|thurs|fri|satur|sun)day night)\b/.test(out.text||'')&&!/\b(?:what|where|things?|ideas?|suggest\w*|recommend\w*|anything|something)\b/.test(out.text||'');
  if(night)out.daypart='evening';
  const window=out.daypart&&(night||new RegExp(`\\b${out.daypart}\\b`).test(out.text||''))&&WINDOW_START[out.daypart]!=null&&!out.items.some(x=>x.kind==='deadline')?out.daypart:null;
  if(!window&&when?.preset==='this-weekend'&&weekday<0){
    if(ref){out.startDate=wd===0||wd===6?ref:isoAdd(ref,6-wd);out.dateSource='this weekend';}
    const n=wd===0?1:2;
    out.items.push({id:'weekend',kind:'days',value:n,strength:'must',sourceText:'this weekend',dayIndex:null,weekday:null});
    out.endDate=ref&&n>1?isoAdd(out.startDate,1):null;out.planDays=n;
    return out;
  }
  // Round 13 (2026-10-21): "Saturday in Osoyoos" (a town and a weekday, nothing else) is a one-day plan on that day,
  // not an Ideas list. "What can we do Saturday in Osoyoos" still asks for ideas.
  if(!window&&weekday>=0&&ref&&!out.daypart&&!when?.preset&&!/\b(?:what|where|things?|ideas?|suggest\w*|recommend\w*|anything|something)\b/.test(out.text||'')){
    out.startDate=isoAdd(ref,(weekday-wd+7)%7);out.dateSource=out.dateSource||'the day you named';
    out.items.push({id:'weekday-day',kind:'days',value:1,strength:'must',sourceText:String(when.weekday),dayIndex:null,weekday:null});
    out.planDays=1;
    return out;
  }
  if(!window)return out;
  out.timeWindow=window;
  out.startMinutes=WINDOW_START[window];
  if(ref){
    if(weekday>=0)out.startDate=isoAdd(ref,(weekday-wd+7)%7);
    else if(when?.relative==='tomorrow')out.startDate=isoAdd(ref,1);
    else if(/\btonight\b/.test(out.text||'')||when?.preset==='today'){out.startDate=ref;out.windowToday=true;}
    else if(when?.preset==='this-weekend')out.startDate=wd===0||wd===6?ref:isoAdd(ref,6-wd);
    if(out.startDate)out.dateSource=out.dateSource||'the day you named';
  }
  return out;
}
// Round 12 (2026-10-20): an undated window that has already passed today ("an afternoon in Kelowna" asked at 6:45 PM
// Pacific) is planned for tomorrow, not for hours that are over. clock is okanaganClock(now): {date, minutes}.
// Round 13 (2026-10-21): the same for "tonight" / « ce soir » (dated today). A window that has started but still has
// at least 90 minutes left starts at the next quarter hour, with fewer stops (the first ones are dropped: at 8:20 PM
// "tonight" is dinner at 8:30 and a nightcap, not drinks at 5 PM). requirements.windowClock records what was done, so
// the plan can say so. Returns true when the plan moved to tomorrow.
const WINDOW_END={morning:840,afternoon:1140,evening:1440};
const WINDOW_STOP_MINUTES=75;
function rollPastTimeWindow(requirements,clock){
  const w=requirements?.timeWindow;
  if(!w||!clock||!/^\d{4}-\d{2}-\d{2}$/.test(clock.date||'')||!Number.isFinite(clock.minutes))return false;
  if(requirements.startDate&&requirements.startDate!==clock.date)return false;
  const canRoll=!requirements.startDate||!!requirements.windowToday;
  if(clock.minutes<=WINDOW_START[w])return false;
  const start=Math.ceil(clock.minutes/15)*15,left=WINDOW_END[w]-start;
  if(left<90){
    if(!canRoll)return false;
    requirements.startDate=isoAdd(clock.date,1);requirements.dateSource='tomorrow';requirements.startMinutes=WINDOW_START[w];
    requirements.windowClock={rolled:true,window:w,now:clock.minutes};
    return true;
  }
  requirements.startMinutes=start;
  requirements.windowStops=Math.max(1,Math.min(3,Math.floor(left/WINDOW_STOP_MINUTES)));
  requirements.windowClock={rolled:false,window:w,now:clock.minutes,start};
  return false;
}
// The stops of a time-window plan (round 11): what a morning, an afternoon or an evening in a town is made of.
function timeWindowComponents(trip,requirements){
  const w=requirements.timeWindow;
  const make=(types,phrase,extra={})=>({kind:'venue',types,phrase,activities:[],features:[],collections:[],cuisines:[],dog:!!trip?.party?.dog,kids:!!trip?.party?.kids,meal:null,daypart:w,generic:false,windowStop:true,...extra});
  const parts=w==='morning'?[make(['cafe'],'coffee'),make(['outdoor','indoor'],'a walk or a sight'),make(['restaurant'],'lunch',{meal:'lunch',daypart:'midday'})]
    :w==='afternoon'?[make(['outdoor','indoor'],'a walk or a sight'),make(['winery','brewery'],'a tasting'),make(['cafe'],'coffee or a treat')]
    :[make(['winery','brewery','cocktail'],'drinks'),make(['restaurant'],'dinner',{meal:'dinner'}),make(['cocktail','pub','brewery'],'a nightcap')];
  // Round 13: a window that has already started keeps only the stops that still fit (the last ones).
  const n=Number.isInteger(requirements.windowStops)?requirements.windowStops:parts.length;
  return {...trip,multi:true,components:parts.slice(Math.max(0,parts.length-n)),leftoverTerms:[],explicitStops:true,timeWindow:w,regions:trip?.regions||[],party:trip?.party||{dog:false,kids:false},when:trip?.when||null,route:trip?.route||null,unknownPlaces:trip?.unknownPlaces||[]};
}
// Words covered by verified requirement grammar must not also become
// unmatched cuisine searches. Unknown terms still reach the old interpreter.
function consumedTerms(requirements) {
  const terms = new Set();
  const add = text => norm(text).split(' ').forEach(w => terms.add(w));
  if (requirements?.daypart) add('morning afternoon evening');
  if (requirements?.onlyRequested) add('only just');
  if (requirements?.startDate) add(`starting start begins beginning ${requirements.dateSource || ''}`);
  if (requirements?.startMinutes != null) add('starting start begin leave depart at am pm');
  for (const i of requirements?.items || []) {
    if (i.kind === 'venue') add(i.venueName || '');
    if (i.kind === 'transport') add('no car without a our my do not have don t driving free on foot walkable walk walking between the stops places venues we want to');
    if (i.kind === 'evening_walk') add(`no not don t do won will avoid without want to driving drive car after past once it s at in the dark night nightfall sunset dinner evening am pm ${i.phrase || ''}`);
    if (i.kind === 'deadline') add(`${i.sourceText} back return finish finished done home by before no later than noon midday am pm`);
    if (i.kind === 'duration') add('hour hours hr hrs minute minutes min mins afternoon morning evening');
    if (i.kind === 'unsupported') {
      if(i.value==='party size') add('one two three four five six seven eight nine ten people adults children kids guests');
      if(i.value==='age suitability') add('one two three four five six seven eight nine ten ages age aged year years old olds');
      if(i.value==='accessibility') add('someone using wheelchair accessible accessibility');
      if(i.value==='exact budget') add('total people budget under maximum max cost spend dollars');
      add(i.sourceText.split(' ').filter(w=>/^\d+$/.test(w)).join(' '));
    }
    if (i.kind === 'distance') add('keep driving limited minimize minimise nearby stops short drives under within maximum max less than km kilometers kilometres');
    if (i.kind === 'event') {
      if (i.eventKind === 'hockey') add('ice hockey game games match matches junior');
      if (i.nameTerms?.length) add(i.nameTerms.join(' '));
    }
    if (i.kind === 'feature') add(`${i.value.replace(/_/g, ' ')} meals meal only must verified`);
    if (i.kind === 'activity') add(i.value==='viewpoints'?'sunset viewpoints viewpoint watch place to':i.value);
    if (i.kind === 'venue_kind') add(`${LABELS[i.value]} ${i.value==='sunset'?'watch place to':i.value==='cooking'?'classes':i.value==='horseback'?'horse riding':''}`);
  }
  return terms;
}
// Keep standalone activities as their own stops in a mixed itinerary.
// A rainy-day option is not an instruction to keep every other stop indoors.

// A constrained single-day outing schedules requested components, rather than
// filling unrelated breakfast/lunch/dinner slots. Multi-day plans stay intact.
function explicitOutingComponents(trip,requirements) {
  const items=requirements.items||[],days=items.find(i=>i.kind==='days')?.value||requirements.planDays;
  if(days>1 || items.some(i=>i.dayIndex>1))return trip;
  const kinds=items.filter(i=>i.kind==='venue_kind'&&i.strength==='must');
  const scoped=kinds.some(i=>SPORT_KINDS[i.value])&&items.some(i=>i.kind==='type'&&i.value==='restaurant'&&/\b(?:dinner|supper)\b/.test(i.sourceText))||!!(kinds.length&&requirements.startDate)||items.some(i=>i.kind==='transport')||requirements.onlyRequested||requirements.outingScope==='short'||days===1&&(kinds.length||items.some(i=>i.kind==='activity'||i.kind==='rainy'&&i.activityOnly))||items.some(i=>i.kind==='price_limit')||requirements.daypart&&(kinds.length||items.some(i=>i.kind==='activity')||items.filter(i=>i.kind==='type'&&i.strength==='must').length>=1);
  if(!scoped)return requirements.timeWindow&&!trip?.multi?timeWindowComponents(trip,requirements):trip;
  const text=requirements.text||'',parts=[];
  const typeFor=k=>SPORT_KINDS[k]?'sport':['walk','easy_walk','challenging_hike','park','sunset','horseback'].includes(k)?'outdoor':['wine_tour','boat_tour','guided_hike','cooking','snow_tour'].includes(k)?'tour':'indoor';
  const make=(types,phrase,extra={})=>({kind:'venue',types,phrase,activities:[],features:[],collections:[],cuisines:[],dog:!!trip?.party?.dog,kids:!!trip?.party?.kids,meal:null,daypart:requirements.daypart,generic:false,...extra});
  for(const i of kinds)parts.push(make([typeFor(i.value)],LABELS[i.value],{plannerKinds:[i.value]}));
  for(const i of items.filter(i=>i.kind==='activity'&&i.strength==='must')) {
    if(i.value==='winter'&&items.some(j=>j.kind==='activity'&&['skiing','snowshoeing'].includes(j.value)))continue;
    const existing=parts.find(c=>i.value==='viewpoints'&&(c.plannerKinds||[]).includes('sunset')||i.value==='hiking'&&(c.plannerKinds||[]).some(k=>['guided_hike','challenging_hike','easy_walk'].includes(k)));
    if(existing)existing.activities.push(i.value);
    else parts.push(make(['outdoor'],i.value,{activities:[i.value]}));
  }
  for(const i of items.filter(i=>i.kind==='event'&&i.strength==='must')) {
    const kind=i.eventKind||(/\bfestivals?\b/.test(i.sourceText)?'festival':/\bmarkets?\b/.test(i.sourceText)?'market':'event');
    parts.push({kind:'event',types:[],activities:[],features:[],collections:[],cuisines:[],phrase:kind,daypart:requirements.daypart,event:{kind,category:i.value==='any'?null:i.value,terms:[...(kind==='hockey'?['hockey']:[]),...(i.nameTerms||[])],...(i.nameTerms?.length?{nameTerms:i.nameTerms.slice()}:{}),noun:kind==='hockey'?'hockey game':kind,venueFeature:null}});
  }
  const represented=new Set(parts.flatMap(c=>c.types));
  for(const i of items.filter(i=>i.kind==='type'&&i.strength==='must')) {
    if(represented.has(i.value))continue;
    const dinner=i.value==='restaurant'&&/\b(?:dinner|supper)\b/.test(text);
    parts.push(make(i.value==='breakfast'?['cafe','restaurant']:[i.value],i.value==='cafe'?'coffee':dinner?'dinner':i.value,{meal:dinner?'dinner':null,daypart:dinner?'evening':requirements.daypart}));represented.add(i.value);
  }
  if(kinds.some(i=>SPORT_KINDS[i.value])&&/\blunch\b/.test(text)&&/\b(?:dinner|supper)\b/.test(text)&&!/\b(?:no|without|skip|avoid) lunch\b/.test(text))parts.push(make(['restaurant'],'lunch',{meal:'lunch',daypart:'afternoon'}));
  for(const i of items.filter(i=>i.kind==='venue'&&i.strength==='must')) {
    const existing=parts.find(c=>c.kind==='venue'&&c.types.includes(i.venueType)&&!c.venueId);
    if(existing){existing.venueId=i.value;existing.phrase=i.venueName;}
    else if(i.venueType)parts.push(make([i.venueType],i.venueName,{venueId:i.value}));
  }
  if(parts.length<2&&!((requirements.outingScope==='short'||requirements.daypart||requirements.onlyRequested||items.some(i=>i.kind==='transport'))&&parts.length===1))return trip;
  const pos=c=>{const needle=c.phrase==='BMX'?'bmx':c.phrase==='walk'?'walk':c.phrase;const n=text.indexOf(needle);return n<0?10000:n;};
  parts.sort((a,b)=>pos(a)-pos(b));
  return {...trip,multi:true,components:parts,leftoverTerms:[],explicitStops:true,outingOccasion:trip?.outingOccasion,regions:trip?.regions||[],party:trip?.party||{dog:false,kids:false},when:trip?.when||null,route:trip?.route||null,unknownPlaces:trip?.unknownPlaces||[]};
}

function expandTripComponents(trip,requirements) {
  if (!trip?.multi || requirements.daypart || requirements.onlyRequested || requirements.items.some(i=>i.kind==='transport')) trip=explicitOutingComponents(trip,requirements);
  if (!trip?.multi) return trip;
  const singleDay=!(requirements.planDays>1||(requirements.items||[]).some(i=>i.kind==='days'&&i.value>1||i.dayIndex>1));
  const components=trip.components.map(c=>singleDay&&requirements.daypart&&!c.meal?{...c,daypart:requirements.daypart}:c);
  for(const item of requirements.items.filter(i=>i.kind==='venue_kind'&&i.strength==='must'&&['easy_walk','challenging_hike'].includes(i.value))){
    for(let n=0;n<components.length;n++)if(components[n].kind==='venue'&&(components[n].activities||[]).includes('hiking'))components[n]={...components[n],plannerKinds:[...new Set([...(components[n].plannerKinds||[]),item.value])]};
  }
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
  return {...trip,components,...(singleDay&&['date_night','romantic'].includes(requirements.occasion)&&components.some(c=>c.kind==='venue'&&['dinner','supper'].includes(c.meal))?{outingOccasion:requirements.occasion}:{}),leftoverTerms:(trip.leftoverTerms||[]).filter(w=>!consumed.has(w))};
}
function requirementDay(item,date) {
  if(item.dayIndex)return item.dayIndex;
  if(item.weekday&&/^\d{4}-\d{2}-\d{2}$/.test(date||'')) {const d=new Date(`${date}T12:00:00Z`);return (DAYS.indexOf(item.weekday)-d.getUTCDay()+7)%7+1;}
  return null;
}
function applicable(item,day,date){const wanted=requirementDay(item,date);return wanted==null||wanted===day;}
function coffeeEvidence(v){
  const text=norm([v.name,v.plannerDescription||v.description,v.textName,v.textDesc].filter(Boolean).join(' '));
  if(/\b(?:no coffee|without coffee|does not serve coffee|do not serve coffee|coffee free)\b/.test(text))return false;
  return /\b(?:coffee|espresso|cappuccino|latte|americano|flat white|cortado)\b/.test(text);
}
function matches(v,i){
  // "Lunch at a winery restaurant" (2026-10-19): a winery that serves lunch is that restaurant.
  if(i.wineryLunch&&i.kind==='type'&&v.type==='winery')return true;
  if(i.kind==='day_trip')return v.region===i.value;
  if(i.servesCoffee&&!coffeeEvidence(v))return false;
  if(i.kind==='venue_kind'||i.kind==='excluded_kind')return (v.plannerKinds||inferPlannerKinds(v)).includes(i.value);
  if(i.kind==='venue')return v.id===i.value;
  if(i.kind==='type'||i.kind==='type_count'||i.kind==='excluded_type')return i.value==='breakfast'?['cafe','restaurant'].includes(v.type):v.type===i.value||(v.fdTypes||[]).includes(i.value)||i.value==='tour'&&(v.plannerKinds||inferPlannerKinds(v)).some(k=>['boat_tour','wine_tour','guided_hike','snow_tour','cooking'].includes(k));
  if(i.kind==='activity')return (v.activities||[]).includes(i.value);
  if(i.kind==='feature')return !!(v.features||{})[i.value]||(i.value==='dog_friendly'&&(v.collections||[]).includes('dog_friendly'));
  if(i.kind==='rainy')return v.indoorEvidence==='explicit'||v.type==='indoor'||v.indoorGolf===true;
  return false;
}
// Round 11 (2026-10-20): a place with no stored hours whose listing says it runs on one day of the week ("every Saturday
// morning from mid-April to the end of October", the Penticton Farmers' Market) is only planned on that day and in those
// months. null when the listing says nothing that clear.
const WEEKDAY_WORDS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const MONTH_WORDS=['january','february','march','april','may','june','july','august','september','october','november','december'];
function listedWeekdays(v){
  // Not food and drink: "live music every Friday" at a restaurant is a night of the week, not its only open day.
  if(!v||DINING.has(v.type)||['winery','brewery','distillery','pub','cocktail'].includes(v.type)||(v.hours&&v.hours!=='[]'&&v.hours!=='{}'&&v.hours!=='null'))return null;
  const text=String(v.plannerDescription||v.description||'').toLowerCase();
  if(!text)return null;
  const days=new Set();
  const day='(sunday|monday|tuesday|wednesday|thursday|friday|saturday)';
  for(const m of text.matchAll(new RegExp(`\\b(?:every|each) ${day}\\b|\\b${day}s only\\b|\\bon ${day} (?:mornings|afternoons|evenings)\\b|\\b(?:only|just) on ${day}s?\\b`,'g')))days.add(WEEKDAY_WORDS.indexOf(m[1]||m[2]||m[3]||m[4]));
  if(!days.size||days.size>2)return null;
  const range=new RegExp(`\\bfrom (?:(?:early|mid|late)[- ])?(${MONTH_WORDS.join('|')})(?: \\d{1,2}(?:st|nd|rd|th)?)? (?:to|until|through) (?:the (?:end|middle) of |(?:early|mid|late)[- ])?(${MONTH_WORDS.join('|')})\\b`).exec(text);
  return {days,months:range?[MONTH_WORDS.indexOf(range[1])+1,MONTH_WORDS.indexOf(range[2])+1]:null};
}
function listedDayConflict(v,day,date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return false;
  const listed=listedWeekdays(v);
  if(!listed)return false;
  const on=new Date(new Date(`${date}T12:00:00Z`).getTime()+((day||1)-1)*86400000);
  if(!listed.days.has(on.getUTCDay()))return true;
  if(listed.months){const m=on.getUTCMonth()+1,[a,b]=listed.months;if(a<=b?(m<a||m>b):(m<a&&m>b))return true;}
  return false;
}
function venueAllowed(v,requirements,day,date){
  if(listedAccessConflict(v,requirements,day,date))return false;
  if(listedDayConflict(v,day,date))return false;
  for(const i of requirements?.items||[]){
    if(i.strength==='prefer'||!applicable(i,day,date))continue;
    if(i.servesCoffee&&(v.type==='cafe'||(v.fdTypes||[]).includes('cafe'))&&!coffeeEvidence(v))return false;
    if((i.kind==='excluded_kind'||i.kind==='excluded_type')&&matches(v,i))return false;
    if(i.kind==='feature'&&(i.value==='dog_friendly'||i.value==='kid_friendly'||DINING.has(v.type))&&!matches(v,i))return false;
    if(i.kind==='price_limit'&&DINING.has(v.type)&&v.price!=null&&v.price>i.value)return false;
    if(i.kind==='rainy'&&!i.activityOnly&&(v.type==='beach'||v.type==='outdoor'||v.type==='golf'&&!v.indoorGolf))return false;
  }return true;
}
function requirementScore(v,requirements,day,date,covered=new Set()){
  let score=0;
  for(const i of requirements?.items||[]){if(!applicable(i,day,date)||covered.has(i.id))continue;
    if(['venue_kind','venue','type','activity'].includes(i.kind)&&matches(v,i))score+=i.strength==='must'?100:25;
    if(i.kind==='rainy'&&matches(v,i))score+=DINING.has(v.type)?35:140;
  }return score;
}
// Resolve distinctive phrases against supplied, date/region-filtered listings only.
// Two meaningful words and one unique title are required; never infer from one word.
const NAMED_EVENT_GENERIC = new Set(['tour', 'tours', 'one', 'two', 'day', 'days', 'weekend', 'weekends', 'night', 'nights', 'trip', 'food', 'okanagan', 'bc']);
function namedEventInterpretationText(text, events = [], details = false) {
  const normalized = norm(text), tokens = normalized.split(' ');
  if (/\b(?:concerts?|events?|live music|festivals?|hockey|markets?)\b/.test(normalized) || tokens.length > 100) return details ? {text, ambiguity:null} : text;
  const filler = new Set('the a an and of return experience tribute show night day live music dinner lunch date plan with in at to'.split(' '));
  const matches = [];
  for (const event of events) {
    const title = norm(event.name).split(' ').filter(w => !filler.has(w));
    if (title.length < 2) continue;
    for (let start = 0; start < tokens.length; start++) {
      if (filler.has(tokens[start])) continue;
      for (let end = start + 2; end <= Math.min(tokens.length, start + 10); end++) {
        if (filler.has(tokens[end - 1])) continue;
        const words = tokens.slice(start, end).filter(w => !['the','a','an','and','of'].includes(w));
        const eventRegion = norm(event.region || '').replace(/-/g, ' ');
        if (words.length < 2 || words.join(' ') === eventRegion || !(` ${title.join(' ')} `).includes(` ${words.join(' ')} `)) continue;
        // Round 7 (2026-10-19): a town and a generic word are not an event's name ("food tour Kelowna" is not "Hungry for
        // Laughs Comedy Tour (Kelowna)").
        const regionWords = new Set(eventRegion.split(' '));
        if (words.filter(w => !regionWords.has(w) && !NAMED_EVENT_GENERIC.has(w)).length < 2) continue;
        if (/\b(?:no|not|without|avoid|skip|exclude)\b(?:(?!\b(?:but|include)\b).)*$/.test(tokens.slice(0,start).join(' '))) continue;
        matches.push({start,end,phrase:words.join(' '),title:norm(event.name),music:(event.categories || []).includes('live-music')});
      }
    }
  }
  const titles = [...new Set(matches.map(m => m.title))];
  if (titles.length > 1) {
    const candidateNames = events.filter(e => titles.includes(norm(e.name))).map(e => e.name);
    const uniqueNames = [...new Set(candidateNames)];
    const candidateIds = uniqueNames.map(name => events.find(e => norm(e.name) === norm(name))?.id).filter(Number.isSafeInteger);
    const result = {text, ambiguity:{phrase:matches.sort((a,b)=>(b.end-b.start)-(a.end-a.start))[0].phrase, candidates:uniqueNames, candidateIds}};
    return details ? result : text;
  }
  if (!titles.length) return details ? {text, ambiguity:null} : text;
  const match = matches.sort((a,b) => (b.end-b.start)-(a.end-a.start))[0];
  tokens.splice(match.end, 0, match.music ? 'concert' : 'event');
  const result = {text:tokens.join(' '), ambiguity:null};
  return details ? result : result.text;
}

function eventMatches(event,item) {
  if (item.eventKind === 'comedy' && !/\b(?:comedy|comedian|comedians|comedic|improv|stand ?up|laughs?)\b/.test(norm(`${event.name || ''} ${event.description || ''}`))) return false;
  // Round 10: a nightlife listing alone (a coffee social, a boutique night) is not a show.
  if (item.eventKind === 'show' && !(event.categories || []).some(c => ['arts-culture','live-music'].includes(c)) && !/\b(?:show|shows|comedy|concert|theatre|theater|performance|musical|play|dance|ballet|opera|symphony)\b/.test(norm(event.name || ''))) return false;
  if (item.holiday && !(event.categories || []).includes('holiday-seasonal') && !/\b(?:christmas|xmas|holiday|festive|santa|noel|christkindl\w*|yule\w*)\b/.test(norm(event.name || ''))) return false;
  if (item.nameTerms?.length && !item.nameTerms.every(term => norm(event.name || '').split(' ').includes(term))) return false;
  if(item.value !== 'any' && !(event.categories || []).includes(item.value)) return false;
  // A comedian listed under Live Music is not live music (2026-10-19).
  if((item.value === 'live-music' || ['live-music','concert'].includes(item.eventKind)) && /\b(?:comedian|comedians|stand up comedy|standup comedy|comedy tour|comedy show|comedy night)\b/.test(norm(`${event.name || ''} ${event.description || ''}`))) return false;
  if(item.eventKind === 'hockey') return /\b(?:hockey|nhl|whl|bchl)\b/.test(norm(`${event.name || ''} ${event.description || ''}`));
  return true;
}
function eventSearchTermMatches(event,term,category){
  const categories=event.categories||[];
  if(category&&category!=='any'&&!categories.includes(category))return false;
  const text=norm(`${event.name||''} ${event.description||''}`);
  if(norm(term)==='hockey')return /\b(?:hockey|nhl|whl|bchl)\b/.test(text);
  return norm(term).split(' ').filter(Boolean).every(word=>text.split(' ').includes(word));
}
function selectedStops(plan){
  if(plan.days?.length)return plan.days.flatMap(d=>d.stops.map(s=>({...s,day:d.day})));
  return [...(plan.itinerary?.stops||[]),...(plan.outing?.stops||[]),...(plan.recommendations||[])].map(s=>({...s,day:1}));
}
function km(a,b){const rad=x=>x*Math.PI/180;const dlat=rad(b.lat-a.lat),dlon=rad(b.lng-a.lng);return 6371*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2)));}
// Road travel (2026-10-18): straight-line km x 1.3 for the road, at 50 km/h for a short hop rising to 70 km/h on a
// longer highway leg, never under 5 minutes. (It used to be x1.6 at 30 km/h plus 15 minutes: "43 min" for 8.5 km
// inside Naramata.) Walking stays 3-4 km/h.
const ROAD_FACTOR=1.3,MIN_DRIVE_MINUTES=5;
function driveMinutes(distance){
  const road=distance*ROAD_FACTOR;
  const speed=road<=10?50:road>=40?70:50+(road-10)*20/30;
  return Math.max(MIN_DRIVE_MINUTES,Math.ceil(road/speed*60));
}
function transferRange(distance,walking=false){
  if(walking)return {minMinutes:Math.ceil(distance/4*60),maxMinutes:Math.ceil(distance*1.3/3*60)+5};
  const max=driveMinutes(distance);
  return {minMinutes:Math.max(MIN_DRIVE_MINUTES,Math.floor(max*0.85)),maxMinutes:max};
}
// Okanagan Lake (2026-10-19, round 7): the only ways across are the bridge at Kelowna and around the south end at
// Penticton, and there is no road along the east shore between Naramata and Kelowna (Okanagan Mountain Park). A pair
// of places on opposite shores is measured around the lake, not across it: Naramata to Summerland went from "7 min" to
// about 40. The shore line is a rough centre line of the lake, north to south; places more than ~9 km from the lake
// (Big White, Rutland) are not on a shore and keep the straight line.
const LAKE_CENTRE=[[49.49,-119.6],[49.55,-119.625],[49.6,-119.615],[49.65,-119.64],[49.7,-119.66],[49.75,-119.665],[49.8,-119.6],[49.85,-119.53],[49.88,-119.505],[49.95,-119.505],[50.05,-119.47],[50.1,-119.43]];
// Round 9 (2026-10-19): the east shore splits at Okanagan Mountain Park (about 49.72), not at 49.8 -- Kelowna's Lower
// Mission (CedarCreek, Waldhof, Summerhill) is on Lakeshore Road north of the park, so "WOK STAR to Waldhof" (4 km)
// was "114 min" around the south end of the lake.
const LAKE_SOUTH_END={lat:49.497,lng:-119.593},LAKE_BRIDGE={lat:49.876,lng:-119.505},LAKE_EAST_SPLIT=49.72;
function lakeShore(p){
  if(!p||!(p.lat>LAKE_CENTRE[0][0]&&p.lat<LAKE_CENTRE[LAKE_CENTRE.length-1][0]))return null;
  const i=LAKE_CENTRE.findIndex(([lat])=>lat>=p.lat),[la,lo]=LAKE_CENTRE[i-1],[lb,lob]=LAKE_CENTRE[i];
  const centre=lo+(lob-lo)*(p.lat-la)/(lb-la),off=p.lng-centre;
  if(Math.abs(off)>0.12)return null;
  return off<0?'west':p.lat<LAKE_EAST_SPLIT?'east-south':'east-north';
}
// -> { km, via } for a pair on opposite shores (km along the way round, before the road factor), else null.
// side: the km on winding shore roads (Naramata Road, Lakeshore Road); the rest is highway. Only a real detour counts
// (the way round at least 1.3 times the straight line): Penticton to Kelowna already drives round the south end.
function lakeDetour(a,b){
  const sa=lakeShore(a),sb=lakeShore(b);
  if(!sa||!sb||sa===sb)return null;
  const pair=[sa,sb].sort().join('/');
  let d;
  if(pair==='east-south/west')d={side:km(a,LAKE_SOUTH_END)+km(LAKE_SOUTH_END,b),highway:0,via:'Penticton'};
  else if(pair==='east-north/west')d={side:km(a,LAKE_BRIDGE)+km(LAKE_BRIDGE,b),highway:0,via:'the bridge'};
  else{const [s,n]=sa==='east-south'?[a,b]:[b,a];d={side:km(s,LAKE_SOUTH_END)+km(LAKE_BRIDGE,n),highway:km(LAKE_SOUTH_END,LAKE_BRIDGE)*1.1,via:'Penticton'};}
  d.km=d.side+d.highway;
  return d.km>=km(a,b)*1.3?d:null;
}
// Kilometres to travel between two places: the straight line, or the way around the lake.
function travelKm(a,b){const d=lakeDetour(a,b);return d?d.km:km(a,b);}
function estimateTransfer(a,b,walking=false){
  if(!a||!b||![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite)||Math.abs(a.lat)>90||Math.abs(b.lat)>90||Math.abs(a.lng)>180||Math.abs(b.lng)>180)return null;
  const detour=lakeDetour(a,b);
  if(!detour)return {...transferRange(km(a,b),walking),mode:walking?'walking':'driving assumed'};
  // Around the lake: winding shore roads (x1.5 rather than x1.3) and through Penticton or over the bridge (+8 min).
  if(walking)return {...transferRange(detour.km,true),mode:'walking',aroundLake:detour.via};
  const max=driveMinutes((detour.side*1.5+detour.highway*ROAD_FACTOR)/ROAD_FACTOR)+8;
  return {minMinutes:Math.max(MIN_DRIVE_MINUTES,Math.floor(max*0.85)),maxMinutes:max,mode:'driving assumed',aroundLake:detour.via};
}
// Approximate NOAA general solar equations; no terrain or weather model.
// https://gml.noaa.gov/grad/solcalc/solareqns.PDF
function estimateDaylight(date,location){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||![location?.lat,location?.lng].every(Number.isFinite)||Math.abs(location.lat)>60||Math.abs(location.lng)>180)return null;
 const noon=new Date(date+'T12:00:00Z');if(!Number.isFinite(noon.getTime())||noon.toISOString().slice(0,10)!==date)return null;
 const year=noon.getUTCFullYear(),days=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000,n=(noon-Date.UTC(year,0,1))/86400000;
 const g=2*Math.PI/days*Math.floor(n),rad=x=>x*Math.PI/180;
 const eq=229.18*(.000075+.001868*Math.cos(g)-.032077*Math.sin(g)-.014615*Math.cos(2*g)-.040849*Math.sin(2*g));
 const dec=.006918-.399912*Math.cos(g)+.070257*Math.sin(g)-.006758*Math.cos(2*g)+.000907*Math.sin(2*g)-.002697*Math.cos(3*g)+.00148*Math.sin(3*g);
 const cosine=Math.cos(rad(90.833))/(Math.cos(rad(location.lat))*Math.cos(dec))-Math.tan(rad(location.lat))*Math.tan(dec);
 if(Math.abs(cosine)>1)return null;
 const angle=Math.acos(cosine)*180/Math.PI;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Vancouver',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(noon);
 const value=t=>Number(parts.find(p=>p.type===t).value),offset=value('hour')*60+value('minute')-720;
 return {sunriseMinutes:Math.ceil(720-4*(location.lng+angle)-eq+offset),sunsetMinutes:Math.floor(720-4*(location.lng-angle)-eq+offset)};
}
// Conservative timing from an outdoor listing, not independently verified.
// Access-road hours and walks to nearby places are not park/trail timing.
function listedOutdoorTiming(v) {
  if (v?.type !== 'outdoor') return {};
  const text = String(v.plannerDescription || v.description || '').replace(/a\.m\./gi, 'am').replace(/p\.m\./gi, 'pm');
  const durations = [];
  let ambiguousDuration = false;
  for (const clause of text.split(/[.;!?]/)) {
    if (!/\b(?:trail|hike|hiking|route)\b/i.test(clause) || /\b(?:drive|driving|closed)\b/i.test(clause)) continue;
    const range = /\b(\d{1,3})\s*(?:–|-|to)\s*(\d{1,3})\s*minutes?\b/i.exec(clause);
    const mixed = /\b(\d{1,3})\s*minutes?\s*to\s*(?:an?|one)\s*hour\s*and\s*a\s*half\b/i.exec(clause);
    if ([...clause.matchAll(/\b\d{1,3}\s*(?:–|-|to)\s*\d{1,3}\s*minutes?\b/gi)].length + [...clause.matchAll(/\b\d{1,3}\s*minutes?\s*to\s*(?:an?|one)\s*hour\s*and\s*a\s*half\b/gi)].length > 1) ambiguousDuration = true;
    if (range || mixed) {
      const match = range || mixed;
      if (/^\s*(?:walk|drive)\s+(?:from|to)\b/i.test(clause.slice(match.index + match[0].length))) continue;
      const min = Number((range || mixed)[1]), max = range ? Number(range[2]) : 90;
      if (min >= 15 && max >= min && max <= 720) durations.push([min, max]);
    }
  }
  // Multiple route ranges are ambiguous; retain the generic allowance.
  const durationRange = !ambiguousDuration && durations.length === 1 ? durations[0] : null;
  const hours = /\b(?:the )?park is open (?:daily )?(1[0-2]|[1-9])\s*(am|pm)\s+to\s+(1[0-2]|[1-9])\s*(am|pm)\b([^.;!?]*)/i.exec(text);
  let hoursRange = null;
  const hoursClause = hours && text.split(/[.;!?]/).find(c => c.includes(hours[0]));
  if (hours && (text.match(/\bpark is open\b/gi) || []).length === 1 && !/\b(?:summer|winter|season|seasonal|weekdays?|weekends?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|only|holidays?|vehicle|road|gate)\b/i.test(hoursClause || hours[5])) {
    const clock = (h, ap) => Number(h) % 12 * 60 + (ap.toLowerCase() === 'pm' ? 720 : 0);
    const from = clock(hours[1], hours[2]), to = clock(hours[3], hours[4]);
    if (to > from) hoursRange = [from, to];
  }
  return { durationRange, hoursRange };
}
// Conservative sport visit allowances; never claimed as operator-supplied durations.
function sportVisitAllowance(v,kinds){
 if(v.type!=='sport')return null;
 if(kinds.includes('disc_golf'))return /\b(?:nine|9)[ -]hole\b/i.test(v.plannerDescription||'')?[30,60]:[60,120];
 if(kinds.some(k=>['bmx','skatepark','tennis','pickleball'].includes(k)))return [45,90];
 return null;
}
function isOutdoorSport(v){
 if(v.type!=='sport')return false;
 const text=(v.name||'')+' '+(v.plannerDescription||'');
 if(/\b(?:indoor|covered|enclosed)\b/i.test(text))return false;
 return /\b(?:outdoor|open-air|disc golf course|skate ?park|bmx (?:race )?track|dawn to dusk)\b/i.test(text);
}
// Planning allowances, not venue-supplied durations or verified routes.
function estimateTripTiming({plan,facts,requirements,tripDate=null}){
  if(['recommendations','discover'].includes(plan.kind))return [];
  const byId=new Map(facts.map(v=>[v.id,v])),groups=new Map();
  for(const stop of selectedStops(plan)){
    if(!stop.venue&&!stop.event)continue;
    const day=stop.day||1;
    if(!groups.has(day))groups.set(day,{day,minMinutes:0,maxMinutes:0,complete:true,unknown:[],visits:[],transfers:[]});
    const g=groups.get(day),v=stop.venue&&byId.get(stop.venue.id);
    const walking=(requirements?.items||[]).some(i=>i.kind==='transport'&&applicable(i,day,requirements.startDate||tripDate));
    if(g.previous){
      const a=g.previous;
      if(v&&[a.lat,a.lng,v.lat,v.lng].every(Number.isFinite)){
        const {minMinutes:min,maxMinutes:max}=transferRange(km(a,v),walking);
        g.minMinutes+=min;g.maxMinutes+=max;g.transfers.push({from:a.id,to:v.id,minMinutes:min,maxMinutes:max,mode:walking?'walking':'driving assumed'});
      }else{g.complete=false;g.unknown.push('transfer');}
    }
    let range=null;
    if(v){
      const kinds=v.plannerKinds||inferPlannerKinds(v);
      const hike=(v.activities||inferPlannerActivities(v)).includes('hiking');
      const selectedShortWalk=(requirements?.shortWalkVenueIds||[]).includes(v.id);
      const requestedWalk=selectedShortWalk || /\b(?:short|easy|gentle|flat) (?:walk|walking|hike)\b/.test(requirements?.text||'');
      const requestedChallenge=(requirements?.items||[]).some(i=>i.value==='challenging_hike'&&i.strength!=='exclude');
      const listed = hike && !requestedWalk && !requestedChallenge ? listedOutdoorTiming(v).durationRange : null;
      const sportAllowance=sportVisitAllowance(v,kinds);
      range=selectedShortWalk?[30,60]:listed || sportAllowance || (hike&&!requestedWalk?(requestedChallenge?[180,300]:[90,180]):v.type==='cafe'?[20,40]:v.type==='restaurant'?[60,90]:v.type==='winery'?[45,75]:kinds.includes('museum')?[60,90]:kinds.includes('gallery')?[30,60]:kinds.some(k=>['easy_walk','walk'].includes(k))?[30,60]:kinds.includes('escape')?[60,90]:null);
      if(range){g.minMinutes+=range[0];g.maxMinutes+=range[1]+(stop.waitMinutes||0);g.visits.push({venueId:v.id,minMinutes:range[0],maxMinutes:range[1],...(listed?{durationSource:'listing'}:sportAllowance?{durationSource:'planning allowance'}:{})});}
      else{g.complete=false;g.unknown.push('visit duration');}
    }else{g.complete=false;g.unknown.push(stop.event?'event duration':'visit duration');}
    g.previous=v||{};
  }
  return [...groups.values()].map(({previous,...g})=>({...g,unknown:[...new Set(g.unknown)]}));
}
function evaluateTripRequirements({requirements,plan,facts,tripDate}){
  const timing=estimateTripTiming({plan,facts,requirements,tripDate});
  const byId=new Map(facts.map(v=>[v.id,v]));const selected=selectedStops(plan).filter(s=>s.venue&&byId.has(s.venue.id)).map(s=>({day:s.day,v:byId.get(s.venue.id)}));
  return (requirements?.items||[]).map(i=>{
    const pool=selected.filter(s=>applicable(i,s.day,tripDate));let status='unmet',reason='';
    if(i.kind==='event'){const events=[...selectedStops(plan),...(plan.kind==='events'?(plan.events||[]).map(event=>({kind:'event',event,day:1})):[])].filter(s=>s.kind==='event'&&s.event&&applicable(i,s.day,tripDate));status=events.some(s=>eventMatches(s.event,i))?'satisfied':'unmet';reason=status==='satisfied'?'Matched a dated event occurrence.':'No matching event was scheduled for the requested dates.';}
    else if(i.kind==='type_count'&&i.perDay){
      // A count per day is checked day by day; some but fewer than asked is "needs confirmation", never "missing" (2026-10-18).
      const dayNumbers=(plan.days||[]).map(d=>d.day).filter(d=>applicable(i,d,tripDate));
      const perDay=dayNumbers.map(d=>({day:d,found:pool.filter(s=>s.day===d&&matches(s.v,i)).length}));
      const short=perDay.filter(x=>x.found<i.count);
      status=!perDay.length||perDay.every(x=>x.found===0)?'unmet':short.length?'unverified':'satisfied';
      reason=`Requested ${i.count} ${i.value} stop${i.count===1?'':'s'} a day; scheduled ${perDay.map(x=>x.found).join(', ')} (day by day).`+(i.requestedCount?` ${i.requestedCount} a day is more than one day holds, so the plan uses ${i.count}.`:'');
    }
    else if(i.kind==='type_count'){const found=pool.filter(s=>matches(s.v,i)).length;status=found===i.count?'satisfied':found>0?'unverified':'unmet';reason=`Requested ${i.count} ${i.value} stop${i.count===1?'':'s'}; scheduled ${found}.`;}
    else if(i.kind==='transport'){
      const tooFar=pool.some((s,k)=>k>0&&s.day===pool[k-1].day&&[s.v.lat,s.v.lng,pool[k-1].v.lat,pool[k-1].v.lng].every(Number.isFinite)&&km(pool[k-1].v,s.v)>i.limitKm);
      status=tooFar?'unmet':'unverified';reason=tooFar?`The final sequence exceeds the ${i.limitKm} km straight-line limit; a practical walking itinerary could not be verified.`:`Car-free suggestions use a maximum ${i.limitKm} km straight-line gap between stops. Actual walking routes, crossings, accessibility and travel times are not verified.`;
    }
    else if(i.kind==='evening_walk'){
      // The drive to dinner is the day's last; anything after dinner should be a short walk from it.
      const after=(plan.days||[]).flatMap(d=>{const st=d.stops||[];const k=st.findIndex(x=>x.daypart==='evening'&&x.venue);return k<0?[]:st.slice(k+1).filter(x=>x.venue||x.event).map(x=>({from:st[k].venue,to:x.venue||x.event.location}));});
      const far=after.some(x=>x.to&&[x.from.latitude,x.from.longitude,x.to.lat??x.to.latitude,x.to.lng??x.to.longitude].every(Number.isFinite)&&km({lat:x.from.latitude,lng:x.from.longitude},{lat:x.to.lat??x.to.latitude,lng:x.to.lng??x.to.longitude})>i.limitKm);
      status=far?'unverified':'satisfied';
      reason=far?`Something after dinner is more than ${i.limitKm} km from it; plan a ride, or skip it to keep the evening on foot.`:'Dinner is the last drive of each day, so nothing after it needs a car.';
    }
    else if(i.kind==='deadline'){status='unverified';reason=`You requested finishing ${i.sourceText}; visit durations and travel time are not verified, so the deadline cannot be guaranteed.`;}
    else if(i.kind==='duration'){
      const estimates=timing.filter(t=>applicable(i,t.day,tripDate));
      status=estimates.some(t=>t.minMinutes>i.value)?'unmet':'unverified';
      reason=estimates.length?estimates.map(t=>`Day ${t.day}: ${t.complete?'estimated':'known-stop subtotal'} ${t.minMinutes}–${t.maxMinutes} minutes for visits and transfers${t.complete?'':'; unknown '+t.unknown.join(', ')}.`).join(' '):'No timed stops were selected.';
      reason+=` You requested ${i.value} minutes. Assumed visits: coffee 20–40, museum 60–90, easy walk 30–60, winery 45–75, meal 60–90 minutes. Transfer estimates use stored straight-line coordinates, assumed walking at 3–4 km/h or driving at 50–70 km/h (at least 5 minutes a transfer), and a road allowance of 1.3 times the straight line; actual routes, queues, breaks and opening-hour sequencing are not verified.`;
      if(status==='unmet')reason+=' Even the minimum allowance exceeds your time limit; remove a stop or allow more time.';
      else if(estimates.some(t=>t.maxMinutes>i.value))reason+=' Allow extra time; the upper estimate exceeds your time limit.';
    }
    else if(i.kind==='price_limit'){status='unverified';reason='Higher known dining price bands are excluded; total cost and unknown prices still need confirmation.';}
    else if(i.kind==='unsupported'){status='unverified';reason=`Okanagan Roam cannot verify ${i.value} from its listing data.`;}
    else if(i.weekday&&!tripDate){status='unverified';reason='A trip start date is needed to apply the weekday instruction.';}
    else if(i.kind==='days'){status=(plan.days?.length===i.value || i.value===1&&plan.kind==='itinerary')?'satisfied':'unmet';reason=status==='satisfied'?`${i.value} days planned.`:'The requested trip length was not met.';}
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
// Alternatives are informational only: never satisfy a missing request or edit stops.
function nearbyEventAlternatives({plan,events,from,to,today,regions=[],suitsKind=()=>true}) {
 const date=x=>/^\d{4}-\d{2}-\d{2}$/.test(x||'')?Date.parse(x+'T12:00:00Z'):NaN;
 const a=date(from),b=date(to);if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)return [];
 const missing=(plan.requirementResults||[]).filter(i=>i.kind==='event'&&i.status==='unmet');
 const seen=new Set(),out=[];
 for(const e of events||[]){
  const start=date(e.startDate),end=date(e.endDate||e.startDate);
  const distance=start>b?(start-b)/86400000:end<a?(a-end)/86400000:0;
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end<date(today)||distance<=0||distance>14)continue;
  if(regions.length&&!regions.includes(e.region))continue;
  if(typeof e.url!=='string'||!/^\/(?!\/)/.test(e.url)||seen.has(e.id+':'+e.startDate))continue;
  const matches=missing.filter(i=>eventMatches(e,i)&&suitsKind(e,i.eventKind));if(!matches.length)continue;
  seen.add(e.id+':'+e.startDate);
  out.push({id:e.id,name:e.name,url:e.url,region:e.region,startDate:e.startDate,endDate:e.endDate||e.startDate,suggestedDate:e.startDate<today?today:e.startDate,time:e.time||'',distanceDays:distance,requirementIds:matches.map(i=>i.id)});
 }
 return out.sort((x,y)=>x.distanceDays-y.distanceDays||x.startDate.localeCompare(y.startDate)||x.id-y.id).slice(0,3);
}
// Surface operator statements, never infer admission or a bookable time from prose.
function listedAccessConflict(v,requirements,day,date) {
 if(!['sport','tour'].includes(v.type)||requirements?.daypart!=='morning'||!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;
 const d=new Date(date+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)return null;
 d.setUTCDate(d.getUTCDate()+(day||1)-1);if([0,6].includes(d.getUTCDay()))return null;
 const sentences=String(v.plannerDescription||'').split(/(?<=[.!?])\s+(?=[A-Z])|[\r\n]+/);
 const matches=sentences.map(source=>({source:source.trim(),match:source.match(/\b(?:play|access|entry) (?:is |allowed |available |permitted )?(?:only )?after (\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?) on school days\b/i)})).filter(x=>x.match);
 if(matches.length!==1)return null;
 const {source,match}=matches[0],hour=Number(match[1]),minute=Number(match[2]||0);
 if(hour<1||hour>12||minute>59)return null;
 const afterMinutes=(hour%12)*60+minute+(/^p/i.test(match[3])?720:0);
 return afterMinutes>=720?{source,afterMinutes,conditional:true}:null;
}
function listedAccessNotes(v) {
 if(!['sport','tour'].includes(v.type)||typeof v.plannerDescription!=='string')return [];
 const sentences=v.plannerDescription.split(/(?<=[.!?])\s+(?=[A-Z])|[\r\n]+/).map(x=>x.trim()).filter(Boolean);
 const relevant=/\b(?:practice (?:and race )?nights?|race nights?|open houses?|riding season|school days?|dawn to dusk|members?(?:ship)? (?:only|required)|permit(?:s)? (?:required|needed)|(?:advance )?bookings? (?:is |are )?(?:required|essential)|reservations? (?:is |are )?(?:required|essential)|(?:book|reserve) (?:in advance|ahead)|(?:tours?|trips?|cruises?) (?:depart|run|operate)|(?:seasonal|seasonally|season dependent)|closed (?:for|during|until)|by appointment)\b/i;
 return [...new Set(sentences.filter(s=>relevant.test(s)))].slice(0,3).map(s=>'Access / schedule from the listing: “'+s+'” Confirm access and scheduling with the operator before visiting.');
}
// Offer shortening only for trailing activity gaps without discarding dated priorities.
function sparseDayRecovery(plan,requirements){
 const days=plan.days||[];
 const activityDays=days.filter(d=>(d.stops||[]).some(s=>s.event||s.venue&&!['restaurant','cafe','pub','cocktail','brewery','distillery'].includes(s.venue.type)));
 const last=activityDays.at(-1)?.day||0;
 const gaps=days.filter(d=>d.activityGap||last>0&&d.day>last&&!(d.stops||[]).some(s=>s.event||s.venue));if(!gaps.length)return null;
 const retained=new Set(days.filter(d=>d.day<=last).flatMap(d=>(d.stops||[]).map(s=>s.venue?.id)));
 const safe=last>0&&last<days.length&&!requirements?.endDate&&!(requirements?.items||[]).some(i=>i.kind==='event'||requirementDay(i,requirements.startDate)>last||i.kind==='venue'&&i.strength==='must'&&!retained.has(i.value));
 return {days:gaps.map(d=>d.day),shorterDays:safe?last:null,region:gaps.every(d=>d.region===gaps[0].region)?gaps[0].region:null};
}
module.exports={rollPastTimeWindow,listedWeekdays,listedDayConflict,travelKm,lakeDetour,onceFoods,namedEventInterpretationText,sparseDayRecovery,sportsVenueInterpretationText,isOutdoorSport,listedAccessConflict,listedAccessNotes,isSportKind:k=>!!SPORT_KINDS[k],nearbyEventAlternatives,listedOutdoorTiming,estimateDaylight,estimateTransfer,estimateTripTiming,tripCalendar,expandTripComponents,inferPlannerKinds,inferPlannerActivities,consumedTerms,eventMatches,eventSearchTermMatches,extractTripRequirements,evaluateTripRequirements,requirementDay,venueAllowed,requirementScore,matches,LABELS,selectedStops};
