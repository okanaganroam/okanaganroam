const test=require('node:test'),assert=require('node:assert/strict');
const {tripWorkspaceDay,tripWorkspaceBooking}=require('../trip-workspace-layout');
test('day selection survives edits but safely falls back when a day disappears',()=>{
 assert.equal(tripWorkspaceDay([1,2,3],2),2);assert.equal(tripWorkspaceDay([1],3),1);assert.equal(tripWorkspaceDay([],2),null);
});
test('booking links belong to this venue and prefer its own booking link',()=>{
 const steps=[{id:9,kind:'venue',url:'https://other.example'},{id:1,kind:'venue',url:'https://partner.example',affiliate:true},{id:1,kind:'venue',url:'https://business.example/book'}];
 assert.equal(tripWorkspaceBooking(1,steps).url,'https://business.example/book');
 assert.equal(tripWorkspaceBooking(2,steps),null);
 assert.equal(tripWorkspaceBooking(1,[{id:1,kind:'venue',url:'javascript:alert(1)'}]),null);
});
test('chat targets the requested day before selecting the first matching stop',()=>{
 const tc=require('../trip-chat');
 const stops=[1,2].flatMap(day=>[1,2].map(n=>({key:day+'-'+(n===1?'morning':'afternoon'),ref:'s'+(day*2+n),id:day*2+n,name:'Winery '+day+n,type:'winery',day,start:600+n*100,badges:[]})));
 const r=tc.rulesRead('Remove the first winery on day 2',stops,{days:2});
 assert.deepEqual(r.ops.find(o=>o.o==='remove').stops.map(s=>s.key),['2-morning']);
});
