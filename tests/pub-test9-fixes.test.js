// Ninth first-time pub test fixes (Dayton, Nov 10 2026; drafts/fresh-eyes-pub9-2026-11-10/REPORT.md), tested as a
// marketing / social media manager. The setup is shared, so restaurants get the same fixes: a booking link box in the
// setup, the menu prefill keeps tracked links intact, happy hour (and specials) "until close", a live deal counter,
// unticked games say nothing, one main-photo story, Help topics, one thanks, no redundant saves, owner stats, TikTok,
// photo order, event pictures and "Add another event", and a staff access line.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'pub-test9-admin';
process.env.OWNER_PHOTO_DIR = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'pt9-photos-'));
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
delete process.env.TRIP_PLANNER_V2;
delete process.env.TRIP_PLANNER_V3;
const app = require('../server.js');
const db = require('../db.js');
const hours = require('../hours.js');
const TEXT = require('../owner-setup-text.js');
const ownerStats = require('../owner-stats.js');
app.setVenueSubmissionTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
// Tap & Barrel's hours: Mon–Thu 11–midnight, Fri–Sat 11–1 AM, Sun 10–11 PM.
const TAP_HOURS = { mon: [['11:00', '00:00']], tue: [['11:00', '00:00']], wed: [['11:00', '00:00']], thu: [['11:00', '00:00']], fri: [['11:00', '01:00']], sat: [['11:00', '01:00']], sun: [['10:00', '23:00']] };
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `PT9 ${type} ${++n}`, slug: `pt9-${type}-${n}`, region: 'kelowna', type, latitude: 49.88 + n / 1000, longitude: -119.49,
  rating: 4.4, address: `${n} Bernard Ave, Kelowna`, phone: '250-555-0142', website: 'https://tapandbarrelkitchen.ca/?utm_source=okanaganroam#top', hours: JSON.stringify(TAP_HOURS),
  description: 'A kitchen and bar downtown with local beer, burgers and the game on.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => { srv && srv.close(); try { fs.rmSync(process.env.OWNER_PHOTO_DIR, { recursive: true, force: true }); } catch (e) { /* temp */ } });
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text(), type: r.headers.get('content-type') }));
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.97.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const change = (t, changes) => post(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const editChange = (t, changes) => post(`/owner/${t}/changes`, { changes, note: '', contact_name: 'Jess', contact_email: 'jess@example.com', company_website: '', started_at: Date.now() - 60000 });
const ok = (r) => assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/.exec(html)[1]);
const scriptOf = (html) => /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];
// Okanagan local time on a date: the site's clock is UTC-7 from Nov 1, 2026 (okanaganClock, BC's permanent time).
const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h + 7, m)); };
// A tiny JPEG header the server reads as 900 x 1200 (like the other owner photo tests).
const JPEG = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x04, 0xB0, 0x03, 0x84, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]), Buffer.alloc(64), Buffer.from([0xFF, 0xD9])]).toString('base64')}`;
const photo = (t, o = {}) => post(`/owner/${t}/photos`, { image: JPEG, credit: 'Tap & Barrel', rights: true, contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000, notify: false, ...o });
// A function from the setup script, run on its own.
const fnFrom = (src, name) => { const i = src.indexOf(`function ${name}(`); assert.ok(i >= 0, name); let d = 0, j = src.indexOf('{', i); for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && !--d) break; } return src.slice(i, j + 1); };

// ---------- 1: a booking link box in the setup's Booking step ----------
test('1: the Booking step has its own booking link box (same field and review as the edit page); a link in the line is offered a move', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  const html = (await get(`/owner/${t}/setup`)).text;
  const js = scriptOf(html);
  assert.match(js, /field\('suBookUrl', T\.bookLinkLabel/);
  assert.match(js, /'moveLink'/);
  for (const lang of ['en', 'fr']) for (const k of ['bookLinkLabel', 'bookLinkEx', 'bookLinkHint', 'linkInLine', 'moveLink']) assert.ok(TEXT[lang][k], `${lang} ${k}`);
  // The link inside a line: found and taken out, the words kept.
  const ctx = {}; vm.runInNewContext(`${fnFrom(js, 'linkIn')}; this.a = linkIn('Book on OpenTable: opentable.ca/r/tap-and-barrel?utm_source=okanaganroam'); this.b = linkIn('Call us or walk in');`, ctx);
  assert.equal(ctx.a.url, 'opentable.ca/r/tap-and-barrel?utm_source=okanaganroam');
  assert.equal(ctx.a.rest, 'Book on OpenTable');
  assert.equal(ctx.b, null);
  // The setup saves the same field as the edit page, and it waits for review.
  const r = await change(t, { booking_url: 'https://www.opentable.ca/r/tap-and-barrel?utm_source=okanaganroam' });
  ok(r); assert.deepEqual(r.body.review, ['booking_url']);
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.equal(cfg.cur.booking_url, 'https://www.opentable.ca/r/tap-and-barrel?utm_source=okanaganroam', 'the waiting link shows in the box');
  // A bad link gets the edit page's own message.
  const bad = await change(t, { booking_url: 'not a link' }); assert.equal(bad.status, 400); assert.match(bad.body.errors.booking_url, /check the link/);
});

// ---------- 2: menu prefill keeps tracked links intact ----------
test('2: the menu step prefills only the website origin, never its query or fragment', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  const js = scriptOf((await get(`/owner/${t}/setup`)).text);
  const ctx = {}; vm.runInNewContext(`${fnFrom(js, 'siteOrigin')}; ${fnFrom(js, 'siteHostOf')}; this.o = siteOrigin('https://tapandbarrelkitchen.ca/?utm_source=okanaganroam#top'); this.p = siteOrigin('www.sandbarpub.ca/home?x=1'); this.h = siteHostOf('https://www.sandbarpub.ca/home?x=1');`, ctx);
  assert.equal(ctx.o, 'https://tapandbarrelkitchen.ca/');
  assert.equal(ctx.p, 'https://www.sandbarpub.ca/');
  assert.equal(ctx.h, 'sandbarpub.ca');
  assert.doesNotMatch(TEXT.en.webLead, /add to the end/i);
  assert.match(TEXT.en.webLead, /after the last \//); assert.match(TEXT.fr.webLead, /après le dernier \//);
  assert.match(js, /var urlNow = S\.webUrl != null \? S\.webUrl : site;/); // café test 5 (2026-11-12): named, for the Use-site check
});

// ---------- 3: happy hour (and specials) until close ----------
test('3: a happy hour "until close" ends at that day\'s closing time (after midnight too) on the page, now/next and the counts; old rows read the same', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  // Sunday late happy hour 9 PM until close (the pub closes at 11 PM Sunday), and Fri 10 PM until close (1 AM).
  const hh = { mon: [], tue: [], wed: [], thu: [], fri: [['22:00', '01:00']], sat: [], sun: [['21:00', '23:00']], _season: null, _close: { sun: ['21:00'], fri: ['22:00'] } };
  ok(await change(t, { happy_hour: hh, badges: { happy_hour: true } }));
  const stored = JSON.parse(db.prepare('SELECT happy_hour_times AS h FROM venues WHERE id = ?').get(v.id).h);
  assert.deepEqual(stored._close, { fri: ['22:00'], sun: ['21:00'] });
  assert.deepEqual(stored.sun, [['21:00', '23:00']], 'the stored end is the closing time (what older readers show)');
  const week = app.happyHourWeekText(JSON.stringify(stored), false);
  assert.match(week, /Sun 9 PM until close/);
  assert.match(app.happyHourWeekText(JSON.stringify(stored), true), /jusqu’à la fermeture/);
  // The pub changes its Sunday close to 10 PM: "until close" follows it, with no new save of the happy hour.
  db.prepare('UPDATE venues SET hours = ? WHERE id = ?').run(JSON.stringify({ ...TAP_HOURS, sun: [['10:00', '22:00']] }), v.id);
  const venue = app.getVenue(v.id);
  const now = at('2026-11-15', '21:30'); // a Sunday
  const hhOn = app.venueHappyHour(venue, app.hoursWithExtras(venue, now), false, now);
  assert.equal(hhOn.live.state, 'now');
  assert.match(hhOn.live.text, /10\s?PM|ends in/);
  const st = hours.happyHourState(stored, { weekday: 'sun', minutes: 21 * 60 + 30, date: '2026-11-15' }, false, null, { placeHours: app.hoursWithExtras(venue, now) });
  assert.equal(st.until.minutes, 22 * 60);
  // Friday: later today, 10 PM to 1 AM (Saturday morning).
  const fri = hours.happyHourState(stored, { weekday: 'fri', minutes: 18 * 60, date: '2026-11-20' }, false, null, { placeHours: TAP_HOURS });
  assert.equal(fri.state, 'later'); assert.deepEqual(fri.to, { weekday: 'sat', minutes: 60 });
  // The valley-wide count sees it on at 9:30 PM Sunday and not at 10:15 PM (closed).
  const onNow = (when) => { const x = app.happyHourNowSummary(when); return x.state === 'now' ? x.count : 0; };
  assert.ok(onNow(at('2026-11-15', '21:30')) >= 1);
  const before = onNow(at('2026-11-15', '22:15'));
  db.prepare('UPDATE venues SET hours = ? WHERE id = ?').run(JSON.stringify(TAP_HOURS), v.id);
  assert.equal(onNow(at('2026-11-15', '22:15')), before + 1, 'with the 11 PM close it is still on at 10:15 PM');
  // The client map gets the same function (HOURS_CLIENT_SRC carries happyHourUntilClose).
  assert.match(hours.HOURS_CLIENT_SRC, /function happyHourUntilClose/);
  // An edit-page save of the week without "_close" keeps it for the windows that still start at the same time.
  // (So the same week sent again is "nothing changed", and "_close" is still there.)
  const same = await editChange(t, { happy_hour: { mon: [], tue: [], wed: [], thu: [], fri: [['22:00', '01:00']], sat: [], sun: [['21:00', '23:00']] } });
  assert.equal(same.status, 400); assert.match(same.body.errors.form, /Nothing has changed/);
  ok(await editChange(t, { happy_hour: { mon: [['16:00', '18:00']], tue: [], wed: [], thu: [], fri: [['22:00', '01:00']], sat: [], sun: [['21:00', '23:00']] } }));
  assert.deepEqual(JSON.parse(db.prepare('SELECT happy_hour_times AS h FROM venues WHERE id = ?').get(v.id).h)._close, { fri: ['22:00'], sun: ['21:00'] });
  // Old rows (no _close) read exactly as before.
  const old = { sun: [['21:00', '00:00']] };
  assert.equal(app.happyHourWeekText(JSON.stringify(old), false), 'Sun 9 PM–⁠midnight');
  assert.deepEqual(hours.happyHourUntilClose(old, hours.parseHours(TAP_HOURS).days), old);
  // A "_close" naming a time that isn't a window start is refused.
  const bad = await change(t, { happy_hour: { ...hh, _close: { sun: ['20:00'] } } });
  assert.equal(bad.status, 400);
  // Specials keep their own "until close" (end: 'close'): the setup has the toggle.
  const js = scriptOf((await get(`/owner/${t}/setup`)).text);
  assert.match(js, /data-act="spClose:/); assert.match(js, /data-act="hhClose:/);
  assert.ok(TEXT.en.untilClose && TEXT.fr.untilClose && TEXT.en.closeUnknown && TEXT.fr.closeUnknown);
});

test('3b: the setup brings a happy hour "until close" back as one row with its toggle on', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  ok(await change(t, { happy_hour: { mon: [['21:00', '00:00']], tue: [], wed: [], thu: [], fri: [['21:00', '01:00']], sat: [], sun: [['21:00', '23:00']], _close: { mon: ['21:00'], fri: ['21:00'], sun: ['21:00'] } }, badges: { happy_hour: true } }));
  const cfg = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.deepEqual(JSON.parse(cfg.cur.happy_hour)._close, { fri: ['21:00'], mon: ['21:00'], sun: ['21:00'] });
  const js = scriptOf((await get(`/owner/${t}/setup`)).text);
  assert.match(js, /k = x\[0\] \+ '-' \+ \(c \? 'close' : x\[1\]\)/, 'until-close windows group by their start');
});

// ---------- 4: live counter ----------
test('4: the happy hour deal box has a live count of the room left (EN + FR)', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  const js = scriptOf((await get(`/owner/${t}/setup`)).text);
  assert.match(js, /data-room="' \+ i \+ '"/); assert.match(js, /function roomText/); assert.match(js, /addEventListener\('input', roomRefresh\)/);
  for (const k of ['charsLeft', 'charLeft1', 'charsOver', 'charOver1']) { assert.ok(TEXT.en[k], k); assert.ok(TEXT.fr[k], k); }
});

// ---------- 5: unticked games are not "don't have" ----------
test('5: only the explicit "No games" tile records a no; unticked game tiles leave it open', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  const js = scriptOf((await get(`/owner/${t}/setup`)).text);
  assert.match(js, /if \(gameOn \|\| !S\.noGames\) rem\.push\('games'\); else if \(!partial\) add\.push\('games'\);/);
  assert.match(js, /data-off="no_games"/);
  assert.ok(TEXT.en.noGames && TEXT.fr.noGames);
  // Past data reads as it was: a stored "games" answer still shows as the No games tile picked (never rewritten).
  ok(await change(t, { not_offered: ['games'] }));
  assert.deepEqual(cfgOf((await get(`/owner/${t}/setup`)).text).cur.not_offered, ['games']);
});

// ---------- 6: main photo messages agree ----------
test('6: a main photo picked in the setup reads "Your pick: on your page within a day" on the edit page, never "We chose this photo for you"', async () => {
  const v = mk('pub', { image_url: '/images/venues/sample.jpg' }); const t = tokenFor(v.id);
  ok(await photo(t, { main: true }));
  const page = (await get(`/owner/${t}`)).text;
  assert.match(page, /Your pick: on your page within a day/);
  assert.match(page, /Your main photo · on your page within a day/);
  assert.doesNotMatch(page, /We chose this photo for you/);
  const fr = (await get(`/fr/owner/${t}`)).text;
  assert.match(fr, /Votre choix : sur votre page d’ici un jour/);
  // Without a pick the old wording stays.
  const v2 = mk('pub', { image_url: '/images/venues/sample.jpg' });
  assert.match((await get(`/owner/${tokenFor(v2.id)}`)).text, /We chose this photo for you/);
});

// ---------- 7: Help topics ----------
test('7: Help answers "I\'m not the owner", TikTok, photo order, stats, event pictures and the booking link (EN + FR)', () => {
  for (const page of ['edit', 'setup']) {
    const html = app.ownerHelpWidgetHtml(page, { avgSpend: true, completeness: true });
    const c = JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
    const ctx = { T: c.topics, cfg: c };
    vm.runInNewContext(`${html.slice(html.indexOf('function norm(s)'), html.indexOf('function ask(q)'))}; this.best = best;`, ctx);
    for (const [q, id] of [["I'm not the owner, can I edit?", 'not-owner'], ["I'm staff, can I edit the page?", 'not-owner'], ['I’m the marketing manager, am I allowed to make changes?', 'not-owner'],
      ['How do I change the order of my photos?', 'photo-order'], ['how many people see my page', 'stats'], ['Can I add a picture to my event?', 'event-picture'],
      ['add another event', 'event-picture'], ['where do I put my booking link', 'booking-link'], ['can my staff log in', 'staff'],
      ['je ne suis pas le propriétaire, puis-je modifier?', 'not-owner'], ['changer l ordre des photos', 'photo-order']]) {
      assert.equal(ctx.best(q).id, id, `${page}: ${q}`);
    }
    const by = Object.fromEntries(c.topics.map((x) => [x.id, x]));
    assert.match(by.stats.a, /Your page in the last 30 days/); assert.doesNotMatch(by.stats.a, /aren’t in the business portal yet/);
    assert.match(by.stats.aFr, /Votre page ces 30 derniers jours/);
    assert.match(by['not-owner'].a, /People with access/); assert.match(by['not-owner'].aFr, /Personnes ayant accès/);
    // Café test 3 (2026-11-11): no TikTok topic any more (the TikTok box is gone).
    assert.ok(!by.tiktok);
    for (const id of ['photo-order', 'event-picture', 'booking-link']) assert.ok(by[id].a && by[id].aFr, id);
  }
});

// ---------- 8 + 9: one thanks; no redundant saves; easy replacing ----------
test('8/9: the thanks shows once; a line save sends only what changed; prefilled boxes select on first tap', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  const page = (await get(`/owner/${t}`)).text;
  assert.match(page, /var tt = document.getElementById\('opToast'\); if \(tt\) tt.hidden = true;/);
  assert.doesNotMatch(page, /tt\.hidden = false/);
  const js = scriptOf((await get(`/owner/${t}/setup`)).text);
  assert.match(js, /if \(bk && !S\.badges\[bk\]\)/);
  assert.match(js, /if \(!sameLine\) list2\.push\(\{ visit_rows: vr \}\);/);
  assert.match(js, /select\(\)/, 'a prefilled one-line box is selected on its first tap');
  // A repeat from the setup is a plain success that changes nothing (café test 5, 2026-11-12; it was a 400).
  ok(await change(t, { badges: { takes_reservations: true } }));
  assert.equal((await change(t, { badges: { takes_reservations: true } })).status, 200);
});

// ---------- 10: owner stats ----------
test('10: the edit page and the setup finish show the page\'s own 30-day numbers, from venue_event_counts, owner-only, honest when small', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  const now = new Date();
  const dayOf = (back) => require('../trip-demand.js').dayOf(new Date(now.getTime() - back * 86400000));
  const add = (back, name, k) => db.prepare('INSERT INTO venue_event_counts (day, venue_id, name, n) VALUES (?, ?, ?, ?) ON CONFLICT(day, venue_id, name) DO UPDATE SET n = n + excluded.n').run(dayOf(back), v.id, name, k);
  // Zero first: an honest line, no numbers made up.
  let st = ownerStats.ownerStats(db, v.id, now);
  assert.equal(st.none, true); assert.equal(st.views, 0);
  assert.match(ownerStats.ownerStatsHtml(st, 'en'), /No visits counted in the last 30 days yet/);
  // Some counts: a click counted both ways (outbound + click sheet) is one click.
  add(1, 'venue_view', 12); add(2, 'venue_view', 3); add(1, 'outbound_click:website', 4); add(1, 'click:website', 4); add(1, 'click:call_button', 2); add(2, 'outbound_click:phone', 1);
  add(1, 'click:directions', 3); add(1, 'click:booking', 1); add(3, 'click:full_menu', 5); add(40, 'venue_view', 9); add(40, 'click:website', 2); add(70, 'venue_view', 100);
  st = ownerStats.ownerStats(db, v.id, now);
  assert.equal(st.views, 15);
  assert.deepEqual(st.clicks, { website: 4, call: 2, directions: 3, book: 1, menu: 5 });
  assert.equal(st.clicks_total, 15);
  assert.equal(st.small, true);
  assert.ok(st.prev, 'counting started more than 60 days ago here, so the month before is compared');
  assert.equal(st.prev.views, 9); assert.equal(st.prev.clicks.website, 2);
  const page = (await get(`/owner/${t}`)).text;
  assert.match(page, /Your page in the last 30 days/);
  assert.match(page, /<span class="os-n">15<\/span><span class="os-l">Page views<small>9 the 30 days before<\/small>/);
  assert.match(page, /Early days: these numbers are small/);
  assert.match(page, /Only you can see these numbers/);
  const fr = (await get(`/fr/owner/${t}`)).text;
  assert.match(fr, /Votre page ces 30 derniers jours/); assert.match(fr, /Vues de la page/);
  const setup = cfgOf((await get(`/owner/${t}/setup`)).text);
  assert.match(setup.statsHtml, /15 page views · 15 clicks to your website, phone, directions, booking and menu/);
  // Never on the public page.
  assert.doesNotMatch(app.renderVenuePage(app.getVenue(v.id), [], [], []), /os-panel|Your page in the last 30 days/);
  // No comparison when counting started inside the last 60 days.
  const late = ownerStats.ownerStats({ prepare: (sql) => (/MIN\(day\)/.test(sql) ? { get: () => ({ d: dayOf(10) }) } : db.prepare(sql)) }, v.id, now);
  assert.equal(late.prev, null);
  assert.match(ownerStats.ownerStatsHtml(late, 'en'), /We started counting on/);
});

// ---------- 11: TikTok ----------
test('11: TikTok is validated like Instagram, goes live like Instagram and shows with the other socials (setup + edit page, EN + FR)', async () => {
  for (const [raw, out] of [['@tapandbarrel', 'https://www.tiktok.com/@tapandbarrel'], ['https://www.tiktok.com/@tap.and.barrel?lang=en', 'https://www.tiktok.com/@tap.and.barrel'], ['tiktok.com/@tapandbarrel/', 'https://www.tiktok.com/@tapandbarrel'],
    ['tapandbarrel', null], ['https://www.tiktok.com/@tapandbarrel/video/123', null], ['https://www.tiktok.com/foryou', null], ['https://evil.com/@x', null], ['@a', null]]) {
    assert.equal(app.ownerSocialLink('tiktok_url', raw), out, raw);
  }
  const v = mk('pub'); const t = tokenFor(v.id);
  const bad = await change(t, { tiktok_url: 'tapandbarrel' });
  assert.equal(bad.status, 400); assert.match(bad.body.errors.tiktok_url, /TikTok name with @/);
  const r = await change(t, { tiktok_url: '@tapandbarrel' });
  ok(r); assert.deepEqual(r.body.live, ['tiktok_url']);
  const pub = app.renderVenuePage(app.getVenue(v.id), [], [], []);
  assert.match(pub, /<a href="https:\/\/www\.tiktok\.com\/@tapandbarrel" rel="nofollow noopener" target="_blank">TikTok<\/a>/);
  // Café test 3 (2026-11-11): no TikTok box on the edit page or in the setup any more; a saved one stays on the page.
  const edit = (await get(`/owner/${t}`)).text;
  assert.doesNotMatch(edit, /id="opTiktok"/);
  assert.doesNotMatch((await get(`/fr/owner/${t}`)).text, /TikTok \(facultatif\)/);
  assert.doesNotMatch(scriptOf((await get(`/owner/${t}/setup`)).text), /suTt|ttLabel/);
  assert.ok(!TEXT.en.ttLabel && !TEXT.fr.ttLabel);
  // Cleared again.
  ok(await change(t, { tiktok_url: '' }));
  assert.doesNotMatch(app.renderVenuePage(app.getVenue(v.id), [], [], []), />TikTok</);
});

// ---------- 12: photo order ----------
test('12: the edit link can reorder photos (stored, used by the page and gallery); the main photo stays first; waiting photos keep their review', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  const ids = [];
  for (let i = 0; i < 3; i++) { const r = await photo(t); ok(r); ids.push(r.body.id); }
  app.approveOwnerPhoto(ids[0], 'Dayton', { main: true }); app.approveOwnerPhoto(ids[1], 'Dayton', {});
  // ids[2] stays waiting. The grid on the edit link has the arrows (not Make main or Remove).
  const page = (await get(`/owner/${t}`)).text;
  assert.match(page, new RegExp(`data-photo="${ids[2]}" data-move="up"`));
  assert.doesNotMatch(page, /class="op-btn op-make-main"/);
  const r = await post(`/owner/${t}/photos/${ids[2]}/up`, {});
  ok(r); assert.equal(r.body.moved, true); assert.deepEqual(r.body.order, [ids[2], ids[1]]);
  assert.equal(db.prepare('SELECT status FROM owner_photos WHERE id = ?').get(ids[2]).status, 'pending', 'still waiting for review');
  // The main photo can't move.
  assert.equal((await post(`/owner/${t}/photos/${ids[0]}/up`, {})).status, 409);
  // Approved later, it shows in the new place: before the other one.
  app.approveOwnerPhoto(ids[2], 'Dayton', {});
  const files = db.prepare('SELECT id, file FROM owner_photos WHERE venue_id = ?').all(v.id).reduce((m, x) => ({ ...m, [x.id]: x.file }), {});
  const gal = app.venueGalleryPhotos(app.getVenue(v.id), (en) => en).map((p) => p.src || p.url || p);
  const pos = (id) => gal.findIndex((x) => String(x).includes(files[id].replace('.jpg', '')));
  assert.ok(pos(ids[0]) === 0 && pos(ids[2]) >= 0 && pos(ids[2]) < pos(ids[1]), JSON.stringify(gal));
  // Another listing's link can't move it.
  const other = tokenFor(mk('restaurant').id);
  assert.equal((await post(`/owner/${other}/photos/${ids[1]}/up`, {})).status, 404);
  // The setup's photo screen has earlier / later buttons for the photos being sent.
  assert.match(scriptOf((await get(`/owner/${t}/setup`)).text), /data-pmove="/);
  assert.ok(TEXT.en.photoOrderHint && TEXT.fr.photoOrderHint);
});

// ---------- 13: events: a picture, and "Add another event" ----------
test('13: an event can carry a picture (reviewed with the event, published as its image when approved); Add another keeps name and email', async () => {
  const v = mk('pub'); const t = tokenFor(v.id);
  const d = new Date(Date.now() + 5 * 86400000 - 7 * 3600000).toISOString().slice(0, 10);
  const ev = { name: 'Grey Cup Party', categories: ['sports-recreation'], description: 'Watch the Grey Cup on every screen, with wings and pitchers all afternoon.', start_date: d, end_date: '', start_time: '15:00', end_time: '',
    all_day: false, event_url: 'https://tapandbarrelkitchen.ca/events?utm_source=okanaganroam', price_text: 'Free', schedule_notes: '', contact_name: 'Jess', contact_email: 'jess@example.com', company_website: '', started_at: Date.now() - 60000, partner_venue_ids: [] };
  // No rights tick: refused with the field's own message.
  const noRights = await post(`/owner/${t}/events`, { ...ev, image: JPEG });
  assert.equal(noRights.status, 400); assert.match(noRights.body.errors.image, /permission/);
  const r = await post(`/owner/${t}/events`, { ...ev, image: JPEG, image_rights: true });
  ok(r);
  const sub = db.prepare('SELECT image_file, image_key, status FROM event_submissions WHERE id = ?').get(r.body.id);
  assert.match(sub.image_file, /^[a-z0-9]{24}\.jpg$/); assert.equal(sub.status, 'pending');
  // Private preview works; the public file does not, until the event is approved.
  assert.equal((await get(`/owner-photos/preview/${sub.image_key}.jpg`)).status, 200);
  assert.equal((await get(`/images/owner/${sub.image_file}`)).status, 404);
  const a = app.approveEventSubmission(r.body.id, { reviewer: 'Dayton' });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.event.image_url, `/images/owner/${sub.image_file}`);
  assert.equal((await get(`/images/owner/${sub.image_file}`)).status, 200);
  // An event without a picture is as before.
  ok(await post(`/owner/${t}/events`, { ...ev, name: 'Trivia Night Special', start_time: '19:00' }));
  // The edit page: the picture field, its rights tick, and Add another keeps the name and email ("Sending as …").
  const page = (await get(`/owner/${t}`)).text;
  assert.match(page, /id="oePhoto" accept="image\/\*"/); assert.match(page, /id="oePhotoRights"/);
  assert.match(page, /sentAs = \{ name: v\('oeContactName'\)\.trim\(\), email: v\('oeContactEmail'\)\.trim\(\) \};/);
  assert.match(page, /Sending as/); assert.match((await get(`/fr/owner/${t}`)).text, /Image \(facultatif\)/);
});

// ---------- 14: staff access line ----------
test('14: the edit page and the setup welcome say managers and staff can use the link, each with their own login (EN + FR)', async () => {
  const v = mk('restaurant'); const t = tokenFor(v.id);
  assert.match((await get(`/owner/${t}`)).text, /Managers and staff can use this link too\. Each person can make their own login from it/);
  assert.match((await get(`/fr/owner/${t}`)).text, /Les gérants et le personnel peuvent aussi utiliser ce lien/);
  const js = scriptOf((await get(`/owner/${t}/setup`)).text);
  assert.doesNotMatch(js, /id="suStaff"/); // café test 4: the setup's first screen no longer says it (the edit page does)
  assert.match(TEXT.en.staffLine, /People with access/); assert.match(TEXT.fr.staffLine, /Personnes ayant accès/);
});
