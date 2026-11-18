// Whistler tour test 4 fixes (fresh eyes, 2026-11-17; Whistler Roam drafts/fresh-eyes-tour4-2026-11-17/REPORT.md: Dev, a
// solo guide with no office who runs a free history walk, a paid food tour and a winter lights walk, and lets dogs come).
// Covers bugs 1-12, the Minor list, the wording table and suggested fixes 1-9, in English and French, and that the other
// setup types still load.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-wr4-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const tr = require('../trip-requirements.js');
const planner = require('../trip-planner.js');
const text = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'owner-setup-client.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const V3 = fs.readFileSync(path.join(ROOT, 'trip-planner-v3-page.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Tour Wr4 ${++n}`, slug: `tour-wr4-${n}`, region: 'penticton', type, latitude: 49.49 + n / 2000, longitude: -119.59,
  rating: 4.6, reviews: 120, address: `${300 + n} Main St, Penticton`, phone: '250-555-0177', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour setup tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p, { redirect: 'manual' }).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.38.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes, fr = false) => postJson(`${fr ? '/fr' : ''}/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const progress = (t, step, status = 'live') => postJson(`/owner/${t}/setup/progress`, { step, status });
const score = async (t) => JSON.parse((await get(`/owner/${t}/setup/progress`)).text).score;
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id), topics };
};
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&#8288;|⁠/g, '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
const itemsOf = (p) => [...((p.outing && p.outing.stops) || []), ...((p.itinerary && p.itinerary.stops) || []), ...(p.days || []).flatMap((d) => d.stops || []), ...(p.recommendations || [])].filter((x) => x && x.venue);
const names = (p) => itemsOf(p).map((x) => x.venue.name);
const stopOf = (p, name) => itemsOf(p).find((x) => x.venue.name === name);
const tourInfo = (id) => { const r = db.prepare('SELECT info FROM venue_tour_info WHERE venue_id = ?').get(id); return r ? JSON.parse(r.info) : {}; };
const box = (id) => { const r = db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(id); return r ? JSON.parse(r.info) : null; };
const setBox = (id, info) => db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(id, JSON.stringify(info));
const cardOf = (html, name) => { const i = html.indexOf(`>${name}<`); const a = html.lastIndexOf('<li class="venue-card"', i); return html.slice(a, html.indexOf('</li>', i)); };

// Dev's listing, moved to Penticton: no office (the address is a park), wrong badges from a mis-categorised scrape, research
// lines partly wrong ("history walk by donation", "Free parking at the office; patio seating; vegan options").
const D = 'Village Stories Walking Tours';
let devCache = null;
function dev() {
  if (devCache) return devCache;
  const v = mk('tour', { name: D, slug: 'village-stories-wr4', cuisine: 'Walking tours & food tours', rating: 4.9, reviews: 212, price: 2, address: 'Gyro Park, 99 Main St, Penticton',
    patio: 1, vegan: 1, vegetarian: 1, happy_hour: 1, live_music: 1,
    description: 'Small-group guided walks through downtown Penticton with a local guide: a history walk, a food tasting tour of downtown restaurants, and a winter lights walk.',
    description_fr: 'Visites guidées à pied en petit groupe au centre-ville de Penticton avec un guide local.' });
  setBox(v.id, { rows: [
    { label: 'Known for', text: 'Guided history walks and food tasting tours of downtown Penticton' },
    { label: 'Time needed', text: '1 to 3 hours' },
    { label: 'Prices', text: 'Food tour $129 per person; history walk by donation' },
    { label: 'Booking', text: 'Book online; walk-ups welcome on the history walk' },
    { label: 'Ages', text: 'All ages; food tour tastings 19+' },
    { label: 'Season', text: 'Year-round' },
    { label: 'Good to know', text: 'Free parking at the office; patio seating; vegan options' }], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' });
  mk('tour', { name: 'Okanagan Tasting Tours Wr4', cuisine: 'Food tour', rating: 4.8, reviews: 300, description: 'Guided tasting tour of four downtown restaurants.' });
  mk('tour', { name: 'Skaha Jet Boats Wr4', cuisine: 'Jet boat tours', rating: 4.9, reviews: 900, description: 'Jet boat tours on Skaha Lake.' });
  mk('tour', { name: 'Naramata Wine Shuttle Wr4', cuisine: 'Wine tours', rating: 4.8, reviews: 500, description: 'Guided wine tours of the Naramata Bench.' });
  mk('restaurant', { name: 'Main Street Diner Wr4', cuisine: 'Canadian', rating: 4.5, reviews: 300, hours: JSON.stringify(WK('11:00', '21:00')) });
  mk('restaurant', { name: 'Lakeside Bistro Wr4', cuisine: 'French', rating: 4.7, reviews: 400, hours: JSON.stringify(WK('11:00', '22:00')) });
  mk('cafe', { name: 'Front Street Cafe Wr4', cuisine: 'Cafe', rating: 4.6, reviews: 200, hours: JSON.stringify(WK('07:00', '16:00')) });
  mk('outdoor', { name: 'KVR Trail Walk Wr4', cuisine: '', rating: 4.8, reviews: 700, description: 'An easy flat walking trail along the old railway with lake views.', activities: ['hiking'] });
  // A town with no food-tour or walking-tour company.
  const vern = { region: 'vernon', address: '6300 Tronson Rd, Vernon', latitude: 50.25, longitude: -119.33 };
  mk('outdoor', { name: 'Vernon Rail Trail Wr4', ...vern, rating: 4.8, reviews: 700, description: 'An easy flat walking trail along the lake.', activities: ['hiking'] });
  mk('tour', { name: 'Vernon Jet Boats Wr4', ...vern, latitude: 50.251, cuisine: 'Jet boat tours', description: 'Jet boats.' });
  mk('restaurant', { name: 'Vernon Bistro Wr4', ...vern, latitude: 50.252, cuisine: 'Bistro', rating: 4.7, reviews: 400, hours: JSON.stringify(WK('11:00', '22:00')) });
  devCache = { v, t: tokenFor(v.id) };
  return devCache;
}
const clientFn = (name) => { const m = new RegExp(`  function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}\\n`).exec(CLIENT) || new RegExp(`  function ${name}\\([^)]*\\)\\{.*\\}\\n`).exec(CLIENT); assert.ok(m, name); return m[0]; };

test('1. a free or by-donation tour: typed in the same price box, stored with the tour answers, "Free" on the page, the card and in Build My Trip', async () => {
  const { v, t } = dev();
  // The words the box takes, on the server and in the setup's own reader (the same rule).
  const WORDS = [['free', 'free'], ['Free', 'free'], ['FREE!', 'free'], ['0', 'free'], ['$0', 'free'], ['0 $', 'free'], ['0.00', 'free'], ['gratuit', 'free'], ['Gratuite', 'free'], ["it's free", 'free'], ['free, tips welcome', 'free'],
    ['by donation', 'donation'], ['By Donation', 'donation'], ['donation', 'donation'], ['pay what you want', 'donation'], ['pay-what-you-want', 'donation'], ['pay what you can', 'donation'], ['free (pay what you want)', 'donation'], ['free, by donation', 'donation'],
    ['contribution volontaire', 'donation'], ['Contribution volontaire', 'donation'], ['don', 'donation'], ['par don', 'donation'], ['gratuit (contribution volontaire)', 'donation'],
    ['129', ''], ['$35', ''], ['free for kids, $35 adults', ''], ['call us', ''], ['', ''], ['free parking', 'free']];
  for (const [typed, want] of WORDS.filter(([x]) => x !== 'free parking')) assert.equal(app.tourFreeRead(typed), want, typed);
  assert.equal(app.tourFreeRead(0), 'free');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(clientFn('tourFreeRead'), ctx);
  for (const [typed, want] of WORDS.filter(([x]) => x !== 'free parking')) assert.equal(vm.runInContext(`tourFreeRead(${JSON.stringify(typed)})`, ctx), want, `client: ${typed}`);
  assert.deepEqual(app.cleanTourPrice('by donation', true), { value: 'donation' });
  assert.deepEqual(app.cleanTourPrice('0', true), { value: 'free' });
  assert.deepEqual(app.cleanTourPrice('129', true), { value: 129 });
  // Only the per-person box: the private price (and every other caller) still refuses 0 and words.
  assert.ok(app.cleanTourPrice('0').error); assert.ok(app.cleanTourPrice('free').error);
  assert.equal((await change(t, { tour_info: { private: 'free' } })).status, 400);

  // Research said "history walk by donation": nothing is pre-picked (it was 129), a note says what to type.
  const c0 = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(c0.researchFee, null);
  assert.equal(c0.researchFreeHint, true);
  assert.equal(c0.t.tpriceFreeHint, 'Your page says by donation. Type free if that’s right.');
  assert.equal(c0.t.tpriceFreeTip, 'Free or by donation? Type free.');
  assert.equal(c0.t.tpriceLead, 'Your lowest paid price for one adult. It shows on your card as “From $X”.');
  assert.equal(c0.t.tpriceLeadFree, 'Your card will say “Free”.');
  assert.match(c0.t.tpriceNeed, /^Just the number, like 189\. Free or by donation\? Type free\.$/);
  const f0 = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.match(f0.t.tpriceFreeTip, /^Gratuit ou contribution volontaire\s?\? Écrivez gratuit\.$/);
  assert.match(f0.t.tpriceLeadFree, /Gratuit/);
  assert.equal(f0.t.tfreeCard, 'Gratuit');
  // A listing with a paid research price and no free words keeps its pre-pick.
  const paid = mk('tour', { cuisine: 'Boat tours' });
  setBox(paid.id, { rows: [{ label: 'Prices', text: 'Sunset cruise $79 per person; free parking at the dock' }], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' });
  const cp = cfgOf((await get(`/owner/${tokenFor(paid.id)}/setup`)).text);
  assert.equal(cp.researchFee, 79); assert.equal(cp.researchFreeHint, false);

  // "by donation": saved live, with the private price beside it.
  const r = ok(await change(t, { tour_price: 'by donation', tour_info: { private: 400 } }));
  assert.deepEqual(r.body.live.sort(), ['tour_info', 'tour_price']);
  assert.deepEqual({ price: tourInfo(v.id).price, free: tourInfo(v.id).free, private: tourInfo(v.id).private }, { price: 0, free: 'donation', private: 400 });
  assert.equal(app.tourPrice(v.id), null); assert.equal(app.tourFree(v.id), 'donation'); assert.equal(app.tourPriceValue(v.id), 'donation');
  assert.equal(box(v.id).rows.find((x) => x.label === 'Prices').text, 'Free (pay what you want). Private tours from $400.');
  assert.match(plain(page(v, 'en')), /Prices Free \(pay what you want\)\. Private tours from \$400\./);
  assert.match(plain(page(v, 'fr')), /Tarifs Gratuit \(contribution volontaire\)\. Sorties privées à partir de 400 \$\./);
  assert.equal(app.ownerValueText('tour_price', 'donation'), 'Free (pay what you want)');
  assert.equal(app.ownerValueText('tour_price', 'free'), 'Free');
  // "free" (or 0): "Free." / « Gratuit. »
  ok(await change(t, { tour_price: '0' }));
  assert.equal(tourInfo(v.id).free, 'free');
  assert.match(plain(page(v, 'en')), /Prices Free\. Private tours from \$400\./);
  assert.match(plain(page(v, 'fr')), /Tarifs Gratuit\. Sorties privées à partir de 400 \$\./);
  // The setup opens on the saved answer; the checklist counts the price as answered.
  const c1 = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(c1.cur.tour_price, 'free');
  assert.ok(!(await score(t)).left.some((x) => x.k === 'tour_price'));
  // The card: "Free" (« Gratuit » in French), no "From $X"; the $$ tier is off the page for a tour with its own price.
  assert.equal(app.cardPriceFor(v.id), 'Free');
  const card = cardOf((await get('/penticton/tours')).text, D);
  assert.match(card, /<span class="chip chip-feat chip-price">(?:<svg[\s\S]*?<\/svg>)?Free<\/span>/);
  assert.doesNotMatch(card, /From \$/);
  assert.match(cardOf((await get('/fr/penticton/tours')).text, D), /chip-price">(?:<svg[\s\S]*?<\/svg>)?Gratuit<\/span>/);
  assert.doesNotMatch(plain(page(v, 'en')), /Penticton · \$\$ ·| Price \$\$ /);
  const tier = mk('tour', { cuisine: 'Boat tours', price: 2 });
  assert.match(plain(page(tier, 'en')), /Penticton · \$\$ ·/, 'a tour with no price of its own keeps the tier');
  ok(await change(tokenFor(tier.id), { tour_price: 85 }));
  assert.doesNotMatch(plain(page(tier, 'en')), /Penticton · \$\$ ·/, 'a From price hides the tier too');
  const rest = mk('restaurant', { price: 2, cuisine: 'Canadian' });
  assert.match(plain(page(rest, 'en')), /\$\$/, 'restaurants keep their tier');

  // Build My Trip: the trip card says Free ($0 in the estimate), never a researched price; "free" is applied.
  ok(await change(t, { tour_info: { kinds: ['walking', 'food'], length: '1h', book: 'no', age: 'all' } }));
  const p1 = await plan('free walking tour in Penticton tomorrow');
  const me = stopOf(p1, D);
  assert.ok(me, JSON.stringify(names(p1)));
  assert.equal(me.venue.freeTour, 'free'); assert.equal(me.venue.cost, undefined);
  assert.equal(me.venue.price, null, 'no $$ tier beside Free on the trip card');
  assert.deepEqual(names(p1), [D]);
  assert.ok(!(p1.unsupported || []).some((u) => /free/i.test(u)), JSON.stringify(p1.unsupported));
  assert.doesNotMatch(String(p1.summary || p1.title || ''), /free/i);
  assert.ok(names(await plan('free things to do in Penticton')).includes(D));
  assert.equal(names(await plan('free tour in Penticton'))[0], D, 'a free tour comes first');
  assert.match(V3, /if \(v\.freeTour\) return '<p class="t3-stop-price" data-cost-cents="0"><strong>' \+ esc\(french \? 'Gratuit' : 'Free'\)/);
  assert.equal(planner.publicVenue({ id: 1, name: 'x', region: 'penticton', type: 'tour', url: '/x', features: {}, tourFree: 'donation', tourPrice: 35 }).freeTour, 'donation');

  // A paid price saved later replaces free; and free replaces a paid price.
  ok(await change(t, { tour_price: 35 }));
  assert.deepEqual({ price: tourInfo(v.id).price, free: tourInfo(v.id).free }, { price: 35, free: undefined });
  assert.equal(app.cardPriceFor(v.id), 'From $35');
  assert.match(plain(page(v, 'en')), /Prices From \$35 a person\. Private tours from \$400\./);
  ok(await change(t, { tour_price: 'gratuit' }, true));
  assert.equal(app.tourPriceValue(v.id), 'free'); assert.equal(app.cardPriceFor(v.id), 'Free');
  // Saving other tour answers keeps it; taking the price back clears it.
  ok(await change(t, { tour_info: { book: 'same_day' } }));
  assert.equal(tourInfo(v.id).free, 'free');
  // A winery's free tasting is as it was.
  const w = mk('winery', { cuisine: 'Winery' });
  ok(await change(tokenFor(w.id), { tasting_fee: 0 }));
  assert.equal(app.cardPriceFor(w.id), 'Free tasting');
  // The setup: the box keeps the words, the lead and the preview say Free, the save sends the word.
  assert.match(CLIENT, /if \(CUR\.tour_price === 'free' \|\| CUR\.tour_price === 'donation'\) \{ S\.tour\.free = CUR\.tour_price; S\.tour\.price = 0; \}/);
  // Tour test 7 (2026-11-17): also sent when a held price is waiting, so it is withdrawn.
  assert.match(CLIENT, /if \(pfree !== S\.savedTourPrice \|\| CUR\.tour_price_waiting != null\) pl\.push\(\{ tour_price: pfree \}\);/);
  assert.match(CLIENT, /return S\.tour\.free && T\.tpriceLeadFree \? T\.tpriceLeadFree :/);
  assert.match(CLIENT, /S\.savedTourPrice === 'free' \|\| S\.savedTourPrice === 'donation' \? \(T\.tfreeCard \|\| 'Free'\)/);
  assert.match(CLIENT, /field\('suTprice', T\.tpriceLabel, boxVal\('suTprice', tp\.price\), \{ max: 40 \}\) \+ \(T\.tpriceFreeTip \? '<p class="su-hint" id="suFreeTip">'/);
  assert.match(CLIENT, /C\.researchFreeHint && S\.savedTourPrice == null && !tp\.free && T\.tpriceFreeHint \? '<p class="su-sent su-research" id="suFreeHint">'/);
});

test('2. banners: the green "Saved" from the screen before clears when a nudge shows; a red nudge clears as soon as the price can be read (all price boxes)', () => {
  assert.match(CLIENT, /if \(\(S\.nudge \|\| S\.error\) && typeof toastEl !== 'undefined' && toastEl && toastEl\.textContent\) toastEl\.textContent = '';/);
  assert.match(CLIENT, /if \(PRICE_BOXES\.indexOf\(bfId\) >= 0 && S\.nudge && priceBoxOk\(bfId, bf\.value\)\) \{ S\.nudge = ''; var em2 = screen\.querySelector\('\.su-error'\); if \(em2 && em2\.parentNode\) em2\.parentNode\.removeChild\(em2\);/);
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext([clientFn('moneyHead'), clientFn('tourPriceRead'), clientFn('tourFreeRead'), clientFn('priceBoxOk')].join('\n'), ctx);
  const okBox = (id, x) => vm.runInContext(`priceBoxOk(${JSON.stringify(id)}, ${JSON.stringify(x)})`, ctx);
  for (const [id, typed, want] of [['suTprice', '129', true], ['suTprice', 'free', true], ['suTprice', '0', true], ['suTprice', 'by donation', true], ['suTprice', '', false], ['suTprice', 'call us', false],
    ['suTpriv', '', true], ['suTpriv', '400', true], ['suTpriv', 'free', false], ['suCfee', '16', true], ['suCfee', '0', false], ['suCfee', 'abc', false], ['suFee', '0', true], ['suFee', '12.50', true], ['suFee', 'twelve', false], ['suFee', '900', false]]) assert.equal(okBox(id, typed), want, `${id}: ${typed}`);
});

test('3. the dogs follow-up in trip words for a tour (EN + FR); the page line reads as sentences; other types keep theirs', async () => {
  const { v, t } = dev();
  const c = cfgOf((await get(`/owner/${t}/setup`)).text), f = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(c.t.dogQ, 'Which trips can dogs join?');
  assert.equal(c.t.dogEx, 'Dogs on a leash welcome on our walks, not on the food tour.');
  assert.deepEqual(c.t.quick.dogs, ['On every trip', 'On some trips', 'On a leash']);
  assert.deepEqual(c.t.dogChipLabels, ['On every trip', 'On some trips (say which)', 'On a leash']);
  // Tour test 8 (2026-11-17): "Guests’ own dogs" (a sled-dog business read it as her own dogs).
  assert.equal(c.offerLabels.dog_friendly, 'Guests’ own dogs can come along');
  assert.match(f.t.dogQ, /^À quelles sorties les chiens peuvent-ils venir\s?\?$/);
  assert.deepEqual(f.t.quick.dogs, ['À toutes les sorties', 'À certaines sorties', 'En laisse']);
  assert.deepEqual(f.t.dogChipLabels, ['À toutes les sorties', 'À certaines sorties (dites lesquelles)', 'En laisse']);
  assert.equal(f.offerLabels.dog_friendly, 'Les chiens des clients peuvent venir');
  for (const o of [c, f]) assert.doesNotMatch(JSON.stringify([o.t.dogQ, o.t.dogEx, o.t.quick.dogs, o.t.dogChipLabels]), /patio|inside|water bowl|terrasse|intérieur|bols/i);
  assert.match(CLIENT, /var shown = key === 'dogs' && TOUR && T\.dogChipLabels && T\.dogChipLabels\.length === l\.length \? T\.dogChipLabels : l;/);
  // The chips as sentences on the page, in both languages; her own words stay as typed.
  assert.equal(app.dogsChipSentences('On every trip. On a leash'), 'Dogs welcome on every trip. On a leash.');
  assert.equal(app.dogsChipSentences('À certaines sorties'), 'Chiens bienvenus à certaines sorties.');
  assert.equal(app.dogsChipSentences('Patio only'), 'Dogs welcome on the patio only.');
  ok(await change(t, { badges: { dog_friendly: true }, visit_rows: { dogs: 'On some trips. On a leash' } }));
  assert.match(plain(page(v, 'en')), /Dogs Dogs welcome on some trips\. On a leash\./);
  assert.match(plain(page(v, 'fr')), /Chiens Chiens bienvenus à certaines sorties\. En laisse\./);
  ok(await change(t, { visit_rows: { dogs: 'Dogs on a leash welcome on our walks, not on the food tour.' } }));
  assert.match(plain(page(v, 'en')), /Dogs Dogs on a leash welcome on our walks, not on the food tour\./);
  // A restaurant and a pub keep the patio question and chips.
  for (const type of ['restaurant', 'pub', 'brewery']) {
    const o = cfgOf((await get(`/owner/${tokenFor(mk(type, { cuisine: 'Canadian' }).id)}/setup`)).text);
    assert.equal(o.t.dogQ, 'Where are dogs allowed?', type);
    assert.equal(o.t.dogChipLabels, undefined, type);
    assert.match(String(o.offerLabels.dog_friendly || ''), /^(?!.*trips)/, type);
  }
});

test('4. saving "Who can come" takes the food-only badges off a tour (on that save only)', async () => {
  const { v, t } = dev();
  const c = cfgOf((await get(`/owner/${t}/setup`)).text);
  // Tour test 6 adds the place badges the tour setup never shows (Lake view…) after these.
  assert.deepEqual(c.tourFoodBadges.slice(0, 8), ['patio', 'live_music', 'sports_tv', 'vegan', 'vegetarian', 'gluten_free', 'nonalcoholic', 'happy_hour']);
  assert.deepEqual(app.TOUR_FOOD_BADGES_CLEARED, c.tourFoodBadges);
  assert.match(CLIENT, /if \(TOUR\) \(C\.tourFoodBadges \|\| \['patio', 'live_music', 'sports_tv', 'vegan', 'vegetarian', 'gluten_free', 'nonalcoholic', 'happy_hour'(?:, 'lake_view')?\]\)\.forEach\(function\(b\)\{ if \(S\.savedBadges\[b\] \|\| \(CUR\.badges \|\| \{\}\)\[b\]\) \{ sendB\[b\] = false; S\.badges\[b\] = false; \} \}\);/);
  assert.equal(cfgOf((await get(`/owner/${tokenFor(mk('restaurant').id)}/setup`)).text).tourFoodBadges, undefined);
  // The badge row of the page: between "See hours" and the buttons.
  const badgeRow = () => { const p = plain(page(v, 'en')); return p.slice(p.indexOf('See hours'), p.indexOf('Open in Google Maps')); };
  for (const b of ['Vegan-Friendly', 'Vegetarian-Friendly', 'Happy Hour', 'Patio', 'Live Music']) assert.ok(badgeRow().includes(b), `before: ${b}`);
  // What the screen sends: every one of them that is on, turned off, with the age answer.
  const on = c.tourFoodBadges.filter((b) => c.cur.badges[b]);
  assert.deepEqual(on.sort(), ['happy_hour', 'live_music', 'patio', 'vegan', 'vegetarian']);
  ok(await change(t, { tour_info: { age: 'all', adult: true }, badges: { ...Object.fromEntries(on.map((b) => [b, false])), wheelchair_accessible: true, locally_owned: true } }));
  await progress(t, 'offer');
  const head = badgeRow();
  for (const b of ['Vegan-Friendly', 'Vegetarian-Friendly', 'Happy Hour', 'Patio', 'Live Music']) assert.ok(!head.includes(b), `after: ${b}`);
  assert.match(head, /Wheelchair accessible/);
});

test('5. folded owner lines: a tour’s own lines all show, Good to know stays in the box ahead of Dogs and Groups, and the checklist counts a line a full box set aside (all types)', async () => {
  const { v, t } = dev();
  ok(await change(t, { tour_info: { kinds: ['walking', 'food'], length: '1h', book: 'day', age: 'all', adult: true, year: 'all' }, tour_price: 35 }));
  ok(await change(t, { badges: { dog_friendly: true }, visit_rows: { dogs: 'Dogs on a leash are welcome on the history walk and the lights walk. Not on the food tour.' } }));
  ok(await change(t, { visit_rows: { known_for: 'Guided history walks and food tasting tours of downtown Penticton' } }));
  const g1 = ok(await change(t, { visit_rows: { good_to_know: 'Meet at the park gate 10 minutes early. Wear comfortable shoes. Walks run rain or shine.' } }));
  const g2 = ok(await change(t, { visit_rows: { groups: 'Groups of 8 or more: please call ahead. Never more than 12 people.' } }));
  // Nine lines of his own: the box keeps seven, with Good to know among them; Groups and Dogs are the two set aside.
  const b = box(v.id);
  assert.equal(b.rows.length, 7);
  assert.ok(b.rows.some((x) => x.label === 'Good to know') && b.rows.some((x) => x.label === 'Known for'));
  assert.deepEqual((b.owner_dropped || []).filter((x) => x.owned).map((x) => x.label).sort(), ['Dogs', 'Groups']);
  // The page shows all nine open: no "More: groups, good to know".
  for (const lang of ['en', 'fr']) {
    const html = page(v, lang), visitHtml = /<section class="venue-section venue-visit"[\s\S]*?<\/section>/.exec(html)[0];
    assert.doesNotMatch(visitHtml, /<details class="visit-more">/, lang);
    assert.equal((visitHtml.match(/<li><span class="visit-label">/g) || []).length, 9, lang);
  }
  const en = plain(page(v, 'en'));
  assert.match(en, /Known for .* Good to know Meet at the park gate.* Groups Groups of 8 or more.* Dogs Dogs on a leash are welcome/);
  // So the setup never has to say "under More" for a tour; the checklist counts both lines.
  assert.equal(g1.body.visit_folded, undefined); assert.equal(g2.body.visit_folded, undefined);
  const left = (await score(t)).left.map((x) => x.k);
  assert.ok(!left.includes('pyv_groups') && !left.includes('pyv_known'), left.join(','));
  // A new Known for typed into a full box is never the line set aside.
  ok(await change(t, { visit_rows: { known_for: 'Small-group history walks and food tasting tours with a local guide' } }));
  assert.ok(box(v.id).rows.some((x) => x.label === 'Known for'));
  // Research writing the box again keeps his set-aside lines (they used to be lost).
  const cur = db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(v.id).info;
  const merged = JSON.parse(app.mergeOwnerVisitRows(cur, JSON.stringify({ rows: [{ label: 'Parking', text: 'Paid lots nearby.' }], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-18' })));
  assert.deepEqual(merged.owner_dropped.map((x) => x.label).sort(), ['Dogs', 'Groups']);
  assert.ok(!merged.rows.some((x) => x.label === 'Parking'), 'research never shows while one of his lines is set aside');

  // A restaurant (stored before the rule: her Known for set aside, research's lines in the box): the checklist counts
  // her line, and on the page it trades places with one of research's instead of sitting under "More".
  const r = mk('restaurant', { cuisine: 'Canadian' }), rt = tokenFor(r.id);
  setBox(r.id, { rows: [{ label: 'Reservations', text: 'Recommended on weekends.' }, { label: 'Takeout', text: 'Call to order.' }, { label: 'Dietary', text: 'Vegetarian options.' }, { label: 'Parking', text: 'Free lot behind.' },
    { label: 'Menu', text: 'Burgers and bowls.' }, { label: 'Patio', text: 'Seats 30.' }, { label: 'Best season', text: 'Summer.' }],
    owner_labels: ['Known for', 'Reservations', 'Takeout', 'Dietary'], owner_dropped: [{ label: 'Known for', text: 'Smash burgers and a lake view', owned: true }], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' });
  assert.ok(!(await score(rt)).left.some((x) => x.k === 'pyv_known'), 'a set-aside Known for is answered');
  const rv = /<section class="venue-section venue-visit"[\s\S]*?<\/section>/.exec(page(r, 'en'))[0];
  const shown = rv.split('<details class="visit-more">')[0], more = rv.split('<details class="visit-more">')[1] || '';
  assert.match(shown, /<span class="visit-label">Known for<\/span><span>Smash burgers and a lake view/);
  assert.doesNotMatch(more, /Known for/);
  // A winery whose own lines fill the box: the last of hers stays under "More" (as before), the checklist counts it, and
  // the setup says where it shows.
  const w = mk('winery', { cuisine: 'Winery' }), wt = tokenFor(w.id);
  setBox(w.id, { rows: ['Known for', 'Tastings', 'Groups', 'Restaurant', 'Food', 'Winter', 'Dogs'].map((l) => ({ label: l, text: `${l} line.` })), owner_labels: ['Dogs', 'Food', 'Groups', 'Known for', 'Reservations', 'Restaurant', 'Tastings', 'Winter'],
    winery_labels: ['Food', 'Groups', 'Restaurant', 'Tastings', 'Winter'], owner_dropped: [{ label: 'Reservations', text: 'Book ahead on weekends.', owned: true }], booking_url: null, source_url: null, checked_at: '2026-11-01' });
  assert.ok(!(await score(wt)).left.some((x) => x.k === 'pyv_reservations'));
  assert.deepEqual(app.ownerVisitFoldedKeys(app.getVenue(w.id)), ['reservations']);
  assert.match(page(w, 'en'), /<details class="visit-more"><summary>More: reservations<\/summary>/);
  assert.equal(text.en.foldedMore, 'Look for it under “More” in your Plan your visit box.');
  assert.match(text.fr.foldedMore, /sous « Plus »/);
  assert.match(CLIENT, /S\.foldedNow = \(j\.visit_folded \|\| \[\]\)\.some\(function\(k\)\{ return typeof changes\.visit_rows\[k\] === 'string' && changes\.visit_rows\[k\]; \}\);/);
  assert.match(CLIENT, /var foldedNote = S\.foldedNow && how === 'live' && T\.foldedMore \? ' ' \+ T\.foldedMore : ''; S\.foldedNow = false;/);
  // The save's own answer names a line the page folds (a restaurant's Groups line beside another folded line).
  const r2 = mk('restaurant', { cuisine: 'Canadian' });
  setBox(r2.id, { rows: [{ label: 'Parking', text: 'Free lot behind.' }, { label: 'Patio', text: 'Seats 30.' }], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' });
  const sv = ok(await change(tokenFor(r2.id), { visit_rows: { groups: 'Call ahead for 10 or more' } }));
  assert.deepEqual(sv.body.visit_folded, ['groups']);
});

test('6. Build My Trip: "food tour" is the food-tour operator when the town has one (restaurants otherwise); French food tours; walking, ghost, history, night and lights walks are walking tours', async () => {
  const { v, t } = dev();
  ok(await change(t, { tour_info: { kinds: ['walking', 'food'], length: '1h' } }));
  const OPS = [D, 'Okanagan Tasting Tours Wr4'];
  for (const q of ['food tour in Penticton', 'Food tour in Penticton on Saturday', 'tasting tour in Penticton', 'visite gourmande à Penticton samedi', 'tournée gourmande à Penticton samedi', 'visite culinaire à Penticton samedi']) {
    const got = names(await plan(q));
    assert.deepEqual(got.slice().sort(), OPS.slice().sort(), `${q}: ${JSON.stringify(got)}`);
  }
  // No food-tour operator in the town, or a diet / crawl request: eating round town, as before.
  for (const q of ['food tour in Vernon', 'vegan food tour in Penticton', 'a food crawl in Penticton']) {
    const p = await plan(q);
    assert.ok(!names(p).some((x) => OPS.includes(x)), `${q}: ${JSON.stringify(names(p))}`);
    assert.match(String(p.summary || p.title || ''), /Restaurants|cafes|food/i, q);
  }
  assert.ok(names(await plan('food tour in Vernon')).includes('Vernon Bistro Wr4'));
  // Walking tours.
  for (const q of ['walking tour in Penticton tomorrow morning', 'Winter lights walk in Penticton on January 15', 'ghost walk in Penticton', 'history walk in Penticton', 'night walk in Penticton', 'history tour in Penticton', 'marche des lumières à Penticton le 15 janvier', 'visite à pied de Penticton jeudi', 'visite guidée à pied de Penticton jeudi']) {
    const p = await plan(q);
    assert.deepEqual(names(p), [D], `${q}: ${JSON.stringify(names(p))}`);
    assert.doesNotMatch(String(p.summary || p.title || ''), /Hiking|“/, q);
    assert.deepEqual(p.unsupported || [], [], q);
  }
  // No walking-tour company in the town: a "… walk" is a walk again, a "walking tour" a tour request.
  assert.deepEqual(names(await plan('night walk in Vernon')), ['Vernon Rail Trail Wr4']);
  assert.ok(!names(await plan('walking tour in Vernon')).includes('Vernon Rail Trail Wr4'));
  // A plain walk still means the trails, with an operator in town or not.
  assert.deepEqual(names(await plan('an easy walk in Penticton')), ['KVR Trail Walk Wr4']);
  // The kinds: the operator's own pick, or the listing's own words; never a restaurant, never a wine tasting tour.
  const kinds = (o) => tr.inferPlannerKinds({ type: 'tour', name: '', description: '', ...o });
  assert.ok(kinds({ cuisine: 'Food tour' }).includes('food_tour'));
  assert.ok(kinds({ cuisine: 'Boat tours', tourKinds: ['boat', 'food'] }).includes('food_tour'));
  assert.ok(kinds({ cuisine: 'Walking & history tours' }).includes('walking_tour'));
  assert.ok(kinds({ cuisine: 'Ghost tours' }).includes('walking_tour'));
  assert.ok(kinds({ cuisine: 'Boat tours', tourKinds: ['walking'] }).includes('walking_tour'));
  assert.ok(!kinds({ cuisine: 'Wine tasting tours' }).includes('food_tour'));
  assert.ok(!kinds({ cuisine: 'Jet boat tours', description: 'A short walk to the dock.' }).includes('walking_tour'));
  assert.ok(!tr.inferPlannerKinds({ type: 'restaurant', name: 'Bistro', description: 'A stop on every food tour and walking tour.', cuisine: 'French' }).some((k) => ['food_tour', 'walking_tour'].includes(k)));
  assert.equal(tr.LABELS.food_tour, 'food tour'); assert.equal(tr.LABELS.walking_tour, 'walking tour');
  assert.ok(app.tripTourKindVenues().some((x) => x.name === D && x.tourKinds.includes('food')));
});

test('7. admin: the owner’s main-photo pick pre-ticks the box (the reviewer can untick it); "See the tours & prices page"; a Groups line is labelled Groups', async () => {
  const card = (o) => app.renderAdminPhotoCard({ id: 7, venue_name: 'X', width: 1200, height: 900, submitted_at: '2026-11-17 10:00:00', credit: 'Dev', preview_url: '/owner-photos/preview/k.jpg', listing_url: '/x', status: 'pending', ...o }, false);
  assert.match(card({ venue_has_own_photo: true, main_requested: true, is_main: false }), /<input type="checkbox" name="main" checked>/);
  assert.match(card({ venue_has_own_photo: true, main_requested: true, is_main: false }), /owner wants this as the main photo<\/strong> \(Approve makes it main; untick the box to keep the current one\)/);
  assert.match(card({ venue_has_own_photo: true, main_requested: false, is_main: false }), /<input type="checkbox" name="main">/);
  assert.match(card({ venue_has_own_photo: false, main_requested: false, is_main: false }), /<input type="checkbox" name="main" checked>/);
  // The review page sends the box as it stands; approving with it ticked makes the photo the main one.
  assert.match(SERVER, /var main = card\.querySelector\('input\[name=main\]'\); if \(main\) body\.main = main\.checked;/);
  const v = mk('tour', { cuisine: 'Boat tours', image_url: '/images/venues/example-own.jpg' });
  const dir = path.join(ROOT, '.owner-photos-local'); fs.mkdirSync(dir, { recursive: true });
  const jpeg = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x11, 0x08, 900 >> 8, 900 & 255, 1200 >> 8, 1200 & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]), Buffer.alloc(64), Buffer.from([0xFF, 0xD9])]);
  const up = await postJson(`/owner/${tokenFor(v.id)}/photos`, { image: `data:image/jpeg;base64,${jpeg.toString('base64')}`, credit: 'Dev', rights: true, contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000, notify: false, main: true });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const listed = app.listOwnerPhotos('pending').find((p) => p.id === up.body.id);
  assert.equal(listed.main_requested, true); assert.equal(listed.venue_has_own_photo, true);
  assert.match(app.renderAdminPhotoCard(listed, false), /name="main" checked>/);
  assert.equal(app.approveOwnerPhoto(up.body.id, 'test', { main: true }).main, true);
  assert.match(db.prepare('SELECT image_url FROM venues WHERE id = ?').get(v.id).image_url, /^\/images\/owner\//);
  // Admin wording.
  assert.match(SERVER, /adminSee: `See the \$\{L\} page`/);
  assert.match(SERVER, /rel="noopener">' \+ \(T\.adminSee \|\| 'See the menu page'\) \+ '<\/a>/);
  assert.equal(app.ownerValueText('visit_rows', { known_for: '', groups: 'Never more than 12 people.', good_to_know: 'Wear comfortable shoes.' }), 'Groups: Never more than 12 people. · Good to know: Wear comfortable shoes.');
  assert.equal(app.ownerValueText('visit_rows', { groups: 'Call ahead for 10 or more' }), 'Groups: Call ahead for 10 or more');
  assert.equal(app.ownerValueText('visit_rows', { groups: 'Cash only' }), 'Good to know: Cash only');
});

test('8. Help for tours (EN + FR): times, free, dogs, lengths, strollers, allergies, languages, group size, the phone, parking', async () => {
  const { t } = dev();
  const en = helpBot((await get(`/owner/${t}/setup`)).text), fr = helpBot((await get(`/fr/owner/${t}/setup`)).text);
  const EN = [['my tours go at different times', 'tour-times'], ['where do the times go', 'tour-times'], ['Where do I put the times of each tour?', 'tour-times'],
    ['My history walk is free, people pay what they like. What do I put?', 'tour-free-trip'], ['Can I put 0?', 'tour-free-trip'], ['my walk is by donation', 'tour-free-trip'], ['pay what you want', 'tour-free-trip'], ['it says from $129 but my walk is free', 'tour-free-trip'],
    ['Is this free?', 'tour-free'], ['it asks about a patio', 'tour-dogs'], ['Dogs can come on the walks but not the food tour', 'tour-dogs'], ['dogs on some tours', 'tour-dogs'],
    ['My tours are different lengths. Which one do I pick?', 'tour-lengths'], ['Can people bring strollers? Kids are free', 'tour-strollers'], ['What about allergies on the food tour?', 'tour-allergies'], ['dietary needs', 'tour-allergies'],
    ['I can do tours in French on request', 'tour-languages'], ['tours in other languages', 'tour-languages'], ['how do I write this in French', 'french'],
    ['Maximum group size is 12', 'tour-max-group'], ['never more than 12 people', 'tour-max-group'], ['minimum age', 'tour-age'],
    ['Will people see my phone number?', 'phone'], ['There is no parking at the plaza', 'parking-paid'], ['parking is paid', 'parking-paid'], ['private and company walks', 'tour-groups'], ['My lights walk is only in winter', 'tour-one-trip-season']];
  for (const [q, id] of EN) assert.equal(en.best(q).id, id, q);
  const FR = [['mes visites partent à des heures différentes', 'tour-times'], ['ma marche est gratuite, contribution volontaire', 'tour-free-trip'], ['puis-je mettre 0?', 'tour-free-trip'], ['les chiens peuvent venir à certaines sorties', 'tour-dogs'],
    ['mes sorties n’ont pas la même durée', 'tour-lengths'], ['poussettes', 'tour-strollers'], ['allergies', 'tour-allergies'], ['visites en anglais sur demande', 'tour-languages'], ['maximum de 12 personnes par groupe', 'tour-max-group'],
    ['est-ce que les gens voient mon numéro de téléphone?', 'phone'], ['il n’y a pas de stationnement', 'parking-paid']];
  for (const [q, id] of FR) assert.equal(fr.best(q).id, id, q);
  const a = (id) => plain(en.topic(id).a), aFr = (id) => plain(fr.topic(id).aFr);
  // Tour times: one time from the first departure to the last return; times per trip in Your tours and prices. No
  // restaurant words in the plain hours answer either.
  assert.match(a('tour-times'), /from your first departure to when the last trip gets back/);
  assert.match(a('tour-times'), /The time of each trip goes in Your tours and prices/);
  for (const id of ['tour-times', 'hours']) { assert.doesNotMatch(a(id), /lunch|dinner|midnight/i, id); assert.doesNotMatch(aFr(id), /midi et soir|minuit/i, id); }
  assert.match(a('tour-free-trip'), /type the word free in the price box \(or 0 , or by donation \/ pay what you want \)/);
  assert.match(aFr('tour-free-trip'), /écrivez le mot gratuit dans la case du prix/);
  assert.match(a('tour-dogs'), /tick Guests’ own dogs can come along/); assert.doesNotMatch(a('tour-dogs'), /edit page|Badges/);
  assert.match(a('tour-lengths'), /tap your shortest trip.*Your tours and prices/);
  for (const id of ['tour-strollers', 'tour-allergies', 'tour-languages']) { assert.match(a(id), /Good to know \(in “More about your tours”\)/, id); assert.match(aFr(id), /Bon à savoir/, id); }
  assert.match(a('tour-max-group'), /Groups and private bookings.*Never more than 12 people/);
  // The phone: plainly public, with the site's example number (a per-site constant).
  assert.match(a('phone'), /^ ?Yes, people see it\. The phone number on your listing is public/);
  assert.equal(app.HELP_PHONE_EXAMPLE, '250-555-0123');
  assert.ok(a('phone').includes(app.HELP_PHONE_EXAMPLE) && aFr('phone').includes(app.HELP_PHONE_EXAMPLE));
  assert.match(aFr('phone'), /Oui, les gens le voient\./);
  // Parking points to "More about your tours", not the edit page.
  assert.match(a('parking-paid'), /No parking \/ paid parking\? Leave Free parking unticked/);
  assert.match(a('parking-paid'), /Good to know , in More about your tours/); assert.doesNotMatch(a('parking-paid'), /edit page/);
  // The winter-only trip example is the site's own (no heli-skiing on Okanagan); the groups answer no longer says the
  // booking link box is on that screen; "photos and price lists", never menus.
  assert.ok(a('tour-one-trip-season').includes(app.TOUR_HELP_SEASONAL_TRIP.en) && aFr('tour-one-trip-season').includes(app.TOUR_HELP_SEASONAL_TRIP.fr.replace(/ ([:$])/g, ' $1')) || aFr('tour-one-trip-season').includes('raquettes'));
  assert.doesNotMatch(a('tour-one-trip-season') + aFr('tour-one-trip-season'), /heli|héli|1,650|1 650/i);
  assert.doesNotMatch(a('tour-groups'), /box is on the same screen/); assert.match(a('tour-groups'), /Your booking link has its own screen, Booking/);
  const all = JSON.stringify(en.topics) + JSON.stringify(fr.topics);
  assert.doesNotMatch(all, /photos and menus|photos et (?:les )?menus/);
  assert.match(all, /photos and price lists/);
  // A restaurant's help keeps its own words.
  const rest = helpBot((await get(`/owner/${tokenFor(mk('restaurant', { cuisine: 'Canadian' }).id)}/setup`)).text);
  assert.match(plain(rest.topic('hours').a), /lunch & dinner/);
  assert.equal(rest.topic('tour-times'), undefined);
  assert.doesNotMatch(plain(rest.topic('phone').a), /Yes, people see it/);
});

test('9. research lines the owner has not confirmed never sit under "From the venue" alone; a tour’s research Good to know loses its restaurant words once Who can come is saved', async () => {
  const src = (h) => plain(/<p class="venue-hours-checked">[\s\S]*?<\/p>/.exec(/<section class="venue-section venue-visit"[\s\S]*?<\/section>/.exec(h)[0])[0]).trim();
  const v = mk('tour', { cuisine: 'Boat tours' }), t = tokenFor(v.id);
  setBox(v.id, { rows: [{ label: 'Known for', text: 'Sunset cruises on the lake' }, { label: 'Ages', text: 'All ages; tastings 19+' }, { label: 'Good to know', text: 'Free parking at the office; patio seating; vegan options. Bring a jacket.' }],
    booking_url: null, source_url: 'https://www.example.com/tours', checked_at: '2026-11-01' });
  assert.match(src(page(v, 'en')), /^From example\.com, checked Nov 1, 2026$/);
  // One owner answer: the box says both sources (it said "From the venue" over research's Ages and Good to know).
  ok(await change(t, { tour_price: 79 }));
  assert.match(src(page(v, 'en')), /^From the venue and example\.com, checked /);
  // The French page leaves research's lines with no French off, so every line it shows is his.
  assert.match(src(page(v, 'fr')), /^Source : l’établissement, vérifié le /);
  assert.doesNotMatch(plain(/<section class="venue-section venue-visit"[\s\S]*?<\/section>/.exec(page(v, 'fr'))[0]), /Sunset cruises|patio seating/);
  assert.match(SERVER, /mixedSource \? `Sources\\u00a0: l\\u2019\\u00e9tablissement et \$\{escapeHtml\(mixedSource\)\}`/);
  // Who can come saved: research's Ages is replaced by his, and research's Good to know drops the parking, patio and
  // vegan words (display only; the stored row is untouched).
  ok(await change(t, { tour_info: { age: '6' }, badges: { wheelchair_accessible: true } }));
  const en = plain(page(v, 'en'));
  assert.match(en, /Ages Ages 6 and up\./);
  assert.match(en, /Good to know Bring a jacket\./);
  assert.doesNotMatch(en, /patio seating|vegan options|Free parking at the office/);
  assert.match(box(v.id).rows.find((x) => x.label === 'Good to know').text, /patio seating; vegan options/);
  // Every line his own: "From the venue".
  ok(await change(t, { visit_rows: { known_for: 'Sunset cruises with a local skipper', good_to_know: 'Bring a jacket: it is cool on the water.' } }));
  assert.match(src(page(v, 'en')), /^From the venue, checked /);
  assert.match(src(page(v, 'fr')), /^Source : l’établissement, vérifié le /);
  // All types: a restaurant with the owner's Known for beside research's Parking.
  const r = mk('restaurant', { cuisine: 'Canadian' });
  setBox(r.id, { rows: [{ label: 'Known for', text: 'Smash burgers' }, { label: 'Parking', text: 'Free lot behind.' }], owner_labels: ['Known for'], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' });
  assert.match(src(page(r, 'en')), /^From the venue and example\.com, checked Nov 1, 2026$/);
  setBox(r.id, { rows: [{ label: 'Known for', text: 'Smash burgers' }], owner_labels: ['Known for'], booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' });
  assert.match(src(page(r, 'en')), /^From the venue, checked Nov 1, 2026$/);
});

test('10. wording and small items: "end of February", "tap Next", "Address or meeting point", one capital in the category, Category and Meeting point on the page, Back after a changed answer', async () => {
  const { v, t } = dev();
  // A stretch that runs to the end of February (stored as Feb 29).
  assert.equal(app.hoursExtraRangeText('12-01', '02-29'), 'Dec 1 – end of February');
  assert.equal(app.hoursExtraRangeText('12-01', '02-29', true), '1er déc. – fin février');
  assert.equal(app.hoursExtraRangeText('12-01', '03-15'), 'Dec 1 – Mar 15');
  assert.equal(app.hoursExtraRangeText('2028-02-29', '2028-03-02'), 'Feb 29 – Mar 2', 'a real dated day keeps its date');
  ok(await change(t, { hours_seasons: [{ from: '12-01', to: '02-29', hours: WK('10:00', '19:00') }] }));
  const en = plain(page(v, 'en')), fr = plain(page(v, 'fr'));
  assert.match(en, /Hours \(Dec 1 – end of February\)/); assert.match(en, /Mar 1 – Nov 30 .* Dec 1 – end of February Daily 10 AM – 7 PM/);
  assert.match(fr, /Heures du 1er déc\. à la fin de février/); assert.match(fr, /1er déc\. – fin février/);
  assert.doesNotMatch(en + fr, /Feb 29|29 févr/);
  assert.match(CLIENT, /function mdLabel\(md\)\{ if \(md === '02-29'\) return C\.lang === 'fr' \? 'fin février' : 'end of February';/);
  // A tour's season line too.
  const s = mk('tour', { cuisine: 'Snowshoe tours' });
  ok(await change(tokenFor(s.id), { open_months: '12-01:02-29', tour_info: { year: 'seasonal' } }));
  assert.match(plain(page(s, 'en')), /Season Dec 1 – end of February\./);
  assert.match(plain(page(s, 'fr')), /Saison Du 1er déc\. à la fin de février\./);
  // Wording.
  const c = cfgOf((await get(`/owner/${t}/setup`)).text), f = cfgOf((await get(`/fr/owner/${t}/setup`)).text);
  assert.equal(c.t.hoursBack, 'We put back the hours you had before. Check them, then tap Next.');
  assert.match(f.t.hoursBack, /puis touchez Suivant\.$/);
  assert.equal(c.t.streetLabel, 'Address or meeting point'); assert.equal(f.t.streetLabel, 'Adresse ou point de rencontre');
  const rc = cfgOf((await get(`/owner/${tokenFor(mk('restaurant').id)}/setup`)).text);
  assert.equal(rc.t.streetLabel, 'Street address'); assert.equal(rc.t.hoursBack, c.t.hoursBack);
  // Category words: one list, one capital; acronyms and hyphenated names stay.
  assert.equal(app.tourKindsText(['walking', 'food'], false, 'Walking tours & food tours'), 'Walking tours & food tours');
  assert.equal(app.tourKindsText(['walking', 'food'], true, 'Walking tours & food tours'), 'Visites à pied et visites gourmandes');
  assert.equal(app.tourKindsText(['snowmobile', 'dogsled'], false, ''), 'Snowmobile tours & dog sledding');
  assert.equal(app.tourKindsText(['fishing', 'raft', 'jetboat'], false, ''), 'Jet boat tours, fishing & rafting') // list order (tour test 5);
  assert.equal(app.tourKindsText(['snowmobile', 'adventure'], false, 'Snowmobile & ATV tours'), 'Snowmobile tours & ATV tours');
  ok(await change(t, { tour_info: { kinds: ['walking', 'food'], length: '1h' } }));
  assert.equal(app.getVenue(v.id).cuisine, 'Walking tours & food tours');
  // The page: "Category" (not Cuisine) for a tour, and "Meeting point" once the Basics question is confirmed.
  assert.match(plain(page(v, 'en')), /Good to Know Category Walking tours & food tours Address Gyro Park/);
  await progress(t, 'basics');
  assert.equal(app.tourAddressIsMeetingPoint(app.getVenue(v.id)), true);
  assert.match(plain(page(v, 'en')), /Category Walking tours & food tours Meeting point Gyro Park, 99 Main St, Penticton/);
  assert.match(plain(page(v, 'fr')), /Catégorie Visites à pied et visites gourmandes Point de rencontre Gyro Park/);
  const rest = mk('restaurant', { cuisine: 'Canadian' });
  await progress(tokenFor(rest.id), 'basics');
  assert.match(plain(page(rest, 'en')), /Cuisine Canadian Address /);
  // The phone's Back right after a changed answer stays on the answers list.
  assert.match(CLIENT, /if \(S\.toList\) \{ S\.toList = false; S\.hist = \[\]; S\.listBack = true; return go\('start'\); \}/);
  assert.match(CLIENT, /if \(S\.step === 'start' && S\.listBack\) \{ S\.listBack = false; navSync\(\); return; \}/);
  assert.match(CLIENT, /if \(s !== 'start'\) S\.listBack = false;/);
});

test('11. bug 12, the safe part: a published list with trips of different lengths adds "Varies by tour" to Time needed and Booking, and one note in Build My Trip', async () => {
  const v = mk('tour', { name: 'Old Town Walks Wr4', cuisine: 'Walking tours', region: 'oliver', address: '1 Main St, Oliver', latitude: 49.18, longitude: -119.55 }), t = tokenFor(v.id);
  ok(await change(t, { tour_info: { kinds: ['walking'], length: '1h', book: 'day', age: 'all' }, tour_price: 35 }));
  const list = (items, extra = '') => db.prepare(`INSERT INTO venue_menus (venue_id, status, data, published_at${extra ? ', source' : ''}) VALUES (?, 'published', ?, '2026-11-17'${extra ? ', ?' : ''})`).run(...[v.id, JSON.stringify({ sections: [{ name: 'Walks', items }] })].concat(extra ? [extra] : []));
  assert.deepEqual(app.tourListVaries(v.id), { length: false, ages: false }, 'no list');
  assert.doesNotMatch(plain(page(v, 'en')), /Varies by tour/);
  // One trip, or trips of the same length: nothing added.
  list([{ name: 'History walk', price: '$35', description: '75 minutes. All ages.' }, { name: 'Lights walk', price: '$35', description: '75 minutes. All ages.' }]);
  assert.deepEqual(app.tourListVaries(v.id), { length: false, ages: false });
  db.prepare('DELETE FROM venue_menus WHERE venue_id = ?').run(v.id);
  list([{ name: 'History walk', price: 'Pay what you want', description: '75 minutes · Every day at 10 AM and 2 PM. All ages.' }, { name: 'Food tasting tour', price: '$129', description: '3 hours · Thursday to Sunday at 4 PM. Tastings are for 19 and over.' }, { name: 'Private walk', price: 'From $400' }]);
  assert.deepEqual(app.tourListVaries(v.id), { length: true, ages: true });
  const en = plain(page(v, 'en')), fr = plain(page(v, 'fr'));
  assert.match(en, /Time needed Up to 1 hour\. Varies by tour: see Tours & prices\./);
  assert.match(en, /Booking Book at least a day ahead\. Varies by tour: see Tours & prices\./);
  assert.match(en, /Ages All ages\. Varies by tour: see Tours & prices\./);
  assert.match(fr, /Durée Jusqu’à 1 heure\. Varie selon la sortie : voir Sorties et tarifs\./);
  assert.match(fr, /Réservation Réservez au moins la veille\. Varie selon la sortie : voir Sorties et tarifs\./);
  assert.doesNotMatch(en, /Prices From \$35 a person\. Varies/);
  // Nothing stored changes, and the card's length chip is as it was.
  assert.equal(box(v.id).rows.find((x) => x.label === 'Time needed').text, 'Up to 1 hour.');
  // Build My Trip: one note beside the operator's booking answer.
  const st = stopOf(await plan('walking tour in Oliver tomorrow'), 'Old Town Walks Wr4');
  assert.ok(st, 'planned');
  assert.ok(st.caveats.includes('Book at least a day ahead (the operator’s own answer).'));
  assert.ok(st.caveats.includes('Length, ages and booking can differ by tour: see this operator’s Tours & prices.'), JSON.stringify(st.caveats));
  assert.match(fs.readFileSync(path.join(ROOT, 'trip-french-copy.js'), 'utf8'), /La durée, l’âge et la réservation peuvent varier selon la sortie/);
  // A research list the owner has not confirmed never counts.
  db.prepare("UPDATE venue_menus SET source = 'research' WHERE venue_id = ?").run(v.id);
  assert.deepEqual(app.tourListVaries(v.id), { length: false, ages: false });
});

test('the other setups still load, their price boxes and words are as they were, and happy hour is never asked of a tour', async () => {
  for (const type of ['restaurant', 'pub', 'cafe', 'winery', 'brewery', 'distillery', 'cocktail', 'tour']) {
    const o = mk(type, { cuisine: type === 'winery' ? 'Winery' : type === 'tour' ? 'Boat tours' : 'Canadian' });
    for (const lang of ['', '/fr']) {
      const r = await get(`${lang}/owner/${tokenFor(o.id)}/setup`);
      assert.equal(r.status, 200, `${type} ${lang}`);
      const c = cfgOf(r.text);
      assert.ok(c.t.hoursBack && c.t.foldedMore, `${type} ${lang}`);
      if (type !== 'tour') { assert.equal(c.t.tpriceFreeTip, undefined, type); assert.equal(c.tourFoodBadges, undefined, type); assert.equal(c.researchFreeHint, undefined, type); }
      else assert.ok(!c.allSteps.includes('happy'));
    }
    assert.equal((await get(`/penticton/${{ restaurant: 'restaurants', pub: 'pubs', cafe: 'cafes', winery: 'wineries', brewery: 'breweries', distillery: 'distilleries', cocktail: 'cocktail-lounges', tour: 'tours' }[type]}/${o.slug}`)).status, 200, type);
  }
  // The tasting, flight and cocktail boxes keep the number pad; only the tour's per-person box takes words.
  assert.equal((CLIENT.match(/mode: 'decimal', max: 40 \}/g) || []).length, 4);
  // A restaurant's page rows are as they were: research's lines in research's order, its own source line.
  const r = mk('restaurant', { cuisine: 'Canadian' });
  setBox(r.id, { rows: [{ label: 'Known for', text: 'Smash burgers' }, { label: 'Reservations', text: 'Recommended on weekends.' }, { label: 'Parking', text: 'Free lot behind.' }, { label: 'Patio', text: 'Seats 30.' }, { label: 'Groups', text: 'Call ahead for 10 or more.' }],
    booking_url: null, source_url: 'https://example.com', checked_at: '2026-11-01' });
  const rv = /<section class="venue-section venue-visit"[\s\S]*?<\/section>/.exec(page(r, 'en'))[0];
  assert.match(plain(rv), /Plan your visit Known for Smash burgers Reservations Recommended on weekends\. Parking Free lot behind\. More: patio, groups Patio Seats 30\. Groups Call ahead for 10 or more\. From example\.com, checked Nov 1, 2026/);
});
