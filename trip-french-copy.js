'use strict';
// Display-only French copy. Stored venue names, URLs, facts and API output stay intact.
function t3FrenchText(value){
 let text=String(value||'');
 const directLabels={market:'marché',festival:'festival',event:'événement',walks:'promenades','easy walk':'promenade facile','easy walks':'promenades faciles','Kid-friendly spots':'Endroits adaptés aux enfants'};
 if(Object.prototype.hasOwnProperty.call(directLabels,text))return directLabels[text];
 const accessPrefix='Access / schedule from the listing: “',accessSuffix='” Confirm access and scheduling with the operator before visiting.';
 if(text.startsWith(accessPrefix)&&text.endsWith(accessSuffix))return 'Accès / horaires selon la fiche (texte original) : « '+text.slice(accessPrefix.length,-accessSuffix.length)+' » Confirmez l’accès et les horaires auprès de l’exploitant avant de partir.';
 const phrases=[
 ['An Okanagan Roam Local Favourite','Un coup de cœur local d’Okanagan Roam'],['One of Okanagan Roam’s Hidden Gems','L’un des trésors cachés d’Okanagan Roam'],
 ['A fun pick for teenagers','Une activité amusante pour les ados'],['Indoor fun for kids','Du plaisir à l’intérieur pour les enfants'],['A good rainy-day pick','Un bon choix pour un jour de pluie'],['An all-vegetarian or vegan kitchen','Une cuisine entièrement végétarienne ou végane'],['A good walk with your dog','Une belle promenade avec votre chien'],['A guided food tour','Une visite gourmande guidée'],
 ['Has the Kid-Friendly badge','Possède le badge Adapté aux enfants'],
 ['A restaurant suits a date night','Un restaurant convient à une soirée en amoureux'],
 ['Indoor kinds of places come first.','Les lieux intérieurs sont proposés en priorité.'],
 ['Okanagan Roam doesn’t track the weather or confirm that a place is indoors, so check before you go.','Okanagan Roam ne suit pas la météo et ne confirme pas si un lieu est intérieur; vérifiez avant de partir.'],
 ['Indoor suitability is not verified for every stop; check before visiting.','Le caractère intérieur n’est pas vérifié pour chaque arrêt; vérifiez avant de partir.'],
 ['Listed as an indoor venue','Répertorié comme lieu intérieur'],
 ['Meal option; indoor seating is not confirmed','Option de repas; les places à l’intérieur ne sont pas confirmées'],
 ['Indoor suitability is not confirmed','Le caractère intérieur n’est pas confirmé'],
 ['Timing conflict: ','Conflit d’horaire : '],
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
 ['No usable hours listed on Okanagan Roam — check before you go','Aucun horaire utilisable indiqué sur Okanagan Roam — vérifiez avant de partir'],
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
 ['shorter transfers are preferred. Confirm the route.','les trajets plus courts sont privilégiés. Confirmez le parcours.'],
 ['Listed event start ','Début indiqué de l’événement : '],['; listed end ','; fin indiquée : '],['; event duration is not listed','; durée de l’événement non indiquée'],
 ['Estimated visit ','Visite estimée : '],['within listed hours','pendant les heures indiquées'],['; uses an assumed start time','; heure de départ supposée'],
 ['Estimated driving assumed travel','Trajet estimé en voiture (mode supposé)'],['Estimated walking travel','Trajet estimé à pied'],[' travel to the event:',' vers l’événement :'],
 ['; allow 30 minutes for arrival','; prévoyez 30 minutes pour l’arrivée'],['Listed hours:','Horaires indiqués :'],
 ['Matches your request for ','Correspond à votre demande : '],[', where the event is',', où a lieu l’événement'],
 ['Its description mentions','Sa description mentionne'],['Listed on Okanagan Roam for','Répertorié sur Okanagan Roam pour'],['Has the verified','Possède le badge vérifié'],
 ['Event start time is not listed; confirm before visiting.','L’heure de début n’est pas indiquée; confirmez avant de partir.'],
 ['Matched a dated event occurrence.','Correspond à une occurrence datée de l’événement.'],['Matched an actual listing.','Correspond à une fiche existante.'],['No selected stop matches this exclusion.','Aucun arrêt choisi ne correspond à cette exclusion.'],['A selected stop conflicts with this exclusion.','Un arrêt choisi contredit cette exclusion.'],
 ['Wheelchair access isn’t listed on Okanagan Roam, so check with each place before you go.','L’accès en fauteuil roulant n’est pas indiqué sur Okanagan Roam; vérifiez auprès de chaque lieu avant de partir.'],
 ['Group seating isn’t listed on Okanagan Roam, so book ahead for a large group.','Les places pour les groupes ne sont pas indiquées sur Okanagan Roam; réservez à l’avance pour un grand groupe.'],
 ['Exact costs aren’t listed on Okanagan Roam; the plan favours lower price levels where they are known.','Les coûts exacts ne sont pas indiqués sur Okanagan Roam; le plan privilégie les prix plus bas lorsqu’ils sont connus.'],
 ['Places with higher listed prices are left out; not every place lists a price, so check before you go.','Les lieux aux prix indiqués plus élevés sont exclus; tous les lieux n’indiquent pas leurs prix, alors vérifiez avant de partir.'],
 ['No indoor backup could be fitted into this plan.','Aucune option intérieure n’a pu être intégrée à ce plan en cas de pluie.'],
 ['You asked for one dinner, so it is planned once and the other evenings are left free.','Vous avez demandé un seul souper : il est prévu une fois et les autres soirées restent libres.'],
 ['No matching event was scheduled for the requested dates.','Aucun événement correspondant n’a été prévu aux dates demandées.'],['Not met:','Non satisfait :'],['Not verified:','Non vérifié :'],['hockey game','match de hockey'],['live music','musique en direct'],['sports event','événement sportif']
 ];
 for(const [a,b] of phrases)text=text.split(a).join(b);
 text=text.replace(/Day (\d+) has no additional matching activity available\. The optional afternoon meal was left out; dinner remains\. Consider a different activity or a shorter trip\./g,'Le jour $1 ne comporte aucune autre activité correspondante disponible. Le repas facultatif de l’après-midi a été retiré; le souper reste au programme. Envisagez une autre activité ou un voyage plus court.');
 text=text.replace(/\beasy walks?\b/gi,match=>match.toLowerCase().endsWith('s')?'promenades faciles':'promenade facile');
 text=text.replace(/^In (.+), where you asked to go$/, 'À $1, où vous souhaitez aller');
 text=text.replace(/\bRated ([\d.]+) from ([\d,]+) reviews/g,'Note de $1 selon $2 avis').replace(/\bRated ([\d.]+)/g,'Note de $1');
 text=text.replace(/; includes (\d+) minutes waiting for the scheduled slot or opening/g,'; comprend $1 minutes d’attente pour le créneau prévu ou l’ouverture');
 text=text.replace(/Placed in the (morning|afternoon|evening) slot/g,(_,p)=>'Prévu '+({morning:'le matin',afternoon:'l’après-midi',evening:'le soir'}[p]));
 text=text.replace(/No selected stop meets (.+)\./g,'Aucun arrêt choisi ne satisfait $1.');
 text=text.replace(/^No (.+) could be fitted into this plan\.$/,(_,w)=>'Impossible d’intégrer ce qui suit dans le plan : '+({beach:'une plage',winery:'un vignoble',restaurant:'un restaurant','café':'un café','breakfast or brunch spot':'un endroit pour le déjeuner ou le brunch','golf course':'un terrain de golf','outdoor stop':'un arrêt en plein air',tour:'une visite guidée',brewery:'une microbrasserie',pub:'un pub','cocktail lounge':'un bar à cocktails',distillery:'une distillerie','indoor attraction':'une attraction intérieure','hike or walk':'une randonnée ou une promenade','ski hill':'une station de ski','snowshoe trail':'un sentier de raquette','winter activity':'une activité hivernale',viewpoint:'un point de vue'}[w]||w)+'.');
 text=text.replace(/^Not every stop is listed as (.+)\.$/,(_,w)=>'Les arrêts ne sont pas tous indiqués comme '+({'dog friendly':'acceptant les chiens','kid friendly':'adaptés aux enfants','vegetarian friendly':'offrant des options végétariennes','vegan friendly':'offrant des options végétaliennes','gluten-free friendly':'offrant des options sans gluten'}[w]||w)+'.');
 text=text.replace(/^Okanagan Roam can’t check (.+) from its listings, so confirm it before you go\.$/,'Okanagan Roam ne peut pas vérifier « $1 » dans ses fiches; confirmez avant de partir.');
 text=text.replace(/No (.+) is listed on What’s On( for the evening| for the daytime)? for those dates, so the rest of the plan is shown\./g,(_,kind,part)=>'Aucun événement correspondant ('+kind+') n’est répertorié'+(part?' pour cette période de la journée':'')+' aux dates demandées; le reste du plan est affiché.');
 text=text.replace(/No matching activity fits the morning on day (\d+); that time is left free rather than adding a meal\./g,'Aucune activité correspondante ne convient le matin du jour $1; ce créneau reste libre plutôt que d’ajouter un repas.');
 text=text.replace(/Used instead of (.+) because its timing could not be verified\./g,'Choisi à la place de $1, dont l’horaire n’a pas pu être vérifié.');
 text=text.replace(/Used instead of (.+) because its listed hours do not fit the estimated sequence\./g,'Choisi à la place de $1, dont les horaires indiqués ne conviennent pas à la séquence estimée.');
 text=text.replace(/No suitable (morning|afternoon|evening) stop was found for day (\d+)( in (.+))?\./g,(_,part,day,where,town)=>'Aucun arrêt approprié '+({morning:'le matin',afternoon:'l’après-midi',evening:'le soir'}[part])+' du jour '+day+(town?' à '+town:'')+'.');
 text=text.replace(/Nothing matching (.+) was available( in (.+))?\./g,(_,what,where,town)=>'Aucune option correspondant à '+what+(town?' à '+town:'')+' n’était disponible.');
 text=text.replace(/(Morning|Afternoon|Evening) on day (\d+) is kept free for the event’s listed duration\./g,(_,part,day)=>({Morning:'Le matin',Afternoon:'L’après-midi',Evening:'Le soir'}[part])+' du jour '+day+' reste libre pour la durée indiquée de l’événement.');
 text=text.replace('Reserved for the listed event time.','Réservé pour l’horaire indiqué de l’événement.');
 text=text.replace(/A later assumed start reduces waiting while keeping the same stops and listed opening hours\. Estimated first visit: ([\d:]+)\. Change your request to specify a start time\./g,'Un départ supposé plus tard réduit l’attente tout en conservant les mêmes arrêts et horaires indiqués. Première visite estimée : $1. Précisez une heure de départ dans votre demande.');
 text=text.replace(/Trip starts on (\d{4}-\d{2}-\d{2}) \(Okanagan calendar date\)\./g,'Le voyage commence le $1 (date locale de l’Okanagan).');
 text=text.replace(/^Date night: Dinner in (.+)\.$/,'Soirée en amoureux : souper à $1.');
 text=text.replace(/^If it rains: (.+) (?:are|is) indoors nearby, so swap (?:one|it) in for a beach or outdoor stop\.$/,(_,names)=>'S’il pleut : '+names.replace(/ and (?!.* and )/,' et ')+(/ and /.test(names)?' sont des options intérieures à proximité; remplacez une plage ou une sortie en plein air par l’une d’elles.':' est une option intérieure à proximité; remplacez une plage ou une sortie en plein air par celle-ci.'));
 text=text.replace(/^Okanagan Roam doesn’t list (.+) for these places, so they’re matched on the rest of your request; check with each place\.$/,(_,w)=>'Okanagan Roam n’indique pas '+w.replace(/“/g,'« ').replace(/”/g,' »').replace(/ and (?!.* and )/,' et ')+' pour ces lieux; ils correspondent au reste de votre demande. Vérifiez auprès de chaque lieu.');
 text=text.replace(/^Based in (.+), with day (\d+) as your day trip to (.+)\.$/,'Basé à $1, avec le jour $2 consacré à votre excursion à $3.');
 text=text.replace(/^Planned as a road trip from (.+) to (.+), one stretch of the valley each day\.$/,'Planifié comme un road trip de $1 à $2, une portion de la vallée chaque jour.');
 text=text.replace(/ on (\d{4}-\d{2}-\d{2})/g,' le $1');
 const words={Cafes:'Cafés',Wineries:'Vignobles',Breweries:'Microbrasseries',Beaches:'Plages',Dinner:'Souper',Supper:'Souper',Lunch:'Dîner',Breakfast:'Déjeuner','Live-music':'Musique en direct','Live music':'Musique en direct',Morning:'Matin',Afternoon:'Après-midi',Evening:'Soir',cafes:'cafés',wineries:'vignobles',walks:'promenades','kid-friendly spots':'endroits adaptés aux enfants','indoor & rainy day spots':'lieux intérieurs et jours de pluie','outdoor destinations':'lieux de plein air','Hiking & Trails':'Randonnées et sentiers','dog-friendly spots':'endroits qui acceptent les chiens','vegetarian-friendly venues':'lieux avec options végétariennes','vegan-friendly venues':'lieux avec options véganes','lake time':'temps au bord du lac','golf courses':'terrains de golf','cocktail lounges':'bars à cocktails','tours & experiences':'visites et expériences',breweries:'microbrasseries',beaches:'plages',daily:'tous les jours','Mon–Thu':'lun.–jeu.','Fri–Sat':'ven.–sam.',Sun:'dim.'};
 for(const [a,b] of Object.entries(words)){if(text===a)text=b;else if(a===a.toLowerCase()||a.includes('–')||a.includes('&'))text=text.replace(new RegExp('\\b'+a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','g'),b);}
 text=text.replace(/^In (.+), où a lieu l’événement$/, 'À $1, où a lieu l’événement');
 // Opening hours inside a reason ("Listed hours: 11:00–22:00 Mon–Fri; 10:00–22:00 Sat").
 if(/\d{2}:\d{2}/.test(text))text=text.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g,d=>({Mon:'lun.',Tue:'mar.',Wed:'mer.',Thu:'jeu.',Fri:'ven.',Sat:'sam.',Sun:'dim.'}[d]));
 return text;
}
function t3FrenchEvent(event){
 const e={...event};
 const days={Mon:'lun.',Tue:'mar.',Wed:'mer.',Thu:'jeu.',Fri:'ven.',Sat:'sam.',Sun:'dim.'};
 const months={Jan:'janv.',Feb:'févr.',Mar:'mars',Apr:'avr.',May:'mai',Jun:'juin',Jul:'juill.',Aug:'août',Sep:'sept.',Oct:'oct.',Nov:'nov.',Dec:'déc.'};
 e.dateLabel=String(e.dateLabel||'').replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g,d=>days[d]).replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}(?:[–-]\d{1,2})?)/g,(_,m,d)=>d+' '+months[m]);
 e.time=String(e.time||'').replace(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi,(raw,h,m,part)=>{
  if(Number(h)<1||Number(h)>12||Number(m||0)>59)return raw;
  const hour=Number(h)%12+(part.toLowerCase()==='pm'?12:0);
  return String(hour).padStart(2,'0')+' h'+(m&&m!=='00'?' '+m:'');
 });
 return e;
}
function t3FrenchPlan(plan){
 const p=JSON.parse(JSON.stringify(plan));
 const translateStop=s=>{
  if(s.event)s.event=t3FrenchEvent(s.event);
  s.label=t3FrenchText(s.label);s.why=(s.why||[]).map(t3FrenchText);s.caveats=(s.caveats||[]).map(t3FrenchText);
  if(s.unscheduledReason)s.unscheduledReason=t3FrenchText(s.unscheduledReason);
  if(s.scheduleNote)s.scheduleNote=t3FrenchText(s.scheduleNote);
  if(s.venue?.typeLabel)s.venue.typeLabel=t3FrenchText(s.venue.typeLabel);
  if(s.venue?.listedHours)s.venue.listedHours=t3FrenchText(s.venue.listedHours).replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g,d=>({Mon:'lun.',Tue:'mar.',Wed:'mer.',Thu:'jeu.',Fri:'ven.',Sat:'sam.',Sun:'dim.'}[d]));
  for(const a of s.alternates||[])translateStop(a);
 };
 if(p.understood){for(const key of ['interests','themes'])if(p.understood[key])p.understood[key]=p.understood[key].map(t3FrenchText);if(typeof p.understood.when==='string')p.understood.when=t3FrenchEvent({dateLabel:p.understood.when}).dateLabel.replace(/,/g,'');}
 const stops=p.days?.length?p.days.flatMap(d=>d.stops||[]):p.itinerary?.stops||p.outing?.stops||p.recommendations||[];
 for(const s of stops)translateStop(s);
 if(p.events)p.events=p.events.map(t3FrenchEvent);
 for(const i of p.requirementResults||[])if(i.reason)i.reason=t3FrenchText(i.reason);
 p.warnings=(p.warnings||[]).map(t3FrenchText);p.notes=(p.notes||[]).map(t3FrenchText);p.contextNotes=(p.contextNotes||[]).map(t3FrenchText);
 const names=stops.map(s=>s.venue?.name||s.event?.name).filter(Boolean);
 if(names.length){
  const translatedSummary=p.summary?t3FrenchText(p.summary):'';
  const towns=[...new Set(stops.map(s=>s.venue?.regionLabel).filter(Boolean))],at=towns.length===1?' à '+towns[0]:towns.length===2?' à '+towns[0]+' et '+towns[1]:' dans l’Okanagan';
  p.headline=p.days?.length?(p.days.length===1?'Votre journée'+at:'Votre voyage de '+p.days.length+' jours'+at):translatedSummary&&translatedSummary!==p.summary&&!/\b(?:and|in|with|the|of|for|near)\b/.test(translatedSummary)?translatedSummary:'Votre itinéraire'+at;
  if(p.experience)p.experience.text=p.experience.text?.startsWith('Timing conflict:')?t3FrenchText(p.experience.text):'Arrêts proposés, dans l’ordre : '+names.join(' → ')+'. Les horaires et les trajets restent à confirmer; consultez les détails de chaque arrêt.';
 }else {p.headline=t3FrenchText(p.headline||p.summary);if(p.experience?.text)p.experience.text=t3FrenchText(p.experience.text);}
 return p;
}
module.exports={t3FrenchText,t3FrenchEvent,t3FrenchPlan};
