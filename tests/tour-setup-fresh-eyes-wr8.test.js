// Whistler tour test 8 fixes (fresh eyes, 2026-11-17; Whistler Roam drafts/fresh-eyes-tour8-2026-11-17/REPORT.md: Linda,
// a dog-sledding and summer kennel-visit business, iPhone SE with large text, English; per-sled prices, guests' dogs not
// allowed, two seasons with a break). Covers bugs 1-10, the Minor list, the wording table and suggested fixes 1-8, in
// English and French, the folded-in follow-up (a mountain guide keeps "Ski touring"; Whistler #191's guide words), and
// that the other setup types still load. The Help questions are in tour-help-routing.test.js; planner words in
// tour-planner-words.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-wr8-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const text = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'owner-setup-client.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour Wr8 ${++n}`, slug: `tour-wr8-${n}`, region: 'penticton', type, latitude: 49.49 + n / 2000, longitude: -119.59,
  rating: 4.6, reviews: 120, address: `${300 + n} Main St, Penticton`, phone: '250-555-0188', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour setup tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p, { redirect: 'manual' }).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.48.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const setBox = (id, info) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(id, JSON.stringify(info));
const clientFn = (name) => { const m = new RegExp(`  function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}\\n`).exec(CLIENT) || new RegExp(`  function ${name}\\([^)]*\\)\\{.*\\}\\n`).exec(CLIENT); assert.ok(m, name); return m[0]; };
const publish = (id, sections) => db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-17')").run(id, JSON.stringify({ sections }));
// Linda's listing, moved to Penticton: research partly wrong on purpose (snowmobiles, dogs welcome, Dog-Friendly).
function linda(o = {}) {
  const v = mk('tour', { name: `Apex Sled Dogs ${n + 1}`, cuisine: 'Dog sledding & snowmobile tours', rating: 4.8, reviews: 211,
    description: 'Family dog sledding and snowmobile tours with friendly huskies. Dogs welcome!', description_fr: 'Traîneau à chiens et motoneige en famille avec des huskys. Chiens bienvenus !', dog_friendly: 1, ...o });
  setBox(v.id, { rows: [{ label: 'Prices', text: 'From $149 per person' }, { label: 'Good to know', text: 'Dog-friendly: bring your own dog along!' }], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' });
  return { v, t: tokenFor(v.id) };
}

test('1. dogs: guests’ own dogs on the chips (EN + FR), no research pre-tick for a sled-dog business, a no-dogs line points to No guests’ dogs and takes Dog-Friendly off', async () => {
  const { v, t } = linda();
  const en = cfgOf((await get(`/owner/${t}/setup`)).text), fr = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(en.offerLabels.dog_friendly, 'Guests’ own dogs can come along'); assert.equal(fr.offerLabels.dog_friendly, 'Les chiens des clients peuvent venir');
  assert.equal(text.en.tour.noDogs, 'No guests’ dogs'); assert.equal(text.fr.tour.noDogs, 'Pas de chiens des clients');
  assert.equal(en.ownDogs, true); assert.ok(en.researchTicks.includes('dog_friendly'));
  assert.equal(text.en.tour.offerLeadOwnDogs, 'Families check this before they book. Dogs here means guests’ own dogs, not yours.');
  assert.doesNotMatch(text.en.tour.offerLeadOwnDogs, /dog owners/);
  // A rafting company is not one.
  const raft = mk('tour', { cuisine: 'Whitewater rafting' });
  assert.equal(cfgOf((await get(`/owner/${tokenFor(raft.id)}/setup`)).text).ownDogs, false);
  // The client: no pre-tick from research for a sled-dog business, the other lead, the no-dogs line nudge.
  assert.match(CLIENT, /if \(ownDogsBiz\(\) && !S\.done\.offer && !S\.dogResearchOff && S\.badges\.dog_friendly && \(C\.researchTicks \|\| \[\]\)\.indexOf\('dog_friendly'\) >= 0\) \{ S\.dogResearchOff = true; S\.badges\.dog_friendly = false; \}/);
  assert.match(CLIENT, /q\(T\.offerQ, ownDogsBiz\(\) && T\.offerLeadOwnDogs \? T\.offerLeadOwnDogs : T\.offerLead\)/);
  const ctx = {}; vm.createContext(ctx); vm.runInContext(clientFn('dogLineNo'), ctx);
  const no = (x) => vm.runInContext(`dogLineNo(${JSON.stringify(x)})`, ctx);
  for (const x of ['Please leave your own dog at home. Our sled dogs only.', 'Guests can’t bring their own dogs', 'No guests’ dogs', 'Pas de chiens des clients.']) { assert.equal(no(x), true, x); }
  for (const x of ['Dogs welcome on our walks, not on the food tour.', 'Dogs on a leash welcome', 'On some trips: private charters only', 'Chiens en laisse bienvenus', '']) { assert.equal(no(x), false, x); }
  assert.equal(text.en.tour.dogLineNo, 'That says guests can’t bring their dog. Tap “No guests’ dogs” instead, so your page says No dogs.');
  // Saved anyway: her own line takes Dog-Friendly off (the badge never shows beside it).
  const dogWords = (h) => (h.match(/Dog-Friendly/g) || []).length;
  const none = dogWords(page(mk('tour', { dog_friendly: 0 })));
  ok(await change(t, { badges: { dog_friendly: true } }));
  assert.ok(dogWords(page(v)) > none);
  ok(await change(t, { visit_rows: { dogs: 'Please leave your own dog at home. Our sled dogs only.' } }));
  assert.equal(!!app.getVenue(v.id).dog_friendly, false);
  const p = page(v);
  // As many "Dog-Friendly" words as a page without the badge (the site menu's guide link has one).
  assert.equal(dogWords(p), none);
  assert.match(plain(p), /Please leave your own dog at home/);
  // A some-trips line keeps the badge.
  const b = linda();
  ok(await change(b.t, { badges: { dog_friendly: true } }));
  ok(await change(b.t, { visit_rows: { dogs: 'Dogs welcome on the summer kennel visit, not on the sleds.' } }));
  assert.equal(!!app.getVenue(b.v.id).dog_friendly, true);
});

test('2. per-sled and per-vehicle prices: their own nudge, never the Private tours move (EN + FR, client and server)', async () => {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(clientFn('moneyHead') + clientFn('feeHours') + clientFn('priceSwiss') + clientFn('priceTrim') + clientFn('tourPriceWhy'), ctx);
  const why = (x) => vm.runInContext(`tourPriceWhy(${JSON.stringify(x)}, false)`, ctx);
  for (const x of ['$349 per sled', '349/sled', '349 per sled (2 adults or 1 adult + 2 kids)', '$349 per sled for 2 people', '200 per ATV', '99 per machine', '349 $ par traîneau (2 adultes)', '$69/bike', '69 per bike for 2 hours']) {
    assert.equal(why(x), 'unit', x); assert.equal(app.tourPriceWhy(x), 'unit', `server ${x}`);
  }
  // Rob's boat charter (test 5) and a group of people with no unit word stay Private tours.
  for (const x of ['650 per boat', '650 for 4 people', '$349 for 2 people']) { assert.equal(why(x), 'group', x); assert.equal(app.tourPriceWhy(x), 'group', x); }
  assert.equal(text.en.tour.tpriceVehicle, 'Priced per sled, boat or vehicle? List it in Your tours and prices, like “Sled ride: $349 per sled (2 adults)”. Here, put your lowest price for one person.');
  assert.match(text.fr.tour.tpriceVehicle, /^Un prix par traîneau, par bateau ou par véhicule\s?\?/);
  // The sled words pick the vehicle nudge; it gets the open-list button, never the move to Private tours.
  assert.match(CLIENT, /T\.tpriceVehicle && \/\\b\(\?:sleds\?\|snowmobiles\?/);
  assert.match(CLIENT, /\(T\.tpriceVehicle && S\.nudge === T\.tpriceVehicle\)\) && T\.tpriceUnitGo/);
  assert.match(CLIENT, /S\.nudge === T\.tpriceGroup \|\| S\.nudge === T\.tpriceDay\) && S\.groupMove != null/);
  const { t } = linda();
  const r = await change(t, { tour_price: '349 per sled (2 adults or 1 adult + 2 kids)' });
  assert.notEqual(r.status, 200);
  assert.match(JSON.stringify(r.body), /Priced per sled, boat or vehicle\?/);
});

// Tour test 15 (Dayton, 2026-11-18): tours have no meeting-spot step; a tour's Maps link is its business pin, and a
// meeting spot approved before stays stored, unused. Other types keep their storefront spot (venueMapsPoint).
test('3. Open in Google Maps uses a tour’s business pin (a stored meeting spot is not used); the admin note stays for other types', async () => {
  const { v } = linda({ latitude: 49.9, longitude: -119.1 });
  assert.match(page(v), /maps\/search\/\?api=1&amp;query=49\.9,-119\.1|maps\/search\/\?api=1&query=49\.9,-119\.1/);
  db.prepare("INSERT INTO venue_arrival_points (venue_id, file, preview_key, lat, lng, status) VALUES (?, 'wr8-test.jpg', ?, 49.4521, -119.6011, 'approved')").run(v.id, `wr8-${v.id}`);
  const h = page(v);
  assert.match(h, /query=49\.9,-119\.1/);
  assert.doesNotMatch(h, /query=49\.4521,-119\.6011/);
  assert.equal(app.getVenue(v.id).latitude, 49.9);
  assert.match(SERVER, /An approved meeting or storefront spot is what \\u201cOpen in Google Maps\\u201d uses\./);
});

test('4. a closure covering much of the open season asks once (EN + FR); a break between seasons and holidays don’t', async () => {
  const ctx = { pad2: (x) => (`0${x}`).slice(-2) }; vm.createContext(ctx); vm.runInContext(clientFn('closeInsideSeason'), ctx);
  const ins = (a, b, sea) => JSON.parse(JSON.stringify(vm.runInContext(`closeInsideSeason(${JSON.stringify(a)}, ${JSON.stringify(b)}, ${JSON.stringify(sea)})`, ctx)));
  const sea = { from: '12-10', to: '09-15' };
  assert.deepEqual(ins('01-04', '06-14', sea), { from: '01-04', to: '06-14' });
  assert.equal(ins('04-01', '06-14', sea), null);
  assert.equal(ins('12-24', '12-26', sea), null);
  assert.equal(ins('10-01', '11-30', sea), null);
  assert.deepEqual(ins('05-01', '10-31', { from: '05-01', to: '10-15' }), { from: '05-01', to: '10-15' });
  assert.equal(text.en.closeInside, 'Those dates close you {a} – {b}, inside your season. Is that right?');
  assert.match(text.fr.closeInside, /en pleine saison/);
  assert.match(CLIENT, /if \(k === 'closureKeep'\) \{ S\.closeInsideOk = S\.closeInside; return act\('closureAdd'\); \}/);
});

test('5. kinds: Farm, ranch or kennel visits; public words only what the listing says (never u-pick unless said); sled dogs are dog sledding', async () => {
  const { en, fr } = text; void en; void fr;
  const t = await get(`/owner/${tokenFor(mk('tour', { cuisine: 'Farm tours' }).id)}/setup`);
  assert.match(t.text, /Farm, ranch or kennel visits/); assert.doesNotMatch(t.text, /Farm visits and u-pick/);
  assert.match((await get(`/fr/owner/${tokenFor(mk('tour', { cuisine: 'Farm tours' }).id)}/setup`)).text, /Visites de ferme, de ranch ou de chenil/);
  assert.equal(app.tourKindsText(['dogsled', 'farm'], false, 'Dog sledding & snowmobile tours', 'Friendly huskies. Kennel visits with puppies in summer.'), 'Dog sledding & kennel visits');
  assert.equal(app.tourKindsText(['dogsled', 'farm'], true, 'Dog sledding & snowmobile tours', 'Friendly huskies. Kennel visits with puppies in summer.'), 'Traîneau à chiens et visites du chenil');
  assert.equal(app.tourKindsText(['dogsled', 'farm'], false, 'Dog sledding & snowmobile tours', ''), 'Dog sledding & farm visits');
  assert.equal(app.tourKindsText(['farm'], false, 'Farm tours & u-pick'), 'Farm visits & U-pick');
  assert.doesNotMatch(app.tourKindsText(['farm'], false, 'Lavender farm', ''), /u-pick/i);
  for (const c of ['Callaghan Sled Dogs', 'Husky sled rides', 'Kennel tours']) assert.ok(!app.tourKindSuggestion({ cuisine: c, name: '' }).includes('snowmobile'), c);
  assert.ok(app.tourKindSuggestion({ cuisine: 'Callaghan Sled Dogs', name: '' }).includes('dogsled'));
  assert.ok(app.tourKindSuggestion({ cuisine: 'Kennel tours', name: '' }).includes('farm'));
  assert.ok(app.tourKindSuggestion({ cuisine: 'Snowmobile & sled tours', name: '' }).includes('snowmobile'));
  // Saved: the page and card say it (EN), never u-pick.
  const { v, t: tk } = linda({ description: 'Friendly huskies. Kennel visits with puppies in summer.' });
  ok(await change(tk, { tour_info: { kinds: ['dogsled', 'farm'] } }));
  assert.equal(app.getVenue(v.id).cuisine, 'Dog sledding & kennel visits');
  assert.doesNotMatch(plain(page(v)), /u-pick/i);
});

test('6. the French description left from our research is named with a link to the French story box (setup, finish, edit page); nothing translated', async () => {
  const { v, t } = linda();
  let c = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(c.frDesc, 'research');
  ok(await change(t, { description: 'Our family runs dog sledding tours in winter and kennel visits in summer, with 80 friendly Alaskan huskies. Small groups and cocoa by the fire.' }));
  c = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(c.frDesc, 'old');
  assert.equal(cfgOf((await get(`/fr/owner/${t}/setup`)).text).frDesc, '');
  const edit = (await get(`/owner/${t}`)).text;
  assert.match(edit, /id="opFrDescOld">Your French description is the old one from our research: <a href="\/fr\/owner\/[^"]+\/setup#story"/);
  assert.equal(text.en.frDescOld, 'Your French description is the old one from our research:');
  assert.match(CLIENT, /\(frOnlyNamed\(\) \|\| frOnlyFinish\(\)\) \+ frDescOld\(true\)/); // tour test 14: the finish screen's call (not when the translation is queued)
  assert.match(CLIENT, /x = doneLine\('story'\) \+ q\(T\.storyQ, T\.storyLead\) \+ frDescOld\(\)/);
  assert.equal(app.getVenue(v.id).description_fr, 'Traîneau à chiens et motoneige en famille avec des huskys. Chiens bienvenus !');
  // A place whose French description is the owner's own: nothing said.
  const other = mk('tour', { description_fr: '' });
  assert.equal(cfgOf((await get(`/owner/${tokenFor(other.id)}/setup`)).text).frDesc, '');
});

test('7. minor: $ for a bracketed price, 80-character prices, one trip count, every season in the short list, usual hours folded in a long closure, chips', async () => {
  assert.equal(app.menuPriceWithWords('349 per sled (2 adults, or 1 adult + 2 kids)'), '$349 per sled (2 adults, or 1 adult + 2 kids)');
  assert.match(app.menuPriceWithWords('349 per sled (2 adults, or 1 adult + 2 kids)', 'fr'), /^349\s\$ par traîneau \(2 adults, or 1 adult \+ 2 kids\)$/);
  assert.match(app.menuPriceWithWords('$349 per sled', 'fr'), /^349\s\$ par traîneau$/);
  assert.match(SERVER, /const MENU_LIMITS = \{ sections: 40, items: 500, name: 140, description: 500, price: 80,/);
  assert.match(SERVER, /data-f="price" maxlength="80"/);
  const { v, t } = linda();
  publish(v.id, [
    { name: 'Winter', items: [{ name: 'Sled ride', price: '349 per sled (2 adults, or 1 adult + 2 kids)' }, { name: 'Extra child', price: '49' }, { name: 'Mush your own team (16+)', price: '299 pp' }, { name: 'Shuttle from town', price: '25 pp return' }, { name: 'Snowsuit rental', price: '20' }, { name: 'Night ride', price: '399' }] },
    { name: 'Summer', items: [{ name: 'Kennel visit', price: '35 adult, 20 child, under 4 free' }] }]);
  const h = page(v);
  assert.match(plain(h), /See all tours & prices \(4 tours\)/);
  assert.match(plain(h), /Summer Kennel visit/);
  assert.match(plain(h), /\$349 per sled \(2 adults, or 1 adult \+ 2 kids\)/);
  const edit = plain((await get(`/owner/${t}`)).text);
  assert.match(edit, /\(4 tours\)/); assert.doesNotMatch(edit, /\(7 tours\)/);
  // A long closure this week: the usual hours are folded under it.
  const g = mk('tour', { hours: JSON.stringify({ ...WK('09:00', '16:30'), _closures: [{ from: '2027-04-01', to: '2027-06-14', note: 'Between seasons.', yearly: true }] }) });
  ok(await change(tokenFor(g.id), { open_months: '12-10:09-15' }));
  const gp = page(g, 'en', new Date('2027-04-20T18:00:00Z'));
  assert.match(gp, /<details class="venue-hours-usual"><summary>Usual hours when open<\/summary>/);
  assert.doesNotMatch(plain(gp), /Every day 9 AM – 4:30 PM/);
  // The adult chip only beside All ages when picked; a 4+ chip for every tour; the nudge stays in view; taller links.
  assert.match(CLIENT, /S\.tour\.age && S\.tour\.age !== '19' && \(S\.tour\.age !== 'all' \|\| S\.tour\.adult\)/);
  assert.match(CLIENT, /\(TOUR \? \[4\]\.concat\(GROUP_SIZES, T\.groupsChipBig \? \[21\] : \[\]\) : GROUP_SIZES\)/); // tour test 9: and 21+
  assert.match(CLIENT, /if \(e2 && e2\.getBoundingClientRect && e2\.getBoundingClientRect\(\)\.top < 8\) e2\.scrollIntoView\(\{ block: 'start' \}\);/);
  assert.match(SERVER, /body\.owner-page main p a:not\(\[class\]\), body\.owner-page main \.op-hint a:not\(\[class\]\) \{ display: inline-block; padding: 7px 0; margin: -7px 0; \}/);
});

test('8. follow-up: a mountain guide keeps Ski touring; guiding and avalanche courses keep both words; stricter guide words; backcountry guiding is the guide kind', async () => {
  assert.equal(app.tourKindsText(['guide'], false, 'Backcountry guiding', 'Guiding outfit run by an ACMG mountain guide. AST 1 and AST 2 avalanche courses, intro ski touring, crevasse rescue.'), 'Mountain guiding & ski touring');
  assert.equal(app.tourKindsText(['guide'], true, 'Backcountry guiding', 'intro ski touring'), 'Guide de montagne et ski de randonnée');
  assert.equal(app.tourKindsText(['guide'], false, 'Mountain guides, ski touring & avalanche courses'), 'Mountain guiding, avalanche courses & ski touring');
  assert.equal(app.tourKindsText(['guide', 'snowshoe'], false, 'Ski touring, mountaineering & avalanche courses'), 'Ski touring, mountain guiding & avalanche courses');
  // Erik (test 7): his unticked heli-skiing still goes; ski touring (his own) stays.
  assert.doesNotMatch(app.tourKindsText(['guide'], false, 'Ski touring, heli-skiing & avalanche courses'), /heli/i);
  assert.deepEqual(app.tourKindSuggestion({ cuisine: 'Backcountry guiding', name: '' }), ['guide']);
  // The second filter: a heli company with ACMG guides, a ski-mountaineer founder story: not Adventure; mountaineering is.
  const yurt = { type: 'tour', name: 'Valley Yurt', cuisine: 'Snowshoe tours', description: 'Fly in to our yurt with ACMG guides. Founded by ski mountaineer Bob.' };
  assert.notEqual(app.tourActivityOf(yurt), 'adventure');
  assert.equal(app.tourInActivity(yurt, 'adventure'), false);
  assert.equal(app.tourInActivity({ ...yurt, description: 'Guided mountaineering and glacier travel courses.' }, 'adventure'), true);
});

test('other setup types still load (EN + FR) with no tour words', async () => {
  for (const type of ['restaurant', 'pub', 'winery', 'cafe', 'brewery', 'distillery', 'cocktail']) {
    const t = tokenFor(mk(type, { cuisine: 'Canadian' }).id);
    for (const p of [`/owner/${t}/setup`, `/fr/owner/${t}/setup`]) {
      const r = await get(p);
      assert.equal(r.status, 200, `${type} ${p}`);
      const c = cfgOf(r.text);
      assert.ok(Array.isArray(c.steps) && c.steps.length, type);
      assert.equal(c.tourKinds, undefined, type);
      assert.equal(c.ownDogs, undefined, type);
    }
  }
});
