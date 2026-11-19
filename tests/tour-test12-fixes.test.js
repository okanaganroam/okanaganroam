// Whistler tour test 12 fixes (fresh eyes, 2026-11-18; Whistler Roam drafts/fresh-eyes-tour12-2026-11-18/REPORT.md:
// Kayla, a bungee and giant swing site near Whistler on an iPhone 14. She pastes her Instagram captions (emojis, hashtags,
// "DM us"). Ages 14+, under 19s need a parent or guardian to sign the waiver; an online waiver; the meeting spot is a
// gravel lot off Hwy 99, not the office; winter is weekends only, weather permitting).
// The Help questions are in tour-help-routing.test.js.
// Runs on a throwaway database (like server.test.js); the runner puts whistler.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'whistler.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-t12-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const text = require('../owner-setup-text.js');
const clean = require('../owner-text-clean.js');
const completeness = require('../portal-completeness.js');
const sent = [];
app.setVenueSubmissionTransport(async (f) => { sent.push(f); });
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async (m) => { sent.push(m); });

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'owner-setup-client.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const PLANNER = fs.readFileSync(path.join(ROOT, 'trip-planner.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour T12 ${++n}`, slug: `tour-t12-${n}`, region: 'whistler', type, latitude: 50.116 + n / 3000, longitude: -122.957,
  rating: 4.6, reviews: 120, address: `${500 + n} Main St, Whistler`, phone: '604-555-0142', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour test 12 tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
let ipN = 0, srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p, { redirect: 'manual', headers: { 'User-Agent': 'whistlerroam-check/1.0' } }).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.72.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, setup_frequency: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ');
const boxOf = (id) => JSON.parse((db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(id) || { info: '{}' }).info);
const rowOf = (id, label) => ([...(boxOf(id).rows || []), ...(boxOf(id).owner_dropped || [])].find((r) => r.label === label) || {}).text;
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const namesOf = (p) => itemsOf(p).map((x) => x.venue.name);
const NOW = new Date('2026-11-18T12:00:00-08:00');
// Any pending (review) request for the venue goes live, as Dayton's Approve does.
const approveAll = (id) => { for (const r of db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending'").all(id)) app.approveOwnerChange(r.id, 'admin:test'); app.clearHoursExtraCache(); };

// Kayla's site: research says "Bungee jumping & giant swing", 9–6 daily, check in at the office in Function Junction.
const TOURS = [
  { name: 'Tours', items: [{ name: '🤯 Bungee Jump 160ft 🔥', price: '$139 per jump', duration: '1 hr', description: 'Jump off the bridge over the Cheakamus River canyon!' },
    { name: '2nd jump (same day)', price: '$69', description: 'Go again same day only' },
    { name: 'Giant Canyon Swing 🎢', price: '$119 pp', duration: '90 min' }] },
  { name: 'Extras', items: [{ name: '📸 GoPro video + photos package', price: '+$59 add on', description: 'Add it to any jump or swing. Edited clip sent same day.' },
    { name: 'Gift cards 🎁', price: 'any amount', description: 'Perfect birthday gift. Buy online' }] },
];
async function kayla(o = {}) {
  const v = mk('tour', { name: `Cheakamus Canyon Bungee ${n + 1}`, cuisine: 'Bungee jumping & giant swing', rating: 4.9, reviews: 211, address: '1080 Millar Creek Rd, Whistler',
    description: 'Bungee jumps and a giant canyon swing over the Cheakamus River south of Whistler. Check in at our office in Function Junction.',
    description_fr: 'Sauts à l’élastique et balançoire géante au-dessus de la rivière Cheakamus. Enregistrement à notre bureau de Function Junction.', hours: JSON.stringify(WK('09:00', '18:00')), ...o });
  const t = tokenFor(v.id);
  ok(await change(t, { tour_info: { kinds: ['adventure'], length: '1h', book: 'day', age: '14', adult: true, adult_age: '19', adult_waiver: true, year: 'all' } }));
  ok(await change(t, { tour_price: 139 }));
  db.prepare("INSERT INTO venue_menus (venue_id, status, data, published_at) VALUES (?, 'published', ?, '2026-11-18')").run(v.id, JSON.stringify({ sections: TOURS }));
  approveAll(v.id);
  return { v, t };
}
const plan = (q) => app.runTripPlan({ text: q }, NOW);

test('1. age: a 14+ chip and the under 18s / under 19s, "come with an adult" / "need a parent or guardian to sign the waiver" choice; the Ages line (EN + FR) and Kid-friendly', async () => {
  assert.ok(completeness.TOUR_AGES.includes('14'));
  assert.match(CLIENT, /tchips\('age', \['all', '5', '6', '8', '10', '12', '14', '16', '19'\]/);
  assert.match(CLIENT, /tchips\('adultAge', \['18', '19'\], T\.tadultAges, /); assert.match(CLIENT, /tchips\('adultHow', \['adult', 'waiver'\], T\.tadultHows, /);
  for (const L of [text.en.tour, text.fr.tour]) { assert.equal(L.tages[14], '14+'); assert.ok(L.tadultAges && L.tadultHows && L.tadultRule); }
  assert.equal(text.en.tour.tadultHows.waiver, 'need a parent or guardian to sign the waiver');
  const { v, t } = await kayla();
  assert.equal(rowOf(v.id, 'Ages'), 'Ages 14 and up. Under 19s need a parent or guardian to sign the waiver.');
  assert.match(plain(page(v)), /Ages 14 and up\. Under 19s need a parent or guardian to sign the waiver\./);
  assert.match(plain(page(v, 'fr')), /À partir de 14 ans\. Les moins de 19 ans ont besoin qu’un parent ou tuteur signe la décharge\./);
  assert.equal(app.getVenue(v.id).kid_friendly, false);
  // Under 18s, with an adult (the old rule) still reads as before.
  ok(await change(t, { tour_info: { adult_age: null, adult_waiver: null } })); approveAll(v.id);
  assert.equal(rowOf(v.id, 'Ages'), 'Ages 14 and up. Under 18s come with an adult.');
  // Taking the rule back clears its choice; a choice without the rule isn't kept.
  ok(await change(t, { tour_info: { adult: null } })); approveAll(v.id);
  ok(await change(t, { tour_info: { adult_age: '19' } })); approveAll(v.id);
  const ti = app.venueTourInfo(v.id);
  assert.ok(!('adult_age' in ti) && !('adult' in ti), JSON.stringify(ti));
  assert.equal((await change(t, { tour_info: { adult_age: '21' } })).status, 400);
  assert.deepEqual(app.tourAdultRule({ age: '14', adult: true, adult_age: '19', adult_waiver: true }), { age: 19, waiver: true, en: 'Under 19s need a parent or guardian to sign the waiver.', fr: 'Les moins de 19 ans ont besoin qu’un parent ou tuteur signe la décharge.' });
});

test('1b. Build My Trip: a 12- or 13-year-old leaves her out; a 16-year-old plans her with "Under 19s need a parent or guardian to sign the waiver"', async () => {
  const { v } = await kayla();
  for (const age of [12, 13]) {
    const p = plan(`bungee jump in Whistler in July with our ${age}-year-old`);
    assert.ok(!namesOf(p).includes(v.name), `${age}: ${JSON.stringify(namesOf(p))}`);
  }
  const p16 = plan('bungee jump in Whistler in July with our 16-year-old');
  const stop = itemsOf(p16).find((x) => x.venue.name === v.name);
  assert.ok(stop, JSON.stringify([p16.kind, namesOf(p16)]));
  assert.ok((stop.caveats || []).includes('Under 19s need a parent or guardian to sign the waiver.'), JSON.stringify(stop.caveats));
  assert.equal(app.tourPlannerFacts(v.id).tourMinAge, '14');
  const fc = require('../trip-french-copy.js');
  assert.equal(fc.t3FrenchText('Under 19s need a parent or guardian to sign the waiver.'), 'Les moins de 19 ans ont besoin qu’un parent ou tuteur signe la décharge.');
  assert.match(PLANNER, /\/\^\(\?:5\|6\|8\|10\|12\|14\|16\)\$\//);
});

test('2. social caption text: trailing hashtags and the short lines’ emojis go, "b4" becomes "before", "DM us" stays (flagged), # words keep their case', async () => {
  const s = (x, o) => clean.socialTidy(x, o);
  assert.equal(s('160ft canyon jump 🤯 #sendit', { short: true }), '160ft canyon jump');
  assert.equal(s('Weight 40-150kg ⚖️ online waiver b4 you arrive!! Closed in high winds ⚠️ #safetyfirst', { short: true }), 'Weight 40-150kg online waiver before you arrive! Closed in high winds');
  assert.equal(s('Stag/stagette + bday groups get 10% off 🎉 DM us', { short: true }), 'Stag/stagette + bday groups get 10% off DM us');
  // The story keeps its emojis inside; the hashtag run at the end goes.
  assert.equal(s('🤯 JUMP 160ft 🔥 #sendit our crew is stoked 💪 do the waiver ✍️ #Whistler #bungee #yolo'), '🤯 JUMP 160ft 🔥 #sendit our crew is stoked 💪 do the waiver');
  assert.equal(s('We are Whistler’s #1 canyon swing'), 'We are Whistler’s #1 canyon swing');
  assert.equal(s('© 2026 Acme® tours', { short: true }), '© 2026 Acme® tours');
  // The capitalizer leaves # words alone.
  assert.equal(app.ownerTextClean('#whistler bungee: see you in whistler'), '#whistler bungee: see you in Whistler');
  const { v, t } = await kayla();
  ok(await change(t, { visit_rows: { known_for: '160ft canyon jump 🤯 #sendit', good_to_know: 'Wear closed-toe shoes. online waiver b4 you arrive!! Closed in high winds ⚠️ #safetyfirst', groups: 'Groups of 8 or more: please book ahead. bday groups get 10% off 🎉 DM us' } }));
  approveAll(v.id);
  assert.equal(rowOf(v.id, 'Known for'), '160ft canyon jump');
  assert.equal(rowOf(v.id, 'Good to know'), 'Wear closed-toe shoes. Online waiver before you arrive! Closed in high winds');
  assert.equal(rowOf(v.id, 'Groups'), 'Groups of 8 or more: please book ahead. Bday groups get 10% off DM us');
  // A tour's meeting point in words: no emoji, a capital to start.
  ok(await change(t, { address: 'gravel lot off Hwy 99 right after the Cheakamus bridge 🚗 NOT our office' }));
  const req = db.prepare("SELECT changes FROM owner_change_requests WHERE venue_id = ? AND changes LIKE '%address%' ORDER BY id DESC LIMIT 1").get(v.id);
  assert.equal(JSON.parse(req.changes).address, 'Gravel lot off Hwy 99 right after the Cheakamus bridge NOT our office');
  // The admin cards: the social flag; no "Whistler's" misspelling flag.
  const card = app.renderAdminChangeCard({ id: 1, venue_name: v.name, submitted_at: '2026-11-18', listing_url: '/x', changes: { description: '🤯 JUMP #sendit Whistler’s only canyon bungee. Whistler\'s best. DM us', visit_rows: { groups: 'bday 10% off DM us' } }, previous: {}, note: '' });
  assert.match(card, /Hashtags \/ emojis \/ ‘DM us’ from social media/); assert.match(card, /“#sendit”/); assert.match(card, /“DM us”/);
  assert.doesNotMatch(card, /may be Whistler/);
  assert.deepEqual(clean.nameMisspellings("Whistler's only canyon bungee", { phrases: [], words: ['Whistler'] }), []);
  const menuCard = app.typedTourFlagsHtml(app.getVenue(v.id), JSON.stringify({ sections: [{ items: [{ name: 'Swing 🎢', price: '$119', description: 'DM us for groups' }] }] }));
  assert.match(menuCard, /Hashtags \/ emojis \/ ‘DM us’ from social media/);
  // The tours editor flags it too.
  assert.match(SERVER, /Hashtags \/ emojis \/ ‘DM us’ from social media: we tidy the ones at the end when you save; edit the rest here\./);
  // Typed tours: names lose emojis and trailing hashtags; descriptions their trailing hashtags.
  const m = await postJson(`/owner/${t}/menu/manual`, {});
  assert.ok([200, 201].includes(m.status), JSON.stringify(m.body));
  const s1 = await postJson(`/owner/${t}/menu/save`, { data: { sections: [{ name: '', items: [{ name: '🤯 Bungee Jump 160ft 🔥', price: '$139', description: 'Jump off the bridge! #sendit #whistlerbungee' }] }] } });
  assert.equal(s1.status, 200, JSON.stringify(s1.body));
  const draft = db.prepare("SELECT data FROM venue_menus WHERE venue_id = ? AND status IN ('draft', 'ready') ORDER BY id DESC LIMIT 1").get(v.id);
  const it = JSON.parse(draft.data).sections[0].items[0];
  assert.equal(it.name, 'Bungee Jump 160ft'); assert.equal(it.description, 'Jump off the bridge!');
});

test('3. "$139 per jump 🔥 2nd jump same day $69" saves 139 per person; "same day" is not a day rate; the nudge to Your tours and prices', () => {
  const x = '$139 per jump 🔥 2nd jump same day $69';
  assert.equal(app.tourPriceWhy(x), 'first');
  assert.deepEqual(app.cleanTourPrice(x, true), { value: 139 });
  assert.equal(app.tourPriceWhy('$139 pp, kids $99'), 'first');
  assert.equal(app.tourPriceWhy('$750/day'), 'day');
  assert.equal(app.tourPriceWhy('$139 same day'), '');
  assert.equal(app.tourPriceWhy('650 per boat'), 'group');
  assert.match(CLIENT, /if \(!priv && PER_ONE_RE\.test\(rest\) && /);
  assert.match(CLIENT, /var why0 = tourPriceWhy\(x, priv\); if \(why0 && why0 !== 'first'\) return NaN;/);
  assert.equal(text.en.tour.tpriceFirst, 'Second-jump or combo prices? Add them in Your tours and prices.');
  assert.ok(text.fr.tour.tpriceFirst);
});

test('4. her new English story with research French: the translation is queued (as "Leave it to us"); the French page shows her English story with « Description en anglais »', async () => {
  const { v, t } = await kayla();
  sent.length = 0;
  const story = 'Whistler’s only canyon bungee and giant swing over the Cheakamus River. Check in 30 minutes early at the gravel lot off Hwy 99, not our office, and do the online waiver before you come.';
  ok(await change(t, { description: story }));
  const q = db.prepare("SELECT * FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_story' AND status = 'help'").all(v.id);
  assert.equal(q.length, 1);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(sent.some((m) => /French description/i.test(JSON.stringify(m))), JSON.stringify(sent).slice(0, 400));
  // Once only.
  ok(await change(t, { description: `${story} See you there.` }));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_story' AND status = 'help'").get(v.id).n, 1);
  approveAll(v.id);
  const fr = page(v, 'fr');
  assert.match(fr, /<p class="venue-desc-lang" id="venueDescLang">Description en anglais<\/p>/);
  assert.match(plain(fr), /gravel lot off Hwy 99/);
  assert.doesNotMatch(plain(fr), /Enregistrement à notre bureau/);
  assert.doesNotMatch(page(v), /venueDescLang/);
  // Her own French story: shown, no note, nothing queued.
  const v2 = mk('tour', { description_fr: 'Recherche.' });
  assert.equal(app.ownerFrDescEnglishShown(app.getVenue(v2.id)), false);
});

test('5. "Weather permitting" on a stretch of other hours: the hours block, "Open now · weather permitting" (EN + FR), Season "All year (Nov–Apr: weekends only)", and a planner note on those dates', async () => {
  const { v, t } = await kayla();
  const winter = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [['10:00', '16:00']], sun: [['10:00', '16:00']] };
  ok(await change(t, { hours_seasons: [{ from: '11-01', to: '04-30', label: '', hours: winter, weather: true }] }));
  approveAll(v.id);
  app.clearHoursExtraCache();
  assert.deepEqual(app.venueWeatherStretches(v.id), [{ from: '11-01', to: '04-30' }]);
  const sat = new Date('2027-01-16T11:00:00-08:00'), jul = new Date('2026-07-18T11:00:00-07:00');
  assert.match(plain(page(v, 'en', sat)), /Open now · Closes 4 PM · weather permitting/);
  assert.match(plain(page(v, 'fr', sat)), /selon la météo/);
  assert.doesNotMatch(plain(page(v, 'en', jul)), /weather permitting/);
  assert.match(plain(page(v, 'en', sat)), /Sat, Sun 10 AM – 4 PM · Weather permitting/);
  assert.match(plain(page(v, 'fr', sat)), /· Selon la météo/);
  ok(await change(t, { tour_info: { year: null } })); approveAll(v.id);
  ok(await change(t, { tour_info: { year: 'all' } })); approveAll(v.id);
  assert.equal(rowOf(v.id, 'Season'), 'All year (Nov–Apr: weekends only).');
  assert.deepEqual(app.tourStretchWeekendsText(v.id), { en: 'Nov–Apr: weekends only', fr: 'nov.–avr. : fins de semaine seulement' });
  // Only for tours.
  const r = mk('restaurant'); const rt = tokenFor(r.id);
  assert.equal((await change(rt, { hours_seasons: [{ from: '11-01', to: '04-30', label: '', hours: winter, weather: true }] })).status, 400);
  // The planner: the facts carry the stretch; a January plan's stop says so.
  assert.deepEqual(app.tourPlannerFacts(v.id).tourWeather, [{ from: '11-01', to: '04-30' }]);
  const p = plan('bungee jump in Whistler in January');
  const stop = itemsOf(p).find((x) => x.venue.name === v.name);
  assert.ok(stop, JSON.stringify([p.kind, namesOf(p)]));
  assert.ok((stop.caveats || []).includes('Runs weather permitting at this time of year (the operator’s own answer).'), JSON.stringify(stop.caveats));
  assert.match(PLANNER, /const TOUR_WEATHER_NOTE = 'Runs weather permitting at this time of year \(the operator’s own answer\)\.';/);
  const fc = require('../trip-french-copy.js');
  assert.equal(fc.t3FrenchText('Runs weather permitting at this time of year (the operator’s own answer).'), 'Selon la météo à cette période de l’année (réponse de l’entreprise).');
  // The setup: the option on the stretch screen (tours only), EN + FR.
  assert.match(CLIENT, /seas && TOUR && T\.seaWeather/); assert.match(CLIENT, /if \(k === 'seaWeather'\)/);
  assert.ok(text.en.seaWeather && text.fr.seaWeather);
});

test('7a. Close by and its distances start from the approved meeting spot (not the office pin); a pickup operator keeps the office', async () => {
  const { v } = await kayla({ latitude: 50.0870, longitude: -123.0400 });
  const near = mk('cafe', { name: 'Gravel Lot Coffee', latitude: 50.0350, longitude: -123.1100 });
  const far = mk('cafe', { name: 'Office Coffee', latitude: 50.0872, longitude: -123.0402 });
  db.prepare("INSERT INTO venue_arrival_points (venue_id, file, preview_key, lat, lng, status) VALUES (?, 't12.jpg', ?, 50.0352, -123.1102, 'approved')").run(v.id, `t12-${v.id}`);
  const o = app.venueCloseByOrigin(app.getVenue(v.id));
  assert.equal(o.latitude, 50.0352);
  const nb = app.getNearbyVenues(app.getVenue(v.id));
  assert.equal(nb.find((x) => x.id === near.id).distance_km < 0.1, true);
  assert.ok(nb.find((x) => x.id === far.id).distance_km > 5);
});

test('7b. links pulled out of pasted text: a booking link with an emoji or #linkinbio, an instagram.com/<name> link', async () => {
  assert.equal(app.ownerUrlFromPaste('https://book.example.com/jump 🔥 #linkinbio', 'booking_url'), 'https://book.example.com/jump');
  assert.equal(app.ownerUrlFromPaste('book here: book.example.com/jump!!', 'booking_url'), 'book.example.com/jump');
  assert.equal(app.ownerUrlFromPaste('@cheakamusbungee 🤙', 'instagram_url'), '@cheakamusbungee');
  const { v, t } = await kayla();
  ok(await change(t, { booking_url: 'https://book.example.com/jump 🔥 #linkinbio', instagram_url: 'instagram.com/cheakamusbungee 🤙' }));
  const all = db.prepare('SELECT changes FROM owner_change_requests WHERE venue_id = ? ORDER BY id DESC LIMIT 4').all(v.id).map((r) => JSON.parse(r.changes));
  assert.ok(all.some((c) => c.booking_url === 'https://book.example.com/jump'), JSON.stringify(all));
  assert.ok(all.some((c) => c.instagram_url === 'https://www.instagram.com/cheakamusbungee/'), JSON.stringify(all));
  // The setup reads the link or @name out of pasted text, and an instagram.com link becomes "@name".
  assert.match(CLIENT, /function socFromPaste\(val, ig\)/); assert.match(CLIENT, /function urlFromPaste\(v\)/);
  const fn = new Function(`${/function igFromSite\(v\)\{[^\n]*\n/.exec(CLIENT)[0]}${/function socFromPaste\(val, ig\)\{[\s\S]*?\n  \}\n/.exec(CLIENT)[0]} return socFromPaste;`)();
  assert.equal(fn('instagram.com/cheakamusbungee 🤙 #linkinbio', true), '@cheakamusbungee');
  assert.equal(fn('https://www.facebook.com/cheakamusbungee 🔥', false), 'https://www.facebook.com/cheakamusbungee');
});

test('7c. the Groups chip focuses the box at the end; research words her own story says stay with her kinds', () => {
  assert.match(CLIENT, /if \(qk === 'good_to_know' \|\| qk === 'groups'\) \{ try \{ box\.focus\(\); var bl = box\.value\.length; box\.setSelectionRange\(bl, bl\);/);
  assert.match(app.tourKindsText(['adventure'], false, 'Bungee jumping & giant swing', '', 'Our giant swing over the canyon'), /giant swing/i);
  assert.doesNotMatch(app.tourKindsText(['adventure'], false, 'Bungee jumping & giant swing', '', ''), /giant swing/i);
  assert.equal(app.tourKindsText(['sightseeing'], false, 'Sightseeing tours & airport shuttles', '', ''), 'Sightseeing tours');
});

test('7d. extras, add-ons and gift cards aren’t tours (page, admin card); /browse and the tours search box read typed tour lines; "1 to 1½ hours"', async () => {
  const { v } = await kayla();
  assert.equal(app.tourTripItems({ sections: TOURS }).length, 3);
  assert.match(plain(page(v)), /See all tours & prices \(3 tours\)/);
  const m = db.prepare("SELECT m.*, v.name AS venue_name FROM venue_menus m JOIN venues v ON v.id = m.venue_id WHERE m.venue_id = ? AND m.status = 'published'").get(v.id);
  assert.match(app.renderAdminMenuCard(m), /3 tours/);
  // A section called Extras / Add-ons / Gift cards, "+$" prices.
  assert.equal(app.tourTripItems({ sections: [{ name: 'Add-ons', items: [{ name: 'Photos', price: '$20' }] }, { name: '', items: [{ name: 'Swing', price: '$119' }, { name: 'Video', price: '+$59' }] }] }).length, 1);
  // /browse (server filter) and its words; the tours page's search words.
  const b = await get('/browse?q=gopro');
  assert.equal(b.status, 200);
  assert.ok(b.text.includes(v.name), 'browse ?q=gopro');
  const tp = await get('/tours');
  if (tp.status === 200) assert.match(tp.text, /gopro/);
  assert.equal(app.tourLengthWords([60, 90]).en, '1 to 1½ hours.');
  assert.equal(app.tourLengthWords([60, 90]).fr, 'De 1 à 1,5 heure.');
  assert.equal(app.tourLengthWords([90, 180]).en, '1½ to 3 hours.');
  assert.equal(app.tourLengthWords([120, 1440 * 2]).en, '2 hours to 2 days.');
});

test('7e. "gift cards" on /search with a tour word finds her typed list before a gift shop', async () => {
  const { v } = await kayla();
  mk('shop', { name: 'Village Gift Shop', cuisine: 'Gift shop', description: 'Gifts, gift cards and souvenirs.' });
  const names = (q) => (app.runDiscovery(app.discoverySearchText(q, 'en'), { limit: 40, lang: 'en' }).results.items || []).map((x) => (x.venue || x).name);
  const r = names('bungee gift cards');
  assert.ok(r.includes(v.name), JSON.stringify(r));
  const gi = r.indexOf('Village Gift Shop');
  assert.ok(gi < 0 || r.indexOf(v.name) < gi, JSON.stringify(r));
});

test('7f. the meeting spot: "Choose a photo I took there" reads the photo’s GPS (EXIF); none: says so', () => {
  assert.match(CLIENT, /TOUR && T\.doorPick \? big\('🖼', T\.doorPick, T\.doorPickSub, true, 'doorPick'\)/);
  assert.match(SERVER, /<input type="file" id="suDoorPick" accept="image\/jpeg,image\/\*"/);
  for (const L of [text.en.tour, text.fr.tour]) for (const k of ['doorPick', 'doorPickSub', 'doorPickNoGps']) assert.ok(L[k], k);
  const exifGps = new Function(`${/function exifGps\(buf\)\{[\s\S]*?\n  \}\n/.exec(CLIENT)[0]} return exifGps;`)();
  // A tiny JPEG: SOI, APP1 Exif (big-endian TIFF, IFD0 with a GPS pointer, a GPS IFD with N 50°2'6", W 123°6'36"), EOI.
  const rat = (a) => a.flatMap(([n, d]) => [n, d]);
  const tiff = [];
  const u16 = (x) => [(x >> 8) & 255, x & 255], u32 = (x) => [(x >>> 24) & 255, (x >> 16) & 255, (x >> 8) & 255, x & 255];
  // Header (8) + IFD0 at 8: 1 entry (2 + 12 + 4 = 18) -> GPS IFD at 26: 4 entries (2 + 48 + 4 = 54) -> rationals at 80.
  tiff.push(0x4d, 0x4d, ...u16(42), ...u32(8));
  tiff.push(...u16(1), ...u16(0x8825), ...u16(4), ...u32(1), ...u32(26), ...u32(0));
  tiff.push(...u16(4), ...u16(1), ...u16(2), ...u32(2), 0x4e, 0, 0, 0, ...u16(2), ...u16(5), ...u32(3), ...u32(80), ...u16(3), ...u16(2), ...u32(2), 0x57, 0, 0, 0, ...u16(4), ...u16(5), ...u32(3), ...u32(104), ...u32(0));
  for (const x of rat([[50, 1], [2, 1], [6, 1], [123, 1], [6, 1], [36, 1]])) tiff.push(...u32(x));
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, ...u16(app1.length + 2), ...app1, 0xff, 0xd9]);
  const at = exifGps(jpg.buffer);
  assert.ok(at && Math.abs(at.lat - 50.035) < 1e-6 && Math.abs(at.lng + 123.11) < 1e-6, JSON.stringify(at));
  assert.equal(exifGps(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]).buffer), null);
  assert.equal(exifGps(Uint8Array.from([1, 2, 3, 4]).buffer), null);
});
