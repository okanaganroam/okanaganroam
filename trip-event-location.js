'use strict';
// Exact event-host aliases used only when the event has no linked venue record.
// Prospera's official contact/directions pages confirm its Kelowna address;
// coordinates are the mapped venue point for OSM way 1225579073.
// Round 14 (2026-10-20): two Penticton holiday-market hosts with no listing of their own (they were "not on the map"):
// the Penticton Trade & Convention Centre (273 Power St; OSM way 1026269633) and West Bench Elementary
// (1604 West Bench Dr; OSM way 1068313494). Names are matched after "&" -> "and".
const CURATED_EVENT_LOCATIONS = [
  {name:'prospera place',region:'kelowna',venueId:null,lat:49.89258,lng:-119.4954,
   address:'1223 Water St, Kelowna, BC V1Y 9V1',
   sources:['https://prosperaplace.com/contact-us/','https://mapcarta.com/W1225579073']},
  {name:'penticton trade and convention centre',region:'penticton',venueId:null,lat:49.4964026,lng:-119.6058051,
   address:'273 Power St, Penticton, BC V2A 7K9',
   sources:['https://www.openstreetmap.org/way/1026269633']},
  {name:'west bench elementary',region:'penticton',venueId:null,lat:49.5010705,lng:-119.631027,
   address:'1604 West Bench Dr, Penticton, BC',
   sources:['https://www.openstreetmap.org/way/1068313494']},
];

// Full normalized names within one region, existing explicit venue links, or
// a manually curated exact host alias. Duplicate candidates remain ambiguous.
// Round 14 (2026-10-20): a host written as "Name, street address" ("West Bench Elementary, 1604 W Bench Dr") is also
// tried by its name alone, and "&" reads as "and"; a different town after the comma never matches.
function resolveEventLocation(event,venues){
  const key=value=>{
    const text=String(value||'').replace(/[‘’]/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
    const suffix=', '+String(event.region||'').replace(/-/g,' ').toLowerCase();
    return event.region&&text.endsWith(suffix)?text.slice(0,-suffix.length).trim():text;
  };
  const amp=text=>text.replace(/\s*&\s*/g,' and ').replace(/\s+/g,' ').trim();
  const full=key(event.venue_name_text);
  const comma=full.indexOf(', ');
  const short=comma>0&&/^\d/.test(full.slice(comma+2))?full.slice(0,comma).trim():null;
  const names=[...new Set([full,amp(full),short,short&&amp(short)].filter(Boolean))];
  const candidates=venues.filter(v=>v.redirect_to==null&&(event.venue_id!=null?v.id===event.venue_id:names.length&&event.region&&v.region===event.region&&(names.includes(key(v.name))||names.includes(amp(key(v.name))))));
  if(candidates.length===0&&event.venue_id==null){
    const curated=CURATED_EVENT_LOCATIONS.filter(v=>v.region===event.region&&names.includes(v.name));
    if(curated.length===1){const {venueId,lat,lng}=curated[0];return {venueId,lat,lng};}
    return null;
  }
  if(candidates.length!==1)return null;
  const v=candidates[0];
  if(v.latitude==null||v.longitude==null||String(v.latitude).trim()===''||String(v.longitude).trim()==='')return null;
  const lat=Number(v.latitude),lng=Number(v.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return null;
  return {venueId:v.id,lat,lng};
}
module.exports={resolveEventLocation};
