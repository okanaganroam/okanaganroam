// Owner portal: fresh-eyes 3 fixes on the easy setup (2026-11-10).
// The serious one: reopening typed happy hours rebuilt the form from the page's combined deal text ("Tue, Wed, Thu: $5
// draft beer…; Fri: $6 h", cut at 60 letters) and saving again stored "Tue, Wed, Thu: Tue, Wed, Thu: $5 draft beer and
// half price w" and dropped Friday's deal. Now the setup keeps its own happy hour rows beside a signature of what the
// page stored from them, and every list it edits (specials, weekly events, closures, Plan your visit lines, the dog
// note) goes back exactly as stored when the owner changes nothing.
// Tested here: the server side of each round trip, the "I'm done for now" flag, and the page script's rules. The
// click-through (edit, save unchanged, stored data identical) is drafts/setup-fixes2-2026-11-10/shoot.js.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-setup-roundtrip-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
const app = require('../server.js');
const db = require('../db.js');
const strings = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});

let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Round Trip ${type} ${++n}`, slug: `round-trip-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.4, address: '214 Main St, Penticton', phone: '250-555-0142', website: 'https://example.com',
  hours: JSON.stringify({ mon: [], tue: [['11:00', '21:00']], wed: [['11:00', '21:00']], thu: [['11:00', '21:00']], fri: [['11:00', '22:00']], sat: [['11:00', '22:00']], sun: [['11:00', '20:00']] }),
  description: 'A fixture used only by the setup round-trip tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(() => srv && srv.close());
const text = (p) => fetch(base + p, { redirect: 'manual' }).then((r) => r.text());
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.44.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => post(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const prog = (t, body) => post(`/owner/${t}/setup/progress`, body);
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/.exec(html)[1]);
const scriptOf = (html) => /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];
const cur = async (t) => cfgOf(await text(`/owner/${t}/setup`)).cur;
const rows = (table, id) => JSON.stringify(db.prepare(`SELECT * FROM ${table} WHERE venue_id = ? ORDER BY id`).all(id).map(({ id: _i, created_at: _c, updated_at: _u, ...r }) => r));

const WEEK = { mon: [], tue: [['15:00', '17:00']], wed: [['15:00', '17:00']], thu: [['15:00', '17:00']], fri: [['14:00', '18:00']], sat: [], sun: [] };
const DEALS = [{ text: 'Tue, Wed, Thu: $5 draft beer and half price wings' }, { text: 'Fri: $6 house wine and $8 nachos' }];
const BLOCKS = [{ days: ['tue', 'wed', 'thu'], from: '15:00', to: '17:00', what: '$5 draft beer and half price wings' }, { days: ['fri'], from: '14:00', to: '18:00', what: '$6 house wine and $8 nachos' }];

test('happy hours: the setup gets its own rows back exactly as typed, while the page still shows what they made', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  assert.equal((await change(t, { happy_hour: WEEK, happy_hour_deals: { deals: DEALS, deals_fr: [] }, badges: { happy_hour: true } })).status, 201);
  const saved = await prog(t, { step: 'happy', status: 'live', blocks: BLOCKS });
  assert.equal(saved.status, 200);
  assert.ok(!('blocks' in saved.body.progress), 'the answer carries the statuses only');
  const c = await cur(t);
  assert.deepEqual(c.happy_blocks, BLOCKS, 'each happy hour with its own deal, no day prefix, nothing cut');
  assert.deepEqual(c.happy_hour_deals.deals.map((d) => d.text), DEALS.map((d) => d.text));
  // Saving the very same thing again changes nothing on the page.
  const before = db.prepare('SELECT happy_hour_times, happy_hour_deals FROM venues WHERE id = ?').get(v.id) || {};
  const again = await change(t, { happy_hour: WEEK, happy_hour_deals: { deals: DEALS, deals_fr: [] }, badges: { happy_hour: true } });
  assert.equal(again.status, 200, 'nothing new to send'); assert.equal(again.body.unchanged, true); // café test 5 (2026-11-12): an unchanged setup re-send is a 200 no-op
  assert.deepEqual(db.prepare('SELECT happy_hour_times, happy_hour_deals FROM venues WHERE id = ?').get(v.id) || {}, before);
  await prog(t, { step: 'happy', status: 'live', blocks: BLOCKS });
  assert.deepEqual((await cur(t)).happy_blocks, BLOCKS);
  // A skip never drops them (and never replaces the answer).
  await prog(t, { step: 'happy', status: 'skip' });
  assert.deepEqual((await cur(t)).happy_blocks, BLOCKS);
  // The page changed since (here: one end time): the rows are not offered back; the form is rebuilt from the page.
  assert.equal((await change(t, { happy_hour: { ...WEEK, fri: [['14:00', '17:00']] } })).status, 201);
  const c2 = await cur(t);
  assert.equal(c2.happy_blocks, null);
  assert.deepEqual(c2.happy_hour_deals.deals.map((d) => d.text), DEALS.map((d) => d.text), 'the deals are still whole');
  // "No" drops the rows.
  await prog(t, { step: 'happy', status: 'live', blocks: BLOCKS.map((b, i) => (i ? { ...b, to: '17:00' } : b)) });
  assert.ok((await cur(t)).happy_blocks);
  await prog(t, { step: 'happy', status: 'no' });
  assert.equal(app.setupProgress(v.id).blocks, undefined);
});

test('happy hour rows are checked before they are kept', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  await change(t, { happy_hour: WEEK, badges: { happy_hour: true } });
  for (const bad of [[{ days: ['xyz'], from: '15:00', to: '17:00', what: '' }], [{ days: ['tue'], from: '3pm', to: '17:00', what: '' }], [{ days: ['tue'], from: '15:00', to: '17:00', what: '<b>x</b>' }],
    [{ days: [], from: '15:00', to: '17:00', what: '' }], 'nope', new Array(7).fill(BLOCKS[0])]) {
    assert.equal((await prog(t, { step: 'happy', status: 'live', blocks: bad })).status, 200);
    assert.equal((await cur(t)).happy_blocks, null, JSON.stringify(bad).slice(0, 60));
  }
});

test('weekly specials and weekly events: every stored field reaches the setup, and sending them back unchanged changes nothing', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const specials = [{ days: ['thu'], title: 'Pasta night', deal: 'Pasta night, any pasta and a glass of wine', price: '$18', kind: 'both', start: '17:00', end: 'close', title_fr: 'Soirée pâtes', deal_fr: 'Soirée pâtes, pâtes au choix et un verre de vin', season_from: '10-01', season_to: '04-30' },
    { days: ['sun'], title: 'Prime rib dinner', deal: 'Prime rib dinner', price: '$29', kind: 'food' }];
  const nights = [{ days: ['wed'], kind: 'trivia', title: 'Trivia', start: '19:00', end: '21:00', detail: 'Teams of up to six', host: 'Quiz Bob', cost: 'Free', frequency: 'weekly', title_fr: 'Jeu-questionnaire', detail_fr: 'Équipes de six au plus' }];
  assert.equal((await change(t, { specials })).status, 201);
  assert.equal((await change(t, { weekly_nights: nights })).status, 201);
  const c = await cur(t);
  for (const k of app.OWNER_SPECIAL_KEYS || ['days', 'title', 'deal', 'price', 'kind', 'start', 'end', 'title_fr', 'deal_fr', 'season_from', 'season_to']) assert.ok(k in c.specials[0], `special has ${k}`);
  assert.equal(c.specials[0].end, 'close'); assert.equal(c.specials[0].title_fr, 'Soirée pâtes'); assert.equal(c.specials[0].season_to, '04-30');
  assert.equal(c.weekly_nights[0].host, 'Quiz Bob'); assert.equal(c.weekly_nights[0].detail_fr, 'Équipes de six au plus'); assert.equal(c.weekly_nights[0].end, '21:00');
  const sp0 = rows('venue_specials', v.id), wn0 = rows('venue_weekly_nights', v.id);
  // What the page script sends for rows the owner didn't touch: the stored lines themselves.
  assert.equal((await change(t, { specials: c.specials })).status, 200, 'nothing new to send'); // café test 5 (2026-11-12): an unchanged setup re-send is a 200 no-op
  assert.equal((await change(t, { weekly_nights: c.weekly_nights })).status, 200, 'nothing new to send');
  assert.equal(rows('venue_specials', v.id), sp0);
  assert.equal(rows('venue_weekly_nights', v.id), wn0);
  // One changed row: the other is still exactly as stored.
  assert.equal((await change(t, { specials: [c.specials[0], { ...c.specials[1], price: '$31' }] })).status, 201);
  const after = JSON.parse(rows('venue_specials', v.id));
  assert.deepEqual({ ...after[0], checked_at: null }, { ...JSON.parse(sp0)[0], checked_at: null });
  assert.equal(after[1].price, '$31');
});

test('closures, Plan your visit lines and the dog note: sent back unchanged, nothing changes', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const year = new Date().getFullYear() + 1;
  const closures = [{ from: `${year}-01-04`, to: `${year}-01-17`, note: 'Winter break' }, { from: `${year}-12-25`, to: `${year}-12-25`, note: 'Staff party' }];
  assert.equal((await change(t, { closures })).status, 201);
  assert.equal((await change(t, { visit_rows: { dogs: 'Dogs on the patio only', reservations: 'Call us. Walk-ins welcome too', known_for: 'Homemade pies' } })).status, 201);
  const c = await cur(t);
  assert.deepEqual(c.closures.map((x) => [x.from, x.to || x.from, x.note || '']), closures.map((x) => [x.from, x.to, x.note]), 'the note the owner wrote comes back, also on a holiday date');
  assert.equal(c.visit_rows.dogs, 'Dogs on the patio only');
  const extras0 = JSON.stringify(c.closures), visit0 = JSON.stringify(c.visit_rows);
  assert.equal((await change(t, { closures: c.closures.map((x) => ({ from: x.from, to: x.to || x.from, note: x.note || '' })) })).status, 200); // café test 5 (2026-11-12): an unchanged setup re-send is a 200 no-op
  assert.equal((await change(t, { visit_rows: { dogs: c.visit_rows.dogs } })).status, 200);
  assert.equal((await change(t, { visit_rows: { reservations: c.visit_rows.reservations } })).status, 200);
  const c2 = await cur(t);
  assert.equal(JSON.stringify(c2.closures), extras0);
  assert.equal(JSON.stringify(c2.visit_rows), visit0);
});

test('"I’m done for now": the portal’s own card asks to be tapped again only after it (or after the whole setup)', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const sub = async () => /<span id="opCbSub" data-closed="([^"]*)"/.exec(await text(`/owner/${t}`))[1];
  assert.doesNotMatch(await sub(), /Tap to/, 'the green setup card is the one way in');
  assert.match(await text(`/owner/${t}`), /id="opSetupCard"/);
  const r = await prog(t, { done_for_now: true });
  assert.equal(r.status, 200);
  assert.equal(app.setupProgress(v.id).done_for_now, true);
  assert.match(await sub(), /Tap to (start|see)\.$/);
  // A normal answer keeps the flag.
  await prog(t, { step: 'basics', status: 'live' });
  assert.equal(app.setupProgress(v.id).done_for_now, true);
  // Other types have no setup card and keep their own line.
  const pub = mk('brewery');
  assert.doesNotMatch(await text(`/owner/${tokenFor(pub.id)}`), /opSetupCard/);
});

test('the page script: typed answers are never cut or joined, one number on the finish screens, tap-first answers', async () => {
  const v = mk('restaurant');
  const html = await text(`/owner/${tokenFor(v.id)}/setup`);
  const s = scriptOf(html), cfg = cfgOf(html);
  // Happy hours: no joining of deals, no cutting, the day prefix taken off again, the page's other deals kept.
  assert.doesNotMatch(s, /deals\.join\('; '\)/);
  assert.doesNotMatch(s, /e\.what\.trim\(\)\)\.slice\(0, 60\)/); assert.doesNotMatch(s, /deals\.slice\(0, 6\)/);
  assert.match(s, /CUR\.happy_blocks && CUR\.happy_blocks\.length/);
  // Pub fresh-eyes (2026-11-10): either day prefix ("Mon–Fri: " or the older "Mon, Tue, …: ") is taken off again.
  assert.match(s, /d\.text\.slice\(prefixOf\(hit, d\.text\)\.length\)/);
  assert.match(s, /deals = deals\.concat\(S\.happyKeep\)/);
  assert.match(s, /fill\(T\.dealLong, \{ n: i \+ 1, max: 60 - pre\.length \}\)/, 'a deal that is too long says so; it is never cut');
  assert.match(s, /body\.blocks = happyBlocks\(\)/);
  // Specials and events: an untouched row goes back as stored.
  // Pub test 7: the season is part of what "untouched" means.
  // Pub test 8: the special's own times are part of the "unchanged" check.
  assert.match(s, /if \(e\.orig && e\.was === daysKey\(e\.days\) \+ '\|' \+ e\.text \+ '\|' \+ e\.price \+ '\|' \+ seaKey\(e\.sea\) \+ '\|' \+ \(e\.start \|\| ''\) \+ '\|' \+ \(e\.end \|\| ''\) && !!e\.endClose === \(e\.orig\.end === 'close'\)\) \{ out\.push\(e\.orig\); continue; \}/ /* pub test 9: until close is part of it */);
  assert.match(s, /if \(e\.orig && e\.was === daysKey\(e\.days\) \+ '\|' \+ e\.kind \+ '\|' \+ e\.what \+ '\|' \+ e\.start \+ '\|' \+ seaKey\(e\.sea\)\) \{ out\.push\(e\.orig\); continue; \}/);
  assert.doesNotMatch(s, /text\.slice\(0, 80\)/);
  // Seasonal hours not touched are not sent; a holiday keeps the note it was stored with.
  // Pub test 6: seasonal hours are only sent once the all-year question was answered on this visit (S.seaTouched).
  assert.match(s, /if \(S\.seaTouched\) \{/);
  // Café test 6: a holiday's own name is saved in English (holEn / holKeep); a typed note stays as typed.
  assert.match(s, /S\.holNotes\[o\.key\] != null \? holKeep\(o\.key, S\.holNotes\[o\.key\]\) : holEn\(o\.key\)/);
  // "Save and exit" part-way through a tile step saves the picks but leaves the step open.
  assert.match(s, /if \(S\.exitAfter && HALF\.indexOf\(step\) >= 0 && !answered\(step\)\) \{ S\.busy = false; if \(onOk\) onOk\(\); return leave\(\); \}/);
  assert.match(s, /var HALF = \['offer', 'cuisine', 'closures'\];/);
  // Essentials finish: "Your page is ready. N of 8 essentials done.", then one number.
  assert.match(s, /h\(T\.essReady\)/); assert.match(s, /fill\(T\.essCount, \{ n: nd, total: P1\.length \}\)/); assert.match(s, /'jumpEss:' \+ k/);
  assert.doesNotMatch(s, /T\.pctRightNow/);
  assert.equal(cfg.t.essReady, 'The essentials are done'); // pub test 3: never "ready" beside a low number assert.equal(cfg.t.essCount, '{n} of {total} essentials done.');
  assert.equal(cfg.t.pctAbout, 'About {n}% complete'); assert.equal(cfg.t.pctAboutSub, 'once we add what you sent (usually within a day).'); assert.equal(cfg.t.pctRaise, 'Add more about your place to raise it.');
  // Part 2: no counter, four tiles then "A few more" folded.
  assert.doesNotMatch(s, /T\.moreProg|T\.moreDone/);
  assert.match(s, /<details class="su-fold" id="suFold"/);
  // Closures: the button counts what's new; the date box opens on next month; no "Welcome back" mid-session.
  assert.match(s, /fill\(newC === 1 \? T\.saveClosures1 : T\.saveClosuresN, \{ n: newC \}\)/);
  assert.match(s, /S\.addFrom \|\| nextMonth\(\)/);
  assert.match(s, /S\.fresh \? T\.welcome : T\.soFarQ/);
  assert.equal(cfg.t.saveClosures1, 'Save these closures ({n} new)'); assert.equal(cfg.t.soFarQ, 'Your answers so far');
  // Tap-first answers, in both languages.
  assert.deepEqual(cfg.t.quick.reservations, ['Call us', 'Book on our website', 'Walk-ins welcome too']);
  assert.deepEqual(cfg.t.quick.takeout, ['Call to order', 'Order at the counter', 'DoorDash', 'SkipTheDishes', 'Uber Eats']);
  assert.deepEqual(cfg.t.quick.dogs, ['Patio only', 'Inside and patio', 'Water bowls at the door']);
  assert.deepEqual(cfg.t.quick.groups, ['Call ahead for 10 or more', 'Private room available']);
  for (const k of Object.keys(strings.en.quick)) assert.equal(strings.fr.quick[k].length, strings.en.quick[k].length, `French chips for ${k}`);
  assert.match(s, /quick\(cfg\[0\], 'suLine'/); assert.match(s, /quick\('dogs', 'suDog'/);
  // Menu after sending; honest words; names.
  assert.equal(cfg.t.menuSentQ, 'Your menu is sent ✓'); assert.equal(cfg.t.menuNewer, 'Want to send a newer menu?');
  assert.match(s, /S\.savedLine\.cuisine = T\.savedCuisine/); assert.equal(cfg.t.savedCuisine, 'Your food types and kind of place are on your page now.');
  assert.match(s, /step === 'spend' && d === 'live' && !C\.spendPublic \? T\.stSoon/); assert.equal(cfg.t.stSoon, 'saved (prices aren’t on pages yet)'); // café test 1: no "soon" while prices aren't public
  assert.equal(cfg.t.sentTitle, 'Sent');
  assert.equal(cfg.offerLabels.dog_friendly, 'Dogs welcome (even just the patio)');
  assert.equal(cfg.t.tooSmall, 'This one would look blurry. Pick a different one.');
  assert.equal(cfg.t.backSettings, 'Back to my edit page'); assert.ok(!/page settings/.test(JSON.stringify(cfg.t)), 'one name for the edit page');
  assert.ok(!/réglages/.test(JSON.stringify(strings.fr)));
  assert.match(html, /body\.owner-setup \.su-pages img \{ object-fit: contain;/);
  assert.match(html, /body\.owner-setup \.ohb-x \{ width: 44px; height: 44px; \}/);
  const frHtml = await text(`/fr/owner/${tokenFor(v.id)}/setup`);
  assert.equal(cfgOf(frHtml).t.essReady, 'L’essentiel est fait');
  for (const k of Object.keys(strings.en)) assert.ok(k in strings.fr, `French has ${k}`);
});

test('help: average spend says "soon" while it isn’t shown publicly; other types are untouched', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  assert.equal((await change(t, { avg_spend: 30 })).status, 201);
  await prog(t, { step: 'spend', status: 'live' });
  const html = await text(`/owner/${t}/setup`);
  assert.match(html, /Price per person: saved \(prices aren’t on pages yet\)/); // pub test 8: the label says what it asks
  assert.match(html, /Prices aren’t shown on pages yet\. We’ll use yours when they are\./);
  for (const type of ['brewery', 'distillery']) { // cafés have the setup since 2026-11-10
    const o = mk(type);
    const r = await fetch(`${base}/owner/${tokenFor(o.id)}/setup`, { redirect: 'manual' });
    assert.equal(r.status, 302, `${type} goes back to its edit page`);
  }
});
