// First first-time café owner test on Whistler (Maya, Android phone, English, a coffee shop; Whistler Roam
// drafts/fresh-eyes-cafe1-2026-11-15/REPORT.md). The code is shared, so the fixes are made here: the help answers a café
// owner's questions (dairy-free milks, Wi-Fi, no alcohol, an event after closing, ordering ahead, closing early on a
// holiday) and says "Right here in setup" in the setup; the holidays screen says what to do about an early close; the kind
// isn't repeated when it equals the cuisine; Build My Trip keeps a stated time on a list and reads a café's "What you
// serve"; a Dogs chip isn't expanded beside her own sentence; the last screen and the edit page point cafés to Weekly
// events in café words; and the small ones (research ticks, the season-aware time warning, "Today" on the map, the café
// day card, the spend guess, the specials counter).
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'cafe-wr1-admin-token';
process.env.TRIP_PLANNER_V3 = 'on';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const text = require('../owner-setup-text.js');
const tp = require('../trip-planner.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
const WEEK = (o, c) => JSON.stringify(WK(o, c));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Lake Test ${++n}`, slug: `lake-test-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.4, reviews: 150, address: `${700 + n} Bernard Ave, Kelowna`, phone: '250-555-0142', website: 'https://example.com', hours: WEEK('07:00', '17:00'),
  description: 'A fixture used only by the first Whistler café fresh-eyes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.13.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => assert.equal(r.status, 200, JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const research = (id, list) => {
  const r = app.guardedVisitInfoUpdate(id, app.currentVisitInfoJson(id), { rows: list, booking_url: null, source_url: 'https://example.com/visit', checked_at: today }, { reason: 'test research', batch_id: 'test' });
  assert.equal(r.ok, true, JSON.stringify(r));
};
const CLIENT = () => fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
const helpBot = (html) => {
  const m = /<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>\s*<script>([\s\S]*?)<\/script>/.exec(html);
  const stub = () => ({ addEventListener() {}, appendChild() {}, querySelector() { return null; } });
  const ctx = { window: {}, document: { getElementById: (id) => (id === 'ohbCfg' ? { textContent: m[1] } : stub()), createElement: stub, querySelectorAll: () => [] }, setTimeout };
  vm.createContext(ctx); vm.runInContext(m[2], ctx);
  const topics = JSON.parse(m[1]).topics;
  return { best: (q) => ctx.window.__ohbBest(q), topic: (id) => topics.find((x) => x.id === id), topics };
};
const page = (v, lang = 'en', now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, ...(now ? { now } : {}) });
const plan = (q) => postJson('/api/trip/plan', { text: q }).then((r) => r.body);
const names = (p) => (p.recommendations || []).map((x) => x.venue && x.venue.name);
const MAYA_RESEARCH = [{ label: 'Known for', text: 'Espresso and house-baked pastries' }, { label: 'Prices', text: 'Coffee from $4' }, { label: 'Kids & dogs', text: 'Dog friendly patio' }, { label: 'Good to know', text: 'Free Wi-Fi' }];
// Maya's café: stored cuisine "Coffee shop", research lines, badges from research.
const maya = (o = {}) => {
  const v = mk('cafe', { name: `Lost Lake Coffee House ${n + 1}`, cuisine: 'Coffee shop', price: '$', dog_friendly: 1, vegan: 1, gluten_free: 1, patio: 1, kid_friendly: 1, ...o });
  research(v.id, MAYA_RESEARCH);
  return v;
};

// ---------- 1. Help ----------
test('help in a café’s setup answers the café questions plainly, in English and French, and never brings up happy hour for alcohol', async () => {
  const v = maya(); const t = tokenFor(v.id);
  const en = helpBot((await get(`/owner/${t}/setup`)).text);
  const want = [
    ['how do I add oat milk', 'cafe-milks'], ['dairy free milk', 'cafe-milks'],
    ['wifi', 'cafe-wifi'], ['do I say we have wi-fi', 'cafe-wifi'],
    ['do I need to say we don\'t serve alcohol', 'cafe-no-alcohol'],
    ['my event is after we close', 'cafe-event-late'],
    ['people can order ahead on my website', 'cafe-order-link'], ['online ordering', 'cafe-order-link'],
    ['we close early on christmas eve', 'cafe-early-close'],
    ['where do I say laptops are ok', 'cafe-laptops'],
    ['lait d’avoine', 'cafe-milks'], ['avez-vous le wifi', 'cafe-wifi'], ['faut-il dire que nous ne servons pas d’alcool', 'cafe-no-alcohol'],
    ['notre événement est après la fermeture', 'cafe-event-late'], ['commander en ligne', 'cafe-order-link'], ['nous fermons plus tôt la veille de Noël', 'cafe-early-close'],
  ];
  for (const [q, id] of want) assert.equal(en.best(q).id, id, `"${q}" -> ${JSON.stringify(en.best(q))}`);
  // The answers.
  assert.match(en.topic('cafe-milks').a, /^<p>Right here in setup: tick <strong>Dairy-free milks<\/strong> on <strong>What you offer<\/strong>/);
  assert.match(en.topic('cafe-milks').a, /<strong>Dietary details<\/strong> and pick oat, almond, soy or coconut/);
  assert.match(en.topic('cafe-milks').aFr, /^<p>Ici même, dans la configuration : cochez <strong>Laits sans produits laitiers<\/strong>/);
  assert.match(en.topic('cafe-wifi').a, /^<p>Right here in setup: tick <strong>Wi-Fi<\/strong> on <strong>What you offer<\/strong>.*No Wi-Fi\? Tick <strong>No Wi-Fi<\/strong>/);
  assert.match(en.topic('cafe-no-alcohol').a, /^<p>No\. .*We only ask about beer and wine if you tick <strong>Beer &amp; wine<\/strong> under <strong>What you serve<\/strong>\.<\/p>$/);
  for (const k of ['a', 'aFr']) assert.doesNotMatch(en.topic('cafe-no-alcohol')[k], /happy hour|5 à 7|Still to add/i, 'never happy hour to a café');
  assert.match(en.topic('cafe-event-late').a, /That’s fine\. On your edit page, open <strong>Weekly events<\/strong> and add it with its own times/);
  assert.match(en.topic('cafe-order-link').a, /We don’t ask about ordering ahead right now.*<strong>menu link<\/strong> or your <strong>website<\/strong>.*email us/);
  assert.doesNotMatch(en.topic('cafe-order-link').a, /wine list/i);
  assert.match(en.topic('cafe-early-close').a, /^<p>Open but closing early\? Message us the date and time.*Closed all day\? Tap the holiday right here in setup/);
  assert.doesNotMatch(en.topic('cafe-early-close').a, /On your edit page/);
  assert.match(en.topic('cafe-laptops').a, /doesn’t ask about laptops any more/, 'the laptops answer is kept');
  // A closed day in the setup is the setup's own screen, not "On your edit page…".
  assert.equal(en.best('how do I add a closed day for a holiday').id, 'closures');
  assert.match(en.topic('closures').a, /^<p>Right here in setup: <strong>Hours and holidays<\/strong> \(tap <strong>Change an answer<\/strong> if it’s done\)\. After your hours comes <strong>Holidays and closures<\/strong>\./);
  assert.match(en.topic('closures').aFr, /^<p>Ici même, dans la configuration : <strong>Heures et jours fériés<\/strong>/);
  // No "Right here in setup: Weekly events" for a café (its setup has no events screen); the hours answers name the
  // café's button.
  assert.ok(!en.topics.some((x) => /Right here in setup: <strong>Weekly events<\/strong>/.test(String(x.a))), 'no setup events answer for a café');
  assert.equal(en.best('how often').id, 'weekly-nights');
  assert.match(en.topic('weekly-nights').a, /^<p>A café’s regular events go on your edit page: open <strong>Weekly events<\/strong>\./);
  assert.match(en.topic('hours').a, /<strong>\+ Add a second time<\/strong>/); assert.doesNotMatch(en.topic('hours').a, /lunch &amp; dinner/);
  // The edit page says where in the setup it is.
  const edit = helpBot((await get(`/owner/${t}`)).text);
  assert.equal(edit.best('how do I add oat milk').id, 'cafe-milks');
  assert.match(edit.topic('cafe-milks').a, /^<p>In <strong>Set up your page<\/strong>: tick <strong>Dairy-free milks<\/strong>/);
  assert.match(edit.topic('cafe-early-close').a, /or add it here under <strong>Special closures<\/strong>/);
  // Other types are unchanged: a pub's setup still answers events in the setup, and has no café topics.
  const pub = helpBot((await get(`/owner/${tokenFor(mk('pub').id)}/setup`)).text);
  assert.ok(pub.topics.some((x) => /Right here in setup: <strong>Weekly events<\/strong>/.test(String(x.a))));
  assert.equal(pub.topic('cafe-wifi'), undefined);
  assert.match(pub.topic('hours').a, /\+ Add a second time \(lunch &amp; dinner\)/);
  // "Closed on a holiday" in any setup is that setup's own screen, in its own words, with the early-close line.
  assert.match(pub.topic('closures').a, /^<p>Right here in setup: <strong>Holidays and closures<\/strong> \(tap <strong>Change an answer<\/strong> if it’s done\)\. Tap each holiday you’re closed/);
  assert.match(pub.topic('closures').a, /Open that day but closing early\? Leave it unticked and message us the date and time\.<\/p>$/);
  const rest = helpBot((await get(`/owner/${tokenFor(mk('restaurant').id)}/setup`)).text);
  assert.equal(rest.best('closed on christmas day').id, 'closures'); assert.doesNotMatch(rest.topic('closures').a, /On your edit page/);
  assert.match(helpBot((await get(`/owner/${tokenFor(mk('restaurant').id)}`)).text).topic('closures').a, /edit page|Special closures/, 'the edit page keeps its own answer');
});

// ---------- 2. Holidays screen ----------
test('the holidays screen says what to do when open but closing early (EN + FR), under the tiles', async () => {
  assert.equal(text.en.holEarly, 'Open that day but closing early? Leave it unticked and message us the date and time.');
  assert.equal(text.fr.holEarly, 'Ouvert ce jour-là, mais vous fermez plus tôt ? Ne le cochez pas et écrivez-nous la date et l’heure.');
  const v = maya();
  assert.equal(cfgOf((await get(`/owner/${tokenFor(v.id)}/setup`)).text).t.holEarly, text.en.holEarly);
  assert.equal(cfgOf((await get(`/fr/owner/${tokenFor(v.id)}/setup`)).text).t.holEarly, text.fr.holEarly);
  const s = CLIENT();
  const tiles = s.indexOf("data-act=\"holAll\""), line = s.indexOf('id="suHolEarly"'), save = s.indexOf('su-closures-save');
  assert.ok(tiles > 0 && line > tiles && save > line, 'after the holiday tiles, before the save button');
});

// ---------- 3. Kind = cuisine ----------
test('a kind that only repeats the cuisine is said once: cards, the page’s Cuisine row, the French page and the edit page', async () => {
  const v = maya({ region: 'lake-country', address: '1 Main St, Lake Country' }); const t = tokenFor(v.id);
  ok(await change(t, { place_type: 'Coffee shop', cafe_info: { serves: ['espresso', 'drip', 'pastries', 'breakfast'] } }));
  const venue = app.getVenue(v.id);
  assert.equal(app.placeTypeDisplay(venue), 'Coffee shop');
  assert.equal(app.placeTypeBesideCuisines(venue), '', 'the same words as the cuisine');
  assert.equal(app.placeTypeBesideCuisines(venue, true), '');
  assert.equal(app.placeTypeBesideCuisines({ ...venue, cuisine: 'COFFEE SHOP' }), '', 'whatever the case');
  const list = (await get('/lake-country/cafes')).text;
  assert.doesNotMatch(list, /Coffee shop\s*(?:&middot;|·)\s*Coffee shop/i);
  assert.match(list, /Coffee shop &middot; 4\.4/);
  const en = page(v), fr = page(v, 'fr');
  assert.doesNotMatch(en, /Coffee shop · Coffee shop/);
  assert.doesNotMatch(fr, /Café · Café/i);
  assert.doesNotMatch((await get('/fr/lake-country/cafes')).text, /Café\s*(?:&middot;|·)\s*Café/i);
  // The edit page's "What you serve" line.
  const edit = (await get(`/owner/${t}`)).text;
  assert.doesNotMatch(edit, /Coffee shop · [^<]*· Coffee shop/);
  // A kind that says something new stays (a bakery that picked Coffee shop; a restaurant's Family).
  const b = mk('cafe', { cuisine: 'Bakery', region: 'lake-country' });
  ok(await change(tokenFor(b.id), { place_type: 'Coffee shop' }));
  assert.equal(app.placeTypeBesideCuisines(app.getVenue(b.id)), 'Coffee shop');
  assert.match((await get('/lake-country/cafes')).text, /Bakery &middot; Coffee shop/);
  const r = mk('restaurant', { cuisine: 'Italian' });
  ok(await change(tokenFor(r.id), { place_type: 'Family' }));
  assert.equal(app.placeTypeBesideCuisines(app.getVenue(r.id)), app.placeTypeDisplay(app.getVenue(r.id)));
});

// ---------- 4. Build My Trip ----------
test('Build My Trip: a single coffee stop keeps its time: closed places are left out, and at 7am a place open at 7 comes before one that opens at 8', async () => {
  const at = { region: 'peachland', latitude: 49.77, longitude: -119.73 };
  const m = maya({ ...at, name: 'Peachland Lost Lake Coffee', address: '1 Beach Ave, Peachland', hours: WEEK('07:00', '16:00') });
  ok(await change(tokenFor(m.id), { hours: WK('07:00', '16:00'), hours_checked: true, hours_seasons: [{ from: '11-27', to: '04-18', label: '', hours: WK('06:00', '16:00') }] }));
  mk('cafe', { ...at, name: 'Peach Pit Coffee', slug: 'peach-pit-coffee', address: '3 Beach Ave, Peachland', rating: 4.9, reviews: 900, hours: WEEK('08:00', '15:00'), cuisine: 'Coffee' });
  mk('cafe', { ...at, name: 'Third Street Beans', slug: 'third-street-beans', address: '5 Beach Ave, Peachland', rating: 4.2, reviews: 80, hours: WEEK('06:30', '18:00'), cuisine: 'Coffee shop' });
  const late = await plan('A coffee in Peachland at 4:30pm on Wednesday October 13 2027');
  assert.equal(late.understood.when, 'Wed, Oct 13 at 4:30 PM', 'the time is kept');
  assert.deepEqual(names(late), ['Third Street Beans'], 'the two that close at 3 and 4 are left out');
  const early = await plan('A coffee in Peachland at 7am on Tuesday January 11 2028');
  assert.equal(early.understood.when, 'Tue, Jan 11 at 7 AM');
  const order = names(early);
  assert.equal(order.length, 3, `all three: ${order}`);
  assert.equal(order[2], 'Peach Pit Coffee', `the two open at 7 first: ${order}`);
  const pit = early.recommendations.find((x) => x.venue.name === 'Peach Pit Coffee');
  assert.ok((pit.caveats || []).some((c) => /Opens at 08:00, after the time you asked for/.test(c)), JSON.stringify(pit.caveats));
  // A place that only opens much later is left out; with no time the list is as before (all three).
  assert.deepEqual(names(await plan('A coffee in Peachland at 5:30am on Tuesday January 11 2028')).sort(), ['Peachland Lost Lake Coffee', 'Third Street Beans'], 'her winter 6 AM and the 6:30 opening are within an hour and a half; 8 AM is not');
  assert.equal(names(await plan('A coffee in Peachland on Wednesday October 13 2027')).length, 3);
  // The helper.
  const hours = require('../hours.js').parseHours(JSON.stringify({ ...WK('07:00', '16:00'), fri: [['17:00', '02:00']], sat: [] }));
  assert.equal(tp.openAtMinute(hours, 'wed', 16 * 60 + 30), false); assert.equal(tp.openAtMinute(hours, 'wed', 7 * 60), true);
  assert.equal(tp.openAtMinute(hours, 'sat', 60), true, '1 AM Saturday is Friday night’s close'); assert.equal(tp.openAtMinute(hours, 'sat', 180), false);
});

test('Build My Trip: a café’s own "What you serve" counts: Breakfast + vegan + gluten-free is found for a vegan and gluten-free breakfast at 8am', async () => {
  const at = { region: 'summerland', latitude: 49.6, longitude: -119.67 };
  // Her story (not research's description) says nothing of breakfast or coffee.
  const m = maya({ ...at, name: 'Giant’s Head House', slug: 'giants-head-house', cuisine: null, address: '1 Main St, Summerland', description: 'We opened in 2019 so locals had somewhere warm to start the day. Our beans come from a roaster down the road.' });
  const before = await plan('Vegan and gluten-free breakfast in Summerland on Tuesday October 12 2027 at 8am');
  assert.ok(!names(before).includes('Giant’s Head House'), 'not found before she answers');
  ok(await change(tokenFor(m.id), { place_type: 'Coffee shop', cafe_info: { serves: ['espresso', 'pastries', 'breakfast'] } }));
  assert.match(app.cafePlannerWords(app.getVenue(m.id)), /^ Coffee shop Espresso drinks Pastries Breakfast coffee$/);
  const after = await plan('Vegan and gluten-free breakfast in Summerland on Tuesday October 12 2027 at 8am');
  assert.ok(names(after).includes('Giant’s Head House'), JSON.stringify([after.summary, names(after), after.warnings]));
  // "A coffee" on a named day finds her too (her serves say espresso), and a café listed as "Coffee shop".
  mk('cafe', { ...at, name: 'Main Street Mugs', slug: 'main-street-mugs', address: '3 Main St, Summerland', cuisine: 'Coffee shop', description: 'A friendly spot.' });
  const coffee = names(await plan('A coffee in Summerland at 9am on Tuesday October 12 2027'));
  assert.ok(coffee.includes('Giant’s Head House') && coffee.includes('Main Street Mugs'), JSON.stringify(coffee));
  // Beer & wine is never a planner word, and a café with no answers adds nothing.
  assert.equal(app.cafePlannerWords(app.getVenue(mk('cafe').id)), '');
  const bw = mk('cafe'); ok(await change(tokenFor(bw.id), { cafe_info: { serves: ['beer_wine', 'lunch'] } }));
  assert.equal(app.cafePlannerWords(app.getVenue(bw.id)), ' Lunch (sandwiches, soup)');
});

// ---------- 5. Dogs line ----------
test('a Dogs chip beside the owner’s own sentence is not expanded into a second sentence (every type)', () => {
  assert.equal(app.dogsChipSentences('Patio only. Dogs welcome on the patio, water bowl out front'), 'Patio only. Dogs welcome on the patio, water bowl out front');
  assert.equal(app.dogsChipSentences('Terrasse seulement. Les chiens sont bienvenus, bol d’eau à l’entrée'), 'Terrasse seulement. Les chiens sont bienvenus, bol d’eau à l’entrée');
  assert.equal(app.dogsChipSentences('Inside and patio; treats at the till'), 'Inside and patio; treats at the till');
  for (const type of ['cafe', 'pub', 'restaurant']) {
    const html = app.visitInfoHtml({ rows: [{ label: 'Dogs', text: 'Patio only. Dogs welcome on the patio, water bowl out front' }], owner_labels: ['Dogs'] }, false, { type });
    assert.doesNotMatch(html, /Dogs welcome on the patio only\. Dogs welcome on the patio/, type);
    assert.match(html, /Patio only\. Dogs welcome on the patio, water bowl out front/, type);
  }
  // Chips alone still read as sentences, and a few words after a comma still make one sentence.
  assert.equal(app.dogsChipSentences('Patio only'), 'Dogs welcome on the patio only.');
  assert.equal(app.dogsChipSentences('Patio only. Water bowls at the door'), 'Dogs welcome on the patio only. Water bowls at the door.');
  assert.equal(app.dogsChipSentences('Patio only, on leash'), 'Dogs welcome on the patio only, on leash');
});

// ---------- 6. Events: the last screen and the edit page ----------
test('cafés are pointed to Weekly events: the last screen says so, and the edit page’s rows are in café words with "How often?" and a worded add button', async () => {
  assert.equal(text.en.cafe.finishEvents, 'Got a regular event? Add it under Weekly events on your edit page.');
  assert.equal(text.fr.cafe.finishEvents, 'Un événement régulier ? Ajoutez-le sous Événements de la semaine, sur votre page de modification.');
  assert.equal(text.en.finishEvents, undefined, 'cafés only');
  const s = CLIENT();
  assert.equal(s.split("(C.cafe && T.finishEvents ? '<p class=\"su-hint\" id=\"suFinishEvents\">'").length, 3, 'on both finish screens');
  const v = maya(); const t = tokenFor(v.id);
  assert.equal(cfgOf((await get(`/owner/${t}/setup`)).text).t.finishEvents, text.en.cafe.finishEvents);
  assert.equal(cfgOf((await get(`/owner/${tokenFor(mk('pub').id)}/setup`)).text).t.finishEvents, undefined);
  const en = (await get(`/owner/${t}?full=1`)).text, fr = (await get(`/fr/owner/${t}?full=1`)).text;
  assert.match(en, /Your regular events, like a latte art night\./);
  assert.match(en, /<legend>Event 1<\/legend>/); assert.doesNotMatch(en, /<legend>Night 1<\/legend>|like trivia on Tuesdays|Teams up to 6/);
  assert.match(en, /placeholder="Latte art night"/);
  assert.match(en, /<span class="op-wn-freq-t">How often\?<\/span> <select class="op-wn-freq"/);
  assert.match(en, /data-wn-add[^>]*>\+ Add an event<\/button>/);
  assert.match(fr, /Vos événements réguliers, comme une soirée d’art latté\./); assert.match(fr, /<legend>Événement 1<\/legend>/); assert.match(fr, /<span class="op-wn-freq-t">À quelle fréquence[\u202f\u00a0 ]?\?<\/span>/);
  // A new café row starts as "Something else" (its name is what shows), never trivia.
  assert.match(/<fieldset class="op-sp op-wn" data-wn="1"[\s\S]*?<\/fieldset>/.exec(en)[0], /<option value="other" selected>Something else<\/option>/);
  // On a phone the list add buttons keep their words (they had shrunk to a bare "+").
  assert.match(en, /body\.owner-page \.op-wn-add, body\.owner-page \.op-sp-add, body\.owner-page \.op-deal-add \{ font-size: 0\.9rem; width: auto;/);
  assert.match(en, /body\.owner-page \.op-wn-add::before, body\.owner-page \.op-sp-add::before, body\.owner-page \.op-deal-add::before \{ content: none; \}/);
  // A pub keeps its nights (with the new label).
  const pub = (await get(`/owner/${tokenFor(mk('pub').id)}?full=1`)).text;
  assert.match(pub, /<legend>Night 1<\/legend>/); assert.match(pub, /placeholder="Trivia Tuesday"/); assert.match(pub, /\+ Add a night<\/button>/); assert.match(pub, /How often\?/);
  // The edit page doesn't offer a café Sports TV: its box is off the screen whatever the page's styles say (the hidden
  // mark alone was overridden by .amenity-check's display:flex). A pub keeps its Sports TV box.
  assert.match(en, /<div class="amenity-check-grid" id="opBadges" data-venue-type="cafe">/);
  assert.match(en, /<label class="amenity-check" hidden><input type="checkbox" name="badge" value="sports_tv">/);
  assert.match(en, /body\.owner-page #opBadges\[data-venue-type="cafe"\] \.amenity-check\[hidden\]:has\(input\[value="sports_tv"\]\) \{ display: none; \}/);
  assert.match(pub, /<div class="amenity-check-grid" id="opBadges">/); assert.match(pub, /<label class="amenity-check"><input type="checkbox" name="badge" value="sports_tv">/);
  // The café tips are in café words too.
  assert.match(en, /Your regular events, up to \d+: an open mic, live music, a paint night, a latte art night/); assert.doesNotMatch(en, /Your regular nights, up to/);
});

// ---------- 7. Small ----------
test('research’s "Free Wi-Fi" and "Free parking" pre-tick a café’s tiles as suggestions; never over her own answer or "No Wi-Fi"', async () => {
  const v = maya(); const t = tokenFor(v.id);
  assert.deepEqual(cfgOf((await get(`/owner/${t}/setup`)).text).visitTicks, ['wifi']);
  const p = mk('cafe'); research(p.id, [{ label: 'Good to know', text: 'Free parking behind the building. Free Wi-Fi.' }]);
  assert.deepEqual(cfgOf((await get(`/owner/${tokenFor(p.id)}/setup`)).text).visitTicks, ['free_parking', 'wifi']);
  const none = mk('cafe'); research(none.id, [{ label: 'Good to know', text: 'No Wi-Fi: a place to talk' }]);
  assert.deepEqual(cfgOf((await get(`/owner/${tokenFor(none.id)}/setup`)).text).visitTicks, []);
  // Nothing is saved by the suggestion: the page has no Wi-Fi until she saves the screen.
  assert.ok(!(cfgOf((await get(`/owner/${t}/setup`)).text).cur.badges || {}).wifi);
  assert.doesNotMatch(page(v), />\s*Wi-Fi\s*</);
  // Her own answers stand: "No Wi-Fi" said, or Wi-Fi unticked after it was on.
  ok(await change(t, { not_offered: ['wifi'] }));
  assert.deepEqual(cfgOf((await get(`/owner/${t}/setup`)).text).visitTicks, []);
  const own = maya(); ok(await change(tokenFor(own.id), { badges: { wifi: true } })); ok(await change(tokenFor(own.id), { badges: { wifi: false } }));
  assert.deepEqual(cfgOf((await get(`/owner/${tokenFor(own.id)}/setup`)).text).visitTicks, []);
  // The page script ticks them for cafés too, and never over No Wi-Fi.
  assert.match(CLIENT(), /if \(C\.cafe && !S\.done\.offer && !S\.visitTicksSet\) \{ S\.visitTicksSet = true; S\.visitTicked = \(C\.visitTicks \|\| \[\]\)\.filter\(function\(k\)\{ if \(S\.badges\[k\] \|\| \(k === 'wifi' && S\.noWifi\)\) return false; S\.badges\[k\] = true; return true; \}\); \}/);
});

test('a café’s day card: no "Open after midnight?", and a second time without "lunch & dinner" (other types unchanged)', async () => {
  const c = cfgOf((await get(`/owner/${tokenFor(maya().id)}/setup`)).text).t, f = cfgOf((await get(`/fr/owner/${tokenFor(maya().id)}/setup`)).text).t;
  assert.equal(c.addSecond, '+ Add a second time'); assert.equal(c.twoTimesMax, 'Up to two times a day.');
  assert.equal(f.addSecond, '+ Ajouter une deuxième plage'); assert.equal(f.twoTimesMax, 'Jusqu’à deux plages par jour.');
  const r = cfgOf((await get(`/owner/${tokenFor(mk('restaurant').id)}/setup`)).text).t;
  assert.equal(r.addSecond, '+ Add a second time (lunch & dinner)');
  // The Midnight / 1 AM / 2 AM row is left off a café's day card by the page script (run as the page runs it).
  const s = CLIENT();
  const src = s.slice(s.indexOf('  var LATE = ['), s.indexOf('\n  }\n', s.indexOf('  function lateBtns(')) + 4);
  const late = (C) => { const ctx = { C, T: text.en, h: (x) => x, fill: (x) => x, dayName: (d) => d, t12: (x) => x }; vm.runInNewContext(`${src}\nthis.f = lateBtns;`, ctx); return ctx.f('mon', 0, ['07:00', '17:00']); };
  assert.equal(late({ cafe: true }), ''); assert.match(late({ restaurant: true }), /Open after midnight\?/);
});

test('the time warning knows the other hours: "(your hours right now; fine in your Nov 27 – Apr 18 hours)"', () => {
  const s = CLIENT();
  const src = s.slice(s.indexOf('  var MLAST = ['), s.indexOf('  function closedWarnAny('));
  const T = { ...text.en, ...text.en.cafe };
  const run = (todayIso, S, Tx = T) => {
    class D extends Date { constructor(...a) { if (a.length) super(...a); else super(todayIso); } }
    const ctx = { T: Tx, C: { lang: Tx === T ? 'en' : 'fr', monthNames: Tx === T ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] : ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'], longDays: Tx === T ? { mon: 'Monday', tue: 'Tuesday' } : { mon: 'Lundi', tue: 'Mardi' }, dayNames: {} }, CUR: { hours_seasons: [] }, S, Date: D,
      DAYS, fill: (str, o) => String(str).replace(/\{(\w+)\}/g, (m0, k) => (o && o[k] != null ? o[k] : m0)), h: (x) => x, screen: {}, el: () => null };
    vm.runInNewContext(`function dayName(d){ return d; } function monthName(i){ return C.monthNames[i]; } function longDay(d){ var n = C.longDays[d] || d; return C.lang === 'fr' ? n.toLowerCase() : n; } function monthRun(){ return { none: true }; }\n${src}\nthis.warn = function(e){ return specialHoursWarn(e); };`, ctx);
    return ctx.warn;
  };
  const sea = { on: true, months: { 11: true, 12: true, 1: true, 2: true, 3: true, 4: true }, exact: { from: '11-27', to: '04-18' }, week: WK('06:00', '16:00') };
  const S = { week: WK('07:00', '16:00'), sea };
  const special = { days: { mon: true, tue: true }, start: '06:30', end: '08:00', sea: { on: false, months: {}, exact: null } };
  // Before Nov 27: outside today's hours, fine in the winter ones.
  assert.equal(run('2026-11-15T12:00:00', S)(special), 'Heads up: these times are outside your hours on Monday and Tuesday (your hours right now; fine in your Nov 27 – Apr 18 hours). Check the start and end.');
  // In the winter: the same special is outside the usual hours, which aren't on now.
  assert.equal(run('2027-01-09T12:00:00', S)(special), 'Heads up: these times are outside your hours on Monday and Tuesday (your usual hours; fine in your Nov 27 – Apr 18 hours). Check the start and end.');
  // Fits the usual hours but not the season's.
  const S2 = { week: WK('06:00', '16:00'), sea: { ...sea, week: WK('07:00', '16:00') } };
  assert.equal(run('2026-11-15T12:00:00', S2)(special), 'Heads up: these times are outside your hours on Monday and Tuesday (in your Nov 27 – Apr 18 hours; fine the rest of the year). Check the start and end.');
  // Outside both, or with no season: the plain warning; inside both: nothing.
  assert.equal(run('2026-11-15T12:00:00', S)({ ...special, start: '05:00' }), 'Heads up: these times are outside your hours on Monday and Tuesday. Check the start and end.');
  assert.equal(run('2026-11-15T12:00:00', { week: WK('07:00', '16:00'), sea: { on: false, months: {}, exact: null } })(special), 'Heads up: these times are outside your hours on Monday and Tuesday. Check the start and end.');
  assert.equal(run('2026-11-15T12:00:00', S)({ ...special, start: '07:00' }), '');
  // French.
  assert.equal(run('2026-11-15T12:00:00', S, { ...text.fr, ...text.fr.cafe })(special), 'Attention : ces heures sont en dehors de vos heures d’ouverture le lundi et le mardi (vos heures en ce moment; c’est correct selon vos heures du 27 nov. au 18 avr.). Vérifiez le début et la fin.');
});

test('a special is not "Today" once its end time has passed or the place has closed for the day: the page, and the map’s row and script', async () => {
  const v = maya({ region: 'vernon', address: '1 30th Ave, Vernon' }); const t = tokenFor(v.id);
  ok(await change(t, { specials: [{ days: DAYS.slice(), title: 'Coffee and a muffin', deal: 'Coffee and a muffin before 8', price: '$7', kind: 'food', start: '06:30', end: '08:00', title_fr: null, deal_fr: null, season_from: null, season_to: null }] }));
  const venue = app.getVenue(v.id);
  // A moment today on the site's clock, whatever its offset.
  const at = (hhmm) => { const want = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)); const noon = new Date(`${today}T19:00:00Z`); return new Date(noon.getTime() + (want - app.okanaganClock(noon).minutes) * 60000); };
  const rows = (now) => app.venueSpecials(venue, venue.hours, false, now).rows.map((r) => r.today);
  assert.deepEqual(rows(at('07:30')), [true]); assert.deepEqual(rows(at('09:00')), [false], 'after 8 AM'); assert.deepEqual(rows(at('18:00')), [false], 'after closing');
  // The map row carries the end (480 minutes) so the open page drops "Today: …" after it; a special with no end keeps its shape.
  const row = app.mapPlacesData(at('07:30')).find((p) => p[2] === venue.name);
  assert.equal(row[17][3], 480, JSON.stringify(row[17]));
  ok(await change(t, { specials: [{ days: DAYS.slice(), title: 'Punch card', deal: 'Buy 9, get the 10th free', price: null, kind: 'food', start: null, end: null, title_fr: null, deal_fr: null, season_from: null, season_to: null }] }));
  assert.equal(app.mapPlacesData(at('07:30')).find((p) => p[2] === venue.name)[17].length, 2);
  const map = (await get('/map')).text;
  assert.ok(map.includes('p.spOn = !!(p.sp && p.spDay === wd && !spOver(p, ck));'));
  assert.ok(map.includes('if (p.spEnd && clock.minutes >= p.spEnd) return true;'));
  assert.ok(map.includes('p.spEnd = a[17][3] || 0;'));
  // The script's rule, run as the page runs it.
  const src = /  function spOver\(p, clock\)\{[\s\S]*?\n  \}/.exec(map)[0];
  const ctx = { statusAt: (h, c) => (c.minutes >= 1020 ? { state: 'closed', closedToday: false, opensAt: { weekday: 'tue', minutes: 420 } } : c.minutes < 420 ? { state: 'closed', closedToday: false, opensAt: { weekday: 'mon', minutes: 420 } } : { state: 'open' }), parseHours: (x) => x, expandFoodDrinkHours: (x) => x };
  vm.runInNewContext(`${src}\nthis.f = spOver;`, ctx);
  assert.equal(ctx.f({ spEnd: 480, h: {} }, { weekday: 'mon', minutes: 450 }), false); assert.equal(ctx.f({ spEnd: 480, h: {} }, { weekday: 'mon', minutes: 480 }), true);
  assert.equal(ctx.f({ spEnd: 0, h: {} }, { weekday: 'mon', minutes: 600 }), false); assert.equal(ctx.f({ spEnd: 0, h: {} }, { weekday: 'mon', minutes: 1030 }), true, 'closed for the day');
  assert.equal(ctx.f({ spEnd: 0, h: {} }, { weekday: 'mon', minutes: 300 }), false, 'before opening it is still today’s');
});

test('a café’s spend guess: only a price that suits a coffee and a pastry; "Coffee from $4" guesses nothing and shows no "We guessed" line', async () => {
  const v = maya();
  let cfg = cfgOf((await get(`/owner/${tokenFor(v.id)}/setup`)).text);
  assert.equal(cfg.suggestSpend, 0); assert.equal(cfg.suggestSpendFrom, '');
  const b = mk('cafe'); research(b.id, [{ label: 'Prices', text: 'Breakfast sandwiches $9' }]);
  cfg = cfgOf((await get(`/owner/${tokenFor(b.id)}/setup`)).text);
  assert.equal(cfg.suggestSpend, 9); assert.equal(cfg.suggestSpendFrom, 'Breakfast sandwiches $9');
  const big = mk('cafe', { price: '$$' }); research(big.id, [{ label: 'Prices', text: 'Brunch mains $24' }]);
  assert.equal(cfgOf((await get(`/owner/${tokenFor(big.id)}/setup`)).text).suggestSpend, 0, 'a meal price is not a coffee and a pastry');
  const side = mk('cafe', { price: '$$' }); research(side.id, [{ label: 'Prices', text: 'Lattes from $6' }]);
  assert.equal(cfgOf((await get(`/owner/${tokenFor(side.id)}/setup`)).text).suggestSpend, 0, 'never the $$ fallback for a café');
  assert.match(CLIENT(), /if \(spendAuto && C\.suggestSpend\) \{ S\.spend = C\.suggestSpend; spendAuto = false; \}/);
  // Restaurants are unchanged.
  const r = mk('restaurant'); research(r.id, [{ label: 'Prices', text: 'Burgers from $19' }]);
  assert.equal(cfgOf((await get(`/owner/${tokenFor(r.id)}/setup`)).text).suggestSpend, 19);
});

test('the specials box counts its characters near the 80 limit (EN + FR)', () => {
  assert.equal(text.en.specialCount, '{n} of {max} characters'); assert.equal(text.fr.specialCount, '{n} caractères sur {max}');
  const s = CLIENT();
  const ctx = { T: text.en, fill: (str, o) => String(str).replace(/\{(\w+)\}/g, (m0, k) => o[k]) };
  vm.runInNewContext(`${/  var SP_MAX = 80, SP_COUNT_FROM = 60;\n  function spCount\(v\)\{[^\n]*\}/.exec(s)[0]}\nthis.f = spCount;`, ctx);
  assert.equal(ctx.f('Coffee and a muffin'), ''); assert.equal(ctx.f('x'.repeat(60)), '60 of 80 characters'); assert.equal(ctx.f('x'.repeat(80)), '80 of 80 characters');
  assert.match(s, /field\('sp' \+ i, T\.whatIsIt, e\.text, \{ max: SP_MAX, data: 'data-sp="' \+ i \+ ':text"' \}\)\n[^\n]*\n\s+\+ '<p class="su-hint su-count" id="spc' \+ i \+ '" aria-live="polite"'/);
  assert.match(s, /input\[data-sp\$=":text"\]'\), function\(inp\)\{ inp\.addEventListener\('input'/);
});
