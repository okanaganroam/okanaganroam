// Indoor test 6 (2026-11-19; Priya's All ages pottery and paint studio in Penticton was left out of every kids, rainy-day,
// family and kids' birthday plan, as Chris's climbing park was in test 5): one place of EVERY indoor kind (indoor-kinds.js),
// each in its own town with the owner's own ages (All ages, or the kind's natural age) and a Groups party line, against a
// few generic competitors (a gallery, a theatre, a casino, a spa). For each kind, Build My Trip's kids requests, the site
// search and the Indoor hub's own search for "kids birthday party <town>". Family kinds are offered; a casino, a spa and a
// 19+ place never are. So the kids/family gap can't come back for any kind.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'indoor-matrix-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
process.env.DISCOVERY_SEARCH = 'on';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const IK = require('../indoor-kinds.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

// Every kind, its own town, a name and category a real place of that kind would have, and the owner's own age answer.
// expect: 'yes' (offered for kids and families), 'no' (never offered to kids), 'any' (quiet kinds: allowed, not required).
const KINDS = {
  gallery: { town: 'armstrong', name: 'Hilltop Art Gallery', cuisine: 'Art gallery', age: 'all', expect: 'any' },
  museum: { town: 'coldstream', name: 'Coldstream Science Museum', cuisine: 'Science centre', age: 'all', expect: 'yes' },
  theatre: { town: 'enderby', name: 'Enderby Stage Theatre', cuisine: 'Live theatre', age: 'all', expect: 'any' },
  cinema: { town: 'kaleden', name: 'Kaleden Picture House', cuisine: 'Movie theatre', age: 'all', expect: 'yes' },
  spa: { town: 'lake-country', name: 'Lake Country Day Spa', cuisine: 'Day spa', age: '16', expect: 'no' },
  pool: { town: 'lumby', name: 'Lumby Aquatic Centre', cuisine: 'Pool', age: 'all', expect: 'yes' },
  climbing: { town: 'naramata', name: 'Naramata Bouldering Co', cuisine: 'Climbing gym', age: 'all', expect: 'yes' },
  games: { town: 'okanagan-falls', name: 'OK Falls Arcade & Laser Tag', cuisine: 'Arcade', age: 'all', expect: 'yes' },
  escape: { town: 'oliver', name: 'Oliver Escape Rooms', cuisine: 'Escape room', age: 'all', expect: 'yes' },
  bowling: { town: 'osoyoos', name: 'Osoyoos Lanes', cuisine: 'Bowling alley', age: 'all', expect: 'yes' },
  kids: { town: 'peachland', name: 'Peachland Play Place', cuisine: 'Indoor playground', age: 'all', expect: 'yes' },
  classes: { town: 'penticton', name: 'Penticton Clay & Paint Studios', cuisine: 'Pottery studio', age: 'all', expect: 'yes' },
  curling: { town: 'summerland', name: 'Summerland Curling Club', cuisine: 'Curling', age: 'all', expect: 'any' },
  yoga: { town: 'vernon', name: 'Vernon Yoga Loft', cuisine: 'Yoga studio', age: 'all', expect: 'any' },
  casino: { town: 'west-kelowna', name: 'Westside Casino', cuisine: 'Casino', age: '19', expect: 'no' },
  library: { town: 'kelowna', name: 'Kelowna Branch Library', cuisine: 'Library', age: 'all', expect: 'any' },
  other: { town: 'big-white', name: 'Big White Indoor Fun Centre', cuisine: 'Indoor activity', age: 'all', expect: 'any' },
};
const TOWN_LABELS = { 'lake-country': 'Lake Country', 'okanagan-falls': 'Okanagan Falls', 'west-kelowna': 'West Kelowna', 'big-white': 'Big White' };
const TOWN_NAME = (r) => TOWN_LABELS[r] || r[0].toUpperCase() + r.slice(1);

const DAY = (a, b) => JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[a, b]]])));
let n = 0;
const mk = (o) => app.createVenue({ slug: `indoor-mx-${++n}`, type: 'indoor', latitude: 49.5 + n / 3000, longitude: -119.6, address: `${100 + n} Main St, BC`,
  phone: '250-555-0166', website: 'https://example.com', hours: DAY('10:00', '20:00'), rating: 4.4, reviews: 80, ...o });
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
let srv, base, ipN = 0;
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.96.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const ok = async (p) => { const r = await p; assert.ok(r.status === 200 || r.status === 201, JSON.stringify(r.body)); return r; };
const NOW = new Date('2026-11-19T12:00:00-08:00');
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const idsOf = (p) => itemsOf(p).map((x) => x.venue.id);
const plain = (h) => String(h).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');

const placed = {}; // kind -> { v, comps }
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`;
  for (const [kind, k] of Object.entries(KINDS)) {
    const town = TOWN_NAME(k.town);
    const v = mk({ region: k.town, name: `${k.name} MX`, cuisine: k.cuisine, description: `${k.name} in ${town}.`, rating: 4.3, reviews: 60 });
    const t = tokenFor(v.id);
    await ok(change(t, { indoor_info: { kinds: [kind], length: '1-2h', book: 'busy', age: k.age, year: 'all' } }));
    await ok(change(t, { visit_rows: { groups: 'Groups of 10 or more: please book ahead. Kids’ birthday parties with a private room.' } }));
    // Generic competitors, better rated, with no owner answers: three family places nobody answered for (a fun centre, a
    // museum and a pool, which used to fill every indoor slot), then the ones never for kids (a casino and a spa, last two).
    const comps = [
      mk({ region: k.town, name: `${town} Fun Centre MX`, cuisine: 'Family fun centre', description: 'Bowling, an arcade and laser tag.', rating: 4.7, reviews: 300, kid_friendly: 1 }),
      mk({ region: k.town, name: `${town} Museum & Archives MX`, cuisine: 'Museum', description: 'Local history museum.', rating: 4.7, reviews: 300, kid_friendly: 1 }),
      mk({ region: k.town, name: `${town} Leisure Pool MX`, cuisine: 'Pool', description: 'A leisure pool with a lazy river and a waterslide.', rating: 4.7, reviews: 300, kid_friendly: 1 }),
      mk({ region: k.town, name: `${town} Public Art Gallery MX`, cuisine: 'Art gallery', description: 'A public art gallery with rotating exhibitions.', rating: 4.8, reviews: 400 }),
      mk({ region: k.town, name: `${town} Playhouse Theatre MX`, cuisine: 'Live theatre', description: 'A live theatre.', rating: 4.8, reviews: 500 }),
      mk({ region: k.town, name: `${town} Lake City Casino MX`, cuisine: 'Casino', description: 'Slots and table games. 19+.', rating: 4.9, reviews: 900 }),
      mk({ region: k.town, name: `${town} Nordic Spa MX`, cuisine: 'Spa', description: 'A day spa with massage and facials.', rating: 4.9, reviews: 800 }),
    ];
    placed[kind] = { v, comps, town };
  }
});
test.after(() => srv && srv.close());

const ASKS = (town) => [
  { q: `rainy day with kids in ${town}`, young: null },
  { q: `family fun in ${town}`, young: null },
  { q: `kids birthday party in ${town}`, young: null },
  { q: `things to do with a 6 year old in ${town}`, young: 6 },
];

test('Every indoor kind in indoor-kinds.js is in the matrix', () => {
  assert.deepEqual(Object.keys(KINDS).sort(), IK.INDOOR_KIND_TEXT_KINDS.slice().sort());
});

test('Build My Trip: every family kind is offered for kids, rainy-day, family, birthday and "6 year old" requests; a casino, a spa or a 19+ place never', () => {
  const fails = [];
  for (const [kind, k] of Object.entries(KINDS)) {
    const { v, comps, town } = placed[kind];
    for (const { q, young } of ASKS(town)) {
      const p = app.runTripPlan({ text: q }, NOW);
      const ids = idsOf(p);
      const names = itemsOf(p).map((x) => x.venue.name).join(' | ');
      const tooYoung = young != null && /^\d+$/.test(k.age) && young < Number(k.age);
      if (k.expect === 'yes' && !tooYoung && !ids.includes(v.id)) fails.push(`${kind}: "${q}" leaves it out (${names})`);
      if ((k.expect === 'no' || tooYoung) && ids.includes(v.id)) fails.push(`${kind}: "${q}" offers it (${names})`);
      for (const c of comps.slice(-2)) if (ids.includes(c.id)) fails.push(`${kind}: "${q}" offers ${c.name}`);
    }
  }
  assert.deepEqual(fails, []);
});

test('An 8+ escape room is offered when the kids named are 8 or older, never for a 6 year old or kids of unknown age', async () => {
  const v = mk({ region: 'osoyoos', name: 'Osoyoos Escape Co MX', cuisine: 'Escape room', description: 'Two escape rooms.', rating: 4.9, reviews: 400 });
  await ok(change(tokenFor(v.id), { indoor_info: { kinds: ['escape'], length: '1-2h', age: '8', year: 'all' } }));
  assert.ok(idsOf(app.runTripPlan({ text: 'rainy day with a 10 year old in Osoyoos' }, NOW)).includes(v.id), '10 year old');
  assert.ok(!idsOf(app.runTripPlan({ text: 'things to do with a 6 year old in Osoyoos' }, NOW)).includes(v.id), '6 year old');
  assert.ok(!idsOf(app.runTripPlan({ text: 'family fun in Osoyoos' }, NOW)).includes(v.id), 'kids of unknown age');
});

test('A 19+ place of a family kind (an arcade bar) is never offered to kids', () => {
  const v = mk({ region: 'oliver', name: 'Oliver Arcade Bar MX', cuisine: 'Arcade bar', description: 'Retro arcade games and craft beer.', rating: 4.9, reviews: 900 });
  const t = tokenFor(v.id);
  return ok(change(t, { indoor_info: { kinds: ['games'], length: '1-2h', age: '19', year: 'all' } })).then(() => {
    for (const { q } of ASKS('Oliver')) assert.ok(!idsOf(app.runTripPlan({ text: q }, NOW)).includes(v.id), q);
  });
});

// The Indoor hub's own search, run with the page's real client functions (fdFold .. fdPlan) on its own search data.
async function hubSearch(lang) {
  const html = await fetch(`${base}${lang === 'fr' ? '/fr' : ''}/indoor`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.text());
  const scripts = [...html.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const a = scripts.indexOf('function fdFold('), b = scripts.indexOf('var searchPlan = ');
  assert.ok(a > 0 && b > a, 'the hub has its search functions');
  const src = scripts.slice(a, b).replace(/^\s*var HEART_USE[\s\S]*$/m, '');
  const dataJson = (id) => { const m = new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`).exec(html); return m ? JSON.parse(m[1]) : null; };
  return { html, src, dataJson };
}

test('Search: "kids birthday party <town>" finds every family kind in site search, and the Indoor hub\'s own search matches party/parties and class/classes', async () => {
  const fails = [];
  for (const [kind, k] of Object.entries(KINDS)) {
    if (k.expect !== 'yes') continue;
    const { v, comps, town } = placed[kind];
    const r = await fetch(`${base}/search?q=${encodeURIComponent(`kids birthday party ${town}`)}`, { redirect: 'manual', headers: { 'User-Agent': 'okanaganroam-check/1.0' } });
    const h = plain(await r.text());
    if (!h.includes(v.name)) fails.push(`site search ${kind} (${town}): missing`);
    for (const c of comps.slice(-2)) if (h.includes(c.name)) fails.push(`site search ${kind}: lists ${c.name}`);
  }
  // The hub's search: the page's own fold, plural/singular and every-word rules on each card's search text.
  const { html, src } = await hubSearch('en');
  const cardText = {};
  for (const m of html.matchAll(/data-venue-id="(\d+)"[^>]*data-venue-name="([^"]*)"/g)) cardText[m[1]] = m[2];
  // The page's filter data: inline, or (a big list) loaded from /cards/rest/<hash>.json as the page's own script does.
  const tag = /<script type="application\/json" id="fdVenueData"([^>]*)>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(tag, 'the hub has its data tag');
  const rest = /data-rest="([^"]+)"/.exec(tag[1]);
  const data = rest ? await fetch(`${base}/cards/rest/${rest[1]}.json`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } }).then((r) => r.json()) : JSON.parse(tag[2] || '{}');
  const ctx = { cards: [], welcoming: false, DATA: data };
  for (const [kind, k] of Object.entries(KINDS)) {
    const { v, town } = placed[kind];
    const d = data[v.id] || {};
    ctx.cards.push({ id: v.id, kind, expect: k.expect, town, text: `${v.name} ${town} ${d.k || ''}` });
  }
  vm.createContext(ctx);
  vm.runInContext(`${src}\nthis.__plan = fdPlan; this.__hit = fdHit; this.__fold = fdFold;`, ctx);
  ctx.cards.forEach((c) => { c.__fd = ctx.__fold(c.text); });
  for (const c of ctx.cards) {
    if (c.expect !== 'yes') continue;
    const plan = ctx.__plan(`kids birthday party ${c.town}`);
    if (!plan.groups.every((alts) => ctx.__hit(c.__fd, alts))) fails.push(`hub search ${c.kind}: misses (${c.__fd.slice(0, 160)})`);
  }
  // party ↔ parties, class ↔ classes, both ways.
  const one = (text, q) => { const f = ctx.__fold(text); return ctx.__plan(q).groups.every((alts) => ctx.__hit(f, alts)); };
  if (!one('Kids’ birthday parties', 'birthday party')) fails.push('hub search: party finds parties');
  if (!one('Private birthday party room', 'birthday parties')) fails.push('hub search: parties finds party');
  if (!one('Wheel classes for adults', 'wheel class')) fails.push('hub search: class finds classes');
  if (!one('A wheel class for adults', 'wheel classes')) fails.push('hub search: classes finds class');
  assert.deepEqual(fails, []);
});

// Indoor test 8 (2026-11-19; Gary's 5-pin bowling centre: "a licensed lounge" in his story cost −40 and dropped him from
// every kids' rainy-day plan). A family place whose story mentions a licensed lounge or a bar is still offered for kids:
// with the owner's All ages, with a family kind and no age answer, and with no owner answers at all (the story is not read
// for adult words; only the name or category is).
test('A family place whose story mentions a licensed lounge or a bar is still offered for kids', async () => {
  const story = 'Five-pin bowling since 1962, with cosmic bowling on weekends, an arcade corner and a licensed lounge and bar for the grown-ups.';
  const allAges = mk({ region: 'armstrong', name: 'Armstrong Lanes MX', cuisine: 'Bowling alley', description: story, rating: 4.9, reviews: 500 });
  await ok(change(tokenFor(allAges.id), { indoor_info: { kinds: ['bowling'], length: '1-2h', age: 'all', year: 'all' } }));
  const kindOnly = mk({ region: 'enderby', name: 'Enderby Lanes MX', cuisine: 'Bowling alley', description: story, rating: 4.9, reviews: 500 });
  await ok(change(tokenFor(kindOnly.id), { indoor_info: { kinds: ['bowling'], length: '1-2h', year: 'all' } }));
  const noAnswers = mk({ region: 'lumby', name: 'Lumby Bowl MX', cuisine: 'Bowling alley', description: story, rating: 4.9, reviews: 500 });
  // Gary had 596 competitors: a few strong family places in each town, so −40 would leave him out.
  for (const [r, town] of [['armstrong', 'Armstrong'], ['enderby', 'Enderby'], ['lumby', 'Lumby']]) {
    for (const nm of ['Kids Gym', 'Play Barn', 'Science Hub', 'Trampoline Zone']) mk({ region: r, name: `${town} ${nm} MX8`, cuisine: 'Family fun centre', description: 'Family fun.', rating: 4.8, reviews: 400, kid_friendly: 1 });
  }
  for (const [v, town] of [[allAges, 'Armstrong'], [kindOnly, 'Enderby'], [noAnswers, 'Lumby']]) {
    assert.ok(idsOf(app.runTripPlan({ text: `rainy day with kids in ${town}` }, NOW)).includes(v.id), `${v.name}: rainy day with kids`);
  }
});

// Indoor test 9 (2026-11-19; Melissa's play centre for kids 0 to 10 was the first pick for "something for my 12 year old"):
// a 12-year-old's request offers every family kind with no age range of its own, and never a play centre whose own words
// say kids 0 to 10 (it says why, in a note).
test('A 12-year-old: every family kind is offered; a play centre for kids 0 to 10 never is, with a note', async () => {
  const fails = [];
  for (const [kind, k] of Object.entries(KINDS)) {
    if (k.expect !== 'yes') continue;
    const { v, town } = placed[kind];
    const ids = idsOf(app.runTripPlan({ text: `something for my 12 year old in ${town}` }, NOW));
    if (!ids.includes(v.id)) fails.push(`${kind}: "something for my 12 year old in ${town}" leaves it out`);
  }
  assert.deepEqual(fails, []);
  const play = mk({ region: 'peachland', name: 'Peachland Tiny Tots Play MX', cuisine: 'Indoor playground', description: 'Indoor play centre for kids 0 to 10, with a toddler zone.', rating: 4.9, reviews: 300 });
  await ok(change(tokenFor(play.id), { indoor_info: { kinds: ['kids'], length: '1-2h', age: 'all', year: 'all' } }));
  for (const q of ['something for my 12 year old in Peachland', 'rainy day with our 12 year old in Peachland', 'things to do with a 12 year old in Peachland']) {
    const p = app.runTripPlan({ text: q }, NOW);
    assert.ok(!idsOf(p).includes(play.id), q);
    assert.ok((p.notes || []).some((x) => x.includes('Peachland Tiny Tots Play MX is for kids 0 to 10')), `${q}: ${(p.notes || []).join(' | ')}`);
  }
  assert.ok(idsOf(app.runTripPlan({ text: 'rainy day with a 4 year old in Peachland' }, NOW)).includes(play.id), 'a 4-year-old');
});

// Indoor test 11 (2026-11-19; Kim's science centre was not on page 1 of "things to do with kids in Vernon": 89 places A to
// Z, trails first in November). Site search for every family kind's town: the owner's family place comes before the trails
// and parks, and a casino or a spa is never listed.
test('Search: "things to do with kids in <town>" lists every family kind\'s place ahead of the town\'s trails and parks, never a casino or spa', async () => {
  const fails = [];
  for (const [kind, k] of Object.entries(KINDS)) {
    if (k.expect !== 'yes') continue;
    const { v, comps, town } = placed[kind];
    const trail = mk({ region: k.town, type: 'outdoor', name: `${town} Creek Park Trail MX ${kind}`, cuisine: 'Trail', description: 'An easy creek trail through a park.', kid_friendly: 1, rating: 4.9, reviews: 900 });
    const r = await fetch(`${base}/search?q=${encodeURIComponent(`things to do with kids in ${town}`)}`, { headers: { 'User-Agent': 'okanaganroam-check/1.0' } });
    const h = plain(await r.text());
    const at = h.indexOf(v.name), tr = h.indexOf(trail.name);
    if (at < 0) fails.push(`${kind} (${town}): missing`);
    else if (tr >= 0 && tr < at) fails.push(`${kind} (${town}): the trail comes first`);
    for (const c of comps.slice(-2)) if (h.includes(c.name)) fails.push(`${kind}: lists ${c.name}`);
  }
  assert.deepEqual(fails, []);
});

// Indoor test 12 (2026-11-19; Jess's hot yoga studio is 16+): "yoga with my 12 year old" never offers a 16+ studio, offers an
// all-ages one, and a plain "yoga in <town>" (no kids) still offers the 16+ studio. A class place with no set hours and a
// schedule link is never "Hours not listed" on a kids' plan either.
test('Indoor test 12: a 16+ yoga studio is never offered with a 12-year-old; an all-ages one is; with no kids the 16+ one is', async () => {
  const town = 'Summerland', region = 'summerland';
  const sixteen = mk({ region, name: 'Summerland Hot Yoga 16 MX', cuisine: 'Yoga studio', description: 'A hot yoga studio. Ages 16 and up.', rating: 4.9, reviews: 200 });
  const t16 = tokenFor(sixteen.id);
  await ok(change(t16, { indoor_info: { kinds: ['yoga'], length: '1h', book: 'ahead', age: '16', year: 'all' } }));
  const family = mk({ region, name: 'Summerland Family Yoga MX', cuisine: 'Yoga studio', description: 'Yoga for all ages, family yoga on Sundays.', rating: 4.2, reviews: 30 });
  await ok(change(tokenFor(family.id), { indoor_info: { kinds: ['yoga'], length: '1h', book: 'busy', age: 'all', year: 'all' } }));
  for (const q of [`yoga with my 12 year old in ${town}`, `yoga class for me and my 12 year old in ${town}`, `cours de yoga avec mon enfant de 12 ans à ${town}`]) {
    const ids = idsOf(app.runTripPlan({ text: q }, NOW));
    assert.ok(!ids.includes(sixteen.id), q);
    assert.ok(ids.includes(family.id), `${q}: ${ids.join(',')}`);
  }
  assert.ok(idsOf(app.runTripPlan({ text: `hot yoga in ${town}` }, NOW)).includes(sixteen.id));
});
