// The kind-PAIR sweep (sport test 4, 2026-11-20; Ryan's golf course also ticked "Driving range or mini golf" and Build My
// Trip read it as a range). Owners pick more than one kind: the MAIN kind (the first) decides, extra kinds add, never
// replace. For every pair (main + second kind) of the sport kinds: Build My Trip plans it for its main kind's plain request
// (and ranks it above a place that has that kind only as its second), its card in the plan says its main kind, search finds
// it for its main kind, and its page never says a third kind's own words. (Help: tests/sport-test4-fixes.test.js #2.)
// Runs on a throwaway database (like server.test.js); put okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-pair-sweep-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const SK = require('../sport-kinds.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let srv, base, ipN = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.125.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then((r) => r.status);
const getText = (p) => fetch(base + p, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const NOV = new Date('2026-11-20T12:00:00-08:00');
const GOLFISH = ['golf', 'simgolf', 'range'];
const TOWNS = ['vernon', 'penticton', 'osoyoos', 'oliver', 'summerland', 'peachland', 'west-kelowna', 'lake-country', 'naramata', 'enderby', 'armstrong', 'coldstream'];
const LAT = { vernon: 50.27, penticton: 49.49, osoyoos: 49.03, oliver: 49.18, summerland: 49.6, peachland: 49.77, 'west-kelowna': 49.86, 'lake-country': 50.05, naramata: 49.59, enderby: 50.55, armstrong: 50.45, coldstream: 50.22 };
const KIND_DESC = { golf: 'An 18-hole public course.', simgolf: 'Four golf simulator bays and a lounge.', range: 'A driving range with covered stalls.', rink: 'An ice rink with public skating.',
  skatepark: 'A concrete skate park with a bowl.', discgolf: 'An 18-hole disc golf course.', bike: 'A BMX track for all ages.', swim: 'An outdoor pool with a slide.', courts: 'Six pickleball courts.',
  skischool: 'Ski and snowboard lessons for kids and adults.', sportsctr: 'A sports centre with a gym.', sportother: 'A family sports place.' };
// Kinds a visitor plans for in July (courts and Something else aren't visitor stops; a sports centre is a rainy-day stop;
// ski lessons are out of season).
const PLANNED = ['golf', 'simgolf', 'range', 'rink', 'skatepark', 'discgolf', 'bike', 'swim'];
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// What only one kind says (as round 3's sweep): its price line, its unique price words and its button.
const OWN_WORDS = (() => {
  const out = {}, basisCount = {};
  for (const k of SK.SPORT_KINDS) for (const l of ['en', 'fr']) { const b = SK.K[k][l].price.basis; basisCount[b] = (basisCount[b] || 0) + 1; }
  for (const k of SK.SPORT_KINDS) {
    const w = [];
    for (const l of ['en', 'fr']) {
      const e = SK.K[k][l];
      if (!/^(?:From|À partir de) \{x\}\.$/.test(e.price.page)) w.push(esc(e.price.page.replace(/ ?\{x\}.*$/, '').trim()));
      if (basisCount[e.price.basis] === 1 && e.price.basis.split(' ').length > 1) w.push(esc(e.price.basis));
    }
    if (SK.K[k].bookBtn) w.push(...SK.K[k].bookBtn.map(esc));
    out[k] = w.filter((x) => x.length > 5);
  }
  return out;
})();

test('every kind pair: Build My Trip plans the main kind (above a place with it only as a second kind), says it on the card; search finds it; the page has no third kind\'s words', async () => {
  process.env.DISCOVERY_SEARCH = 'on';
  const bad = [];
  const made = {};
  try {
    let n = 0;
    for (const main of SK.SPORT_KINDS) {
      SK.SPORT_KINDS.filter((k) => k !== main).forEach((second, i) => {
        const town = TOWNS[i];
        // Neutral names: a name never says a kind (the planner reads names too).
        const v = app.createVenue({ name: `Pair Fixture ${String(n + 1).padStart(3, '0')}`, slug: `pair-fixture-${n + 1}`, region: town, type: GOLFISH.includes(main) ? 'golf' : 'sport', latitude: LAT[town] + (++n % 12) / 1000, longitude: -119.5,
          rating: 4.4, reviews: 80, address: `${n} Main St`, hours: JSON.stringify(WK('09:00', '20:00')), description: KIND_DESC[main], description_fr: 'Un endroit de sport.' });
        made[`${main}+${second}`] = { v, town };
      });
    }
    for (const [key, { v }] of Object.entries(made)) {
      const [main, second] = key.split('+');
      const t = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
      const st = await change(t, { indoor_info: { kinds: [main, second], length: '1-2h', book: 'ahead', age: 'all', year: 'all' }, indoor_price: 12 });
      if (![200, 201].includes(st)) bad.push(`${key}: save ${st}`);
    }
    if (app.clearVenueCaches) app.clearVenueCaches();
    for (const [key, { v, town }] of Object.entries(made)) {
      const [main, second] = key.split('+');
      const name = v.name;
      const townWords = town.replace(/-/g, ' ');
      // Build My Trip: planned for its main kind, ranked above the places that have that kind only second.
      if (PLANNED.includes(main)) {
        const p = app.runTripPlan({ text: `${SK.K[main].en.search[0]} in ${townWords} on Saturday July 17, 2027` }, NOV);
        const s = JSON.stringify([p.recommendations, p.itinerary, p.days, p.outing]);
        const at = s.indexOf(name);
        if (at < 0) bad.push(`${key}: not planned for "${SK.K[main].en.search[0]}"`);
        else {
          const rivals = Object.keys(made).filter((k) => k.endsWith(`+${main}`) && made[k].town === town);
          for (const r of rivals) { const ri = s.indexOf(made[r].v.name); if (ri >= 0 && ri < at) bad.push(`${key}: ranked below ${r} (a ${main} only as its second kind)`); }
          // The card says its main kind, never only its second kind's word.
          const card = s.slice(at, at + 1500), lbl = (/"typeLabel":"([^"]*)"/.exec(card) || [])[1] || '';
          const secondOnly = SK.SPORT_KIND_WORDS[second] && lbl && lbl === SK.SPORT_KIND_WORDS[second][0];
          if (secondOnly) bad.push(`${key}: plan card says "${lbl}"`);
        }
      }
      // Search: its main kind's words find it.
      if (main !== 'sportother') {
        const q = `${main === 'skischool' ? 'ski lessons' : SK.K[main].en.search[0]} ${townWords}`;
        const r = plain(await getText(`/search?q=${encodeURIComponent(q)}`));
        if (!r.includes(name)) bad.push(`${key}: search "${q}" misses it`);
      }
      // Its page: never a third kind's own words.
      const forbid = Object.entries(OWN_WORDS).filter(([k]) => k !== main && k !== second).flatMap(([, w]) => w);
      const words = new RegExp(`(?:${forbid.join('|')})`, 'i');
      for (const lang of ['en', 'fr']) {
        const h = app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now: NOV });
        const txt = plain(h.replace(/<title>[\s\S]*?<\/title>/, '')).replace(/Things to Do[\s\S]*?Business login/, '');
        const at = txt.indexOf(name);
        const m = words.exec(txt.slice(at));
        if (m) bad.push(`${key} [${lang}] page: "${m[0]}"`);
      }
    }
  } finally { delete process.env.DISCOVERY_SEARCH; }
  assert.deepEqual(bad, []);
});
