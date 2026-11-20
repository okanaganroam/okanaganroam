// Sport planner matrix (2026-11-20, the sport easy setup). For every sport kind, a listing its owner set up (kind, ages,
// walk-ins or book ahead, price, season) and the requests a visitor types for it, in English and French: it is planned
// when it should be (its kind, its town, in season) and left out when it shouldn't (out of season, a 19+ place on a kids
// trip, courts, which are a local facility rather than a visitor's stop). Its stop says its own price words ("Green fees
// from $59", "Adult public skate $5", Free) and the owner's booking answer. Golf kinds are type 'golf' listings.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-planner-matrix-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const SK = require('../sport-kinds.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const WK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['09:00', '20:00']]])));
const REG = { penticton: [49.49, -119.59], kelowna: [49.886, -119.495], vernon: [50.267, -119.272], oliver: [49.18, -119.55], 'big-white': [49.72, -118.93] };
let n = 0, ipN = 0, srv, base;
const mk = (type, region, o = {}) => app.createVenue({ name: `Planner ${++n}`, slug: `sport-planner-${n}`, region, type, latitude: REG[region][0] + n / 4000, longitude: REG[region][1], rating: 4.6, reviews: 300, address: `${n} Main St`, hours: WK, description: 'A place.', ...o });
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (v, changes) => fetch(`${base}/owner/${app.createOwnerLink(v.id, { reset: true }).url.split('/owner/')[1]}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.121.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then((r) => r.status);
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const JULY = new Date('2026-07-15T12:00:00-07:00'), JAN = new Date('2027-01-15T12:00:00-08:00');

// [kind, type, region, listing, owner answers, price, open_months, [request, when, in?, words on the stop]]
const CASES = [
  ['golf', 'golf', 'penticton', { name: 'Sagebrush Links Golf Club' }, { kinds: ['golf'], age: 'all', book: 'ahead', length: 'half', year: 'seasonal' }, 59, '04-01:10-31', [
    ['golf in Penticton', JULY, true, ['Green fees from', 'Book a tee time ahead (the owner’s own answer).']],
    ['golf with kids in Penticton', JULY, true],
    ['golf in Penticton', JAN, false],
    ['golf à Penticton', JULY, true, ['Droits de jeu à partir de']]]],
  ['simgolf', 'golf', 'kelowna', { name: 'Clubhouse Sim Bays', description: 'Indoor golf simulators.' }, { kinds: ['simgolf'], age: '19', book: 'ahead', length: '1-2h', year: 'all' }, 45, null, [
    ['indoor golf in Kelowna', JULY, true, ['Bays from']],
    ['golf simulator kelowna', JAN, true],
    ['indoor golf with kids in Kelowna', JULY, false]]],
  ['range', 'golf', 'kelowna', { name: 'Putters Paradise', description: 'An 18-hole mini golf course.' }, { kinds: ['range'], age: 'all', book: 'no', length: '1h', year: 'seasonal' }, 12, '04-15:10-15', [
    ['mini golf in Kelowna', JULY, true, ['From']],
    ['mini golf in Kelowna', JAN, false]]],
  ['rink', 'sport', 'vernon', { name: 'Vernon Ice Centre' }, { kinds: ['rink'], age: 'all', book: 'no', length: '1-2h', year: 'seasonal' }, 5, '10-01:03-31', [
    ['ice skating in Vernon', JAN, true, ['Adult public skate']],
    ['ice skating in Vernon', JULY, false],
    ['patinage à Vernon', JAN, true, ['Patinage libre adulte']]]],
  ['skatepark', 'sport', 'penticton', { name: 'Lower Bench Ride Park' }, { kinds: ['skatepark'], age: 'all', book: 'no', length: '1-2h', year: 'all' }, 'free', null, [
    ['skate park in Penticton', JULY, true],
    ['free things to do with kids in Penticton', JULY, true]]],
  ['discgolf', 'sport', 'vernon', { name: 'Hilltop Discs' }, { kinds: ['discgolf'], age: 'all', book: 'no', length: '1-2h', year: 'all' }, 'free', null, [
    ['disc golf in Vernon', JULY, true],
    ['disque-golf à Vernon', JULY, true]]],
  ['bike', 'sport', 'kelowna', { name: 'Glenmore Riders Club' }, { kinds: ['bike'], age: 'all', book: 'no', length: '1-2h', year: 'seasonal' }, 10, '04-15:10-15', [
    ['bmx track in Kelowna', JULY, true, ['From']],
    ['pump track in Kelowna', JULY, true],
    ['bmx track in Kelowna', JAN, false]]],
  ['swim', 'sport', 'oliver', { name: 'Desert Splash Outdoor Pool' }, { kinds: ['swim'], age: 'all', book: 'no', length: '1-2h', year: 'seasonal' }, 5, '06-01:08-31', [
    ['outdoor pool in Oliver', JULY, true, ['Adult swim']]]],
  ['skischool', 'sport', 'big-white', { name: 'Ridge Snow School' }, { kinds: ['skischool'], age: '5', book: 'ahead', length: 'half', year: 'seasonal' }, 89, '12-01:04-05', [
    ['ski lessons at Big White on January 15', JULY, true, ['Lessons from']],
    ['ski lessons at Big White on July 15', JULY, false],
    ['cours de ski à Big White le 15 janvier', JULY, true]]],
  ['courts', 'sport', 'penticton', { name: 'Robinson Racquet Courts' }, { kinds: ['courts'], age: 'all', book: 'no', length: '1-2h', year: 'all' }, 'free', null, [
    ['pickleball in Penticton', JULY, false]]],
];

test('the planner matrix covers every sport kind but the catch-all ones', () => {
  for (const k of SK.SPORT_KINDS.filter((x) => !['sportsctr', 'sportother'].includes(x))) assert.ok(CASES.some((c) => c[0] === k), k);
});

test('every sport kind is planned for its own requests, in season, with its own price words; left out of season and where it doesn\'t fit', async () => {
  const wrong = [];
  for (const [kind, type, region, o, info, price, om, asks] of CASES) {
    const v = mk(type, region, o);
    const st = [await change(v, { indoor_info: info }), await change(v, { indoor_price: price })].concat(om ? [await change(v, { open_months: om })] : []);
    assert.ok(st.every((x) => x === 200 || x === 201), `${kind}: ${st}`);
    for (const [q, when, want, words] of asks) {
      const p = app.runTripPlan({ text: q }, when);
      const stop = itemsOf(p).find((x) => x.venue.id === v.id);
      if (!!stop !== want) { wrong.push(`${kind}: "${q}" (${when.toISOString().slice(0, 10)}) ${want ? 'missing' : 'should be out'}; got ${itemsOf(p).slice(0, 4).map((x) => x.venue.name).join(', ')}`); continue; }
      for (const w of (stop && words) || []) if (!JSON.stringify(stop).includes(w)) wrong.push(`${kind}: "${q}" stop lacks "${w}"`);
    }
  }
  assert.deepEqual(wrong, []);
});
