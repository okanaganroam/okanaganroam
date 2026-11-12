// Third first-time pub test fixes (Dayton, Nov 10 2026; drafts/fresh-eyes-pub3-2026-11-10/REPORT.md). The setup is
// shared, so restaurants get the same fixes: the ✕ clear button, after-midnight buttons, one percentage, the phone going
// live, Instagram by Facebook, wording, the "To reach 100%" list, and bugs (menu by email, heated patio, preview place
// type, kid-friendly for pubs).
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'pub-test3-admin';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const pc = require('../portal-completeness.js');
const TEXT = require('../owner-setup-text.js');
const sent = [];
app.setVenueSubmissionTransport(async (m) => { sent.push(m); });

const WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['11:00', '23:00']]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `PT3 ${type} ${++n}`, slug: `pt3-${type}-${n}`, region: 'vernon', type, latitude: 50.26 + n / 1000, longitude: -119.27,
  rating: 4.3, address: `${n} 30 Ave, Vernon`, phone: '250-555-0100', hours: WEEK, description: 'A fixture used only by the third pub test fix tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const text = (p) => get(p).then((r) => r.text);
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.93.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const change = (t, changes, setup = true) => post(`/owner/${t}/changes${setup ? '?from=setup' : ''}`, { changes, ...(setup ? { from_setup: true } : {}), note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const progress = (t, step, status) => post(`/owner/${t}/setup/progress`, { step, status });
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/.exec(html)[1]);
const scriptOf = (html) => /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });

// ---------- 1: the ✕ clear button ----------
test('1: a ✕ inside every filled text box empties it and keeps the cursor there (EN+FR label, tap-sized)', async () => {
  const html = await text(`/owner/${tokenFor(mk('pub').id)}/setup`), s = scriptOf(html);
  // Pub test 7: the story box gets one too.
  assert.match(s, /querySelectorAll\('input\.su-field\[type=text\], input\.su-field\[type=tel\], input\.su-field\[type=search\], textarea\.su-area'\)/);
  assert.match(s, /b\.onclick = function\(\)\{ inp\.value = ''; b\.hidden = true; try \{ inp\.focus\(/);
  assert.match(s, /b\.addEventListener\('mousedown', keep\)/, 'tapping it never takes the cursor out of the box');
  assert.match(s, /b\.hidden = !inp\.value/, 'only on a filled box');
  assert.match(html, /\.su-clear \{[^}]*width: 52px; height: 52px;/, 'big enough to tap on a phone');
  assert.equal(TEXT.en.clearField, 'Clear this box');
  assert.equal(TEXT.fr.clearField, 'Effacer ce champ');
});

// ---------- 2: after midnight ----------
test('2: Midnight / 1 AM / 2 AM buttons under each day, and the early-morning hint up front (pubs and restaurants)', async () => {
  for (const type of ['pub', 'restaurant']) {
    const html = await text(`/owner/${tokenFor(mk(type).id)}/setup`), s = scriptOf(html), cfg = cfgOf(html);
    assert.match(s, /var LATE = \['00:00', '01:00', '02:00'\];/);
    assert.match(s, /\(j === w\.length - 1 \? lateBtns\(d, j, y\) : ''\)/, 'under the day’s last closing time');
    assert.match(s, /data-late="' \+ d \+ ':' \+ j \+ ':' \+ t \+ '">' \+ h\(t12\(t\)\)/);
    assert.match(s, /w4\[1\] = q4\[2\] \+ ':' \+ q4\[3\]; mark\(\);/, 'a tap sets that closing time');
    assert.doesNotMatch(s, /id="suLateHint"/); // café test 4: said once, beside each day's buttons // pub test 6: the season screen shares it
    assert.match(cfg.t.lateHint, /1 AM early Saturday morning/);
  }
  assert.match(TEXT.fr.lateHint, /1 h tôt samedi matin/);
  assert.ok(TEXT.fr.lateLbl && TEXT.fr.lateQ);
});

// ---------- 3: one percentage ----------
test('3: one number: the setup and the edit page both show the score that counts what was sent; the badge stays live-only', async () => {
  const v = mk('pub');
  const t = tokenFor(v.id);
  await progress(t, 'basics', 'live');
  // Something sent for our check (a website) and something sent to type up (the menu, via "help").
  assert.equal((await change(t, { website: 'lakesidepub3.example' })).status, 201);
  const sc = (await get(`/owner/${t}/setup/progress`).then((r) => JSON.parse(r.text))).score;
  assert.ok(sc.soon > sc.pct, `soon ${sc.soon} > now ${sc.pct}`);
  const edit = await text(`/owner/${t}`);
  const card = edit.slice(edit.indexOf('id="opComplete"'), edit.indexOf('id="opCbPanel"'));
  // Café test 4 (2026-11-11): no percent on the edit page; the number it remembers is still the setup's.
  assert.match(card, new RegExp(`data-cb-pct="${sc.soon}"`), 'the edit page keeps the setup’s number');
  assert.doesNotMatch(card, /% complete|counts what you sent|op-cb-ring/);
  assert.doesNotMatch(card, /% now<\/strong>/);
  // Badge: only live data counts. A result whose only missing item is waiting is not "earned".
  const r = { ...pc.scoreCompleteness({}, { today: app.todayLocal() }) };
  const waitingOnly = { ...r, complete: false, pct: 90, pctWithWaiting: 100, missing: [{ key: 'menu', waiting: true, w: 1 }] };
  assert.equal(pc.badgeState(waitingOnly, true), 'none');
  assert.match(pc.renderCompleteness(waitingOnly, { claimed: true }), /Reach 100% to earn/);
  // The setup: never "ready" beside the number; the finish screen's bar says "saved" while things are left.
  const s = scriptOf(await text(`/owner/${t}/setup`));
  assert.equal(TEXT.en.essReady, 'The essentials are done');
  assert.equal(TEXT.fr.essReady, 'L’essentiel est fait');
  assert.match(s, /s === 'finish' \? \(leftList\(\)\.length \? T\.finishBar : T\.allDone\)/);
  assert.ok(TEXT.fr.finishBar);
});

// ---------- 4: the phone goes live ----------
test('4: a phone sent from the setup goes live at once, written 250-555-0123, logged with the old one; bad numbers are refused', async () => {
  const v = mk('pub');
  const t = tokenFor(v.id);
  const bad = await change(t, { phone: '555-0177' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.errors.phone, /10-digit phone number/);
  assert.equal((await change(t, { phone: '150-555-0177' })).status, 400, 'an area code can’t start with 1');
  assert.equal((await change(t, { phone: '250-155-0177' })).status, 400, 'nor an exchange');
  assert.equal((await change(t, { phone: 'call 250 555 0177' })).status, 400);
  const ok = await change(t, { phone: '+1 (250) 555 0177' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.live, ['phone']);
  assert.deepEqual(ok.body.review, []);
  assert.equal(app.getVenue(v.id).phone, '250-555-0177');
  const row = db.prepare("SELECT changes, previous, instant FROM owner_change_requests WHERE venue_id = ? AND instant = 1 ORDER BY id DESC LIMIT 1").get(v.id);
  assert.equal(JSON.parse(row.changes).phone, '250-555-0177');
  assert.equal(JSON.parse(row.previous).phone, '250-555-0100', 'the old number is kept for Undo');
  // The same digits typed another way: nothing changed.
  const same = await change(t, { phone: '(250) 555-0177' });
  assert.equal(same.status, 400);
  assert.ok(same.body.errors.form);
  const ext = await change(t, { phone: '250.555.0188 ext 12' });
  assert.equal(ext.status, 201);
  assert.equal(app.getVenue(v.id).phone, '250-555-0188 ext. 12');
  // French error.
  const frBad = await post(`/fr/owner/${t}/changes?from=setup`, { changes: { phone: '12' }, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
  assert.match(frBad.body.errors.phone, /10 chiffres/);
  // The classic edit page keeps its rules (reviewed), and its "sent" line names the phone.
  const w = mk('pub'); const tw = tokenFor(w.id);
  await progress(tw, 'basics', 'live');
  const cl = await change(tw, { phone: '250-555-0199' }, false);
  assert.equal(cl.status, 201);
  assert.deepEqual(cl.body.review, ['phone']);
  assert.equal(app.getVenue(w.id).phone, '250-555-0100');
  const edit = await text(`/owner/${tw}`);
  assert.match(edit, /class="op-cb-sentline">Phone sent\. We’ll add it within a day\./);
  // Setup words: the phone is no longer "within a day".
  assert.doesNotMatch(TEXT.en.helpTail, /phone number, if you changed it/);
  assert.match(TEXT.en.helpTail, /new phone number and everything else is on your page right away/);
  assert.match(TEXT.fr.helpTail, /nouveau numéro de téléphone et tout le reste sont en ligne tout de suite/);
  assert.equal(app.ownerNanpPhone('1-250-555-0123'), '250-555-0123');
  assert.equal(app.ownerNanpPhone('250 555 0123 x 9'), '250-555-0123 ext. 9');
  assert.equal(app.ownerNanpPhone('+44 20 7946 0958'), null);
});

test('4b: the pending line names every field that is waiting', () => {
  const r = { ...pc.scoreCompleteness({}, { today: app.todayLocal() }) };
  const html = pc.renderCompleteness({ ...r, waiting: [{ key: 'photo_main', en: 'Photos', fr: 'Photos', w: 1, waiting: true, icon: '📷' }] }, { plainWaiting: true, pendingFields: ['website', 'phone'] });
  assert.match(html, /Photos, website and phone sent\. We’ll add them within a day\./);
  const fr = pc.renderCompleteness({ ...r, waiting: [] }, { plainWaiting: true, fr: true, pendingFields: ['phone'] });
  assert.match(fr, /Téléphone : envoyé\./);
});

// ---------- 5: Instagram next to Facebook ----------
test('5: Instagram is a top tile beside Facebook; the "Add more" subtitle names both', async () => {
  const s = scriptOf(await text(`/owner/${tokenFor(mk('pub').id)}/setup`));
  assert.match(s, /var social = open\.filter\(function\(k\)\{ return k === 'facebook' \|\| k === 'instagram'; \}\)/);
  assert.match(s, /concat\(social\.map\(function\(k\)\{ return T\.labels\[k\]; \}\)\)/, 'named with their capital letters');
  // Run moreSub() on its own.
  const src = /function moreSub\(\)\{[\s\S]*?\n  \}/.exec(s)[0];
  const ctx = { P2: ['music', 'specials', 'story', 'groups', 'spend', 'known', 'book', 'takeout', 'instagram', 'facebook', 'door'], C: { pub: true }, T: { ...TEXT.en }, answered: () => false };
  vm.createContext(ctx); vm.runInContext(src + '; this.moreSub = moreSub;', ctx);
  assert.equal(ctx.moreSub(), 'Optional: weekly events, Instagram, Facebook and more');
});

// ---------- 6 & 7: wording ----------
test('6–7: the sports tip, the events question once, "Save kitchen time", one "within a day", and why Facebook takes a day', async () => {
  const html = await text(`/owner/${tokenFor(mk('pub').id)}/setup`), s = scriptOf(html), cfg = cfgOf(html);
  assert.match(cfg.t.sportsEx, /^Tip: /);
  assert.doesNotMatch(cfg.t.sportsEx, /\?/, 'not a question to answer');
  assert.match(TEXT.fr.pub.sportsEx, /^Astuce : /);
  assert.match(s, /'<p class="su-hint" id="suSportsTip">' \+ h\(T\.sportsEx\)/);
  assert.doesNotMatch(s, /ex\(T\.sportsEx\)/);
  assert.equal(s.split('h(T.whatEvent)').length - 1, 1, 'the events question is written once');
  assert.match(s, /aria-labelledby="ntq' \+ i \+ '"/);
  assert.equal(cfg.t.saveKitchen, 'Save kitchen time');
  assert.match(s, /big\('✓', T\.saveKitchen, '', false, 'kitchenSave'\)/);
  assert.equal(TEXT.fr.pub.saveKitchen, 'Enregistrer l’heure de la cuisine');
  assert.match(s, /if \(explain\) line = T\.sentMeans;/);
  assert.doesNotMatch(s, /'<p class="su-hint" id="suSentMeans">'/, 'no second line under the lead');
  assert.equal(cfg.t.fbWhy, 'Paste the link and it shows on your page right away. Only know the name? Type it and we’ll find the link.'); // pub test 4: no Instagram line // café test 4: a link is live right away
  assert.ok(TEXT.fr.fbWhy);
  assert.match(s, /\(ig \? '' : '<p class="su-hint" id="suFbWhy">' \+ h\(T\.fbWhy\) \+ '<\/p>'\)/);
});

// ---------- 8: "To reach 100%" ----------
test('8: the front door waits for a visit; a researched spend asks "About $24 a person?" Yes / No', async () => {
  const v = mk('pub');
  app.guardedAvgSpendUpdate(v.id, null, { amount: 24, source: 'research', source_url: 'https://example.com/', basis: 'Estimated', checked_at: app.todayLocal() }, { reason: 'pt3', batch_id: 'pt3' });
  const t = tokenFor(v.id);
  const html = await text(`/owner/${t}/setup`), s = scriptOf(html), cfg = cfgOf(html);
  assert.equal(cfg.cur.avg_spend.amount, 24);
  assert.match(s, /fill\(T\.doorNextTime, \{ type: C\.typeWord \}\)/);
  assert.equal(TEXT.en.doorNextTime.replace('{type}', 'pub'), 'Do this next time you’re at your pub');
  assert.ok(TEXT.fr.doorNextTime.includes('{type}'));
  assert.equal(TEXT.en.spendAsk.replace('{n}', 24), 'About $24 a person?');
  assert.equal(TEXT.fr.spendAsk.replace('{n}', 24), 'Environ 24 $ par personne?');
  assert.match(s, /big\('✓', fill\(T\.spendAskYes, \{ n: n \}\), '', false, 'spendConfirm'\) \+ big\('✎', T\.spendAskNo, '', true, 'jump:spend'\)/);
  // Yes saves her number through the usual avg_spend save (shown publicly only when AVG_SPEND_PUBLIC is on).
  assert.match(s, /if \(k === 'spendConfirm'\) \{ S\.spend = spendGuess\(\) \|\| S\.spend; S\.toFinish = true; if \(!C\.spendPublic\) S\.savedLine\.spend = T\.savedSpendOff; return saveAll\('spend', \[\{ avg_spend: S\.spend \}\]/);
  assert.equal(cfg.spendPublic, false);
  const r = await change(t, { avg_spend: 24 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(app.getVenue(v.id).avg_spend == null || !/\$24 a person|24 \$ par personne/.test(page(v, 'en')), true, 'not public while the flag is off');
});

// ---------- 9: menu by email ----------
test('9: "I’ll email it" is a row in the admin menu queue ("Menu expected by email"), with no email sent; sending the menu closes it', async () => {
  const v = mk('pub');
  const t = tokenFor(v.id);
  const before = sent.length;
  assert.equal((await progress(t, 'menu', 'email')).status, 200);
  const row = db.prepare("SELECT * FROM venue_menus WHERE venue_id = ? AND help_kind = 'menu_email'").get(v.id);
  assert.ok(row, 'recorded');
  assert.equal(row.status, 'help');
  assert.match(row.help_note, /I’ll email it/);
  assert.equal(sent.length, before, 'no email to anyone');
  // Saying it again only refreshes the one row.
  await progress(t, 'menu', 'email');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM venue_menus WHERE venue_id = ? AND help_kind = 'menu_email'").get(v.id).n, 1);
  const admin = app.renderAdminReviewPage();
  assert.match(admin, /Menu by email #\d+ · <strong>Menu expected by email<\/strong>/);
  assert.match(admin, new RegExp(v.name));
  // The owner's "Your updates" says it plainly.
  assert.match(await text(`/owner/${t}`), /You’ll email us your menu/);
  // The menu arrives through the setup after all: the row closes.
  await progress(t, 'menu', 'day');
  assert.equal(db.prepare("SELECT status FROM venue_menus WHERE venue_id = ? AND help_kind = 'menu_email'").get(v.id).status, 'removed');
  // The score is unchanged by it (an email not sent yet is not "sent").
  const sc = (await get(`/owner/${t}/setup/progress`).then((r) => JSON.parse(r.text))).score;
  assert.ok(sc.left.some((it) => it.k === 'menu'));
});

// ---------- 10: heated patio ----------
test('10: a heated patio leads the highlights as "Heated patio" (FR "Terrasse chauffée"); pubs and restaurants', async () => {
  for (const type of ['pub', 'restaurant']) {
    const v = mk(type, { patio: 1, dog_friendly: 1, sports_tv: 1, lake_view: 1, live_music: 1 });
    const t = tokenFor(v.id);
    const before = page(v, 'en');
    assert.doesNotMatch(before, /Heated patio/);
    const r = await change(t, { badges: { heated_patio: true } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const app2 = require('../server.js');
    const hl = (type === 'pub' ? app2.pubHighlights : null);
    const en = page(v, 'en');
    assert.match(en, /Heated patio/);
    if (hl) {
      const list = hl(app.getVenue(v.id), null, {});
      assert.deepEqual(list.slice(0, 2).map((x) => x[1]), [list[0][1], 'Heated patio']);
      assert.match(list[0][1], /^Sports/);
      assert.ok(!list.some((x) => x[1] === 'Patio'), 'never plain "Patio" as well');
    } else {
      const fd = require('../food-drink-venue-layout.js');
      const list = fd.highlightsFor({ ...app.getVenue(v.id), patio: true }, null, { highlightFirst: ['patio'], highlightLabels: { patio: 'Heated patio' } });
      assert.equal(list[0][1], 'Heated patio');
    }
    const fr = page(v, 'fr');
    assert.match(fr, /Terrasse chauffée/);
  }
});

// ---------- 11: preview place type ----------
test('11: the setup preview card shows the kind of place, as the public page does', async () => {
  const v = mk('pub');
  const t = tokenFor(v.id);
  await change(t, { cuisines: ['Pub Fare', 'Fish & Chips'], place_type: 'Neighbourhood pub' });
  const html = await text(`/owner/${t}/setup`), s = scriptOf(html), cfg = cfgOf(html);
  const src = /function preview\(\)\{[\s\S]*?\n  \}/.exec(s)[0];
  const h = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ctx = { C: cfg, T: cfg.t, S: { cuis: cfg.cur.cuisines, place: cfg.cur.place_type, done: {}, spend: 25 }, h, fill: (x, o) => String(x).replace(/\{(\w+)\}/g, (m, k) => (o[k] != null ? o[k] : m)) };
  vm.createContext(ctx); vm.runInContext(src + '; this.preview = preview;', ctx);
  const out = ctx.preview();
  assert.match(out, /Pub Fare · Fish &amp; Chips · Neighbourhood pub · Vernon/);
  assert.match(page(v, 'en'), /Neighbourhood pub/);
});

// ---------- 12: kid-friendly for pubs ----------
test('12: one rule for kid-friendly pubs: all ages or minors-until count, adults-only and no answer don’t; restaurants unchanged', async () => {
  const mkPub = async (policy) => { const v = mk('pub', { kid_friendly: 1 }); if (policy) await change(tokenFor(v.id), { pub_info: { minors: policy === 'minors_until' ? { policy, until: '20:00' } : { policy } } }); return v; };
  const adults = await mkPub('adults'), until = await mkPub('minors_until'), all = await mkPub('all_ages'), none = await mkPub(null);
  const rest = mk('restaurant', { kid_friendly: 1 }), restNo = mk('restaurant');
  const want = new Map([[adults.id, false], [until.id, true], [all.id, true], [none.id, false], [rest.id, true], [restNo.id, false]]);
  for (const [id, on] of want) {
    const row = db.prepare('SELECT * FROM venues WHERE id = ?').get(id);
    assert.equal(app.kidFriendlyPublic(row), on, `helper for #${id}`);
    assert.equal(app.getVenue(id).kid_friendly, on, `venue object for #${id}`);
    const inSql = !!db.prepare(`SELECT 1 FROM venues WHERE id = ? AND ${app.badgeTrueSql('kid_friendly')}`).get(id);
    assert.equal(inSql, on, `SQL filter (browse, guides) for #${id}`);
  }
  // The API filter (browse/map list), and the stored research flag untouched.
  const list = JSON.parse((await get('/api/venues?kid_friendly=1&limit=2000')).text);
  const ids = new Set((list.venues || list.data || list).map((x) => x.id));
  for (const [id, on] of want) assert.equal(ids.has(id), on, `API #${id}`);
  for (const v of [adults, until, all, none]) assert.equal(db.prepare('SELECT kid_friendly FROM venues WHERE id = ?').get(v.id).kid_friendly, 1);
  // The near-me map's Kids bit.
  const kidsBit = 32;
  const row = (id) => app.mapPlacesData().find((p) => p[5].endsWith(app.getVenue(id).slug));
  assert.equal(row(adults.id)[7] & kidsBit, 0);
  assert.equal(row(until.id)[7] & kidsBit, kidsBit);
  // Search and Build My Trip read the same helper (their venue lists are built with kidFriendlyPublic).
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  // Pub test 5: through badgeOnPublic, which reads kid_friendly with kidFriendlyPublic (and patio with a heated patio).
  assert.match(src, /function badgeOnPublic\(row, f\) \{\n  if \(f === 'kid_friendly'\) return kidFriendlyPublic\(row\);/);
  assert.match(src, /function buildDiscoverySearchVenues\(\) \{[\s\S]*?if \(badgeOnPublic\(row, f\)\) features\[f\] = true;/);
  assert.match(src, /function buildTripPlannerFacts\([\s\S]*?if \(badgeOnPublic\(v, f\)\) features\[f\] = true;/);
  assert.match(src, /const KID_FRIENDLY_SQL = `[^`]*\$\{PUB_KIDS_WELCOME_POLICIES\.map/, 'the SQL is built from the same list');
});

test('4c: step 1 with a new phone plus a new address or website says the phone is live now and the rest within a day', () => {
  for (const k of ['phoneLiveNow', 'phoneRestSite', 'phoneRestAddr', 'phoneRestBoth']) {
    assert.ok(TEXT.en[k] && TEXT.fr[k], `${k} in EN and FR`);
  }
  assert.match(TEXT.en.phoneLiveNow, /on your page now/);
  const s = fs.readFileSync(path.join(__dirname, '..', 'owner-setup-client.js'), 'utf8');
  const fn = s.slice(s.indexOf('function phoneSaved'), s.indexOf('function siteShown'));
  assert.match(fn, /S\.savedLine\.basics = ''/, 'cleared each save, so an old line never sticks');
  assert.match(fn, /T\.phoneLiveNow \+ ' ' \+ rest/, 'phone line + what is still checked');
});
