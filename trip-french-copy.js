'use strict';
// Display-only French copy. Stored venue names, URLs, facts and API output stay intact.
const FR_MONTHS_BY_EN={January:'janvier',February:'février',March:'mars',April:'avril',May:'mai',June:'juin',July:'juillet',August:'août',September:'septembre',October:'octobre',November:'novembre',December:'décembre'};
const FR_SEASON_WORDS={winter:'hiver',spring:'printemps',summer:'été',fall:'automne',autumn:'automne','off-season':'hors saison'};
// Round 15c (2026-10-20): the English heading of an Ideas list ("Breweries in Squamish on Sunday.", "Art galleries and
// dog-friendly spots in Whistler this weekend.", "Ideas for Pemberton.", "What’s on in Squamish.") in French. Built only when
// every part is known (the category, badge, activity and collection names, the towns, the day); otherwise null and the
// heading is left to the usual handling.
const FR_HEADING_NAMES={wineries:'vignobles',breweries:'microbrasseries',cideries:'cidreries',cafes:'cafés','cocktail lounges':'bars à cocktails',distilleries:'distilleries','golf courses':'terrains de golf','indoor & rainy day spots':'lieux pour les jours de pluie','outdoor destinations':'lieux de plein air',pubs:'pubs',restaurants:'restaurants','sports & recreation':'sports et loisirs','tours & experiences':'visites et expériences',beaches:'plages','art galleries':'galeries d’art',museums:'musées','museums & galleries':'musées et galeries',shops:'boutiques',spas:'spas','yoga studios':'studios de yoga',
 'dog-friendly spots':'endroits qui acceptent les chiens','vegan-friendly venues':'lieux avec options véganes','vegetarian-friendly venues':'lieux avec options végétariennes','venues with a patio':'lieux avec terrasse','kid-friendly spots':'endroits adaptés aux enfants','venues with gluten-free options':'lieux avec options sans gluten','venues with a lake view':'lieux avec vue sur le lac','venues with non-alcoholic options':'lieux avec options sans alcool','spots to watch the game':'endroits pour regarder le match','venues with live music':'lieux avec musique en direct','venues that are great for groups':'lieux parfaits pour les groupes','venues with happy hour':'lieux avec un 5 à 7','free things to do':'activités gratuites','arts and culture spots':'lieux d’art et de culture','spots open early for breakfast & brunch':'endroits ouverts tôt pour le déjeuner et le brunch','late-night spots':'endroits ouverts tard',
 'hiking & trails':'randonnées et sentiers','cycling & biking':'vélo','winter':'activités d’hiver','camping':'camping','nature & wildlife':'nature et faune','water activities':'activités nautiques','viewpoints':'points de vue','adventure':'aventure','fishing':'pêche',
 'waterfalls & canyons':'chutes et canyons','huts & cabins':'refuges et cabanes','parks & picnic spots':'parcs et aires de pique-nique','off-leash dog areas':'aires sans laisse pour chiens',lakes:'lacs','shopping':'magasins','zipline':'tyrolienne','ziplining':'tyrolienne','bungee jumping':'saut à l’élastique','rafting':'rafting','scenic flight':'vol panoramique','farm':'fermes',
 'hidden gems':'trésors cachés','local favourites':'coups de cœur locaux','dog-friendly beaches':'plages qui acceptent les chiens','lake time':'temps au bord du lac'};
const FR_HEADING_DAYS={Monday:'lundi',Tuesday:'mardi',Wednesday:'mercredi',Thursday:'jeudi',Friday:'vendredi',Saturday:'samedi',Sunday:'dimanche'};
const FR_HEADING_PARTS={morning:'matin',afternoon:'après-midi',evening:'soir'};
function frHeadingWhen(w){
 if(!w)return '';
 let m;
 if((m=/^on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?: (morning|afternoon|evening))?$/.exec(w)))return ' '+FR_HEADING_DAYS[m[1]]+(m[2]?' '+FR_HEADING_PARTS[m[2]]:'');
 if((m=/^tomorrow(?: (morning|afternoon|evening))?$/.exec(w)))return ' demain'+(m[1]?' '+FR_HEADING_PARTS[m[1]]:'');
 return {'this weekend':' cette fin de semaine',today:' aujourd’hui',tonight:' ce soir','right now':' en ce moment','this morning':' ce matin','this afternoon':' cet après-midi','this evening':' ce soir'}[w]??null;
}
function frHeadingWhere(w){
 if(w==='@AREA@'||w===FR_SITE.area)return FR_SITE.inArea;
 const towns=w.split(/, | and /);
 if(!towns.every(t=>/^[A-Z][A-Za-z’'.-]*(?: [A-Z][A-Za-z’'.-]*)*$/.test(t)))return null;
 return 'à '+(towns.length>1?towns.slice(0,-1).join(', ')+' et '+towns[towns.length-1]:towns[0]);
}
const FR_HEADING_OCCASIONS={'a date night':'pour une soirée en amoureux','a romantic outing':'pour une sortie romantique','a family trip':'pour une sortie en famille','a rainy day':'pour un jour de pluie','a celebration':'pour une célébration','a group getaway':'pour une escapade en groupe','a relaxing getaway':'pour une escapade relaxante','an adventure':'pour une aventure','an adults-only trip':'pour une sortie entre adultes'};
const FR_HEADING_WHEN_RE='(?: (on (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?: (?:morning|afternoon|evening))?|tomorrow(?: (?:morning|afternoon|evening))?|this weekend|today|tonight|right now|this morning|this afternoon|this evening))?';
// Distillery test 2 (2026-11-13): the plan's summary sentence (trip-planner.js buildSummary) in French. It stayed in English
// (« A one-day plan around Naramata, focused on distilleries… ») whenever the plan had no stop to name.
function frSummaryItems(list){
 const items=String(list).split(/, | and /).map(x=>x.trim()).filter(Boolean).map(x=>{const k=x.toLowerCase();if(Object.prototype.hasOwnProperty.call(FR_HEADING_NAMES,k))return FR_HEADING_NAMES[k];const q=/^“(.+)”$/.exec(x);return q?'« '+q[1]+' »':x;});
 return items.length>1?items.slice(0,-1).join(', ')+' et '+items[items.length-1]:items[0]||'';
}
// « axée sur les distilleries et « adultes » »: the article before a plain list (not before a quoted typed word).
function frSummaryList(list){const t=frSummaryItems(list);return /^«/.test(t)?t:'les '+t;}
function frSummaryAround(w){
 if(w==='@AREA@'||w===FR_SITE.area)return FR_SITE.inArea;
 const towns=w.split(/, | and /);
 return 'autour de '+(towns.length>1?towns.slice(0,-1).join(', ')+' et '+towns[towns.length-1]:towns[0]);
}
function frOccasionNoun(o){const v=FR_HEADING_OCCASIONS[o];return v?v.replace(/^pour /,''):null;}
function t3FrenchSummary(text){
 const s=String(text||'');
 const occ=Object.keys(FR_HEADING_OCCASIONS).map(x=>x.replace(/^an? /,'')).join('|');
 let m;
 if(s==='We couldn’t work out a plan from that request yet.')return 'Nous n’avons pas encore pu faire un plan à partir de cette demande.';
 if((m=new RegExp('^(A one-day plan|(\\d+) (?:(relaxed|packed) )?days) around (.+?)(?:, focused on (.+?))?(?: — planned as (an? (?:'+occ+')))?\\.$').exec(s))){
  const head=m[2]?m[2]+' jours'+(m[3]==='relaxed'?' tranquilles':m[3]==='packed'?' bien remplis':''):'Une journée';
  const o=m[6]?frOccasionNoun(m[6]):null;
  const pl=!!m[2];
  return head+' '+frSummaryAround(m[4])+(m[5]?(pl?', axés sur ':', axée sur ')+frSummaryList(m[5]):'')+(o?(pl?' — pensés pour ':' — pensée pour ')+o:'')+'.';
 }
 if((m=new RegExp('^(An outing|An? (?:'+occ+')) in (.+?)'+FR_HEADING_WHEN_RE+'(?:, focused on (.+?))?\\.$').exec(s))){
  const where=frHeadingWhere(m[2]),when=frHeadingWhen(m[3]);if(!where||when===null)return null;
  let noun=m[1]==='An outing'?'une sortie':frOccasionNoun(m[1].replace(/^An?/,(x)=>x.toLowerCase()));if(!noun)return null;
  return noun.charAt(0).toUpperCase()+noun.slice(1)+' '+where+when+(m[4]?', axée sur '+frSummaryList(m[4]):'')+'.';
 }
 if((m=new RegExp('^Places that mention (.+?) in (.+?)'+FR_HEADING_WHEN_RE+'(, ranked by how closely they match and by their ratings)?\\.$').exec(s))){
  const where=frHeadingWhere(m[2]),when=frHeadingWhen(m[3]);if(!where||when===null)return null;
  return 'Lieux qui mentionnent '+frSummaryItems(m[1])+' '+where+when+(m[4]?', classés selon leur correspondance et leurs notes':'')+'.';
 }
 // "<interests> in X[ when][ for an occasion]." with an interest the heading table doesn't know (a typed word in quotes).
 if((m=new RegExp('^(.+?) in ((?:@AREA@|'+FR_SITE.area+')|(?:[A-Z][^.]*?))'+FR_HEADING_WHEN_RE+'(?: for ('+Object.keys(FR_HEADING_OCCASIONS).join('|')+'))?\\.$').exec(s))){
  const where=frHeadingWhere(m[2]),when=frHeadingWhen(m[3]);if(!where||when===null)return null;
  const list=frSummaryItems(m[1]);
  return list.charAt(0).toUpperCase()+list.slice(1)+' '+where+when+(m[4]?' '+FR_HEADING_OCCASIONS[m[4]]:'')+'.';
 }
 return null;
}
function t3FrenchHeading(text){
 const h=t3FrenchHeadingCore(text);
 return h!=null?h:t3FrenchSummary(text);
}
function t3FrenchHeadingCore(text){
 const s=String(text||'');
 let m;
 if((m=new RegExp('^What’s on in (.+?)\\.$').exec(s))){const where=frHeadingWhere(m[1]);return where?'À l’affiche '+where+'.':null;}
 if((m=new RegExp('^Ideas for (.+?)'+FR_HEADING_WHEN_RE+'(?: for ('+Object.keys(FR_HEADING_OCCASIONS).join('|')+'))?\\.$').exec(s))){const where=frHeadingWhere(m[1]),when=frHeadingWhen(m[2]);return where&&when!==null?'Des idées '+where+when+(m[3]?' '+FR_HEADING_OCCASIONS[m[3]]:'')+'.':null;}
 if((m=new RegExp('^(.+?) in ((?:@AREA@|'+FR_SITE.area+')|(?:[A-Z][^.]*?))'+FR_HEADING_WHEN_RE+'(?: for ('+Object.keys(FR_HEADING_OCCASIONS).join('|')+'))?\\.$').exec(s))){
  const items=m[1].split(/, | and /).map(x=>x.trim().toLowerCase());
  if(!items.length||!items.every(x=>Object.prototype.hasOwnProperty.call(FR_HEADING_NAMES,x)))return null;
  const where=frHeadingWhere(m[2]),when=frHeadingWhen(m[3]);
  if(!where||when===null)return null;
  const fr=items.map(x=>FR_HEADING_NAMES[x]);
  const list=fr.length>1?fr.slice(0,-1).join(', ')+' et '+fr[fr.length-1]:fr[0];
  return list.charAt(0).toUpperCase()+list.slice(1)+' '+where+when+(m[4]?' '+FR_HEADING_OCCASIONS[m[4]]:'')+'.';
 }
 return null;
}
// Site names go through tokens: the phrases below are the same on every site, and SITE.french (plain strings, embedded in
// the page) says what each token is on this one.
const FR_SITE=require('./trip-site.js').french;
function frSiteIn(s){
 return String(s).split(FR_SITE.brandWithArticle).join('@BRAND_A@').split(FR_SITE.brand).join('@BRAND@').split(FR_SITE.skiLead).join('@SKI_LEAD@').split(FR_SITE.exampleTowns).join('@TOWNS@')
  .split('only covers '+FR_SITE.coverage).join('only covers @COVERAGE@').split(FR_SITE.area+'’s best').join('@AREA@’s best').split(FR_SITE.area).join('@AREA@')
  .split(FR_SITE.timeName+' time').join('@TIME@ time').split(FR_SITE.timeName+' calendar date').join('@TIME@ calendar date')
  .split('stretch of '+FR_SITE.stretch).join('stretch of @STRETCH@').split('anywhere in '+FR_SITE.stretch).join('anywhere in @STRETCH@')
  .split('from about '+FR_SITE.snowRange).join('from about @SNOW@').split('activity'+(FR_SITE.bikeNote||'')+', so in').join('activity@BIKE@, so in');
}
function frSiteOut(s){
 return String(s).split('@BRAND_A@').join(FR_SITE.brandWithArticle).split('@OF_BRAND@').join(FR_SITE.ofBrand).split('@BRAND@').join(FR_SITE.brand).split('@SKI_LEAD_FR@').join(FR_SITE.skiLeadFr).split('@SKI_LEAD@').join(FR_SITE.skiLead)
  .split('@TOWNS_FR@').join(FR_SITE.exampleTownsFr).split('@TOWNS@').join(FR_SITE.exampleTowns).split('@COVERAGE_FR@').join(FR_SITE.coverageFr).split('@COVERAGE@').join(FR_SITE.coverage).split('@IN_AREA@').join(FR_SITE.inArea).split('@OF_AREA@').join(FR_SITE.ofArea).split('@THE_AREA@').join(FR_SITE.theArea)
  .split('@AREA@').join(FR_SITE.area).split('@TIME@').join(FR_SITE.timeName).split('@OF_STRETCH@').join(FR_SITE.ofStretch).split('@STRETCH@').join(FR_SITE.stretch)
  .split('@SNOW_FR@').join(FR_SITE.snowRangeFr).split('@SNOW@').join(FR_SITE.snowRange).split('@BIKE_FR@').join(FR_SITE.bikeNoteFr).split('@BIKE@').join(FR_SITE.bikeNote);
}
// Brewery test 3 (2026-11-13): « Cidrerie du Verger Bleu est fermée » (a place named for a feminine noun: Cidrerie,
// Distillerie, Brasserie…), and « elle ne fait donc pas partie de ce plan ». Other names keep the masculine. Kept inside
// this function: the trip page ships it to the browser with toString().
function t3FrenchText(value){
 const text=frSiteOut(t3FrenchTextCore(frSiteIn(String(value||''))));
 const m=/^(.+?) (est fermé|a été écarté|correspond, mais est fermé)(?=[\s;.,]|$)/.exec(text);
 if(!m||!/^(?:(?:la|une) )?(?:cidrerie|distillerie|brasserie|microbrasserie|boulangerie|p[âa]tisserie|fromagerie|chocolaterie|cr[êe]perie|ferme|cave|maison|cabane|taverne|buvette|cantine|[ée]picerie|rôtisserie|hydromellerie)(?![a-zà-ÿ])/i.test(m[1]))return text;
 return m[1]+' '+m[2].replace(/fermé$/,'fermée').replace(/écarté$/,'écartée')+text.slice(m[0].length)
  .replace(/^ : il est fermé /,' : elle est fermée ').replace(/; il ne fait donc pas/,'; elle ne fait donc pas').replace(/vérifiez qu’il est ouvert/,'vérifiez qu’elle est ouverte').replace(/ pour le planifier\.$/,' pour la planifier.');
}
function t3FrenchTextCore(value){
 let text=String(value||'');
 const heading=t3FrenchHeading(text);if(heading)return heading;
 const directLabels={market:'marché',festival:'festival',event:'événement',walks:'promenades','easy walk':'promenade facile','easy walks':'promenades faciles','Kid-friendly spots':'Endroits adaptés aux enfants'};
 if(Object.prototype.hasOwnProperty.call(directLabels,text))return directLabels[text];

 // @BRAND@ (2026-10-25): the firm season notes and nearby-town notes.
 const FRM={January:'janvier',February:'février',March:'mars',April:'avril',May:'mai',June:'juin',July:'juillet',August:'août',September:'septembre',October:'octobre',November:'novembre',December:'décembre',winter:'l’hiver',summer:'l’été',spring:'le printemps',fall:'l’automne','the fall':'l’automne','the winter':'l’hiver','the summer':'l’été','the spring':'le printemps'};
 const frm=(x)=>FRM[x]||x;
 const LEFT={'beaches and swimming':'les plages et la baignade','snow activities':'les activités de neige','summer hiking trails':'les sentiers de randonnée d’été','campgrounds':'les campings'};
 text=text.replace(/^Planned for (.+?): places that are out of season then \((.+)\) are left out, and places that suit (.+?) come first\.$/,(_,m,l)=>`Planifié pour ${frm(m)} : les endroits hors saison à ce moment-là (${l.split(/, | and /).map(x=>LEFT[x]||x).join(', ')}) sont écartés, et les endroits qui conviennent à cette période passent en premier.`);
 text=text.replace(/^Planned for (.+?): places that suit that time of year come first\.$/,(_,m)=>`Planifié pour ${frm(m)} : les endroits qui conviennent à cette période passent en premier.`);
 text=text.replace(/^Beaches, swimming and paddling here are summer activities \(about June to September\), so they aren’t part of this (.+?) plan; lakeside walks and places that suit .+? are planned instead\.$/,(_,m)=>`Ici, les plages, la baignade et la pagaie sont des activités d’été (environ de juin à septembre); elles ne font donc pas partie de ce plan pour ${frm(m)}. Des promenades au bord de l’eau et des endroits adaptés à la saison sont prévus à la place.`);
 text=text.replace(/^Snow activities here run from about @SNOW@, so they aren’t part of this (.+?) plan\.$/,(_,m)=>`Ici, les activités de neige vont @SNOW_FR@; elles ne font donc pas partie de ce plan pour ${frm(m)}.`);
 text=text.replace(/^Mountain biking here is mostly a May-to-October activity@BIKE@, so in (.+?) most trails are under snow; low valley trails are listed where they suit\.$/,(_,m)=>`Ici, le vélo de montagne se pratique surtout de mai à octobre@BIKE_FR@; en ${frm(m)}, la plupart des sentiers sont sous la neige. Les sentiers bas de la vallée sont proposés quand ils conviennent.`);
 text=text.replace(/^Nothing in (.+?) fits that, so these are the nearest, in (.+?)(?:, about (\d+) minutes’ drive)?\.$/,(_,a,b,m)=>`Rien à ${a} ne correspond; voici les plus proches, à ${b}${m?`, à environ ${m} minutes de route`:''}.`);
 text=text.replace(/^No place here is listed with (.+) for that, so these match the rest of your request\.$/,(_,f)=>`Aucun lieu ici n’est indiqué avec ${f.replace(/lake view/,'vue sur le lac').replace(/patio/,'terrasse').replace(/ and /g,' et ')} pour cela; voici ceux qui correspondent au reste de votre demande.`);
 text=text.replace(/^You set up camp at (.+) on day 1 and stay there each night\.$/,(_,n)=>`Vous installez le camp à ${n} le jour 1 et y restez chaque nuit.`);
 text=text.replace(/^You set up camp at (.+) in the late afternoon\.$/,(_,n)=>`Vous installez le camp à ${n} en fin d’après-midi.`);
 text=text.replace(/^Camping means a night away, so this is a 2-day plan; change the length if you like\.$/,'Le camping suppose une nuit sur place : voici donc un plan de 2 jours; modifiez la durée au besoin.');
 text=text.replace(/^No (dog-friendly )?(.+?) matched (?:in )?(.+), so the rest of the plan is shown\.$/,(_,dog,kind,where)=>`Aucun lieu (${FR_HEADING_NAMES[kind.toLowerCase()]||kind}${dog?', qui accepte les chiens':''}) ne correspond ${where==='@AREA@'?'@IN_AREA@':'à '+where.replace(/ and /g,' et ')}; voici le reste du plan.`);
 text=text.replace(/^Recognised: (.+)$/,(_,a)=>`Distinction : ${a}`);
 text=text.replace(/^There are no wineries in @AREA@, so these are wine bars and lounges instead\.$/,'Il n’y a pas de vignobles @IN_AREA@ : voici plutôt des bars à vin et des lounges.');
 text=text.replace(/^(.+) opens for the season on (\w+) (\d+), so this plan is for then\.$/,(_,n,m,d)=>`${n} ouvre pour la saison le ${d} ${({January:'janvier',February:'février',March:'mars',April:'avril',May:'mai',June:'juin',July:'juillet',August:'août',September:'septembre',October:'octobre',November:'novembre',December:'décembre'})[m]||m}; ce plan est donc pour cette date.`);
 text=text.replace(/^Nothing in (.+?) fits “(.+)”, so that stop is in (.+), a few minutes away\.$/,(_,a,w,b)=>`Rien à ${a.replace(/ and /g,' et ')} ne correspond à « ${w} »; cet arrêt est donc à ${b.replace(/ and /g,' et ')}, à quelques minutes.`);
 text=text.replace(/^(.+) was left out: it is closed for the season until (\w+) (\d+)\.$/,(_,n,m,d)=>`${n} a été écarté : il est fermé pour la saison jusqu’au ${d==='1'?'1er':d} ${({January:'janvier',February:'février',March:'mars',April:'avril',May:'mai',June:'juin',July:'juillet',August:'août',September:'septembre',October:'octobre',November:'novembre',December:'décembre'})[m]||m}.`);
 text=text.replace(/^(.+) is out of season in (\w+), so it isn’t in this plan\.$/,(_,n,m)=>`${n} est hors saison en ${({January:'janvier',February:'février',March:'mars',April:'avril',May:'mai',June:'juin',July:'juillet',August:'août',September:'septembre',October:'octobre',November:'novembre',December:'décembre'})[m]||m}; il ne fait donc pas partie de ce plan.`);
 text=text.replace(/^(.+) is closed for the season until (\w+) (\d+), so it isn’t in this plan\.$/,(_,n,m,d)=>`${n} est fermé pour la saison jusqu’au ${d==='1'?'1er':d} ${({January:'janvier',February:'février',March:'mars',April:'avril',May:'mai',June:'juin',July:'juillet',August:'août',September:'septembre',October:'octobre',November:'novembre',December:'décembre'})[m]||m}; il ne fait donc pas partie de ce plan.`);
 text=text.replace(/^(.+) is closed for the season with no reopening date listed, so it isn’t in this plan\.$/,(_,n)=>`${n} est fermé pour la saison, sans date de réouverture indiquée; il ne fait donc pas partie de ce plan.`);
 text=text.replace(/^Places within about (\d+) km of (.+)\.$/,(_,k,n)=>`Lieux à environ ${k} km de ${n}.`);
 text=text.replace(/^Day (\d+) is your ski day; the other days are off the hill\.$/,(_,d)=>`Le jour ${d} est votre journée de ski; les autres jours sont sans ski.`);
 text=text.replace(/^Days (.+) are off the hill\.$/,(_,d)=>`Les jours ${d.replace(/ and /g,' et ')} sont sans ski.`);
 text=text.replace(/^Day (\d+) is a day off the hill\.$/,(_,d)=>`Le jour ${d} est une journée sans ski.`);
 text=text.replace(/^Nothing in (.+?) fits that, so these are nearby in (.+)\.$/,(_,a,b)=>`Rien à ${a} ne correspond; voici des endroits à proximité, à ${b.replace(/ and /g,' et ')}.`);
 text=text.replace(/^Nothing in (.+?) fits an evening out, so this is in (.+?), a short drive away\.$/,(_,a,b)=>`Rien à ${a} ne convient pour une soirée; ce plan est donc à ${b.replace(/ and /g,' et ')}, à quelques minutes de route.`);
 text=text.replace(/^Including places a short drive from (.+)\.$/,(_,a)=>`Inclut des endroits à quelques minutes de route de ${a.replace(/ and /g,' et ')}.`);
 text=text.replace(/^Its listing mentions (.+)$/,(_,a)=>`Sa fiche mentionne : ${a}`);
 text=text.replace(/^A quick stop on the drive$/,'Un arrêt rapide sur la route');
 const accessPrefix='Access / schedule from the listing: “',accessSuffix='” Confirm access and scheduling with the operator before visiting.';
 if(text.startsWith(accessPrefix)&&text.endsWith(accessSuffix))return 'Accès / horaires selon la fiche (texte original) : « '+text.slice(accessPrefix.length,-accessSuffix.length)+' » Confirmez l’accès et les horaires auprès de l’exploitant avant de partir.';
 // Round 13 (2026-10-21): a window asked for after it started (server.js tripWindowClockNote).
 const frClock12=(h,m,ap)=>{let x=Number(h)%12+(ap==='PM'?12:0);return x===0&&m==='00'?'minuit':x+' h'+(m==='00'?'':' '+m);};
 // 2026-10-25: a ski hill between seasons is planned from the town below (server.js runTripPlan).
 text=text.replace(/^Most places at (.+?) are closed between seasons, so this plan is based in (.+?), about (\d+) minutes away\. Check (.+?)’s own site for its opening day\.$/,(_,h,t,n)=>'La plupart des lieux de '+h+' sont fermés entre les saisons : ce plan part donc de '+t+', à environ '+n+' minutes. Consultez le site de '+h+' pour sa date d’ouverture.');
 // 2026-10-25: matches closed for the season.
 const frSeasonWhen=(m)=>m?'en '+(FR_MONTHS_BY_EN[m]||m):'en ce moment', frReopens=(r,rm,rd)=>{if(!r)return '';const d='le '+(rd==='1'?'1er':rd)+' '+(FR_MONTHS_BY_EN[rm]||rm);return r==='It'?' Réouverture '+d+'.':' '+r+' rouvre '+d+'.';};
 text=text.replace(/^These places match but are closed for the season (?:in (\w+)|right now): (.+?)\.(?: (.+?) reopens (\w+) (\d{1,2})\.)? Ask again with a date in their season to plan them\.$/,(_,m,names,r,rm,rd)=>'Ces lieux correspondent, mais sont fermés pour la saison '+frSeasonWhen(m)+' : '+names.replace(/ and /g,' et ')+'.'+frReopens(r,rm,rd)+' Redemandez avec une date dans leur saison pour les planifier.');
 text=text.replace(/^(.+?) matches but is closed for the season (?:in (\w+)|right now)\.(?: (.+?) reopens (\w+) (\d{1,2})\.)? Ask again with a date in its season to plan it\.$/,(_,n,m,r,rm,rd)=>n+' correspond, mais est fermé pour la saison '+frSeasonWhen(m)+'.'+frReopens(r,rm,rd)+' Redemandez avec une date dans sa saison pour le planifier.');
 // Winery test 5 (2026-11-12): closed only that day (an owner's holiday closure), and a named place closed on the plan's day.
 const frDom=(d)=>d==='1'?'1er':d, FR_HOLIDAYS={'Christmas Eve':'la veille de Noël','Christmas Day':'Noël','Boxing Day':'le lendemain de Noël','New Year’s Eve':'la veille du jour de l’An','New Year’s Day':'le jour de l’An','Family Day':'le jour de la Famille','Good Friday':'le Vendredi saint','Easter Monday':'le lundi de Pâques'};
 const FR_SHORT_MONTHS_BY_EN={Jan:'janvier',Feb:'février',Mar:'mars',Apr:'avril',May:'mai',Jun:'juin',Jul:'juillet',Aug:'août',Sep:'septembre',Oct:'octobre',Nov:'novembre',Dec:'décembre'};
 text=text.replace(/^(.+?) matches but is closed on (\w+) (\d{1,2})\. Ask again with another date to plan it\.$/,(_,n,m,d)=>n+' correspond, mais est fermé le '+frDom(d)+' '+(FR_MONTHS_BY_EN[m]||m)+'. Essayez une autre date pour le planifier.');
 text=text.replace(/^These places match but are closed on (\w+) (\d{1,2}): (.+?)\. Ask again with another date to plan them\.$/,(_,m,d,n)=>'Ces lieux correspondent, mais sont fermés le '+frDom(d)+' '+(FR_MONTHS_BY_EN[m]||m)+' : '+n.replace(/ and (?!.* and )/,' et ')+'. Essayez une autre date pour les planifier.');
 text=text.replace(/^(.+) is closed on (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2})(?: for (.+?))?, so it isn’t in this plan\.$/,(_,n,m,d,h)=>n+' est fermé le '+frDom(d)+' '+FR_MONTHS_BY_EN[m]+(h?' ('+(FR_HOLIDAYS[h]||h).replace(/^(la|le|l’) /,'')+')':'')+'; il ne fait donc pas partie de ce plan.');
 text=text.replace(/^(.+) is closed (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s from (\w{3}) to (\w{3}), so it isn’t in this plan\.$/,(_,n,w,a,b)=>n+' est fermé le '+FR_HEADING_DAYS[w]+' de '+(FR_SHORT_MONTHS_BY_EN[a]||a)+' à '+(FR_SHORT_MONTHS_BY_EN[b]||b)+'; il ne fait donc pas partie de ce plan.');
 text=text.replace(/^(.+) is closed on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), so it isn’t in this plan\.$/,(_,n,w,m,d)=>n+' est fermé le '+FR_HEADING_DAYS[w]+' '+frDom(d)+' '+FR_MONTHS_BY_EN[m]+'; il ne fait donc pas partie de ce plan.');
 text=text.replace(/^(.+) is closed on your dates, so (.+) is not in this plan\.$/,(_,n,f)=>n+' est fermé à vos dates; '+f+' ne fait donc pas partie de ce plan.');
 // Audit fix (2026-10-27): a closed place named in the request (server.js tripNamedVenuePlan).
 text=text.replace(/^(.+) is closed for the season until (\w+) (\d{1,2}), (\d{4}), so it isn’t in this plan\.$/,(_,n,m,d,y)=>n+' est fermé pour la saison jusqu’au '+(d==='1'?'1er':d)+' '+(FR_MONTHS_BY_EN[m]||m)+' '+y+'; il ne fait donc pas partie de ce plan.');
 text=text.replace(/^(.+) is closed for the season and hasn’t announced when it reopens, so it isn’t in this plan\.$/,'$1 est fermé pour la saison et n’a pas encore annoncé sa réouverture; il ne fait donc pas partie de ce plan.');
 text=text.replace(/^(.+) are closed for the season and haven’t announced when they reopen, so they aren’t in this plan\.$/,(_,n)=>n.replace(/ and (?!.* and )/,' et ')+' sont fermés pour la saison et n’ont pas encore annoncé leur réouverture; ils ne font donc pas partie de ce plan.');
 text=text.replace(/^(.+) is closed right now, so it isn’t in this plan\.$/,'$1 est fermé en ce moment; il ne fait donc pas partie de ce plan.');
 text=text.replace(/^(.+) are closed right now, so they aren’t in this plan\.$/,(_,n)=>n.replace(/ and (?!.* and )/,' et ')+' sont fermés en ce moment; ils ne font donc pas partie de ce plan.');
 // Audit fix (2026-10-27): "tonight" asked after midnight is the coming evening (trip-planner.js planTrip).
 text=text.replace(/^It’s after midnight, so this plan is for (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) evening\.$/,(_,d)=>'Il est passé minuit; ce plan est donc pour '+FR_HEADING_DAYS[d]+' soir.');
 // Planner (2026-10-27): the happy hour crawl (server.js tripHappyHourCrawlPlan) and the long-wait filler (trip-planner.js closeIdleGaps).
 {
  const dayFr=(d)=>FR_HEADING_DAYS[d]||d;
  const frHhClock=(t)=>t.replace(/\bmidnight\b/g,'minuit').replace(/(\d{1,2})(?::(\d{2}))?–(\d{1,2})(?::(\d{2}))? (AM|PM)\b/g,(m,h1,m1,h2,m2,ap)=>{const a=frClock12(h1,m1||'00',Number(h1)<=Number(h2)||Number(h1)===12?ap:(ap==='PM'?'AM':'PM')),b=frClock12(h2,m2||'00',ap);return a+'–'+b;}).replace(/(\d{1,2})(?::(\d{2}))? (AM|PM)\b/g,(m,h,mm,ap)=>frClock12(h,mm||'00',ap));
  text=text.replace(/^Each stop is timed inside its happy hour on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), from the times on its @BRAND@ page\. Happy hours and deals change, so check before you go\.$/,(_,d)=>'Chaque arrêt est prévu pendant son happy hour le '+dayFr(d)+', selon les heures de sa fiche @BRAND@. Les happy hours et les offres changent; vérifiez avant de partir.');
  text=text.replace(/^Fewer than two places in (.+?) have happy hours on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) that line up one after another, so here are the places with happy hour instead\.$/,(_,t,d)=>'Moins de deux lieux à '+t+' ont des happy hours le '+dayFr(d)+' qui se suivent; voici donc plutôt les lieux avec un happy hour.');
  text=text.replace(/^It’s too late today for a happy hour crawl in (.+?): the happy hours that line up are over\. Tomorrow \((Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\) one can start at (\d{1,2})(?::(\d{2}))? (AM|PM)\. Here (are the places with happy hour|is an evening at the pubs) instead\.$/,(_,t,d,h,m,ap,k)=>'Il est trop tard aujourd’hui pour une tournée des happy hours à '+t+' : les happy hours qui se suivent sont terminés. Demain ('+dayFr(d)+'), elle peut commencer à '+frClock12(h,m||'00',ap)+(k[0]==='a'?'. Voici donc plutôt les lieux avec un happy hour.':'. Voici plutôt une soirée dans les pubs.'));
  text=text.replace(/^Happy hour (.+?) on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), from its listing$/,(_,w,d)=>'Happy hour '+frHhClock(w)+' le '+dayFr(d)+', selon sa fiche');
  text=text.replace(/^About a (\d+)-minute (walk|drive) from the stop before$/,(_,m,k)=>'À environ '+m+' minutes '+(k==='walk'?'à pied':'en voiture')+' de l’arrêt précédent');
  text=text.replace(/^A happy hour crawl in (.+?) (tonight|today|tomorrow|on (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))\.$/,(_,t,w)=>'Une tournée des happy hours à '+t+(w==='tonight'?' ce soir':w==='today'?' aujourd’hui':w==='tomorrow'?' demain':' '+dayFr(w.slice(3)))+'.');
  text=text.replace(/^Happy hour and dinner in (.+?) (tonight|today|tomorrow|on (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))\.$/,(_,t,w)=>'Happy hour et souper à '+t+(w==='tonight'?' ce soir':w==='today'?' aujourd’hui':w==='tomorrow'?' demain':' '+dayFr(w.slice(3)))+'.');
  if(text==='Dinner after the happy hours')return 'Souper après les happy hours';
  if(text==='Après')return 'Après-ski';
  text=text.replace(/^An après crawl in (.+?) (tonight|today|tomorrow|on (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))\.$/,(_,t,w)=>'Une tournée après-ski à '+t+(w==='tonight'?' ce soir':w==='today'?' aujourd’hui':w==='tomorrow'?' demain':' '+dayFr(w.slice(3)))+'.');
  text=text.replace(/^Après and dinner in (.+?) (tonight|today|tomorrow|on (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))\.$/,(_,t,w)=>'Après-ski et souper à '+t+(w==='tonight'?' ce soir':w==='today'?' aujourd’hui':w==='tomorrow'?' demain':' '+dayFr(w.slice(3)))+'.');
  if(text==='Dinner before the late happy hours')return 'Souper avant les happy hours de fin de soirée';
  if(text==='Fills the free time between stops')return 'Occupe le temps libre entre deux arrêts';
  if(text==='Free time')return 'Temps libre';
 }
 text=text.replace(/^It’s already late, so this plan is for tomorrow evening\.$/,'Il est déjà tard; ce plan est donc pour demain soir.');
 text=text.replace(/^It’s already evening, so this plan is for tomorrow afternoon\.$/,'Il est déjà le soir; ce plan est donc pour demain après-midi.');
 text=text.replace(/^It’s already afternoon, so this plan is for tomorrow morning\.$/,'Il est déjà l’après-midi; ce plan est donc pour demain matin.');
 text=text.replace(/^The (morning|afternoon|evening) has already started, so this plan starts at (\d{1,2}):(\d{2}) (AM|PM)\.$/,(_,w,h,m,a)=>({morning:'La matinée est déjà commencée',afternoon:'L’après-midi est déjà commencé',evening:'La soirée est déjà commencée'}[w])+'; ce plan commence donc à '+frClock12(h,m,a)+'.');
 const phrases=[
 ['Because you mentioned kids, kid-friendly places come first. Check ages and bookings with each place.','Comme vous voyagez avec des enfants, les lieux adaptés aux enfants passent en premier. Vérifiez l’âge requis et les réservations auprès de chaque lieu.'],['Because you mentioned kids, kid-friendly places, parks and beaches come first. Kid-Friendly is the badge @BRAND@ verifies.','Comme vous voyagez avec des enfants, les lieux adaptés aux enfants, les parcs et les plages passent en premier. Adapté aux enfants est le badge vérifié par @BRAND@.'],
 ['@BRAND_A@ Local Favourite','Un coup de cœur local @OF_BRAND@'],['One of @BRAND@’s Hidden Gems','L’un des trésors cachés @OF_BRAND@'],
 ['By the lake','Au bord du lac'],['A trail with a lake view','Un sentier avec vue sur le lac'],['A fun pick for teenagers','Une activité amusante pour les ados'],['Indoor fun for kids','Du plaisir à l’intérieur pour les enfants'],['A good rainy-day pick','Un bon choix pour un jour de pluie'],['An all-vegetarian or vegan kitchen','Une cuisine entièrement végétarienne ou végane'],['A good walk with your dog','Une belle promenade avec votre chien'],['A guided food tour','Une visite gourmande guidée'],
 ['Has the Kid-Friendly badge','Possède le badge Adapté aux enfants'],
 ['A restaurant suits a date night','Un restaurant convient à une soirée en amoureux'],
 ['Indoor kinds of places come first.','Les lieux intérieurs sont proposés en priorité.'],
 ['@BRAND@ doesn’t track the weather or confirm that a place is indoors, so check before you go.','@BRAND@ ne suit pas la météo et ne confirme pas si un lieu est intérieur; vérifiez avant de partir.'],
 ['Indoor suitability is not verified for every stop; check before visiting.','Le caractère intérieur n’est pas vérifié pour chaque arrêt; vérifiez avant de partir.'],
 ['Listed as an indoor venue','Répertorié comme lieu intérieur'],
 ['Meal option; indoor seating is not confirmed','Option de repas; les places à l’intérieur ne sont pas confirmées'],
 ['Indoor suitability is not confirmed','Le caractère intérieur n’est pas confirmé'],
 ['Timing conflict: ','Conflit d’horaire : '],
 ['Free time: one round of golf a day leaves this part of the day open.','Temps libre : une seule partie de golf par jour, ce moment de la journée reste libre.'],
 ['Optional suggestion: Extra stop added to round out the day','Suggestion facultative : arrêt supplémentaire ajouté pour compléter la journée'],
 ['Dinner is not scheduled because no listed restaurant can fit before ','Le souper n’est pas planifié : aucun restaurant selon les horaires indiqués ne peut tenir avant '],
 ['Your requested restaurant, ','Le restaurant que vous avez demandé, '],
 [' is not scheduled because it cannot fit before ',' n’est pas planifié, car il ne peut pas tenir avant '],
 [' with the listed hours and a 30-minute arrival allowance.',' avec les horaires indiqués et une marge d’arrivée de 30 minutes.'],
 ['No listed restaurant fits before the event and arrival allowance.','Aucun restaurant selon les horaires indiqués ne convient avant l’événement et la marge d’arrivée.'],
 ['Dinner was requested but no feasible pre-event restaurant stop could be scheduled.','Le souper était demandé, mais aucun restaurant ne peut être planifié avant l’événement.'],
 [' Try an earlier-opening restaurant or another date.',' Essayez un restaurant qui ouvre plus tôt ou choisissez une autre date.'],
 [' starts at ',' commence à '],
 [' has a listed start time. ',' a une heure de début indiquée. '],
 [' cannot fit before it with the listed hours and 30-minute arrival allowance.',' ne peut pas tenir avant avec les heures indiquées et une marge d’arrivée de 30 minutes.'],
 [' Its end time is not listed, so dinner after the event cannot be timed.',' Son heure de fin n’est pas indiquée; le souper après l’événement ne peut donc pas être planifié.'],
 [' Confirm the event-to-restaurant travel and opening hours before scheduling dinner afterward.',' Confirmez le trajet entre l’événement et le restaurant ainsi que les heures d’ouverture avant de prévoir le souper après.'],
 [' Try an earlier-opening restaurant or another date.',' Essayez un restaurant qui ouvre plus tôt ou choisissez une autre date.'],
 ['Possible dinner arrival window ','Fenêtre d’arrivée possible pour le souper : '],
 [', if travel permits.',', si le trajet le permet.'],
 [' minutes for dinner within listed opening hours.',' minutes pour le souper dans les horaires indiqués.'],
 ['Allows ','Prévoit '],
 ['This is not a scheduled visit: confirm the event-to-restaurant journey and kitchen service before booking.','Aucune visite n’est programmée : confirmez le trajet entre l’événement et le restaurant ainsi que le service en cuisine avant de réserver.'],
 ['This stop’s opening hours are not verified.','Les horaires de cet arrêt ne sont pas vérifiés.'],
 ['Opening hours are taken from listing text and remain provisional.','Les horaires proviennent du texte de la fiche et restent provisoires.'],
 ['This visit fits the listed opening hours.','Cette visite respecte les horaires indiqués.'],
 ['Timing remains provisional because a preceding stop is provisional.','L’horaire reste provisoire parce qu’un arrêt précédent est provisoire.'],
 ['Confirm visit duration, opening hours and travel before relying on this schedule.','Confirmez la durée de visite, les horaires et le trajet avant de suivre cet horaire.'],
 ['Trail duration is not verified.','La durée du sentier n’est pas vérifiée.'],
 ['No usable hours listed on @BRAND@ — check before you go','Aucun horaire utilisable indiqué sur @BRAND@ — vérifiez avant de partir'],
 ['Sports & Recreation Venue','Lieu de sports et loisirs'], ['Sports & recreation venues','Lieux de sports et loisirs'], ['sports & recreation venues','lieux de sports et loisirs'],

 ['omitted the optional afternoon meal for your late start; dinner remains in the plan.','le repas facultatif de l’après-midi a été retiré pour votre départ tardif; le souper reste au programme.'],
 ['Estimated daylight ','Lumière du jour estimée : '],['-minute margin before sunset.',' minutes de marge avant le coucher du soleil.'],['Terrain and weather can reduce usable light.','Le relief et la météo peuvent réduire la lumière disponible.'],['This outdoor visit falls outside the estimated daylight window. Start earlier or choose a shorter activity.','Cette visite en plein air dépasse la fenêtre de lumière estimée. Partez plus tôt ou choisissez une activité plus courte.'],['Daylight timing is unverified: confirm the date, location and visit duration before planning this outdoor stop.','La lumière du jour n’est pas vérifiée : confirmez la date, le lieu et la durée avant de planifier cet arrêt en plein air.'],
 ['Short easy walk selected; 30–60-minute planning allowance, not a verified trail duration.','Promenade facile courte sélectionnée; prévoyez de 30 à 60 minutes, sans durée de sentier vérifiée.'],
 ['Uses timing from listing text; confirm the chosen trail and any temporary closures.','Utilise les horaires du texte de la fiche; confirmez le sentier choisi et les fermetures temporaires.'],
 ['Uses planning allowances for visit length and travel.','Durées et trajets estimés pour la planification.'],
 ['Sports visit length is a planning allowance, not a verified session or booking; confirm access, opening hours and the route with the operator.','La durée de l’activité sportive est une estimation de planification, pas une séance ni une réservation confirmée; confirmez l’accès, les horaires et le parcours auprès de l’exploitant.'],
 ['Provisional visit ','Visite provisoire : '],['Opening hours or the preceding sequence are not verified.','Les horaires ou la séquence précédente ne sont pas vérifiés.'],['Uses planning allowances for visit length and travel. Trail duration is not verified.','Durées et trajets estimés pour la planification. La durée du sentier n’est pas vérifiée.'],['Confirm trail duration, opening hours and the route before relying on this schedule.','Confirmez la durée du sentier, les horaires et le parcours avant de suivre cet horaire.'],
 ['Visit timing is unverified: hours, duration, transfer or the preceding stop could not be timed. Confirm before following this sequence.','Horaire non vérifié : les heures d’ouverture, la durée, le trajet ou l’arrêt précédent n’ont pas pu être établis. Confirmez avant de suivre cet itinéraire.'],
 ['This visit cannot fit before the listed closing time in the estimated sequence. Change the start time or choose another stop.','Cette visite ne peut pas se terminer avant la fermeture selon cet horaire estimé. Changez l’heure de départ ou choisissez un autre arrêt.'],
 ['This visit cannot fit before the event with the arrival allowance and listed opening hours. Choose an earlier start or move the meal after the event.','Cette visite ne tient pas avant l’événement avec la marge d’arrivée et les horaires indiqués. Partez plus tôt ou prenez le repas après l’événement.'],
 ['The event’s end time is not listed; check that any later stop fits before making plans.','L’heure de fin de l’événement n’est pas indiquée; confirmez que les arrêts suivants sont possibles.'],
 ['Event start time is not listed; confirm it before following this sequence.','L’heure de début n’est pas indiquée; confirmez-la avant de suivre cet itinéraire.'],
 ['Confirm the event duration and allow time around its listed start.','Confirmez la durée de l’événement et prévoyez une marge autour de son début.'],
 ['The preceding visit and arrival allowance cannot fit before the listed start. Choose an earlier meal or move it after the event.','La visite précédente et la marge d’arrivée ne tiennent pas avant le début indiqué. Prenez le repas plus tôt ou après l’événement.'],
 ['This is a planning estimate, not a verified road route.','Il s’agit d’une estimation de planification, pas d’un trajet routier vérifié.'],
 ['Visit length and transfers are estimates; confirm before visiting.','La durée des visites et les trajets sont estimés; confirmez avant de partir.'],
 ['Leaves a 30-minute arrival allowance before the event; event travel time still needs confirmation.','Prévoit une marge d’arrivée de 30 minutes avant l’événement; le trajet reste à confirmer.'],
 ['Event travel time is unverified; confirm the route and allow arrival time before the event.','Le trajet vers l’événement n’est pas vérifié; confirmez le parcours et prévoyez une marge d’arrivée.'],
 ['Visits after the event remain unverified until its duration and travel time are confirmed.','Les visites après l’événement restent non vérifiées tant que sa durée et le trajet ne sont pas confirmés.'],
 ['Visits after the event remain unverified until travel time is confirmed.','Les visites après l’événement restent non vérifiées tant que le trajet n’est pas confirmé.'],
 ['Listed hours vary by day — see the venue page','Les horaires varient selon le jour — consultez la fiche'],
 // Round 15 (2026-10-20): every plan is timed; an undated one says its times are a suggestion.
 ['Times are a suggested schedule for a typical day; check each place’s hours before you go.','Les heures sont un horaire suggéré pour une journée type; vérifiez les heures de chaque lieu avant de partir.'],
 ['shorter transfers are preferred. Confirm the route.','les trajets plus courts sont privilégiés. Confirmez le parcours.'],
 // Round 7 (2026-10-19): an event with no listed end time gets an allowance, and the day carries on from it.
 ['Later visits are timed from the end shown here.','Les visites suivantes partent de la fin indiquée ici.'],
 ['Listed event start ','Début indiqué de l’événement : '],['; listed end ','; fin indiquée : '],['; event duration is not listed','; durée de l’événement non indiquée'],
 ['Estimated visit ','Visite estimée : '],['within listed hours','pendant les heures indiquées'],['; uses an assumed start time','; heure de départ supposée'],
 ['Estimated driving assumed travel','Trajet estimé en voiture (mode supposé)'],['Estimated walking travel','Trajet estimé à pied'],[' travel to the event:',' vers l’événement :'],
 ['; allow 30 minutes for arrival','; prévoyez 30 minutes pour l’arrivée'],['Listed hours:','Horaires indiqués :'],
 ['Matches your request for a comedy show','Correspond à votre demande de spectacle d’humour'],['Matches your request for a show','Correspond à votre demande de spectacle'],
 ['Matches your request for a concert','Correspond à votre demande de concert'],['Matches your request for live music','Correspond à votre demande de musique en direct'],
 ['Matches your request for a hockey game','Correspond à votre demande de match de hockey'],['Matches your request for a festival','Correspond à votre demande de festival'],
 ['Matches your request for a market','Correspond à votre demande de marché'],['Matches your request for an event','Correspond à votre demande d’événement'],['A sit-down dinner to end the day','Un souper au restaurant pour finir la journée'],['Optional: something different after the lifts close','Facultatif : autre chose après la fermeture des remontées'],['Optional — skip it to keep skiing','Facultatif — sautez-le pour continuer à skier'],
 ['Matches your request for ','Correspond à votre demande : '],[', where the event is',', où a lieu l’événement'],
 ['Its description mentions','Sa description mentionne'],['Listed on @BRAND@ for','Répertorié sur @BRAND@ pour'],['Has the verified','Possède le badge vérifié'],
 ['Event start time is not listed; confirm before visiting.','L’heure de début n’est pas indiquée; confirmez avant de partir.'],
 ['Matched a dated event occurrence.','Correspond à une occurrence datée de l’événement.'],['Matched an actual listing.','Correspond à une fiche existante.'],['No selected stop matches this exclusion.','Aucun arrêt choisi ne correspond à cette exclusion.'],['A selected stop conflicts with this exclusion.','Un arrêt choisi contredit cette exclusion.'],
 ['Wheelchair access isn’t listed on @BRAND@, so check with each place before you go.','L’accès en fauteuil roulant n’est pas indiqué sur @BRAND@; vérifiez auprès de chaque lieu avant de partir.'],
 ['Group seating isn’t listed on @BRAND@, so book ahead for a large group.','Les places pour les groupes ne sont pas indiquées sur @BRAND@; réservez à l’avance pour un grand groupe.'],
 ['Exact costs aren’t listed on @BRAND@; the plan favours lower price levels where they are known.','Les coûts exacts ne sont pas indiqués sur @BRAND@; le plan privilégie les prix plus bas lorsqu’ils sont connus.'],
 ['Places with higher listed prices are left out; not every place lists a price, so check before you go.','Les lieux aux prix indiqués plus élevés sont exclus; tous les lieux n’indiquent pas leurs prix, alors vérifiez avant de partir.'],
 ['No indoor backup could be fitted into this plan.','Aucune option intérieure n’a pu être intégrée à ce plan en cas de pluie.'],
 ['You asked for one dinner, so it is planned once and the other evenings are left free.','Vous avez demandé un seul souper : il est prévu une fois et les autres soirées restent libres.'],
 ['First tasting of the day','Première dégustation de la journée'],['Second tasting of the day','Deuxième dégustation de la journée'],['Lunch between the wineries','Dîner entre les vignobles'],['Lunch at the hill','Dîner à la station'],['A lunch stop for the day','Un arrêt pour le dîner'],['A lunch stop between the morning and afternoon','Un arrêt pour le dîner entre le matin et l’après-midi'],
 ['Après-ski and dinner at the hill','Après-ski et souper à la station'],
 // Round 8 (2026-10-19): new reasons and event "why" lines.
 ['Lunch on the hill, between runs','Dîner sur la montagne, entre deux descentes'],['You asked for this place','Vous avez demandé cet endroit'],['One of @AREA@’s best-known sights','L’un des sites les plus connus @OF_AREA@'],['A night out after dinner','Une sortie après le souper'],['Listed for winter on @BRAND@','Indiqué pour l’hiver sur @BRAND@'],['The ski hill','La station de ski'],['Groomed cross-country trails','Pistes de ski de fond damées'],['Snowshoe trails','Sentiers de raquette'],['Whistler’s lift-access bike park','Le parc de vélo de Whistler, accessible par remontée'],['Not listed as dog-friendly on @BRAND@, so plan this one without your dog or check with them first','Pas indiqué comme acceptant les chiens sur @BRAND@ : prévoyez cet arrêt sans votre chien ou renseignez-vous d’abord'],['Breweries, lounges and group-friendly places come first for a group trip.','Pour un voyage en groupe, les brasseries, les bars-salons et les endroits adaptés aux groupes passent en premier.'],['In the cold months the big hikes are under snow, so these are winter adventures instead.','Pendant les mois froids, les grandes randonnées sont sous la neige; voici plutôt des aventures d’hiver.'],['A quick stop on the drive','Un arrêt rapide sur la route'],['Après-ski in the village','Après-ski au village'],['A soak after the lifts close','Une détente après la fermeture des remontées'],['Lunch at a winery that serves food, so it is a tasting too','Dîner dans un vignoble qui sert à manger : c’est aussi une dégustation'],
 ['A lunch stop, so the day doesn’t skip a meal','Un arrêt pour dîner, pour ne pas sauter de repas'],['Fills the free time in the afternoon','Occupe le temps libre de l’après-midi'],
 ['A Halloween event on your dates','Un événement d’Halloween à vos dates'],['A family event on What’s On that day','Un événement familial à l’affiche ce jour-là'],
 ['Listed on What’s On, with its start time','À l’affiche sur @BRAND@, avec son heure de début'],['Listed on What’s On for that day','À l’affiche sur @BRAND@ ce jour-là'],
 ['A viewpoint or walk before the tastings','Un point de vue ou une promenade avant les dégustations'],['Also planned on an earlier evening — few dinner spots at the hill are listed on @BRAND@','Déjà prévu un autre soir — peu de restaurants de la station sont répertoriés sur @BRAND@'],
 // Build My Trip gaps (2026-10-18): counted wine days, the late-afternoon tasting, special dinners, empty results.
 // French gaps (2026-10-18): the occasion notes still in English.
 ['Picked with a date night in mind, based on each place’s type, badges and description.','Choisis pour une soirée en amoureux, selon le type, les badges et la description de chaque lieu.'],
 ['Picked with romance in mind, based on each place’s type, badges and description.','Choisis pour une sortie romantique, selon le type, les badges et la description de chaque lieu.'],
 ['Family-friendly places come first. Kid-Friendly is the badge @BRAND@ verifies.','Les lieux familiaux passent en premier. Adapté aux enfants est le badge vérifié par @BRAND@.'],
 ['Active outdoor stops come first: adventure, hiking, cycling and water.','Les sorties actives en plein air passent en premier : aventure, randonnée, vélo et activités nautiques.'],
 ['Late afternoon','Fin d’après-midi'],['Third tasting of the day','Troisième dégustation de la journée'],['Fourth tasting of the day','Quatrième dégustation de la journée'],['Another tasting','Une autre dégustation'],
 ['Lunch at a winery’s own kitchen, so it is a tasting too','Dîner à la cuisine d’un vignoble : c’est aussi une dégustation'],
 ['No $$$ or fine-dining restaurant open that evening is listed nearby on @BRAND@, so this is the best sit-down dinner left','Aucun restaurant $$$ ou gastronomique ouvert ce soir-là n’est répertorié à proximité sur @BRAND@; voici le meilleur souper au restaurant restant'],
 ['No @BRAND@ listings match every part of that request.','Aucune fiche @OF_BRAND@ ne correspond à toutes les parties de cette demande.'],
 ['We couldn’t work out a plan from that request yet.','Nous n’avons pas encore pu établir un plan à partir de cette demande.'],
 ['Avoids pubs, cocktail bars and technical climbing for a family trip','Évite les pubs, les bars à cocktails et l’escalade technique pour un voyage en famille'],
 ['No matching event was scheduled for the requested dates.','Aucun événement correspondant n’a été prévu aux dates demandées.'],['Not met:','Non satisfait :'],['Not verified:','Non vérifié :'],['hockey game','match de hockey'],['live music','musique en direct'],['sports event','événement sportif']
 ];
 // Planner realism pass (2026-10-18).
 phrases.push(['Early evening','Début de soirée'],['Night','Soirée'],['Opening hours, visit lengths and drive times are estimates.','Les horaires, les durées de visite et les trajets sont des estimations.'],['Dinner is the last drive of each day, so nothing after it needs a car.','Le souper est le dernier trajet en voiture de chaque jour; rien après ne demande de voiture.']);
 // Build My Trip pass 5 (2026-10-19): the notes, reasons and checks still shown in English on /fr.
 phrases.push(
  ['Stops are timed against each venue’s listed hours on @BRAND@ where it has them; hours can change, so check before you go.','Les arrêts sont planifiés selon les horaires indiqués sur @BRAND@ lorsqu’ils existent; les horaires peuvent changer, alors vérifiez avant de partir.'],
  ['Stops are checked against each venue’s listed hours on @BRAND@ where it has them; hours can change, so check before you go.','Les arrêts sont vérifiés selon les horaires indiqués sur @BRAND@ lorsqu’ils existent; les horaires peuvent changer, alors vérifiez avant de partir.'],
  ['Budget ranks venues with a known price; venues without price data are never excluded and their price is never inferred.','Le budget classe les lieux dont le prix est connu; les lieux sans prix ne sont jamais exclus et leur prix n’est jamais deviné.'],
  ['No trip length was given, so this is a one-day plan.','Aucune durée n’a été indiquée : voici un plan d’une journée.'],
  ['No region was given, so these stops were chosen in the same community, anywhere in @STRETCH@.','Aucune région n’a été indiquée : ces arrêts ont été choisis dans une même localité @OF_STRETCH@.'],
  ['Some stops have no map location on file; they were chosen within the same community, but their distance from the other stops isn’t measured.','Certains arrêts n’ont pas de position sur la carte; ils ont été choisis dans la même localité, mais leur distance des autres arrêts n’est pas mesurée.'],
  ['Events aren’t checked for dogs; the dog-friendly requirement applies to the places.','Les événements ne sont pas vérifiés pour les chiens; l’exigence « chiens acceptés » s’applique aux lieux.'],
  ['No live-music event is listed for those dates, so places with a verified Live Music badge are suggested instead.','Aucun spectacle de musique n’est répertorié à ces dates; des lieux avec le badge vérifié Musique en direct sont proposés à la place.'],
  ['Price level $ fits your budget preference','Niveau de prix $ : convient à votre budget'],['Price level $$ fits your budget preference','Niveau de prix $$ : convient à votre budget'],['Price level $$$ fits your budget preference','Niveau de prix $$$ : convient à votre budget'],
  ['A drink first','Un verre pour commencer'],['What to expect','À quoi s’attendre'],['Matched an actual listing.','Correspond à une fiche existante.'],
  ['live show','spectacle'],['comedy show','spectacle d’humour']
 );
 // Reason lines built from a badge, a type and an occasion, or a word in the description (2026-10-19: "Has the Lake View
 // badge", "A restaurant suits a romantic outing" and "mentions “cozy”" were still English on /fr/trip).
 const FR_BADGES={'Lake View':'Vue sur le lac',Patio:'Terrasse','Kid-Friendly':'Adapté aux enfants','Dog-Friendly':'Accepte les chiens','Vegan-Friendly':'Options véganes','Vegetarian-Friendly':'Options végétariennes','Gluten-Free':'Sans gluten','Live Music':'Musique en direct','Great for Groups':'Idéal pour les groupes','Happy Hour':'5 à 7','Sports TV':'Sports à la télé','Non-Alcoholic':'Options sans alcool','Non-Alcoholic Options':'Options sans alcool'};
 const FR_TYPES={restaurant:'Un restaurant',winery:'Un vignoble',cafe:'Un café',café:'Un café',brewery:'Une microbrasserie',cidery:'Une cidrerie',pub:'Un pub','cocktail lounge':'Un bar à cocktails',distillery:'Une distillerie',beach:'Une plage','outdoor destination':'Un lieu de plein air','golf course':'Un terrain de golf',tour:'Une visite','indoor attraction':'Une attraction intérieure',indoor:'Un lieu intérieur',sport:'Un lieu sportif'};
 const FR_OCCASIONS={'romantic outing':'une sortie romantique','date night':'une soirée en amoureux','family trip':'un voyage en famille','rainy day':'un jour de pluie',celebration:'une célébration','group getaway':'une escapade en groupe','relaxing getaway':'une escapade relaxante',adventure:'une aventure','adults-only trip':'un voyage entre adultes'};
 const FR_WORDS={romantic:'romantique',intimate:'intime',candlelit:'aux chandelles','candle lit':'aux chandelles','date night':'soirée en amoureux',sunset:'coucher de soleil',cozy:'chaleureux',cosy:'chaleureux','year-round':'toute l’année'};
 text=text.replace(/^Has the (.+) badge$/,(raw,b)=>FR_BADGES[b]?'Possède le badge '+FR_BADGES[b]:raw);
 text=text.replace(/^An? (.+?) suits an? (.+)$/,(raw,t,o)=>FR_TYPES[t.toLowerCase()]&&FR_OCCASIONS[o]?FR_TYPES[t.toLowerCase()]+' convient à '+FR_OCCASIONS[o]:raw);
 text=text.replace(/^Its description mentions “(.+)”$/,(_,w)=>'Sa description mentionne « '+(FR_WORDS[w]||w)+' »');
 // Audit fix (2026-10-27): the weekly nights and specials a place lists (trip-planner.js scoreVenue), and a named place.
 const FR_NIGHTS={trivia:'un quiz',karaoke:'un karaoké',bingo:'un bingo','open mic':'une scène ouverte',comedy:'une soirée humour','run club':'un club de course','games night':'une soirée jeux','paint night':'une soirée peinture','live music':'de la musique live'};
 const frNightClock=(t)=>{const m=/^(\d{1,2})(?::(\d{2}))? (AM|PM)$/.exec(t||'');if(!m)return t;const h=Number(m[1])%12+(m[3]==='PM'?12:0);return h+' h'+(m[2]?' '+m[2]:'');};
 text=text.replace(/^(Trivia|Karaoke|Bingo|Open mic|Comedy|Run club|Games night|Paint night|Live music) on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?: from (\d{1,2}(?::\d{2})? [AP]M))?, from its listing$/,(_,k,d,t)=>{const fr=FR_NIGHTS[k.toLowerCase()];return fr?(fr.charAt(0).toUpperCase()+fr.slice(1))+' le '+FR_HEADING_DAYS[d]+(t?' à '+frNightClock(t):'')+', selon sa fiche':_;});
 text=text.replace(/^Hosts (trivia|karaoke|bingo|open mic|comedy|run club|games night|paint night) on (.+), from its listing$/,(raw,k,ds)=>{const days=ds.split(/, | and /).map(x=>FR_HEADING_DAYS[x.replace(/s$/,'')]);return days.every(Boolean)?'Accueille '+FR_NIGHTS[k]+' le '+days.join(', ').replace(/, (?!.*, )/,' et ')+', selon sa fiche':raw;});
 text=text.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) special: (.+)$/,(_,d,t)=>'Spécial du '+FR_HEADING_DAYS[d]+' : '+t);
 text=text.replace(/^Weekly special: (.+)$/,'Spécial de la semaine : $1');
 if(text==='The place you named')return 'Le lieu que vous avez nommé';
 // Round 12 (2026-10-20): copy added in round 11 that was still English on /fr/trip.
 phrases.push(['Something to eat between the tastings','De quoi manger entre les dégustations'],['A Christmas event on your dates','Un événement de Noël à vos dates'],['A family Christmas event on your dates','Un événement familial de Noël à vos dates'],['A last drink','Un dernier verre'],['Also planned on an earlier day — few lunch spots at the hill are listed on @BRAND@','Déjà prévu un autre jour — peu d’endroits pour dîner à la montagne sont répertoriés sur @BRAND@']);
 text=text.replace(/^Its listed hours only overlap part of the (morning|midday|afternoon|late afternoon|early evening|evening) — check before you go$/,(_,part)=>'Ses horaires indiqués ne couvrent qu’une partie '+{morning:'de la matinée',midday:'du midi',afternoon:'de l’après-midi','late afternoon':'de la fin d’après-midi','early evening':'du début de soirée',evening:'de la soirée'}[part]+' — vérifiez avant de partir');
 // An advisory with no French notice of its own (venue.advisoryFr is used first): its known opening, never the English.
 text=text.replace(/^Advisory on @BRAND@: (.+)$/,(_,n)=>'Avis @OF_BRAND@ : '+([[/^permanently closed\b/i,'Fermé définitivement.'],[/^temporarily closed\b/i,'Fermé temporairement.'],[/^closed for the season\b/i,'Fermé pour la saison.'],[/\bby appointment\b/i,'Visites ou dégustations sur rendez-vous seulement.'],[/\bswimming advisory\b/i,'Avis de baignade en vigueur.'],[/\broad\b|\bconstruction\b|\bdetour\b/i,'Travaux ou accès routier modifié.'],[/\bclosed\b/i,'Fermeture signalée.']].find(([re])=>re.test(n))||[null,'Une condition temporaire touche cet endroit.'])[1]+' Consultez la fiche avant d’y aller.');
 text=text.replace(/^By appointment, from the listing: “(.+)” Book ahead\.$/,(_,q)=>'Sur rendez-vous, selon la fiche (texte original) : « '+q+' » Réservez à l’avance.');
 text=text.replace(/^By appointment only \(the winery’s own answer\)\. Book ahead\.$/,'Sur rendez-vous seulement (réponse du vignoble). Réservez à l’avance.');
 text=text.replace(/^By appointment only \(the distillery’s own answer\)\. Book ahead\.$/,'Sur rendez-vous seulement (réponse de la distillerie). Réservez à l’avance.');
 // Brewery test 1 (2026-11-12): a brewery's or pub's own time for minors on a kids trip.
 text=text.replace(/^Kids welcome with an adult until (\d{1,2}(?::\d{2})? [AP]M|midnight)(, so plan to leave by then)?$/,(_,t,late)=>'Enfants bienvenus avec un adulte jusqu’à '+(t==='midnight'?'minuit':frNightClock(t))+(late?'; prévoyez de partir avant':''));
 // Brewery test 4 (2026-11-13): a meal at a brewery's or pub's own kitchen, with its kitchen close time.
 text=text.replace(/^(Dinner|Lunch) at (.+?) \((?:kitchen until (\d{1,2}(?::\d{2})? [AP]M|midnight)|its own kitchen)\)$/,(_,m,n,t)=>(m==='Lunch'?'Dîner':'Souper')+' à '+n+(t?' (cuisine jusqu’à '+(t==='midnight'?'minuit':frNightClock(t))+')':' (sa propre cuisine)'));
 // Slot labels made of category names joined with "or" ("wineries, breweries or cocktail lounges"): French names, « ou ».
 const FR_KIND_NAMES={wineries:'vignobles',winery:'vignoble',breweries:'microbrasseries',brewery:'microbrasserie',cideries:'cidreries',cidery:'cidrerie','cocktail lounges':'bars à cocktails','cocktail lounge':'bar à cocktails',pubs:'pubs',pub:'pub',cafes:'cafés',cafe:'café',cafés:'cafés',restaurants:'restaurants',restaurant:'restaurant','outdoor destinations':'lieux de plein air','outdoor destination':'lieu de plein air','indoor & rainy day spots':'lieux intérieurs et jours de pluie',indoor:'lieu intérieur','art galleries':'galeries d’art','art gallery':'galerie d’art',museums:'musées',museum:'musée',shops:'boutiques',shop:'boutique',spas:'spas',spa:'spa','yoga studios':'studios de yoga','yoga studio':'studio de yoga','museums & galleries':'musées et galeries','museum or gallery':'musée ou galerie',beaches:'plages',beach:'plage','golf courses':'terrains de golf','golf course':'terrain de golf','tours & experiences':'visites et expériences',tour:'visite',distilleries:'distilleries',distillery:'distillerie','sports & recreation venues':'lieux de sports et loisirs','sports & recreation venue':'lieu de sports et loisirs'};
 const kinds=text.split(/, | or /);
 if(kinds.length>1&&/ or /.test(text)&&kinds.every(k=>FR_KIND_NAMES[k.toLowerCase()])){const out=kinds.map(k=>FR_KIND_NAMES[k.toLowerCase()]);const joined=out.slice(0,-1).join(', ')+' ou '+out[out.length-1];return /^[A-Z]/.test(text)?joined.charAt(0).toUpperCase()+joined.slice(1):joined;}
 for(const [a,b] of phrases)text=text.split(a).join(b);
 text=text.replace(/^Day (\d+): Confirm times before you go\. /,'Jour $1 : confirmez les heures avant de partir. ');
 const frDay=d=>({Monday:'lundi',Tuesday:'mardi',Wednesday:'mercredi',Thursday:'jeudi',Friday:'vendredi',Saturday:'samedi',Sunday:'dimanche'}[d]||d);
 const frMon=m=>({January:'janvier',February:'février',March:'mars',April:'avril',May:'mai',June:'juin',July:'juillet',August:'août',September:'septembre',October:'octobre',November:'novembre',December:'décembre','the fall':'l’automne','the off-season':'la basse saison',winter:'l’hiver',spring:'le printemps',summer:'l’été'}[m]||m);
 text=text.replace(/^Listed hours (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday): /,(_,d)=>'Horaires indiqués le '+frDay(d)+' : ');
 text=text.replace(/^Day (\d+) is planned as a (\w+)\.$/,(_,n,d)=>'Le jour '+n+' est planifié comme un '+frDay(d)+'.');
 text=text.replace(/^Hours were checked for (\w+) \(@TIME@ time\)\.$/,(_,d)=>'Les horaires ont été vérifiés pour '+frDay(d)+' (heure @OF_AREA@).');
 text=text.replace(/^Planned for (.+?)(?: \(@TIME@ time\))?: seasonal (?:places|activities) such as .+, and nothing is left out for the season alone\.$/,(_,m)=>'Planifié pour '+frMon(m)+' : les lieux saisonniers (plages, activités nautiques, ski, camping, golf extérieur) sont classés selon la période de l’année, sans rien exclure pour la seule saison.');
 text=text.replace(/^Planned for (.+?) \(@TIME@ time\): seasonal activities such as swimming, paddling, skiing, camping and outdoor golf are planned for the time of year, and places that are out of season then are left out\.$/,(_,m)=>'Planifié pour '+frMon(m)+' (heure @OF_AREA@) : la baignade, la pagaie, le ski, le camping et le golf extérieur suivent la saison, et les lieux hors saison sont écartés.');
 text=text.replace(/^Hours shown are each place’s current listed hours on @BRAND@ and can change by season, so check them before you go in (.+)\.$/,(_,m)=>'Les horaires affichés sont ceux indiqués actuellement sur @BRAND@ et peuvent changer selon la saison; vérifiez-les avant de partir en '+frMon(m)+'.');
 text=text.replace(/^Day (\d+) is planned around your (.+)\.$/,'Le jour $1 est planifié autour de votre demande : $2.');
 text=text.replace(/^No single region was given, so the plan moves through (.+) from north to south\.$/,(_,t)=>'Aucune région n’a été indiquée : le plan traverse '+t.replace(/ and (?!.* and )/,' et ')+' du nord au sud.');
 text=text.replace(/^Planned as a one-day drive from (.+?) to (.+)\.$/,(_,a,b)=>`Prévu comme un trajet d’une journée de ${a} à ${b}.`);
 text=text.replace(/^No single region was given, so the plan moves through (.+) from south to north\.$/,(_,t)=>'Aucune région n’a été indiquée : le plan traverse '+t.replace(/ and (?!.* and )/,' et ')+' du sud au nord.');
 text=text.replace(/^(\d+) days? planned\.$/,(_,n)=>n+(n==='1'?' jour prévu.':' jours prévus.'));
 text=text.replace(/Found for (\d+) of (\d+) evenings; nothing matching is listed on What’s On for day ([\d, and]+)\./,(_,a,b,d)=>'Trouvé pour '+a+' soirée'+(a==='1'?'':'s')+' sur '+b+'; rien de correspondant n’est répertorié à l’affiche pour le jour '+d.replace(/ and (?!.* and )/,' et ')+'.');
 text=text.replace(/^No winery with its own kitchen fits lunch on day (\d+)( in (.+))?, so lunch is at a restaurant near the wineries\.$/,(_,d,w,t)=>'Aucun vignoble avec sa propre cuisine ne convient pour le dîner du jour '+d+(t?' à '+t.replace(/ and (?!.* and )/,' et '):'')+'; le dîner est donc dans un restaurant près des vignobles.');
 text=text.replace(/^Lunch here could not start until ([\d:]+) on (\S+) under its listed hours, so it does not fit a midday meal\. Choose another lunch spot nearby\.$/,'Selon ses horaires indiqués, le dîner ici ne pourrait pas commencer avant $1 le $2; il ne convient donc pas pour le midi. Choisissez un autre endroit à proximité.');
 text=text.replace(/^(.+): Lunch here could not start until ([\d:]+) on (\S+) under its listed hours, so it does not fit a midday meal\. Choose another lunch spot nearby\.$/,'$1 : selon ses horaires indiqués, le dîner ici ne pourrait pas commencer avant $2 le $3; il ne convient donc pas pour le midi. Choisissez un autre endroit à proximité.');
 // Round 7 (2026-10-19): the event allowance, skiing out of season, lunch at a winery.
 text=text.replace(/; its end time isn’t listed, so about ([\d.]+) hours are allowed/,(_,h)=>'; heure de fin non indiquée, environ '+h.replace('.',',')+' h prévues');
 if(text==='Rough access road — the listing says to check your vehicle can make it')return 'Route d’accès difficile — selon la fiche, vérifiez que votre véhicule peut s’y rendre'; // 2026-10-25
 if(text==='A skating rink')return 'Une patinoire'; // 2026-10-25
 if(text==='On the water')return 'Sur l’eau'; // 2026-10-25
 text=text.replace(/^Nothing in (.+?) itself matched, so this includes (.+) nearby\.$/,(_,a,b)=>'Rien à '+a+' même ne correspondait; ce plan inclut donc '+b.replace(/ and /g,' et ')+', tout près.'); // 2026-10-25
 if(text==='A dog beach or off-leash area')return 'Une plage pour chiens ou une aire sans laisse'; // 2026-10-25
 text=text.replace(/^A beach day suits (\w+)$/,(raw,m)=>FR_MONTHS_BY_EN[m]?'Une journée à la plage convient en '+FR_MONTHS_BY_EN[m]:raw); // 2026-10-25
 // Audit fix (2026-10-27): the resort's own opening day.
 text=text.replace(/^(.+) opens for the season on (\w+) (\d{1,2}), so skiing isn’t part of this (\w+) plan\.$/,(_,n,om,od,m)=>{const fm=FR_MONTHS_BY_EN[m]||m;return n+' ouvre pour la saison le '+(od==='1'?'1er':od)+' '+(FR_MONTHS_BY_EN[om]||om)+'; le ski ne fait donc pas partie de ce plan '+(/^[aeiouâéèêîôû]/i.test(fm)?'d’':'de ')+fm+'.';});
 text=text.replace(/^@SKI_LEAD@, so skiing isn’t part of this (\w+) plan\.$/,(_,m)=>{const fm=FR_MONTHS_BY_EN[m]||m;return '@SKI_LEAD_FR@; le ski ne fait donc pas partie de ce plan '+(/^[aeiouâéèêîôû]/i.test(fm)?'d’':'de ')+fm+'.';});
 text=text.replace(/^Lunch at (.+), a winery that serves food\.$/,'Dîner à $1, un vignoble qui sert à manger.');
 text=text.replace(/^Lunch at (.+), a winery’s restaurant\.$/,'Dîner à $1, le restaurant d’un vignoble.');
 text=text.replace(/^Every place to eat has the (Vegan|Vegetarian|Gluten-Free)-Friendly badge\.$/,(_,b)=>'Chaque endroit où manger possède le badge '+({Vegan:'Options véganes',Vegetarian:'Options végétariennes','Gluten-Free':'Options sans gluten'}[b])+'.');
 // "No driving after 7pm", applied (2026-10-19).
 text=text.replace(/^No driving after ([\d:]+): dinner is a short walk from the day’s last stop( on the other days)?, or the drive to it ends by then\.$/,(_,t,o)=>'Pas de voiture après '+t+' : le souper est à quelques pas du dernier arrêt de la journée'+(o?' les autres jours':'')+', ou le trajet pour s’y rendre se termine avant.');
 text=text.replace(/^No driving after ([\d:]+): we could not keep the evenings car-free with the places listed; see the note above\.$/,'Pas de voiture après $1 : impossible de garder les soirées sans voiture avec les lieux répertoriés; voir la note ci-dessus.');
 // Round 7 (2026-10-19): said up front, with dinner kept close.
 text=text.replace(/^No driving after ([\d:]+): we could not keep the evenings car-free with the places listed, so dinner is the closest good spot to the day’s last stop\.$/,'Pas de voiture après $1 : impossible de garder les soirées sans voiture avec les lieux répertoriés; le souper est donc la bonne adresse la plus proche du dernier arrêt de la journée.');
 text=text.replace(/^A short drive from (.+), so the evening stays close$/,'À quelques minutes en voiture de $1 : la soirée reste tout près');
 text=text.replace(/^The drive to dinner comes after ([\d:]+) on day ([\d, and]+): no listed dinner spot is within walking distance of the day’s last stop\.$/,(_,t,d)=>'Le trajet pour le souper se fait après '+t+' le jour '+d.replace(/ and (?!.* and )/,' et ')+' : aucun restaurant répertorié n’est à distance de marche du dernier arrêt de la journée.');
 text=text.replace(/^(Under 1 km|About ([\d.]+) km) on foot from (.+), so the evening needs no car$/,(_,a,k,n)=>(k?'Environ '+k.replace('.',',')+' km':'Moins de 1 km')+' à pied de '+n+' : pas besoin de voiture le soir');
 text=text.replace(/^Lunch at a winery’s restaurant$/,'Dîner au restaurant d’un vignoble');
 // Round 9 (2026-10-19): reasons that were still in English on /fr/trip. Constants stay inside the function (it is
 // shipped to the page with toString()).
 {
  const mon={January:'janvier',February:'février',March:'mars',April:'avril',May:'mai',June:'juin',July:'juillet',August:'août',September:'septembre',October:'octobre',November:'novembre',December:'décembre'};
  const act={'Hiking & Trails':'Randonnée et sentiers','Cycling & Biking':'Vélo','Winter':'Hiver','Camping':'Camping','Nature & Wildlife':'Nature et faune','Water Activities':'Activités nautiques','Viewpoints':'Points de vue','Adventure':'Aventure','Fishing':'Pêche','Waterfalls & Canyons':'Chutes et canyons','Waterfalls':'Chutes','Lakes':'Lacs','Parks & Picnic Spots':'Parcs et aires de pique-nique','Off-Leash Dog Areas':'Aires sans laisse pour chiens','Huts & Cabins':'Refuges et cabanes'};
  const enMois=(m)=>mon[m]?(/^[aeiouâéèêîôû]/i.test(mon[m])?'d’':'de ')+mon[m]:'de '+m;
  text=text.replace(/^Described as an indoor golf \/ simulator venue$/,'Décrit comme un golf intérieur ou un simulateur');
  text=text.replace(/^An indoor golf \/ simulator venue — suits an? (\w+) round$/,(_,m)=>'Un golf intérieur ou un simulateur, idéal pour une partie '+enMois(m));
  text=text.replace(/^Listed for (.+?) — in season in (\w+)$/,(raw,a,m)=>act[a]?'Répertorié dans '+act[a]+' — de saison en '+(mon[m]||m):raw);
  text=text.replace(/^Listed for (.+)$/,(raw,a)=>act[a]?'Répertorié dans '+act[a]:raw);
  // 2026-10-25 (tools audit): several activities ("Listed for Hiking & Trails, Nature & Wildlife and Viewpoints",
  // "Répertorié sur @BRAND@ pour Winter and skiing") and the activity a request asked for ("skiing").
  // 2026-10-25 (tools audit): the cold-water note and the general-stop fallback.
  text=text.replace(/^Cold water: outside June to September the lakes and the sea are cold, so plan the (beach and lake stops as walks by the water rather than swims|beach or lake stop as a walk by the water rather than a swim), and paddle only in a wetsuit after checking the rental is open\.$/,(_,n)=>'Eau froide : en dehors de juin à septembre, les lacs et la mer sont froids. Prévoyez '+(/swims$/.test(n)?'les arrêts à la plage et au lac comme des promenades':'l’arrêt à la plage ou au lac comme une promenade')+' au bord de l’eau plutôt qu’une baignade, et ne pagayez qu’en combinaison isothermique, après avoir vérifié que la location est ouverte.');
  text=text.replace(/^Nothing matching that part of your request fits this time, so this is one of the area’s general things to do\.$/,'Rien ne correspond à cette partie de votre demande à ce moment-là : voici l’une des activités générales du coin.');
  const actMore={'skiing':'Ski','snowboarding':'Planche à neige','snowshoeing':'Raquette','hiking':'Randonnée','cycling':'Vélo','winter activities':'Activités d’hiver','water activities':'Activités nautiques','nature and wildlife':'Nature et faune','viewpoints':'Points de vue','camping':'Camping','fishing':'Pêche','adventure':'Aventure','Randonnées et sentiers':'Randonnée et sentiers'};
  const actFr=a=>act[a]||actMore[a]||actMore[a.toLowerCase()]||(Object.values(act).includes(a)?a:null);
  const actList=list=>{const items=list.split(/, | and | et /);const fr=items.map(actFr);if(items.length<2&&!fr[0]||fr.some(x=>!x))return null;const low=fr.map((x,k)=>k?x.charAt(0).toLowerCase()+x.slice(1):x);return low.length>1?low.slice(0,-1).join(', ')+' et '+low[low.length-1]:low[0];};
  text=text.replace(/^Listed for (.+)$/,(raw,l)=>{const fr=actList(l);return fr?'Répertorié dans '+fr:raw;});
  text=text.replace(/^Répertorié sur @BRAND@ pour (.+)$/,(raw,l)=>{const fr=actList(l);return fr?'Répertorié sur @BRAND@ pour '+fr.charAt(0).toLowerCase()+fr.slice(1):raw;});
  const askedFr={'skiing':'du ski','snowboarding':'de la planche à neige','snowshoeing':'de la raquette','hiking':'de la randonnée','cycling':'du vélo','camping':'du camping','fishing':'de la pêche','winter activities':'des activités d’hiver','water activities':'des activités nautiques','nature and wildlife':'de la nature et de la faune','viewpoints':'des points de vue','adventure':'de l’aventure','a walk':'une promenade','a walk by the lake':'une promenade au bord du lac','a park':'un parc','a museum':'un musée','a gallery':'une galerie','a spa':'un spa','a challenging hike':'une randonnée exigeante','a guided hike':'une randonnée guidée','a sunset viewpoint':'un point de vue pour le coucher du soleil'};
  text=text.replace(/^Correspond à votre demande : (?:an? )?(.+)$/,(raw,w)=>{const k=raw.replace(/^Correspond à votre demande : /,'');return askedFr[k]?'Correspond à votre demande : '+askedFr[k]:askedFr[w]?'Correspond à votre demande : '+askedFr[w]:raw;});
  // A step of a date-night outing ("Chosen for the “Dinner” part of your outing").
  const stepFr={'Dinner':'Souper','Lunch':'Dîner','Breakfast':'Déjeuner','Brunch':'Brunch','Coffee':'Café','Drinks':'Un verre','A drink first':'Un verre pour commencer','A nightcap':'Un dernier verre','A last drink':'Un dernier verre','Dessert':'Dessert','A walk':'Une promenade','A show':'Un spectacle'};
  text=text.replace(/^Chosen for the “(.+)” part of your outing$/,(_,l)=>'Choisi pour la partie « '+(stepFr[l]||l)+' » de votre sortie');
  // Live hours ("Hours were checked for Sunday from 23:41 @TIME@ time; ...") and the hours-checked note of a list.
  const dayFr={Monday:'lundi',Tuesday:'mardi',Wednesday:'mercredi',Thursday:'jeudi',Friday:'vendredi',Saturday:'samedi',Sunday:'dimanche'};
  const clockFr=c=>{const [h,m]=c.split(':').map(Number);return h%24===0&&m===0?'minuit':(h%24)+' h'+(m?' '+String(m).padStart(2,'0'):'');};
  text=text.replace(/^Hours were checked for (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)( night)?,? from (\d{1,2}:\d{2}) @TIME@ time; places whose listed hours have already ended \(or do not start again\) are left out\.$/,(_,d,n,c)=>'Les horaires ont été vérifiés pour '+dayFr[d]+(n?' soir':'')+' à partir de '+clockFr(c)+' (heure @OF_AREA@); les lieux dont les horaires indiqués sont déjà terminés (ou ne reprennent pas) sont exclus.');
  const whenFr={today:'aujourd’hui',tomorrow:'demain',tonight:'ce soir','this weekend':'cette fin de semaine','this morning':'ce matin','this afternoon':'cet après-midi','this evening':'ce soir'};
  const whenText=w=>{if(whenFr[w])return whenFr[w];const m=/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?: (morning|afternoon|evening))?$/.exec(w);return m?dayFr[m[1]]+(m[2]?' '+({morning:'matin',afternoon:'après-midi',evening:'soir'}[m[2]]):''):null;};
  text=text.replace(/^Checked against each venue’s listed hours on @BRAND@(?: for (.+?))?: places whose listed hours show them closed then are left out, and places without usable hours are marked\. Hours can change, so check before you go\.$/,(raw,w)=>{const fw=w?whenText(w):'';return fw===null?raw:'Vérifié selon les horaires indiqués sur @BRAND@'+(fw?' pour '+fw:'')+' : les lieux fermés à ce moment-là selon leurs horaires sont exclus, et ceux sans horaires utilisables sont signalés. Les horaires peuvent changer, alors vérifiez avant de partir.';});
  text=text.replace(/^Its listed hours end at (\d{1,2}:\d{2}) — check before you go$/,(_,c)=>'Ses horaires indiqués se terminent à '+clockFr(c)+' — vérifiez avant de partir');
  text=text.replace(/^Price level (\$+)$/,'Niveau de prix $1');
  text=text.replace(/^A sit-down dinner to end the day$/,'Un souper assis pour finir la journée');
  text=text.replace(/^Fills the free time before dinner$/,'Occupe le temps libre avant le souper');
  text=text.replace(/^In (.+?), about (\d+) minutes’ drive: nothing in (.+) fits dinner that day$/,(_,t,n,w)=>'À '+t+', à environ '+n+' minutes en voiture : rien à '+w.replace(/ and (?!.* and )/,' et ')+' ne convient pour le souper ce jour-là');
 }
 text=text.replace(/^No driving after ([\d:]+): dinner is each day’s last drive, and anything after it is a short walk away\.$/,'Pas de voiture après $1 : le souper est le dernier trajet de chaque jour, et ce qui suit est à quelques pas.');
 text=text.replace(/^In (.+), about (\d+) minutes’ drive: nothing in (.+) fits (lunch|dinner) that day$/,(_,t,m,h,meal)=>'À '+t+', à environ '+m+' minutes en voiture : rien à '+h.replace(/ and (?!.* and )/,' et ')+' ne convient pour le '+(meal==='lunch'?'dîner':'souper')+' ce jour-là');
 text=text.replace(/^In (.+), about (\d+) minutes’ drive from (.+)$/,'À $1, à environ $2 minutes en voiture de $3');
 text=text.replace(/^Open ([\d:]+)–([\d:]+); plan on about ([\d.]+) hours there\.$/,(_,a,b,h)=>'Ouvert de '+a+' à '+b+'; prévoyez environ '+h.replace('.',',')+' heures sur place.');
 text=text.replace(/^Something after dinner is more than ([\d.]+) km from it; plan a ride, or skip it to keep the evening on foot\.$/,(_,k)=>'Une activité après le souper est à plus de '+k.replace('.',',')+' km; prévoyez un transport, ou sautez-la pour garder la soirée à pied.');
 // Weekly audit (2026-10-25): a beach day outside summer.
 text=text.replace(/^The lake is usually too cold for a swim in (\w+), so this is suggested as a beach walk or lakeside stop$/,(_,m)=>'Le lac est habituellement trop froid pour se baigner en '+frMon(m)+'; on le propose plutôt pour une promenade sur la plage ou un arrêt au bord de l’eau');
 text=text.replace(/^Lake swimming here is a summer activity, so in (\w+) this is suggested as a lakeside stop$/,(_,m)=>'La baignade dans le lac est une activité d’été; en '+frMon(m)+', on le propose plutôt comme arrêt au bord de l’eau');
 // Weekly audit (2026-10-25): a stop that cannot fit before it closes.
 text=text.replace(/^(.+) was left out: it closes at ([\d:]+), before the plan would get there\.$/,'$1 a été retiré : il ferme à $2, avant que le programme y arrive.');
 text=text.replace(/^(.+) was left out: its listed hours end before the plan would get there\.$/,'$1 a été retiré : ses heures indiquées se terminent avant que le programme y arrive.');
 text=text.replace(/^(.+): it closes at ([\d:]+), so it may not fit after the stop before it\. Start earlier or swap it for another place\.$/,'$1 : il ferme à $2, alors il risque de ne pas convenir après l’arrêt précédent. Commencez plus tôt ou remplacez-le par un autre lieu.');
 text=text.replace(/^(.+): its listed hours mean it may not fit after the stop before it\. Start earlier or swap it for another place\.$/,'$1 : selon ses heures indiquées, il risque de ne pas convenir après l’arrêt précédent. Commencez plus tôt ou remplacez-le par un autre lieu.');
 text=text.replace(/Day (\d+) has no additional matching activity available\. The optional afternoon meal was left out; dinner remains\. Consider a different activity or a shorter trip\./g,'Le jour $1 ne comporte aucune autre activité correspondante disponible. Le repas facultatif de l’après-midi a été retiré; le souper reste au programme. Envisagez une autre activité ou un voyage plus court.');
 text=text.replace(/\beasy walks?\b/gi,match=>match.toLowerCase().endsWith('s')?'promenades faciles':'promenade facile');
 text=text.replace(/^In (.+), where you asked to go$/, 'À $1, où vous souhaitez aller');
 // French number style (2026-10-18): "Note de 4,7 selon 1 234 avis", as on the place pages.
 text=text.replace(/\bRated ([\d.]+) from ([\d,]+) reviews/g,(_,r,n)=>'Note de '+r.replace('.',',')+' selon '+n.replace(/,/g,'\u00a0')+' avis').replace(/\bRated ([\d.]+)/g,(_,r)=>'Note de '+r.replace('.',','));
 text=text.replace(/; includes (\d+) minutes waiting for the scheduled slot or opening/g,'; comprend $1 minutes d’attente pour le créneau prévu ou l’ouverture');
 text=text.replace(/Placed in the (morning|afternoon|evening) slot/g,(_,p)=>'Prévu '+({morning:'le matin',afternoon:'l’après-midi',evening:'le soir'}[p]));
 text=text.replace(/No selected stop meets (.+)\./g,'Aucun arrêt choisi ne satisfait $1.');
 text=text.replace(/^No (.+) could be fitted into this plan\.$/,(_,w)=>'Impossible d’intégrer ce qui suit dans le plan : '+({beach:'une plage',winery:'un vignoble',restaurant:'un restaurant','café':'un café','breakfast or brunch spot':'un endroit pour le déjeuner ou le brunch','golf course':'un terrain de golf','outdoor stop':'un arrêt en plein air',tour:'une visite guidée',brewery:'une microbrasserie',pub:'un pub','cocktail lounge':'un bar à cocktails',distillery:'une distillerie','indoor attraction':'une attraction intérieure','hike or walk':'une randonnée ou une promenade','ski hill':'une station de ski','snowshoe trail':'un sentier de raquette','winter activity':'une activité hivernale',viewpoint:'un point de vue'}[w]||w)+'.');
 text=text.replace(/^Not every stop is listed as (.+)\.$/,(_,w)=>'Les arrêts ne sont pas tous indiqués comme '+({'dog friendly':'acceptant les chiens','kid friendly':'adaptés aux enfants','vegetarian friendly':'offrant des options végétariennes','vegan friendly':'offrant des options végétaliennes','gluten-free friendly':'offrant des options sans gluten'}[w]||w)+'.');
 text=text.replace(/^@BRAND@ can’t check (.+) from its listings, so confirm it before you go\.$/,'@BRAND@ ne peut pas vérifier « $1 » dans ses fiches; confirmez avant de partir.');
 text=text.replace(/No (.+) is listed on What’s On( for the evening| for the daytime)? for those dates, so the rest of the plan is shown\./g,(_,kind,part)=>'Aucun événement correspondant ('+kind+') n’est répertorié'+(part?' pour cette période de la journée':'')+' aux dates demandées; le reste du plan est affiché.');
 text=text.replace(/No matching activity fits the morning on day (\d+); that time is left free rather than adding a meal\./g,'Aucune activité correspondante ne convient le matin du jour $1; ce créneau reste libre plutôt que d’ajouter un repas.');
 text=text.replace(/Used instead of (.+) because its timing could not be verified\./g,'Choisi à la place de $1, dont l’horaire n’a pas pu être vérifié.');
 text=text.replace(/Used instead of (.+) because its listed hours do not fit the estimated sequence\./g,'Choisi à la place de $1, dont les horaires indiqués ne conviennent pas à la séquence estimée.');
 text=text.replace(/No suitable (morning|afternoon|evening) stop was found for day (\d+)( in (.+))?\./g,(_,part,day,where,town)=>'Aucun arrêt approprié '+({morning:'le matin',afternoon:'l’après-midi',evening:'le soir'}[part])+' du jour '+day+(town?' à '+town:'')+'.');
 text=text.replace(/^Nothing matching (.+) is listed in (.+); the closest is (.+) in (.+)\.$/,(_,w,t,n,c)=>'Aucune option correspondant à '+w+' n’est répertoriée à '+t.replace(/ and (?!.* and )/,' et ')+'; la plus proche est '+n+' à '+c+'.');
 // Round 10 (2026-10-19): new planner lines.
 text=text.split('Serves food, so this is the crawl’s meal stop').join('On y mange : c’est l’arrêt repas de la tournée');
 text=text.split('Tours run at set times: book ahead with the operator and plan the day around the time you get.').join('Les visites ont lieu à heures fixes : réservez auprès de l’organisateur et planifiez la journée selon l’heure obtenue.');
 // Round 10 (2026-10-19): the kind of event in a "Not met" or "Not verified" line is French too ("Non vérifié : event").
 text=text.replace(/^(Non vérifié|Non satisfait) : (comedy show|show|event|market|festival) —/,(_,a,k)=>a+' : '+({'comedy show':'spectacle d’humour',show:'spectacle',event:'événement',market:'marché',festival:'festival'}[k])+' —');
 text=text.replace(/^Not part of this plan: (.+) — @BRAND@ couldn’t match (that word|those words) to a kind of place it lists\.$/,(_,w,n)=>'Pas pris en compte dans ce plan : '+w.replace(/“/g,'«\u00a0').replace(/”/g,'\u00a0»').replace(/ and (?!.* and )/,' et ')+' — @BRAND@ n’a pas pu associer '+(n==='that word'?'ce mot':'ces mots')+' à un type de lieu répertorié.');
 text=text.replace(/Nothing matching (.+) was available( in (.+))?\./g,(_,what,where,town)=>'Aucune option correspondant à '+what.replace(/“/g,'«\u00a0').replace(/”/g,'\u00a0»')+(town?' à '+town.replace(/ and (?!.* and )/,' et '):'')+' n’était disponible.');
 text=text.replace(/(Morning|Afternoon|Evening) on day (\d+) is kept free for the event’s listed duration\./g,(_,part,day)=>({Morning:'Le matin',Afternoon:'L’après-midi',Evening:'Le soir'}[part])+' du jour '+day+' reste libre pour la durée indiquée de l’événement.');
 text=text.replace('Reserved for the listed event time.','Réservé pour l’horaire indiqué de l’événement.');
 text=text.replace(/A later assumed start reduces waiting while keeping the same stops and listed opening hours\. Estimated first visit: ([\d:]+)\. Change your request to specify a start time\./g,'Un départ supposé plus tard réduit l’attente tout en conservant les mêmes arrêts et horaires indiqués. Première visite estimée : $1. Précisez une heure de départ dans votre demande.');
 // 2026-10-19: drop-in and untimed family events, and a Halloween trip's day without a Halloween event.
 text=text.replace(/Open (\d{2}:\d{2})–(\d{2}:\d{2}) on (\d{4}-\d{2}-\d{2}); planned arrival about (\d{2}:\d{2}), staying until about (\d{2}:\d{2})\./g,'Ouvert de $1 à $2 le $3; arrivée prévue vers $4, jusqu’à environ $5.');
 text=text.replace(/Event hours are not listed; planned visit about (\d{2}:\d{2})–(\d{2}:\d{2}) on (\d{4}-\d{2}-\d{2})\. Check the times before you go\./g,'Les heures de l’événement ne sont pas indiquées; visite prévue vers $1–$2 le $3. Vérifiez les heures avant de partir.');
 text=text.replace(/Event hours are not listed; this plans about ([\d.]+) hours in the afternoon\. Check the times before you go\./g,(_,h)=>'Les heures de l’événement ne sont pas indiquées; environ '+String(h).replace('.',',')+' heures sont prévues l’après-midi. Vérifiez les heures avant de partir.');
 text=text.replace(/^No Halloween events are listed( near (.+))? on day (\d+), so (it has another family event instead|it is a regular day out)\.$/,(_,n,town,day,rest)=>'Aucun événement d’Halloween n’est à l’affiche'+(town?' près de '+town:'')+' le jour '+day+(rest.startsWith('it has')?'; un autre événement familial est prévu à la place.':'; c’est une journée ordinaire.'));
 text=text.replace(/^A family Halloween event on your dates$/,'Un événement familial d’Halloween à vos dates');
 text=text.replace(/Trip starts on (\d{4}-\d{2}-\d{2}) \(@TIME@ calendar date\)\./g,'Le voyage commence le $1 (date locale @OF_AREA@).');
 text=text.replace(/^Date night: Dinner in (.+)\.$/,'Soirée en amoureux : souper à $1.');
 text=text.replace(/^If it rains: (.+) (?:are|is) indoors nearby, so swap (?:one|it) in for a beach or outdoor stop\.$/,(_,names)=>'S’il pleut : '+names.replace(/ and (?!.* and )/,' et ')+(/ and /.test(names)?' sont des options intérieures à proximité; remplacez une plage ou une sortie en plein air par l’une d’elles.':' est une option intérieure à proximité; remplacez une plage ou une sortie en plein air par celle-ci.'));
 text=text.replace(/^@BRAND@ doesn’t list (.+) for these places, so they’re matched on the rest of your request; check with each place\.$/,(_,w)=>'@BRAND@ n’indique pas '+w.replace(/“/g,'« ').replace(/”/g,' »').replace(/ and (?!.* and )/,' et ')+' pour ces lieux; ils correspondent au reste de votre demande. Vérifiez auprès de chaque lieu.');
 text=text.replace(/^Doesn’t list (.+); the best match left for this time$/,(_,b)=>'N’affiche pas '+b.replace(/the (.+?) badge/g,'le badge $1').replace(/ and (?!.* and )/,' et ')+'; le meilleur choix restant pour ce moment');
 text=text.replace(/^@BRAND@ only covers @COVERAGE@, so (.+) (?:isn’t|aren’t) included\. Here are ideas in @AREA@ instead; name a town such as @TOWNS@ to choose where\.$/,(_,p)=>'@BRAND@ couvre seulement @COVERAGE_FR@, alors '+p.replace(/ and (?!.* and )/,' et ')+' n’est pas inclus. Voici des idées @IN_AREA@; nommez une ville comme @TOWNS_FR@ pour choisir l’endroit.');
 text=text.replace(/^Based in (.+), with day (\d+) as your day trip to (.+)\.$/,'Basé à $1, avec le jour $2 consacré à votre excursion à $3.');
 text=text.replace(/^Planned as a road trip from (.+) to (.+), one stretch of @STRETCH@ each day\.$/,'Planifié comme un road trip de $1 à $2, une portion @OF_STRETCH@ chaque jour.');
 text=text.replace(/: about (\d+) minutes\b/g,' : environ $1 minutes');
 text=text.replace(/^Planned as a road trip from (.+) to (.+), one stretch of @STRETCH@ each day, with a stop on the way\.$/,'Planifié comme un road trip de $1 à $2, une portion @OF_STRETCH@ chaque jour, avec un arrêt en chemin.');
 text=text.replace(/^No other winery that serves lunch nearby fits this part of the day, so (.+) stays in your plan\.$/,'Aucun autre vignoble qui sert le dîner ne convient à ce moment de la journée : $1 reste dans votre plan.');
 // Wine and ski trips (2026-10-18).
 const frMonth=m=>({January:'janvier',February:'février',March:'mars',April:'avril',May:'mai',June:'juin',July:'juillet',August:'août',September:'septembre',October:'octobre',November:'novembre',December:'décembre'}[m]||m);
 const frDate=x=>x.replace(/^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2})$/,(_,m,d)=>(d==='1'?'1er':d)+' '+frMonth(m));
 text=text.replace(/^(.+) opens for the season on (\w+ \d{1,2}) — your dates are before it opens, so check before you book\.$/,(_,n,dt)=>n+' ouvre pour la saison le '+frDate(dt)+' : vos dates sont avant l’ouverture, alors vérifiez avant de réserver.');
 text=text.replace(/^(.+) is closed for the season and hasn’t announced its opening date yet, so check it is open for your dates before you book\.$/,'$1 est fermé pour la saison et n’a pas encore annoncé sa date d’ouverture; vérifiez qu’il est ouvert à vos dates avant de réserver.');
 text=text.replace(/^(.+) opens for the season on (\w+ \d{1,2}), so (\w+) is before the season starts — check before you book\.$/,(_,n,dt,m)=>n+' ouvre pour la saison le '+frDate(dt)+'; '+frMonth(m)+' est donc avant le début de la saison. Vérifiez avant de réserver.');
 text=text.replace(/^(.+) hasn’t announced its opening date yet, so check it is open in (\w+) before you book\.$/,(_,n,m)=>n+' n’a pas encore annoncé sa date d’ouverture; vérifiez qu’il est ouvert en '+frMonth(m)+' avant de réserver.');
 text=text.replace(/^(.+) is closed for the season right now and (?:opens for the season on (\w+ \d{1,2})|hasn’t announced its opening date yet)\. This plan is for when the lifts are running\.$/,(_,n,dt)=>n+' est fermé pour la saison en ce moment et '+(dt?'ouvre le '+frDate(dt):'n’a pas encore annoncé sa date d’ouverture')+'. Ce plan vaut pour la période où les remontées fonctionnent.');
 text=text.replace(/^Only one winery( in (.+))? fits day (\d+); its listed hours or the plan's other days left no second one\.$/,(_,w,t,d)=>'Un seul vignoble'+(t?' à '+t.replace(/ and (?!.* and )/,' et '):'')+' convient au jour '+d+'; ses horaires indiqués ou les autres jours du plan n’en laissent pas un deuxième.');
 text=text.replace(/^No winery open in the afternoon was found for day (\d+)( in (.+))?\.$/,(_,d,w,t)=>'Aucun vignoble ouvert l’après-midi n’a été trouvé pour le jour '+d+(t?' à '+t:'')+'.');
 text=text.replace(/^No sit-down dinner open that evening was found for day (\d+)( in (.+))?\.$/,(_,d,w,t)=>'Aucun restaurant ouvert ce soir-là n’a été trouvé pour le souper du jour '+d+(t?' à '+t:'')+'.');
 text=text.replace(/^No dinner spot open that evening was found at the hill for day (\d+)\.$/,'Aucun restaurant ouvert ce soir-là n’a été trouvé à la station pour le jour $1.');
 text=text.replace(/^No ski resort is listed on @BRAND@( in (.+))?\.$/,(_,w,t)=>'Aucune station de ski n’est répertoriée sur @BRAND@'+(t?' à '+t:'')+'.');
 text=text.replace(/^You asked for (\d+) dinners, so the other evenings are left free\.$/,'Vous avez demandé $1 soupers; les autres soirées restent libres.');
 text=text.replace(/^(.+) hasn’t announced its opening day yet; ski season usually starts in late November or December, so check before you book\.$/,'$1 n’a pas encore annoncé sa date d’ouverture; la saison de ski commence habituellement à la fin novembre ou en décembre, alors vérifiez avant de réserver.');
 text=text.replace(/^Only (\d+) of the (\d+) wineries you asked for( in (.+))? fit day (\d+); their listed hours or the plan's other days left no more\.$/,(_,n,w,x,t,d)=>'Seulement '+n+' des '+w+' vignobles demandés'+(t?' à '+t.replace(/ and (?!.* and )/,' et '):'')+' conviennent au jour '+d+'; leurs horaires indiqués ou les autres jours du plan n’en laissent pas d’autres.');
 text=text.replace(/^Up to (\d+) winery visits fit in one day, so each day has (\d+) rather than (\d+)\.$/,'Une journée compte au plus $1 visites de vignobles; chaque jour en prévoit donc $2 au lieu de $3.');
 const frStop=(n,w)=>{const one={winery:'vignoble',brewery:'microbrasserie',restaurant:'restaurant',cafe:'café',distillery:'distillerie'}[w]||w;return n+' '+(n==='1'?one:one+'s');};
 text=text.replace(/Requested (\d+) (\w+) stops? a day; scheduled ([\d, ]+) \(day by day\)\.( (\d+) a day is more than one day holds, so the plan uses (\d+)\.)?/g,(_,n,w,list,x,r,u)=>'Demandé : '+frStop(n,w)+' par jour; prévu : '+list.trim()+' (jour par jour).'+(x?' '+r+' par jour, c’est plus qu’une journée ne peut contenir; le plan en prévoit '+u+'.':''));
 text=text.replace(/Requested (\d+) (\w+) stops?; scheduled (\d+)\./g,(_,n,w,m)=>'Demandé : '+frStop(n,w)+'; prévu : '+m+'.');
 text=text.replace(/^Places that mention (.+) in (.+?)(?:, ranked by how closely they match and by their ratings)?\.$/,(_,w,t)=>'Lieux qui mentionnent '+w.replace(/“/g,'« ').replace(/”/g,' »').replace(/ and (?!.* and )/,' et ')+(t==='@AREA@'?' @IN_AREA@':' à '+t.replace(/ and (?!.* and )/,' et '))+'.');
 // Time windows (2026-10-20, round 11): "Saturday evening in Whistler: drinks, dinner and a nightcap."
 const FR_WINDOW_PARTS={drinks:'un verre',dinner:'un souper','a nightcap':'un dernier verre',coffee:'un café','a walk or a sight':'une promenade ou une visite',lunch:'un dîner','a tasting':'une dégustation','coffee or a treat':'un café ou une gâterie'};
 const FR_WINDOW_DAYS={Monday:'Lundi',Tuesday:'Mardi',Wednesday:'Mercredi',Thursday:'Jeudi',Friday:'Vendredi',Saturday:'Samedi',Sunday:'Dimanche',Tomorrow:'Demain'};
 text=text.replace(/^(A|An|This|Tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (morning|afternoon|evening)(?: in (.+?))?(?:: (.+))?\.$/,(_,d,w,t,list)=>{
  const head=d==='A'||d==='An'?{morning:'Une matinée',afternoon:'Un après-midi',evening:'Une soirée'}[w]:d==='This'?{morning:'Ce matin',afternoon:'Cet après-midi',evening:'Ce soir'}[w]:FR_WINDOW_DAYS[d]+' '+{morning:'matin',afternoon:'après-midi',evening:'soir'}[w];
  const parts=list?list.split(/, | and /).map(x=>FR_WINDOW_PARTS[x]||x):[];
  return head+(t?' à '+t.replace(/ and (?!.* and )/,' et '):'')+(parts.length?' : '+(parts.length>1?parts.slice(0,-1).join(', ')+' et '+parts[parts.length-1]:parts[0]):'')+'.';
 });
 text=text.replace(/^Nothing for (.+) is open (?:in (.+)|along the way from (.+) to (.+)) in that window, so the plan has fewer stops\.$/,(_,x,t,a,b)=>'Rien pour '+(FR_WINDOW_PARTS[x]||x)+' n’est ouvert '+(t?(t==='@AREA@'?'@IN_AREA@':'à '+t.replace(/ and (?!.* and )/,' et ')):'entre '+a+' et '+b)+' à ce moment-là; le plan compte moins d’arrêts.');
 text=text.replace(/^Ideas for (.+)\.$/,(_,t)=>'Idées pour '+(t==='@AREA@'?'@THE_AREA@':t.replace(/ and (?!.* and )/,' et '))+'.');
 text=text.replace(/^What’s on in (.+)\.$/,(_,t)=>'À l’affiche '+(t==='@AREA@'?'@IN_AREA@':'à '+t.replace(/ and (?!.* and )/,' et '))+'.');
 text=text.replace(/^A ski day at (.+)$/,'Une journée de ski à $1');
 text=text.replace(/^About (<?\d+) km \(straight line\) from (.+)$/,(_,k,w)=>'Environ '+k+' km (à vol d’oiseau) '+({'the previous stop':'de l’arrêt précédent','the wineries':'des vignobles','the morning and afternoon stops':'des arrêts du matin et de l’après-midi'}[w]||(/^[AEIOUYÉÈÊaeiouyéèê]/.test(w)?'d’':'de ')+w));
 // "Its listed hours only fit the midday on Mon–Fri, Sun — check the day you go" (2026-10-18).
 text=text.replace(/^Its listed hours only fit the (morning|midday|afternoon|late afternoon|early evening|evening) on (.+) — check the day you go$/,(_,part,list)=>{
  const when={morning:'le matin',midday:'le midi',afternoon:'l’après-midi','late afternoon':'en fin d’après-midi','early evening':'en début de soirée',evening:'le soir'}[part];
  const days=list==='every day'?'jours':list.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g,d=>({Mon:'lun.',Tue:'mar.',Wed:'mer.',Thu:'jeu.',Fri:'ven.',Sat:'sam.',Sun:'dim.'}[d]));
  return 'Selon ses horaires indiqués, il ne convient '+when+' que '+(/[,–]/.test(days)||days==='jours'?'les ':'le ')+days.replace(/^les? /,'')+' — vérifiez le jour de votre visite';
 });
 text=text.replace(/ on (\d{4}-\d{2}-\d{2})/g,' le $1');
 // ISO dates read as dates (2026-10-19): "le 2026-10-24" -> "le 24 octobre 2026".
 text=text.replace(/\b(20\d{2})-(\d{2})-(\d{2})\b/g,(raw,y,m,d)=>{const mo=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][Number(m)-1];return mo?(Number(d)===1?'1er':String(Number(d)))+' '+mo+' '+y:raw;});
 const words={'A cidery, as you asked':'Une cidrerie, comme demandé',Cideries:'Cidreries',cideries:'cidreries',Cidery:'Cidrerie','Lunch at a winery':'Dîner dans un vignoble','A winery that serves lunch':'Un vignoble qui sert le dîner','Fills the free time before dinner':'Occupe le temps libre avant le souper','Late afternoon':'Fin d’après-midi',Winter:'Hiver','Optional — skip it to keep skiing':'Facultatif — sautez-le pour continuer à skier','Lakeside walk':'Promenade au bord du lac',Cafes:'Cafés',Wineries:'Vignobles',Breweries:'Microbrasseries',Beaches:'Plages',Dinner:'Souper',Supper:'Souper',Lunch:'Dîner','Late lunch':'Dîner tardif',Breakfast:'Déjeuner','Live-music':'Musique en direct','Live music':'Musique en direct',Morning:'Matin',Midday:'Midi',Afternoon:'Après-midi',Evening:'Soir','Free time':'Temps libre','Comedy show':'Spectacle d’humour','Comedy':'Humour',comedy:'humour','Show':'Spectacle',cafes:'cafés',wineries:'vignobles',walks:'promenades','kid-friendly spots':'endroits adaptés aux enfants','indoor & rainy day spots':'lieux intérieurs et jours de pluie','art galleries':'galeries d’art','art gallery':'galerie d’art','museums & galleries':'musées et galeries',shops:'boutiques',Shops:'Boutiques',spas:'spas',Spas:'Spas','yoga studios':'studios de yoga','A shop, as asked':'Une boutique, comme demandé','Right by the lake':'Juste au bord du lac','Free to visit':'Entrée gratuite','Your campground for the trip':'Votre terrain de camping pour le voyage','Campsites fill up: reserve ahead where the campground takes bookings':'Les emplacements se remplissent : réservez à l’avance si le camping prend des réservations','Set up camp':'Installation du camp','Rentals or guided trips for what you asked':'Location ou sorties guidées pour ce que vous avez demandé','museum or gallery':'musée ou galerie','outdoor destinations':'lieux de plein air','Hiking & Trails':'Randonnées et sentiers','Waterfalls & Canyons':'Chutes et canyons','Huts & Cabins':'Refuges et cabanes','Parks & Picnic Spots':'Parcs et aires de pique-nique','Off-Leash Dog Areas':'Aires sans laisse pour chiens',Lakes:'Lacs','hiking & trails':'randonnées et sentiers','dog-friendly spots':'endroits qui acceptent les chiens','vegetarian-friendly venues':'lieux avec options végétariennes','vegan-friendly venues':'lieux avec options véganes','lake time':'temps au bord du lac','golf courses':'terrains de golf','cocktail lounges':'bars à cocktails','tours & experiences':'visites et expériences',breweries:'microbrasseries',beaches:'plages',daily:'tous les jours','Mon–Thu':'lun.–jeu.','Fri–Sat':'ven.–sam.',Sun:'dim.'};
 for(const [a,b] of Object.entries(words)){if(text===a)text=b;else if(a===a.toLowerCase()||a.includes('–')||a.includes('&'))text=text.replace(new RegExp('\\b'+a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','g'),b);}
 text=text.replace(/^In (.+), où a lieu l’événement$/, 'À $1, où a lieu l’événement');
 // Opening hours inside a reason ("Listed hours: 11:00–22:00 Mon–Fri; 10:00–22:00 Sat").
 if(/\d{2}:\d{2}/.test(text))text=text.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g,d=>({Mon:'lun.',Tue:'mar.',Wed:'mer.',Thu:'jeu.',Fri:'ven.',Sat:'sam.',Sun:'dim.'}[d]));
 // Hour ranges read like the place pages (2026-10-18): "07:00–17:00" -> "7 h–17 h", "10:30–22:00" -> "10 h 30–22 h".
 // French typography (round 11, 2026-10-20): a space before the colon after a translated label (town names here start
 // with a consonant, so no « d’ » elision is needed).
 text=text.replace(/(\(mode supposé\)|Trajet estimé à pied|Horaires indiqués|vers l’événement):(?=\s)/g,'$1 :');
 if(FR_SITE.elidedTowns)text=text.replace(new RegExp('\\b(de|De) (?=(?:'+FR_SITE.elidedTowns+')\\b)','g'),(_,d)=>d==='De'?'D’':'d’');
 if(/\b\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}\b/.test(text))text=text.replace(/\b(\d{1,2}):(\d{2})\b/g,(_,h,m)=>Number(h)%24===0&&m==='00'?'minuit':Number(h)+' h'+(m==='00'?'':' '+m));
 return text;
}
function t3FrenchEvent(event){
 const e={...event};
 const days={Mon:'lun.',Tue:'mar.',Wed:'mer.',Thu:'jeu.',Fri:'ven.',Sat:'sam.',Sun:'dim.'};
 const months={Jan:'janv.',Feb:'févr.',Mar:'mars',Apr:'avr.',May:'mai',Jun:'juin',Jul:'juill.',Aug:'août',Sep:'sept.',Oct:'oct.',Nov:'nov.',Dec:'déc.'};
 // Round 13 (2026-10-21): the server's French labels (server.js tripEventLabelFr) when it sent them; otherwise these rules.
 if(e.dateLabelFr){e.dateLabel=e.dateLabelFr;}else
 e.dateLabel=String(e.dateLabel||'').replace(/^Nightly\b/,'Tous les soirs').replace(/ · next /g,' · prochaine : ').replace(/\+\s*(\d+) more dates?\b/g,(_,n)=>'+ '+n+' '+(n==='1'?'autre date':'autres dates')).replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g,d=>days[d]).replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}(?:[–-]\d{1,2})?)/g,(_,m,d)=>(d==='1'?'1er':d)+' '+months[m]);
 if(e.timeFr){e.time=e.timeFr;return e;}
 if(e.time==='Times vary'){e.time='Horaires variables';return e;}
 if(e.time==='All day'){e.time='Toute la journée';return e;}
 e.time=String(e.time||'').replace(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi,(raw,h,m,part)=>{
  if(Number(h)<1||Number(h)>12||Number(m||0)>59)return raw;
  const hour=Number(h)%12+(part.toLowerCase()==='pm'?12:0);
  return hour===0&&(!m||m==='00')?'minuit':String(hour).padStart(2,'0')+' h'+(m&&m!=='00'?' '+m:'');
 });
 return e;
}
// "Votre journée commence par une dégustation à Fox & Archer Wines, puis un dîner à The Bistro, et se termine par un
// souper à Terroir Kitchen." One sentence a day (three days at most, then the names of the rest).
const FR_STOP_NOUN={winery:'une dégustation',brewery:'une bière artisanale',distillery:'une dégustation',cafe:'un café',outdoor:'une sortie en plein air',beach:'la plage',golf:'une partie de golf',indoor_golf:'une séance de golf intérieur',indoor:'une visite',tour:'une visite guidée',sport:'une activité',pub:'un verre',cocktail:'un cocktail',restaurant:'un repas'};
function t3FrenchStopText(s,seen){
 const name=s.venue?.name||s.event?.name;
 if(s.event)return 'l’événement « '+name+' »';
 const t=s.venue?.type,part=s.daypart,label=String(s.label||'');
 let noun=FR_STOP_NOUN[s.venue?.indoorGolf?'indoor_golf':t]||'un arrêt';
 if(/^(?:Dîner|Lunch)$/i.test(label)||(part==='midday'&&['restaurant','cafe','pub'].includes(t))||s.wineryLunch||s.onHill)noun=s.wineryLunch?'un dîner au vignoble':'un dîner';
 else if(['evening','night'].includes(part)&&['restaurant','pub'].includes(t))noun='un souper';
 else if(part==='morning'&&t==='cafe')noun='un café';
 else if(s.skiDay)noun='une journée de ski';
 // Round 12 (2026-10-20): an evening ends with « un dernier verre », not a second « souper » (Old Vines, then Friends Pub).
 if(seen){if(noun==='un souper'&&seen.dinner)noun='un dernier verre';else if(noun==='un souper')seen.dinner=true;}
 return noun+' à '+name;
}
function t3FrenchStory(p){
 const days=p.days?.length?p.days.map(d=>({day:d.day,town:d.regionLabel,stops:(d.stops||[]).filter(s=>s.venue||s.event)})):[{day:1,town:null,stops:(p.itinerary?.stops||p.outing?.stops||[]).filter(s=>s.venue||s.event)}];
 const one=days.length===1;
 const out=[];
 for(const d of days.slice(0,3)){
  const seen={dinner:false};
  const parts=d.stops.map(s=>t3FrenchStopText(s,seen));
  if(!parts.length)continue;
  // Round 14 (2026-10-20): an evening or afternoon plan is « Votre soirée » / « Votre après-midi », not « Votre journée ».
  const parts0=d.stops.map(s=>s.daypart);
  // Round 15 (2026-10-20): a brewery or wine crawl is « Votre tournée », not « Votre journée commence par une bière ».
  const drinks=d.stops.filter(s=>s.venue&&['brewery','pub','cocktail','distillery','winery'].includes(s.venue.type));
  const span=drinks.length>=2&&drinks.every(s=>s.venue.type===drinks[0].venue.type)&&!(p.days&&p.days.length)?'Votre tournée':parts0.length&&parts0.every(x=>x==='evening'||x==='night')?'Votre soirée':parts0.length&&parts0.every(x=>x==='afternoon'||x==='late'||x==='evening'||x==='night')&&parts0.some(x=>x==='afternoon'||x==='late')?'Votre après-midi':'Votre journée';
  const lead=one?span+(d.town?' à '+d.town:''):'Le jour '+d.day+(d.town?', à '+d.town+',':'');
  if(parts.length===1){out.push(lead.replace(/,$/,'')+' : '+parts[0]+'.');continue;}
  const first=parts[0],last=parts[parts.length-1],mid=parts.slice(1,-1);
  out.push(lead+' commence par '+first+(mid.length?', puis '+mid.join(', '):'')+', et se termine par '+last+'.');
 }
 // Round 11: the days after the third are named (« Le jour 4 : … », « Les jours 4 à 5 : … »), not « Ensuite ».
 if(days.length>3){const rest=days.slice(3).flatMap(d=>d.stops.map(s=>s.venue?.name||s.event?.name));if(rest.length)out.push((days.length===4?'Le jour 4':'Les jours 4 à '+days.length)+' : '+rest.join(', ')+'.');}
 // Round 12 (2026-10-20): a name that ends in a full stop ("Cannery Brewing Co.") ends the sentence once.
 return out.join(' ').replace(/\bà (le|les) /g,(m,a)=>a==='le'?'au ':'aux ').replace(/([^.])\.\.(?=\s|$)/g,'$1.');
}
function t3FrenchPlan(plan){
 const p=JSON.parse(JSON.stringify(plan));
 const translateStop=s=>{
  if(s.event)s.event=t3FrenchEvent(s.event);
  // Round 12 (2026-10-20): an advisory caveat reads the venue's own French notice (venue.advisoryFr).
  const adv=s.venue&&s.venue.advisoryFr;
  s.label=t3FrenchText(s.label);s.why=(s.why||[]).map(t3FrenchText);s.caveats=(s.caveats||[]).map(c=>adv&&c===adv.en?adv.fr:t3FrenchText(c));
  if(s.unscheduledReason)s.unscheduledReason=t3FrenchText(s.unscheduledReason);
  if(s.scheduleNote)s.scheduleNote=t3FrenchText(s.scheduleNote);
  if(s.venue?.typeLabel)s.venue.typeLabel=s.venue.typeLabelFr||t3FrenchText(s.venue.typeLabel);
  if(s.venue?.listedHours)s.venue.listedHours=t3FrenchText(s.venue.listedHours).replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g,d=>({Mon:'lun.',Tue:'mar.',Wed:'mer.',Thu:'jeu.',Fri:'ven.',Sat:'sam.',Sun:'dim.'}[d]));
  for(const a of s.alternates||[])translateStop(a);
 };
 // Round 7: the When chip ("fall", "January") in French.
 if(p.understood&&p.understood.season&&p.understood.season.label){const l=String(p.understood.season.label),fr=FR_SEASON_WORDS[l.toLowerCase()]||FR_MONTHS_BY_EN[l]||l;p.understood.season={...p.understood.season,label:fr.charAt(0).toUpperCase()+fr.slice(1)};}
 if(p.understood){for(const key of ['interests','themes'])if(p.understood[key])p.understood[key]=p.understood[key].map(x=>{const q=/^“(.+)”$/.exec(String(x));if(!q)return t3FrenchText(x);const fr=t3FrenchText(q[1]);return fr!==q[1]?fr:'« '+q[1]+' »';});if(typeof p.understood.when==='string')p.understood.when=t3FrenchEvent({dateLabel:p.understood.when}).dateLabel.replace(/,/g,'');}
 const stops=p.days?.length?p.days.flatMap(d=>d.stops||[]):p.itinerary?.stops||p.outing?.stops||p.recommendations||[];
 for(const s of stops)translateStop(s);
 if(p.events)p.events=p.events.map(t3FrenchEvent);
 for(const i of p.requirementResults||[])if(i.reason)i.reason=t3FrenchText(i.reason);
 // Round 11 (2026-10-20): « Squamish et Whistler », not « Squamish and Whistler ».
 for(const d of p.days||[]){if(d.confirmNote)d.confirmNote=t3FrenchText(d.confirmNote);if(d.mealNote)d.mealNote=t3FrenchText(d.mealNote);if(typeof d.regionLabel==='string')d.regionLabel=d.regionLabel.replace(/ and /g,' et ');}
 if(p.experience?.title)p.experience.title=t3FrenchText(p.experience.title);
 if(p.understood&&Array.isArray(p.understood.notUsed))p.understood.notUsed=p.understood.notUsed.map(t3FrenchText);
 p.warnings=(p.warnings||[]).map(t3FrenchText);p.notes=(p.notes||[]).map(t3FrenchText);p.contextNotes=(p.contextNotes||[]).map(t3FrenchText);
 const names=stops.map(s=>s.venue?.name||s.event?.name).filter(Boolean);
 // Round 15 (2026-10-20): the plan's own French summary, written from the same data as the English one.
 // 2026-10-25 (tools audit): « les sentiers d’Ivey Lake », not « de Ivey Lake » (de before a vowel is elided).
 if(p.story&&p.story.textFr)p.story={...p.story,text:String(p.story.textFr).replace(/\bde (?=[AEIOUÉÈÊÂÎÔaeiouéèêâîô])/g,'d’')};
 if(names.length){
  const translatedSummary=p.summary?t3FrenchText(p.summary):'';
  const towns=[...new Set(stops.map(s=>s.venue?.regionLabel).filter(Boolean))],at=towns.length===1?' à '+towns[0]:towns.length===2?' à '+towns[0]+' et '+towns[1]:' '+FR_SITE.inArea;
  p.headline=p.days?.length?(p.days.length===1?'Votre journée'+at:'Votre voyage de '+p.days.length+' jours'+at):translatedSummary&&translatedSummary!==p.summary&&!/\b(?:and|in|with|the|of|for|near)\b/.test(translatedSummary)?translatedSummary:'Votre itinéraire'+at;
  // Round 8 (2026-10-19): a written French summary of the day (it was a plain list of names with arrows).
  if(p.experience)p.experience.text=p.experience.text?.startsWith('Timing conflict:')?t3FrenchText(p.experience.text):t3FrenchStory(p)+' Les horaires et les trajets restent à confirmer; consultez les détails de chaque arrêt.';
 }else {p.headline=t3FrenchText(p.headline||p.summary);if(p.experience?.text)p.experience.text=t3FrenchText(p.experience.text);}
 return p;
}
module.exports={t3FrenchHeadingCore,t3FrenchSummary,frSummaryItems,frSummaryList,frSummaryAround,frOccasionNoun,FR_SITE,frSiteIn,frSiteOut,t3FrenchTextCore,t3FrenchText,t3FrenchHeading,frHeadingWhen,frHeadingWhere,FR_HEADING_NAMES,FR_HEADING_DAYS,FR_HEADING_PARTS,FR_HEADING_OCCASIONS,FR_HEADING_WHEN_RE,t3FrenchEvent,t3FrenchPlan,t3FrenchStory,t3FrenchStopText,FR_MONTHS_BY_EN,FR_SEASON_WORDS,FR_STOP_NOUN};
