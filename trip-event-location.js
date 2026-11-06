'use strict';
// Exact event-host aliases used only when the event has no linked venue record.
// Each entry: {name (normalized, '&' -> 'and'), region (slug), venueId:null, lat, lng, address, sources[]}: per site in trip-site.js.
const CURATED_EVENT_LOCATIONS = require('./trip-site.js').curatedEventLocations;

// Full normalized names within one region, existing explicit venue links, or
// a manually curated exact host alias. Duplicate candidates remain ambiguous.
// Round 14 (2026-10-20): a host written as "Name, street address" ("Some Hall, 1234 Main St") is also
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
