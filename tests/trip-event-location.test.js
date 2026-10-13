'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resolveEventLocation}=require('../trip-event-location');
const venue={id:1,name:'The Hub on Martin',region:'penticton',latitude:49.5,longitude:-119.6,redirect_to:null};
test('Exact event location: case and outside whitespace match in the same region',()=>{
 assert.deepEqual(resolveEventLocation({venue_name_text:' The Hub On Martin ',region:'penticton'},[venue]),{venueId:1,lat:49.5,lng:-119.6});
});
test('Exact event location: duplicate names, other towns and fuzzy names stay unresolved',()=>{
 for(const [event,venues] of [[{venue_name_text:venue.name,region:'kelowna'},[venue]],[{venue_name_text:'Hub Martin',region:'penticton'},[venue]],[{venue_name_text:venue.name,region:'penticton'},[venue,{...venue,id:2}]]])assert.equal(resolveEventLocation(event,venues),null);
});
test('Exact event location: explicit links take precedence without guessing a replacement',()=>{
 assert.deepEqual(resolveEventLocation({venue_id:1},[venue]),{venueId:1,lat:49.5,lng:-119.6});
 assert.equal(resolveEventLocation({venue_id:2,venue_name_text:venue.name,region:'penticton'},[venue]),null);
});
test('Curated event locations: exact Prospera Place listing resolves only in Kelowna',()=>{
 assert.deepEqual(resolveEventLocation({venue_name_text:'Prospera Place',region:'kelowna'},[]),{venueId:null,lat:49.89258,lng:-119.4954});
 assert.deepEqual(resolveEventLocation({venue_name_text:'Prospera Place, Kelowna',region:'kelowna'},[]),{venueId:null,lat:49.89258,lng:-119.4954});
 for(const event of [
  {venue_name_text:'Prospera Place',region:'penticton'},
  {venue_name_text:'Prospera Place Annex',region:'kelowna'},
  {venue_name_text:'Prospera Place',region:'kelowna',venue_id:99},
 ])assert.equal(resolveEventLocation(event,[]),null);
});
test('Exact event location: redirected or missing/invalid coordinate listings stay unresolved',()=>{
 for(const patch of [{redirect_to:2},{latitude:null},{longitude:181},{latitude:''},{latitude:NaN}])assert.equal(resolveEventLocation({venue_id:1},[{...venue,...patch}]),null);
});
test('Event host normalization accepts only the full same-region venue name',()=>{
 assert.deepEqual(resolveEventLocation({venue_name_text:' The  Hub on Martin, Penticton ',region:'penticton'},[venue]),{venueId:1,lat:49.5,lng:-119.6});
 const apostrophe={...venue,name:"Winemaker's Hall"};
 assert.deepEqual(resolveEventLocation({venue_name_text:'Winemaker’s Hall, Penticton',region:'penticton'},[apostrophe]),{venueId:1,lat:49.5,lng:-119.6});
 for(const name of ['The Hub on Martin, Kelowna','The Hub on Martin Annex, Penticton','Hub on Martin, Penticton'])assert.equal(resolveEventLocation({venue_name_text:name,region:'penticton'},[venue]),null);
 assert.equal(resolveEventLocation({venue_name_text:'The Hub on Martin, Penticton',region:'penticton'},[venue,{...venue,id:2,name:'The Hub on Martin, Penticton'}]),null);
 assert.equal(resolveEventLocation({venue_id:99,venue_name_text:'The Hub on Martin, Penticton',region:'penticton'},[venue]),null);
});
