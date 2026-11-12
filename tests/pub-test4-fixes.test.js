// Fourth first-time pub test fixes (Dayton, Nov 10 2026; drafts/fresh-eyes-pub4-2026-11-10/REPORT.md). The setup is
// shared, so restaurants get the same fixes: a short hours screen (Change one day at a time), "Add another page" before
// "Send my menu", a "No dogs allowed" answer, "Not sure? Skip" on the spend question, and wording (Local or craft beer,
// no Instagram line on the Facebook screen, a blank kitchen time).
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'pub-test4-admin';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const pc = require('../portal-completeness.js');
const TEXT = require('../owner-setup-text.js');
const sent = [];
app.setVenueSubmissionTransport(async (m) => { sent.push(m); });

const WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['11:00', '23:00']]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `PT4 ${type} ${++n}`, slug: `pt4-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.3, address: `${n} Main St, Penticton`, phone: '250-555-0100', hours: WEEK, description: 'A fixture used only by the fourth pub test fix tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const text = (p) => get(p).then((r) => r.text);
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.94.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const change = (t, changes, setup = true) => post(`/owner/${t}/changes${setup ? '?from=setup' : ''}`, { changes, ...(setup ? { from_setup: true } : {}), note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const progress = (t, step, status) => post(`/owner/${t}/setup/progress`, { step, status });
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/.exec(html)[1]);
const scriptOf = (html) => /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });

// ---------- 1: a short hours screen ----------
test('1: hours start as a short list of the 7 days, each with a big Change button; only tapped days open (pubs and restaurants)', async () => {
  for (const type of ['pub', 'restaurant']) {
    const html = await text(`/owner/${tokenFor(mk(type).id)}/setup`), s = scriptOf(html), cfg = cfgOf(html);
    assert.equal(cfg.t.hoursChange, 'Change');
    assert.equal(cfg.t.hoursEditLead, 'Tap Change beside any day that’s different. The other days stay as they are.');
    // A closed row is a summary and a Change button: no time boxes, so nothing in it is read or changed on Save.
    const row = /if \(!hop\[d\]\) return ([\s\S]*?);\n/.exec(s); // pub test 6: hop = the usual week's or the season's open days
    assert.ok(row, 'the folded row');
    assert.match(row[1], /data-hopen="' \+ d \+ '"/);
    assert.match(row[1], /h\(T\.hoursChange\)/);
    assert.doesNotMatch(row[1], /data-h=|type="time"/, 'a folded day has no time boxes');
    // With no hours yet, Monday opens so there is somewhere to start; otherwise every day starts folded.
    assert.match(s, /if \(!seas && !S\.hoursOpenSet\) \{ S\.hoursOpenSet = true; S\.hoursOpen = \{\}; if \(!DAYS\.some\(function\(d\)\{ return S\.week\[d\]; \}\)\) S\.hoursOpen\.mon = true; \}/);
    // An open day keeps everything it had: Open/Closed, the times, Midnight / 1 AM / 2 AM, the early-morning note, Same as.
    assert.match(s, /\(j === w\.length - 1 \? lateBtns\(d, j, y\) : ''\)/);
    assert.match(s, /id="suLate' \+ d \+ j \+ '"/);
    assert.doesNotMatch(s, /id="suLateHint"/); // café test 4: said once, beside each day's buttons
    assert.match(s, /data-same="' \+ d \+ '"/); assert.match(s, /data-samemon="' \+ d \+ '"/);
    // Copy shortcuts: every day, or Mon–Fri.
    // Pub test 5: "Every open day" unless no other day is open; a day marked Closed is never reopened by a copy.
    assert.match(s, /data-copyall="' \+ d \+ '">' \+ h\(DAYS\.every\(function\(x\)\{ return x === d \|\| copyGets\(d, x\); \}\) \? T\.copyAll : T\.copyOpen\)/); // café test 4
    assert.match(s, /data-copywk="' \+ d \+ '">' \+ h\(T\.copyWeek\)/);
    assert.match(s, /gets\.forEach\(function\(x\)\{ if \(all \|\| \(we \? \['sat', 'sun'\] : \['mon', 'tue', 'wed', 'thu', 'fri'\]\)\.indexOf\(x\) >= 0\) wk\[x\] = clone\(src\); \}\);/); // café test 5: Sat–Sun too // café test 4: copyGets
    // Saving sends the whole week as before (every day, opened or not).
    assert.match(s, /var week = \{\}; DAYS\.forEach\(function\(d\)\{ week\[d\] = S\.week\[d\] \|\| \[\]; \}\);/);
    assert.match(html, /\.su-hchg \{[^}]*min-height: 56px;/, 'the Change button is big enough to tap');
  }
  for (const k of ['hoursEditLead', 'hoursChange', 'hoursChangeDay', 'hoursDoneDay', 'copyTo', 'copyAll', 'copyWeek']) assert.ok(TEXT.fr[k] && TEXT.fr[k] !== TEXT.en[k], `FR ${k}`);
  assert.equal(TEXT.fr.hoursChange, 'Modifier');
});

test('1b: saving the week with only Friday and Saturday changed stores exactly that; untouched days keep their hours', async () => {
  const v = mk('pub', { hours: JSON.stringify({ mon: [['11:00', '23:00']], tue: [['11:00', '23:00']], wed: [], thu: [['11:00', '23:00']], fri: [['11:00', '23:00']], sat: [['10:00', '23:30']], sun: [['11:00', '22:00']] }) });
  const t = tokenFor(v.id);
  const cur = JSON.parse(cfgOf(await text(`/owner/${t}/setup`)).cur.hours);
  // What the client sends: the stored week with the two tapped days changed.
  const week = { ...cur, fri: [['11:00', '02:00']], sat: [['10:00', '02:00']] };
  const r = await change(t, { hours: week, hours_checked: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const after = JSON.parse(app.getVenue(v.id).hours);
  assert.deepEqual(after.fri, [['11:00', '02:00']]);
  assert.deepEqual(after.sat, [['10:00', '02:00']]);
  for (const d of ['mon', 'tue', 'thu', 'sun']) assert.deepEqual(after[d], cur[d], d);
  assert.ok(!after.wed || !after.wed.length, 'a closed day stays closed');
});

// ---------- 2: menu photos ----------
test('2: after a menu page, "Add another page" is the first, main button and "Send my menu" comes second', async () => {
  const s = scriptOf(await text(`/owner/${tokenFor(mk('pub').id)}/setup`));
  const cam = /\} else if \(s === 'menu:cam'\) \{([\s\S]*?)\} else if/.exec(s)[1];
  assert.match(cam, /\(S\.busy \? '' : big\('📷', n \? T\.camMore : T\.camTake, '', !!\(n && S\.error\), 'menuCam'\)\) \+ \(n && !S\.error && !S\.busy \? big\('✓', T\.sendMenu, '', true, 'sendMenuPages'\) : ''\)/);
  assert.ok(cam.indexOf("'menuCam'") < cam.lastIndexOf("'sendMenuPages'"), 'Add another page before Send');
  // Only a failed send puts "Try again" first.
  assert.match(cam, /\(n && \(S\.error \|\| S\.busy\) \? big\('✓', S\.error \? T\.tryAgain : T\.sendMenu, '', false, 'sendMenuPages'\) : ''\)/);
  // The same for menu files chosen from the phone.
  assert.match(s, /\(isMenu && files\.length && !S\.error && !S\.busy \? big\('✓', T\.sendMenu, '', true, 'sendMenuFiles'\) : ''\)/);
  assert.equal(TEXT.en.camMore, 'Add another page');
  assert.match(TEXT.en.camLeadSome, /Add it first/);
  assert.ok(TEXT.fr.camLeadSome.includes('d’abord'));
});

// ---------- 3: No dogs allowed ----------
test('3: "No dogs allowed" is a tile on What you offer (pubs and restaurants), stored as the not-offered answer "dogs"', async () => {
  for (const type of ['pub', 'restaurant']) {
    const html = await text(`/owner/${tokenFor(mk(type).id)}/setup`), s = scriptOf(html), cfg = cfgOf(html);
    assert.equal(cfg.t.noDogs, 'No dogs allowed');
    assert.ok(cfg.offerGroups.some((g) => g.keys.includes('dog_friendly')), `${type} has the Dog friendly tile`);
    assert.match(s, /\(g\.keys\.indexOf\('dog_friendly'\) >= 0 \? '<button type="button" class="su-tile su-tile-wide" aria-pressed="' \+ \(S\.noDogs \? 'true' : 'false'\) \+ '" data-off="no_dogs">/);
    // Picking one turns the other off.
    // Pub test 8: un-ticking No dogs also un-ticks its "Service dogs welcome" follow-up.
    assert.match(s, /if \(k === 'no_dogs'\) \{ S\.noDogs = !S\.noDogs; press\('no_dogs', S\.noDogs\); if \(S\.noDogs\) \{ S\.badges\.dog_friendly = false; press\('dog_friendly', false\); \} else \{ S\.badges\.service_dogs = false; press\('service_dogs', false\); \} sdog\(\); return; \}/);
    assert.match(s, /if \(k === 'dog_friendly' && S\.badges\[k\]\) \{ S\.noDogs = false; press\('no_dogs', false\); S\.badges\.service_dogs = false; press\('service_dogs', false\); sdog\(\); \}/);
    // Saved in order: "no dogs" taken back before Dog friendly goes on; given after it goes off.
    assert.ok(s.indexOf("list.push({ not_offered: { remove: ['dogs'] } })") < s.indexOf("list.push({ badges: badges });"));
    assert.ok(s.indexOf("list.push({ not_offered: { add: ['dogs'] } })") > s.indexOf("list.push({ badges: badges });"));
  }
  assert.equal(TEXT.fr.noDogs, 'Chiens non admis');
  assert.ok(TEXT.fr.noDogsSub);
  assert.ok(pc.noneKeysFor('restaurant').includes('dogs') && pc.noneKeysFor('pub').includes('dogs'));
  assert.ok(!pc.NONE_KEYS.includes('dogs'), 'not a checklist item');
  assert.ok(!pc.itemsFor('pub').some((i) => i.key === 'dogs') && !pc.itemsFor('restaurant').some((i) => i.key === 'dogs'), 'never scored');
  assert.equal(pc.GOT_TEXT.dogs.en, 'Got it: no dogs allowed');
});

test('3b: No dogs and Dog friendly are never both; the answer counts as given, scores nothing and shows nothing new publicly', async () => {
  for (const type of ['pub', 'restaurant']) {
    const v = mk(type, { dog_friendly: 1 }), t = tokenFor(v.id);
    const before = (await progress(t, 'offer', 'skip')).body.score.pct;
    // Dog friendly is on: "no dogs" alone is refused (the page shows dogs).
    let r = await change(t, { not_offered: ['dogs'] });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.ok(r.body.errors.not_offered);
    // The setup's order: Dog friendly off, then "no dogs".
    r = await change(t, { badges: { dog_friendly: false } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    r = await change(t, { not_offered: ['dogs'] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    let cfg = cfgOf(await text(`/owner/${t}/setup`));
    assert.deepEqual(cfg.cur.not_offered, ['dogs']);
    assert.equal(!!cfg.cur.badges.dog_friendly, false);
    const after = (await progress(t, 'offer', 'live')).body.score.pct;
    assert.ok(after >= before, 'no penalty');
    // Pub test 8 (approved): the answer now shows publicly as one short line, and nothing else.
    const html = page(v, 'en');
    assert.match(html, /<strong>No dogs<\/strong>/);
    assert.doesNotMatch(html, /Dogs not allowed|no dogs allowed/i);
    assert.doesNotMatch(html, /Dogs OK|Dog-friendly|Dog friendly/);
    // Research never turns Dog friendly back on.
    const am = app.guardedAmenityCorrectUpdate(v.id, { dog_friendly: { expectedCurrent: false, corrected: true } }, { reason: 'pt4', batch_id: 'pt4', source_url: 'https://example.com/' });
    assert.equal(am.results.dog_friendly, 'rejected_owner_not_offered');
    // Ticking Dog friendly again takes back "no dogs" (the edit page has no Undo for it).
    r = await change(t, { badges: { dog_friendly: true } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    cfg = cfgOf(await text(`/owner/${t}/setup`));
    assert.deepEqual(cfg.cur.not_offered, []);
    assert.equal(cfg.cur.badges.dog_friendly, true);
    // Both at once is refused.
    r = await change(t, { badges: { dog_friendly: true }, not_offered: ['dogs'] });
    assert.equal(r.status, 400, JSON.stringify(r.body));
  }
});

// ---------- 4: Not sure? Skip ----------
test('4: "About $24 a person?" has a "Not sure? Skip" that leaves the question open, scores nothing and stops asking on that screen', async () => {
  const v = mk('pub');
  app.guardedAvgSpendUpdate(v.id, null, { amount: 24, source: 'research', source_url: 'https://example.com/', basis: 'Estimated', checked_at: app.todayLocal() }, { reason: 'pt4', batch_id: 'pt4' });
  const t = tokenFor(v.id);
  const html = await text(`/owner/${t}/setup`), s = scriptOf(html), cfg = cfgOf(html);
  assert.equal(cfg.t.spendSkip, 'Not sure? Skip');
  assert.equal(TEXT.fr.spendSkip, 'Je ne sais pas, passer'); // café test 6 wording
  // Yes and No are as they were; the skip is a quiet link under them.
  assert.match(s, /big\('✓', fill\(T\.spendAskYes, \{ n: n \}\), '', false, 'spendConfirm'\) \+ big\('✎', T\.spendAskNo, '', true, 'jump:spend'\) \+ '<\/div>'/);
  assert.match(s, /data-act="spendSkip">' \+ h\(T\.spendSkip\)/);
  assert.match(s, /if \(k === 'spendSkip'\) \{ S\.spendNotSure = true; if \(answered\('spend'\) \|\| S\.done\.spend === 'skip'\) return render\(\); return record\('spend', 'skip', function\(\)\{ render\(\); \}\); \}/);
  // The finish list leaves it out once she said "Not sure" (both the setup's own list and the checklist's).
  assert.match(s, /if \(k === 'spend' && S\.spendNotSure\) return;/);
  assert.match(s, /\(st === 'spend' && S\.spendNotSure\)/);
  // On the server: a skip is just "skipped", the score doesn't move and the research number stays.
  const a = (await progress(t, 'basics', 'live')).body.score;
  const b = (await progress(t, 'spend', 'skip')).body;
  assert.equal(b.ok, true);
  assert.equal(b.score.pct, a.pct);
  assert.equal(b.score.soon, a.soon);
  assert.equal(cfgOf(await text(`/owner/${t}/setup`)).cur.avg_spend.source, 'research');
});

// ---------- 5: wording ----------
test('5a: "Local or craft beer on tap" for owners and the public, EN and FR; the stored key is the same', async () => {
  const v = mk('pub'), t = tokenFor(v.id);
  assert.equal(cfgOf(await text(`/owner/${t}/setup`)).offerLabels.local_beer_taps, 'Local or craft beer on tap');
  assert.equal(cfgOf(await text(`/fr/owner/${t}/setup`)).offerLabels.local_beer_taps, 'Bière locale ou artisanale en fût');
  const r = await change(t, { badges: { local_beer_taps: true } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(page(v, 'en').includes('Local or craft beer on tap'));
  assert.doesNotMatch(page(v, 'en'), /Local beer on tap/);
  assert.equal(app.MAP_OWNER_FEATURES.find((f) => f.key === 'localbeer').owner, 'local_beer_taps');
  // The map's "Must have" chip, and its EN/FR chip words.
  assert.equal(app.MAP_MUST_HAVES.find((f) => f.key === 'localbeer').label, 'Local or craft beer on tap');
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /localbeer: 'Local or craft beer on tap'[,} ]/);
  assert.match(src, /localbeer: 'Bière locale ou artisanale en fût'[,} ]/);
  assert.doesNotMatch(src, /'Local beer on tap'|'Bière locale en fût'/);
});

test('5b: the Facebook screen no longer mentions Instagram; the Instagram screen keeps its own words', async () => {
  for (const lang of ['en', 'fr']) {
    assert.doesNotMatch(TEXT[lang].fbWhy, /Instagram/);
    assert.doesNotMatch(TEXT[lang].savedFbName, /Instagram/);
  }
  assert.equal(TEXT.en.fbWhy, 'Paste the link and it shows on your page right away. Only know the name? Type it and we’ll find the link.'); // café test 4: a link is live right away
  const html = await text(`/owner/${tokenFor(mk('pub').id)}/setup`), cfg = cfgOf(html);
  assert.doesNotMatch(cfg.t.fbWhy + cfg.t.fbLead + cfg.t.fbQ, /Instagram/);
  assert.match(cfg.t.igLead, /Instagram/);
});

test('5c: the kitchen time starts blank (a saved time is shown) and Save asks gently when it is missing', async () => {
  const v = mk('pub'), t = tokenFor(v.id);
  let html = await text(`/owner/${t}/setup`);
  const s = scriptOf(html);
  assert.match(s, /closes: \(S\.pubInfo\.kitchen \|\| \{\}\)\.closes \|\| '',/);
  assert.doesNotMatch(s, /\|\| '22:00'/);
  assert.match(s, /if \(!\/\^\\d\{2\}:\\d\{2\}\$\/\.test\(S\.kitchen\.closes\)\) \{ S\.nudge = T\.kitchenNeed; return render\(\); \}/);
  assert.equal(cfgOf(html).t.kitchenNeed, 'Please pick the time your kitchen closes.');
  assert.ok(TEXT.fr.kitchenNeed);
  // A saved kitchen time comes back.
  const r = await change(t, { pub_info: { kitchen: { mode: 'earlier', closes: '21:00' } } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  html = await text(`/owner/${t}/setup`);
  assert.equal(cfgOf(html).cur.pub_info.kitchen.closes, '21:00');
});

test('every new setup string has a French version', () => {
  for (const k of ['hoursEditLead', 'hoursChange', 'hoursChangeDay', 'hoursDoneDay', 'copyTo', 'copyAll', 'copyWeek', 'camLeadSome', 'noDogs', 'noDogsSub', 'spendSkip', 'fbWhy', 'kitchenNeed']) {
    assert.ok(TEXT.en[k], `EN ${k}`);
    assert.ok(TEXT.fr[k], `FR ${k}`);
  }
});
