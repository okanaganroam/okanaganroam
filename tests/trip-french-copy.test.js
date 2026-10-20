'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {t3FrenchText,t3FrenchPlan}=require('../trip-french-copy');
test('French planner copy: timing preserves dates, times and uncertainty',()=>{
 const text=t3FrenchText('Listed event start 19:30 on 2026-10-16; listed end 21:30. Estimated driving assumed travel: 6–17 minutes; allow 30 minutes for arrival. This is a planning estimate, not a verified road route.');
 assert.match(text,/19:30/);assert.match(text,/16 octobre 2026/);assert.match(text,/6–17/);assert.match(text,/estim/);assert.ok(!/Listed|driving|verified road/.test(text));
});
test('French planner copy labels complementary stops as optional',()=>{
 assert.equal(t3FrenchText('Optional suggestion: Extra stop added to round out the day'),'Suggestion facultative : arrêt supplémentaire ajouté pour compléter la journée');
});
test('French date-night summary keeps its occasion and selected dinner',()=>{
 assert.equal(t3FrenchText('Date night: Dinner in Kelowna.'),'Soirée en amoureux : souper à Kelowna.');
 const plan=t3FrenchPlan({summary:'Date night: Dinner in Kelowna.',itinerary:{stops:[{venue:{name:'HUMO Kelowna'}}]}});
 assert.equal(plan.headline,'Soirée en amoureux : souper à Kelowna.');
});
test('French planner translates date-night fit reasons',()=>{
 assert.equal(t3FrenchText('A restaurant suits a date night'),'Un restaurant convient à une soirée en amoureux');
});
test('French rainy-day fit copy does not imply unverified indoor seating',()=>{
 assert.equal(t3FrenchText('Listed as an indoor venue'),'Répertorié comme lieu intérieur');
 assert.equal(t3FrenchText('Meal option; indoor seating is not confirmed'),'Option de repas; les places à l’intérieur ne sont pas confirmées');
 assert.equal(t3FrenchText('Indoor suitability is not confirmed'),'Le caractère intérieur n’est pas confirmé');
 assert.equal(t3FrenchText('Indoor kinds of places come first.'),'Les lieux intérieurs sont proposés en priorité.');
 assert.equal(t3FrenchText('Okanagan Roam doesn’t track the weather or confirm that a place is indoors, so check before you go.'),'Okanagan Roam ne suit pas la météo et ne confirme pas si un lieu est intérieur; vérifiez avant de partir.');
 assert.equal(t3FrenchText('Indoor suitability is not verified for every stop; check before visiting.'),'Le caractère intérieur n’est pas vérifié pour chaque arrêt; vérifiez avant de partir.');
});
test('French planner translates the upfront context notes as well as secondary notes',()=>{
 const p=t3FrenchPlan({kind:'outing',summary:'Rainy day in Penticton',contextNotes:['Indoor kinds of places come first.','Okanagan Roam doesn’t track the weather or confirm that a place is indoors, so check before you go.'],notes:[],outing:{stops:[{venue:{name:'LOCAL Public Eatery Penticton'}}]}});
 assert.deepEqual(p.contextNotes,['Les lieux intérieurs sont proposés en priorité.','Okanagan Roam ne suit pas la météo et ne confirme pas si un lieu est intérieur; vérifiez avant de partir.']);
});
test('French planner translates common walking and kid-friendly labels',()=>{
 const p=t3FrenchPlan({understood:{interests:['walks','Kid-friendly spots']},itinerary:{stops:[{why:['Has the Kid-Friendly badge']} ]}});
 assert.deepEqual(p.understood.interests,['promenades','Endroits adaptés aux enfants']);
 assert.equal(p.itinerary.stops[0].why[0],'Possède le badge Adapté aux enfants');
 assert.equal(t3FrenchText('easy walk'),'promenade facile');
 assert.equal(t3FrenchText('easy walks'),'promenades faciles');
 assert.equal(t3FrenchText('“walks”'),'“promenades”');
 assert.equal(t3FrenchText('kid-friendly spots'),'endroits adaptés aux enfants');
});
test('French missing-event next steps translate event category labels',()=>{
 assert.equal(t3FrenchText('market'),'marché');
 assert.equal(t3FrenchText('festival'),'festival');
 assert.equal(t3FrenchText('event'),'événement');
});
test('French planner copy: stored names, links and original plan remain unchanged',()=>{
 const p={kind:'itinerary',headline:'Dinner and live music',experience:{text:'Start with dinner.'},itinerary:{stops:[{label:'Dinner',venue:{name:'The English Cafe',url:'/venue',listedHours:'Listed hours: 16:00–23:00 daily'},why:['Matches your request for restaurants'],caveats:['Visit timing is unverified: hours, duration, transfer or the preceding stop could not be timed. Confirm before following this sequence.']} ]}};
 const before=JSON.stringify(p),fr=t3FrenchPlan(p);
 assert.equal(JSON.stringify(p),before);assert.equal(fr.itinerary.stops[0].venue.name,'The English Cafe');assert.equal(fr.itinerary.stops[0].venue.url,'/venue');assert.equal(fr.itinerary.stops[0].label,'Souper');assert.match(fr.itinerary.stops[0].why[0],/restaurants/);assert.match(fr.itinerary.stops[0].caveats[0],/non vérifi/);
});
test('French planner copy: missing requirements remain missing and preserve warning meaning',()=>{
 const p={kind:'itinerary',itinerary:{stops:[]},warnings:['Not met: hockey — No matching event was scheduled for the requested dates.'],requirementResults:[{value:'hockey',status:'unmet',reason:'No matching event was scheduled for the requested dates.'}]};
 const fr=t3FrenchPlan(p);assert.equal(fr.requirementResults[0].status,'unmet');assert.match(fr.warnings[0],/Non satisfait/);assert.match(fr.requirementResults[0].reason,/Aucun événement/);
});
test('French planner copy: unknown event duration stays explicitly unknown',()=>{
 const text=t3FrenchText('Listed event start 20:00 on 2026-10-14; event duration is not listed.');
 assert.match(text,/durée.*non indiquée/);assert.match(text,/20:00/);
});
test('French planner summary keeps an unscheduled dinner clear when no restaurant fits',()=>{
 const p={experience:{text:'Timing conflict: Dinner is not scheduled because no listed restaurant can fit before Kelowna Rockets starts at 18:05 with the listed hours and a 30-minute arrival allowance. Its end time is not listed, so dinner after the event cannot be timed. Try an earlier-opening restaurant or another date.'},itinerary:{stops:[{label:'Dinner',unscheduledMeal:true,unscheduledReason:'No listed restaurant fits before the event and arrival allowance.'},{label:'Hockey game',event:{name:'Kelowna Rockets'}}]}};
 const fr=t3FrenchPlan(p);
 assert.match(fr.experience.text,/Conflit d’horaire/);assert.match(fr.experience.text,/souper n’est pas planifié/);assert.match(fr.experience.text,/ne peut tenir avant/);assert.match(fr.experience.text,/heure de fin n’est pas indiquée/);assert.match(fr.itinerary.stops[0].unscheduledReason,/aucun restaurant/i);assert.doesNotMatch(fr.experience.text,/Arrêts proposés, dans l’ordre/);
});
test('French event labels: date ranges and clock times preserve the occurrence',()=>{
 const {t3FrenchEvent}=require('../trip-french-copy');
 assert.deepEqual(t3FrenchEvent({dateLabel:'Fri Oct 16',time:'7:30 pm',name:'Friday Night Live',url:'/event'}),{dateLabel:'ven. 16 oct.',time:'19 h 30',name:'Friday Night Live',url:'/event'});
 assert.equal(t3FrenchEvent({dateLabel:'Oct 16–18',time:'12 am'}).time,'minuit'); // round 13: « minuit », not « 00 h »
 assert.equal(t3FrenchEvent({dateLabel:'Dates to confirm',time:''}).time,'');
});
test('French less-common messages: missing activities and replacements keep the names and reason',()=>{
 assert.equal(t3FrenchText('No matching activity fits the morning on day 3; that time is left free rather than adding a meal.'),'Aucune activité correspondante ne convient le matin du jour 3; ce créneau reste libre plutôt que d’ajouter un repas.');
 assert.match(t3FrenchText('Used instead of Sunset Cafe because its timing could not be verified.'),/Sunset Cafe.*horaire.*vérifié/);
});

test('French access warning preserves the quoted listing wording exactly',()=>{
 const source='Play is after 4 p.m. on school days and dawn to dusk otherwise.';
 const note=require('../trip-requirements').listedAccessNotes({type:'sport',plannerDescription:source})[0];
 const fr=require('../trip-french-copy').t3FrenchText(note);
 assert.ok(fr.includes(source));assert.ok(fr.includes('texte original'));assert.ok(fr.includes('Confirmez l’accès'));
});

test('French sports allowance preserves uncertainty without claiming a booking',()=>{
 const fr=t3FrenchText('Uses planning allowances for visit length and travel. Sports visit length is a planning allowance, not a verified session or booking; confirm access, opening hours and the route with the operator.');
 assert.match(fr,/pas une séance ni une réservation confirmée/);assert.ok(!fr.includes('Sports visit length'));assert.match(fr,/confirmez l’accès/);
});

test('French results translate sports labels, location explanations and missing hours',()=>{
 const p={kind:'itinerary',understood:{interests:['sports & recreation venues'],themes:[]},itinerary:{stops:[{venue:{name:'Chip Trail Disc Golf',url:'/armstrong/sports/chip',typeLabel:'Sports & Recreation Venue'},why:['In Armstrong, where you asked to go'],caveats:['No usable hours listed on Okanagan Roam — check before you go']}]}};
 const before=JSON.stringify(p),fr=t3FrenchPlan(p),s=fr.itinerary.stops[0];
 assert.equal(fr.understood.interests[0],'lieux de sports et loisirs');assert.equal(s.venue.typeLabel,'Lieu de sports et loisirs');assert.equal(s.why[0],'À Armstrong, où vous souhaitez aller');assert.match(s.caveats[0],/Aucun horaire/);assert.equal(s.venue.name,'Chip Trail Disc Golf');assert.equal(JSON.stringify(p),before);
});

test('French multi-day cards retain names and translate explanations and listed weekdays',()=>{
 const p={days:[{day:1,stops:[{venue:{name:'Sun Cafe',url:'/sun-cafe',listedHours:'Listed hours: 12:00–19:00 Sun'},why:['Placed in the afternoon slot'],caveats:['Uses planning allowances for visit length and travel. Trail duration is not verified.']}]}]};
 const s=t3FrenchPlan(p).days[0].stops[0];assert.equal(s.venue.name,'Sun Cafe');assert.match(s.venue.listedHours,/dim\./);assert.match(s.why[0],/l’après-midi/);assert.ok(!s.caveats[0].includes('Trail duration'));
});
test('French planner copy: generic visit confirmation does not mention a trail',()=>{
 const text=t3FrenchText('Confirm visit duration, opening hours and travel before relying on this schedule.');
 assert.equal(text,'Confirmez la durée de visite, les horaires et le trajet avant de suivre cet horaire.');
 assert.doesNotMatch(text,/trail|sentier|Confirm visit/);
});
test('French timing copy separates own hours from inherited uncertainty',()=>{
 const text=t3FrenchText('This visit fits the listed opening hours. Timing remains provisional because a preceding stop is provisional.');
 assert.equal(text,'Cette visite respecte les horaires indiqués. L’horaire reste provisoire parce qu’un arrêt précédent est provisoire.');
 assert.equal(t3FrenchText('This stop’s opening hours are not verified.'),'Les horaires de cet arrêt ne sont pas vérifiés.');
 assert.match(t3FrenchText('Opening hours are taken from listing text and remain provisional.'),/texte de la fiche.*provisoires/);
});
test('French conditional dinner window preserves uncertainty and times',()=>{
 const text=t3FrenchText('Possible dinner arrival window 20:00–22:30, if travel permits. Allows 90 minutes for dinner within listed opening hours. This is not a scheduled visit: confirm the event-to-restaurant journey and kitchen service before booking.');
 assert.match(text,/20 h–22 h 30/);assert.match(text,/si le trajet le permet/);assert.match(text,/90 minutes/);assert.match(text,/Aucune visite n’est programmée/);assert.match(text,/service en cuisine/);assert.doesNotMatch(text,/Possible dinner|Allows|scheduled visit/);
});
test('French planner copy runs in the browser with a season or month (2026-10-19: FR_SEASON_WORDS was not shipped)',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
 const fr=require('../trip-french-copy');
 const pageSrc=fs.readFileSync(path.join(__dirname,'..','trip-planner-v3-page.js'),'utf8');
 assert.match(pageSrc,/var FR_MONTHS_BY_EN = \$\{JSON\.stringify\(FR_MONTHS_BY_EN\)\}/);
 assert.match(pageSrc,/var FR_SEASON_WORDS = \$\{JSON\.stringify\(FR_SEASON_WORDS\)\}/);
 // Same shape as the page: the lookups, then the functions as source text, in a fresh context.
 const src='var FR_MONTHS_BY_EN = '+JSON.stringify(fr.FR_MONTHS_BY_EN)+';\nvar FR_SEASON_WORDS = '+JSON.stringify(fr.FR_SEASON_WORDS)+';\n'
  +fr.t3FrenchText.toString()+'\n'+fr.t3FrenchEvent.toString()+'\n'+fr.t3FrenchPlan.toString()+'\nthis.run=t3FrenchPlan;';
 const ctx={};vm.createContext(ctx);vm.runInContext(src,ctx);
 const fall=ctx.run({summary:'3 days in Kelowna',understood:{season:{label:'fall'}},itinerary:{stops:[]}});
 assert.equal(fall.understood.season.label,'Automne');
 const jan=ctx.run({summary:'3 days in Kelowna',understood:{season:{label:'January'}},contextNotes:['The Okanagan’s ski hills usually run from December to early April, so skiing isn’t part of this July plan.'],itinerary:{stops:[]}});
 assert.equal(jan.understood.season.label,'Janvier');
 assert.match(JSON.stringify(jan),/juillet/);
});
