'use strict';
// Exact event-host aliases used only when the event has no linked venue record.
// Prospera's official contact/directions pages confirm its Kelowna address;
// coordinates are the mapped venue point for OSM way 1225579073.
const CURATED_EVENT_LOCATIONS = [
  {name:'prospera place',region:'kelowna',venueId:null,lat:49.89258,lng:-119.4954,
   address:'1223 Water St, Kelowna, BC V1Y 9V1',
   sources:['https://prosperaplace.com/contact-us/','https://mapcarta.com/W1225579073']},
];

// Full normalized names within one region, existing explicit venue links, or
// a manually curated exact host alias. Duplicate candidates remain ambiguous.
function resolveEventLocation(event,venues){
  const key=value=>{
    const text=String(value||'').replace(/[‘’]/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
    const suffix=', '+String(event.region||'').replace(/-/g,' ').toLowerCase();
    return event.region&&text.endsWith(suffix)?text.slice(0,-suffix.length).trim():text;
  };
  const name=key(event.venue_name_text);
  const candidates=venues.filter(v=>v.redirect_to==null&&(event.venue_id!=null?v.id===event.venue_id:name&&event.region&&v.region===event.region&&key(v.name)===name));
  if(candidates.length===0&&event.venue_id==null){
    const curated=CURATED_EVENT_LOCATIONS.filter(v=>v.region===event.region&&v.name===name);
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
