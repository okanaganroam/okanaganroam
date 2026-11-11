// Pub fresh-eyes fixes (Dayton, Nov 10 2026; drafts/fresh-eyes-pub-2026-11-10/REPORT.md): the shared easy-setup code,
// so restaurants get them too. A: a find-link note never lands in the menu-help row. B: Save and exit never records an
// implicit "not offered". C: the average spend tile icon. D: the kind of place and plain words on the front-door step.
// E: the front-door map fallback. F: Sports on TV in a pub's visible highlights. G: the minor ones (deal prefixes, the
// specials split, "To reach 100%", the Optional line). Friction: Midnight/Noon, "Same every day", "All day", two ways
// of saying "when", the quick-ones line, the time, the greeting, the event kinds, recurring holidays. And Tonics out
// of the Kelowna happy hour guide.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'pub-fe-fixes-admin';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const hours = require('../hours.js');
const sent = [];
app.setVenueSubmissionTransport(async (m) => { sent.push(m); });

const WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, d === 'mon' ? [] : [['11:30', '23:00']]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `PFE ${type} ${++n}`, slug: `pfe-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.4, address: `${n} Main St, Penticton`, phone: '250-555-0142', website: 'https://example.com', hours: WEEK,
  description: 'A fixture used only by the pub fresh-eyes fix tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const text = (p) => get(p).then((r) => r.text);
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.77.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const change = (t, changes) => post(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const prog = (t, step, status) => post(`/owner/${t}/setup/progress`, { step, status });
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/.exec(html)[1]);
const scriptOf = (html) => /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });

// ---------- A ----------
test('A: a pub\'s find-link note is its own request and never overwrites the menu-help row; other types are refused', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  assert.equal((await post(`/owner/${t}/menu/help`, { note: 'Our menu is on our website: example.com/menu', contact_email: '', contact_phone: '' })).status, 200);
  const menuRow = db.prepare('SELECT * FROM venue_menus WHERE venue_id = ? AND help_kind IS NULL').get(v.id);
  assert.match(menuRow.help_note, /example\.com\/menu/);
  const r = await post(`/owner/${t}/menu/help`, { note: 'Our Facebook page is called: “The Tapside Pub”. Please find the link and add it to our page.', sheet: 'facebook', contact_email: '', contact_phone: '' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const fb = db.prepare("SELECT * FROM venue_menus WHERE venue_id = ? AND help_kind = 'facebook'").get(v.id);
  assert.equal(fb.status, 'help'); assert.match(fb.help_note, /Tapside/);
  assert.match(db.prepare('SELECT help_note FROM venue_menus WHERE id = ?').get(menuRow.id).help_note, /example\.com\/menu/, 'the menu-help row keeps its own note');
  assert.match(sent[sent.length - 1]._subject, /\[FIND LINK\]/);
  // Instagram too, and a restaurant still works.
  assert.equal((await post(`/owner/${t}/menu/help`, { note: 'Our Instagram is @tapside', sheet: 'instagram', contact_email: '', contact_phone: '' })).status, 200);
  const rest = mk('restaurant');
  assert.equal((await post(`/owner/${tokenFor(rest.id)}/menu/help`, { note: 'Our Facebook page is X', sheet: 'facebook', contact_email: '', contact_phone: '' })).status, 200);
  // A type without the easy setup can't send a note kind, and nothing is folded into a menu row.
  const cafe = mk('cafe'); const ct = tokenFor(cafe.id);
  assert.equal((await post(`/owner/${ct}/menu/help`, { note: 'Our menu is at example.com', contact_email: '', contact_phone: '' })).status, 200);
  const cafeRow = db.prepare('SELECT * FROM venue_menus WHERE venue_id = ?').get(cafe.id);
  assert.equal((await post(`/owner/${ct}/menu/help`, { note: 'Our Facebook page is X', sheet: 'facebook', contact_email: '', contact_phone: '' })).status, 400);
  assert.equal(db.prepare('SELECT help_note FROM venue_menus WHERE id = ?').get(cafeRow.id).help_note, cafeRow.help_note);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM venue_menus WHERE venue_id = ? AND help_kind = 'facebook'").get(cafe.id).n, 0);
});

// ---------- B, C, D, E (the page script and its words) ----------
test('B–E: Save and exit records no implicit "not offered"; the spend icon; the kind of place; the map fallback', async () => {
  const v = mk('pub'); const html = await text(`/owner/${tokenFor(v.id)}/setup`);
  const s = scriptOf(html), cfg = cfgOf(html);
  // B: only a full Save (not Save and exit) adds games / sports to "not offered".
  assert.match(s, /partial = !!S\.exitAfter/);
  assert.match(s, /if \(gameOn \|\| !S\.noGames\) rem\.push\('games'\); else if \(!partial\) add\.push\('games'\)/ /* pub test 9: only the "No games" tile */);
  // Pub test 6: only an explicit "no sports" is recorded, and never from "Save and exit".
  assert.match(s, /if \(badges\.sports_tv \|\| !noSportsSaid\) rem\.push\('sports'\); else if \(!partial\) add\.push\('sports'\);/);
  // C: the average spend tile has its own icon, and a missing one is never "undefined".
  assert.match(s, /spend: '🍽️'/); /* pub test 8: a plate, not a money icon */ assert.match(s, /\(P2_ICONS\[k\] \|\| '•'\)/);
  // D: "pub", and no "Roam Now map" on the front-door step, in English and French.
  assert.equal(cfg.typeWord, 'pub');
  assert.equal(cfg.t.doorLead, 'So visitors can walk right to your door. It takes one photo, taken outside your {type}.');
  assert.equal(cfg.t.doorHere, 'Are you at your {type} right now?');
  assert.match(s, /fill\(T\.doorLead, \{ type: C\.typeWord \}\)/);
  for (const k of ['doorLead', 'doorHere', 'mapFail']) assert.doesNotMatch(cfg.t[k], /Roam Now/);
  const fr = cfgOf(await text(`/fr/owner/${tokenFor(v.id)}/setup`));
  assert.equal(fr.typeWord, 'pub'); assert.match(fr.t.doorHere, /\{type\}/);
  assert.equal(cfgOf(await text(`/owner/${tokenFor(mk('restaurant').id)}/setup`)).typeWord, 'restaurant');
  // E: after 8 seconds (or a failed load) the map gives way to a send-with-my-address button.
  assert.equal(cfg.t.mapFail, 'We couldn’t load the map. Send it with your address and we’ll place the pin for you.');
  assert.equal(cfg.t.mapFailSend, 'Send with my address');
  assert.match(s, /sc\.onerror = mapFailed/);
  assert.match(s, /setTimeout\(function\(\)\{ if \(!map\) mapFailed\(\); \}, 8000\)/);
  assert.match(s, /S\.door\.mapFail = true/);
});

test('E: a front-door spot sent with the listing\'s own pin (the map fallback) is accepted', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  const jpg = `data:image/jpeg;base64,${fs.readFileSync(path.join(__dirname, '..', 'public', 'images', 'venues', fs.readdirSync(path.join(__dirname, '..', 'public', 'images', 'venues')).find((f) => /-2610\.jpg$/.test(f)))).toString('base64')}`;
  const r = await post(`/owner/${t}/arrival`, { image: jpg, lat: v.latitude, lng: v.longitude, rights: true });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
});

// ---------- F ----------
test('F: Sports on TV leads a pub\'s visible highlights, even with four other features', async () => {
  const v = mk('pub', { sports_tv: 1, patio: 1, dog_friendly: 1, live_music: 1, great_groups: 1 });
  await change(tokenFor(v.id), { pub_info: { sports: { list: ['hockey', 'football'], tvs: '6-10' } } });
  const html = page(v, 'en');
  const hl = /<div class="fd-highlights">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(hl, 'the highlights row shows');
  assert.match(hl[1], /^<span>📺 Sports on TV: hockey, football · 6 to 10 TVs<\/span>/);
  assert.equal((hl[1].match(/<span>/g) || []).length, 4, 'still four amenity highlights');
  // A pub with only the researched badge still says Sports TV in the row; restaurants unchanged.
  assert.match(page(mk('pub', { sports_tv: 1 }), 'en'), /📺 Sports TV/);
  const rest = mk('restaurant', { sports_tv: 1, patio: 1, dog_friendly: 1, live_music: 1, great_groups: 1 });
  assert.doesNotMatch(/<div class="fd-highlights">([\s\S]*?)<\/div>/.exec(page(rest, 'en'))[1], /Sports/);
});

// ---------- G ----------
test('G: deal prefixes are compact ("Mon–Fri: ") and old stored deals ("Mon, Tue, Wed, Thu, Fri: ") still come back as typed', async () => {
  const s = scriptOf(await text(`/owner/${tokenFor(mk('pub').id)}/setup`));
  const fn = (name) => { const i = s.indexOf(`function ${name}(`); let d = 0, j = s.indexOf('{', i); for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; } return s.slice(i, j + 1); };
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const names = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  // eslint-disable-next-line no-new-func
  const lib = new Function('DAYS', 'dayName', `${fn('dayPrefix')}\n${fn('oldPrefix')}\n${fn('prefixOf')}\nreturn { dayPrefix, oldPrefix, prefixOf };`)(DAYS, (d) => names[d]);
  const e = (ds) => ({ days: Object.fromEntries(ds.map((d) => [d, true])) });
  assert.equal(lib.dayPrefix(e(['mon', 'tue', 'wed', 'thu', 'fri'])), 'Mon–Fri: ');
  assert.equal(lib.dayPrefix(e(['mon', 'tue', 'thu', 'fri', 'sat'])), 'Mon, Tue, Thu–Sat: ');
  assert.equal(lib.dayPrefix(e(['sat', 'sun'])), 'Sat, Sun: ');
  // Round trip: the new and the old stored forms both give back the row's own words.
  const row = e(['mon', 'tue', 'wed', 'thu', 'fri']);
  for (const stored of ['Mon–Fri: $5 pints', 'Mon, Tue, Wed, Thu, Fri: $5 pints']) {
    const p = lib.prefixOf(row, stored);
    assert.ok(p, stored); assert.equal(stored.slice(p.length), '$5 pints');
  }
  assert.equal(lib.prefixOf(row, 'Sat, Sun: wings'), null, 'another row\'s deal is not taken');
  assert.match(s, /mine\[\(S\.happy\.length > 1 \? oldPrefix\(e\) : ''\) \+ e\.what\] = true/, 'an old-form deal of a row is not kept twice');
  // Specials: "Wing Wednesday, 50¢ wings" is title + deal, never the same words twice.
  assert.match(s, /function specialsSave|specialsSave/);
  assert.match(s, /indexOf\(','\)/);
  // "To reach 100%" skips ticked/answered steps, and the Optional line lists only open Part 2 steps.
  assert.match(s, /tickedBy = \{ book: 'takes_reservations', takeout: 'takeout', groups: 'great_groups' \}/);
  assert.match(s, /function moreSub\(\)/);
  assert.match(s, /moreSub\(\)/);
});

test('G: an old stored multi-row happy hour (long day prefix) comes back into its rows from the server data', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  const hh = JSON.stringify({ mon: [], tue: [['15:00', '17:00']], wed: [['15:00', '17:00']], thu: [['15:00', '17:00']], fri: [['15:00', '17:00']], sat: [['21:00', '23:00']], sun: [] });
  db.prepare('UPDATE venues SET happy_hour_times = ? WHERE id = ?').run(hh, v.id);
  const cfg = cfgOf(await text(`/owner/${t}/setup`));
  assert.ok(cfg.cur.happy_hour, 'the setup reads the stored happy hour');
});

// ---------- Friction ----------
test('Midnight and Noon: never "12 AM" on owner screens or public clock text; French minuit', () => {
  assert.equal(hours.formatClockMinutes(0), 'midnight');
  assert.equal(hours.formatClockMinutes(1440), 'midnight');
  assert.equal(hours.formatClockMinutes(720), '12 PM', 'noon stays 12 PM in the public status line');
  assert.equal(app.minorsLineText({ policy: 'minors_until', until: '00:00' }, false), 'Minors welcome with an adult until midnight');
  assert.equal(app.minorsLineText({ policy: 'minors_until', until: '12:00' }, false), 'Minors welcome with an adult until noon');
  assert.equal(app.minorsLineText({ policy: 'minors_until', until: '00:00' }, true), 'Mineurs bienvenus avec un adulte jusqu’à minuit');
  assert.equal(app.frText('Closes midnight'), 'Ferme à minuit');
  assert.equal(app.frText('Opens midnight'), 'Ouvre à minuit');
  assert.equal(app.frText('11 AM – midnight'), '11 h – minuit');
});

test('Midnight on a public page: a place that closes at 12:00 AM reads "midnight"', () => {
  const late = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['11:00', '00:00']]])));
  const v = mk('pub', { hours: late });
  const html = page(v, 'en');
  assert.match(html, /11 AM – midnight|11 AM–midnight/);
  assert.doesNotMatch(html, /11 AM – 12 AM|11 AM–12 AM/);
});

test('hours editor, happy hour and closures: Same every day, Same as Monday, Open ✓/Closed, All day, This year and next', async () => {
  const html = await text(`/owner/${tokenFor(mk('pub').id)}/setup`);
  const s = scriptOf(html), cfg = cfgOf(html);
  assert.equal(cfg.t.sameEvery, 'Copy Monday to every day'); assert.equal(cfg.t.sameAsMon, 'Same as Monday');
  assert.equal(cfg.t.openOn, 'Open ✓'); assert.equal(cfg.t.closedOff, 'Closed');
  // Pub test 4: the Monday-only copy button became "Copy these hours to: Every day / Mon–Fri" on any open day.
  assert.match(s, /data-copyall="/); assert.match(s, /data-samemon/); assert.match(s, /data-dayopen/); assert.match(s, /data-dayclosed/);
  assert.match(s, /function t12[\s\S]{0,400}'Midnight'[\s\S]{0,200}'Noon'/);
  // All day (open to close) takes the opening hours of the picked days.
  assert.equal(cfg.t.allDay, 'All day (open to close)');
  assert.match(s, /data-act="allDay:' \+ i \+ '"/);
  assert.match(s, /if \(k === 'allDay'\)/);
  // Recurring holidays: closures are stored as dates (no repeat rule), so next year's date is saved too, on by default.
  assert.equal(cfg.t.everyYear, 'This year and next');
  // Pub test 5: every stat holiday repeats (its own date next year); the eves stay one-off.
  assert.match(s, /yearly: key !== 'xmasEve' && key !== 'nye'/);
  assert.match(s, /S\.everyYear\[key\] !== false/);
  assert.match(s, /data-yearly/); assert.match(s, /mapFailQ/);
  assert.equal(cfgOf(await text(`/fr/owner/${tokenFor(mk('pub').id)}/setup`)).t.everyYear, 'Cette année et l’an prochain');
});

test('recurring holidays: this year\'s and next year\'s Christmas save together and both show', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  const y = Number(app.todayLocal().slice(0, 4));
  const r = await change(t, { closures: [{ from: `${y}-12-25`, to: `${y}-12-25`, note: 'Christmas Day' }, { from: `${y + 1}-12-25`, to: `${y + 1}-12-25`, note: 'Christmas Day' }] });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
  const cfg = cfgOf(await text(`/owner/${t}/setup`));
  const froms = (cfg.cur.closures || []).map((c) => c.from);
  assert.ok(froms.includes(`${y}-12-25`) && froms.includes(`${y + 1}-12-25`), JSON.stringify(cfg.cur.closures));
});

test('two ways of saying "when", the honest time, the greeting, event kinds open', async () => {
  const pub = mk('pub'); const html = await text(`/owner/${tokenFor(pub.id)}/setup`);
  const cfg = cfgOf(html), s = scriptOf(html);
  assert.equal(cfg.t.hi, 'Hi, welcome to your page for {name} 👋');
  assert.match(cfg.t.hiLead, /About 15 to 30 minutes\. You can stop any time and carry on later\./ /* pub test 6 */);
  assert.match(cfg.t.helpYes, /<strong>Saved ✓<\/strong> or <strong>Sent ✓<\/strong>/);
  // Event kinds: the 6 most common show open (pubs lead with sports), the rest under "More kinds".
  assert.deepEqual(cfg.nightKinds.slice(0, 6), ['trivia', 'live_music', 'karaoke', 'sports', 'dj', 'open_mic']);
  assert.equal(cfg.t.moreKinds, 'More kinds');
  assert.match(s, /C\.nightKinds\.slice\(0, 6\)/);
  const restCfg = cfgOf(await text(`/owner/${tokenFor(mk('restaurant').id)}/setup`));
  assert.equal(restCfg.nightKinds.length, 12);
  assert.match(restCfg.t.hiLead, /About 15 to 30 minutes\. You can stop any time and carry on later\./); // pub test 6
});

test('the quick-ones line waits until the setup is finished or "I\'m done for now"', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  const before = await text(`/owner/${t}`);
  const sub = (h) => (/id="opCbSub" data-closed="([^"]*)"/.exec(h) || [])[1] || '';
  assert.doesNotMatch(sub(before), /quick one/);
  assert.match(sub(before), /The setup above fills this in/);
  assert.equal((await post(`/owner/${t}/setup/progress`, { done_for_now: true })).status, 200);
  assert.doesNotMatch(sub(await text(`/owner/${t}`)), /The setup above fills this in/);
});

// ---------- Tonics ----------
test('Tonics is out of the Kelowna happy hour guide; the guide keeps its places and renders', async () => {
  const g = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'guides', 'happy-hour-kelowna.json'), 'utf8'));
  const refs = JSON.stringify(g).match(/"ref":/g) || [];
  assert.doesNotMatch(JSON.stringify(g), /tonics/i);
  assert.ok(refs.length >= 20, `still a full guide (${refs.length} places)`);
  const r = await get('/guides/happy-hour-kelowna');
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.text, /Tonics/);
  const dates = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'guide-dates.json'), 'utf8'));
  assert.ok(dates['happy-hour-kelowna'].modified >= '2026-11-09', 'the guide\'s modified date moved with the edit');
});
