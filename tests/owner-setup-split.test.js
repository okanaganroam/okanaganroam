// Owner portal: the easy setup split in two, and the fresh-eyes fixes on the full setup (2026-11-09).
// A first-time tester (62, nervous with websites) said the 20 steps were "OK, but long" (31 minutes, 77% at the end).
// Now: Part 1 "the essentials" (8 questions, in order), a finish, then Part 2 "more about your place" (optional, any
// order). Tested here: the two parts and the card states, 'no' answers, the Facebook page name path (a note for us,
// never published), menu / happy hour / specials sent to type up show as waiting in the portal and in "Your updates",
// the reservations / takeout / groups features, "18" -> "$18", event start times, the plain "sent" sentence, the page
// script's rules (never "Saved" on a failed save; help reads progress fresh), French, and that other types and the
// classic edit page are untouched. The click-through is drafts/setup-split-2026-11-09/shoot.js (55 checks).
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-setup-split-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
const app = require('../server.js');
const db = require('../db.js');
const pc = require('../portal-completeness.js');
const sent = [];
app.setVenueSubmissionTransport(async (m) => { sent.push(m); });

let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Split Setup ${type} ${++n}`, slug: `split-setup-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.4, address: '214 Main St, Penticton', phone: '250-555-0142', website: 'https://example.com', hours: JSON.stringify({ mon: [], tue: [['11:00', '21:00']], wed: [['11:00', '21:00']], thu: [['11:00', '21:00']], fri: [['11:00', '22:00']], sat: [['11:00', '22:00']], sun: [['11:00', '20:00']] }),
  description: 'A fixture used only by the split setup tests.', ...o });
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
const get = (p) => fetch(base + p, { redirect: 'manual' });
const text = (p) => get(p).then((r) => r.text());
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.41.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes, setup = true) => post(`/owner/${t}/changes${setup ? '?from=setup' : ''}`, { changes, ...(setup ? { from_setup: true } : {}), note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const prog = (t, step, status) => post(`/owner/${t}/setup/progress`, { step, status });
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/.exec(html)[1]);
const scriptOf = (html) => /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];
const card = (html) => (/id="opSetupCard"[^>]*>([\s\S]*?)<\/a>/.exec(html) || [])[1] || '';

test('two parts: 8 essentials then 11 optional; seasons are part of closures; an honest time; English and French', async () => {
  const v = mk('restaurant');
  const html = await text(`/owner/${tokenFor(v.id)}/setup`);
  const cfg = cfgOf(html);
  assert.equal(cfg.part1.length, 8);
  assert.equal(cfg.part2.length, 11);
  assert.ok(!cfg.steps.includes('season'), 'no separate Seasons step');
  assert.match(cfg.t.hiLead, /The essentials take about 10 to 15 minutes\. You can stop any time/);
  assert.equal(cfg.t.essQ, 'The essentials are done!');
  assert.equal(cfg.t.moreOpt, 'Add more about your place');
  assert.equal(cfg.t.doneNow, 'I’m done for now');
  assert.equal(cfg.t.finishHome, 'Everything you can do from home is done');
  assert.equal(cfg.t.anotherDay, '+ Closed for a week or two (or other dates)');
  assert.equal(cfg.t.wholeMonths, '+ We close for whole months each year');
  assert.deepEqual([cfg.t.len1, cfg.t.len7, cfg.t.len14, cfg.t.lenPick], ['1 day', '1 week', '2 weeks', 'Pick the last day']);
  // Small wording fixes.
  assert.equal(cfg.t.bookQ, 'Can people book a table?');
  assert.equal(cfg.t.groupsQ, 'Can you take groups of 10 or more?');
  assert.equal(cfg.t.fbQ, 'What’s your Facebook page called?');
  assert.match(cfg.t.igLead, /@yourrestaurant/);
  assert.equal(cfg.t.sendMenu, 'Send my menu', 'one tick (the button adds it)');
  assert.equal(cfg.t.storyCount, 'A bit more would be great.');
  assert.equal(cfg.t.storyGood, 'Great length ✓');
  assert.doesNotMatch(JSON.stringify([cfg.t.uploadSub, cfg.t.upLead, cfg.t.upSub, cfg.t.sheetLead, cfg.t.emailLead]), /PDF/, 'no PDF jargon on the choices');
  assert.deepEqual(cfg.popular, ['Italian', 'Japanese', 'Indian', 'Breakfast & Brunch', 'Chinese', 'Mexican', 'Pub Fare', 'Pizza', 'Burgers', 'Comfort food']);
  const own = html.slice(0, html.indexOf('class="ohb-btn"'));
  assert.doesNotMatch(own, /waiting for (our check|review)|en attente/i, 'the setup never says "waiting"');
  const fr = cfgOf(await text(`/fr/owner/${tokenFor(v.id)}/setup`));
  assert.equal(fr.t.essQ, 'L’essentiel est fait!');
  assert.equal(fr.t.fbQ, 'Comment s’appelle votre page Facebook?');
  assert.equal(fr.t.noLabels.instagram, 'pas sur Instagram');
  for (const k of Object.keys(cfg.t)) assert.ok(k in fr.t, `French has ${k}`);
  // Old links keep working: #season opens the closures step (the page script maps it).
  assert.match(scriptOf(html), /if \(startAt === 'season'\) startAt = 'closures';/);
});

test('progress and the portal card: not started, carry on, essentials done, all set up; "no" is an answer', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  assert.match(card(await text(`/owner/${t}`)), /Set up your page[\s\S]*The essentials take about 10 to 15 minutes/);
  assert.equal(app.setupState(v.id), 'none');
  assert.equal((await prog(t, 'hours', 'live')).status, 200);
  assert.equal(app.setupState(v.id), 'partial');
  assert.match(card(await text(`/owner/${t}`)), /Carry on where you left off/);
  assert.equal((await prog(t, 'season', 'live')).status, 400, 'no Seasons step any more');
  for (const s of app.SETUP_PART1) assert.equal((await prog(t, s, 'live')).status, 200);
  assert.equal(app.setupState(v.id), 'essentials');
  assert.match(card(await text(`/owner/${t}`)), /The essentials are done[\s\S]*Add more about your place\?/);
  assert.equal((await prog(t, 'instagram', 'no')).status, 200, '"We’re not on Instagram" is recorded as no');
  for (const s of app.SETUP_PART2) if (s !== 'instagram') assert.equal((await prog(t, s, s === 'door' ? 'later' : 'skip')).status, 200);
  assert.equal(app.setupState(v.id), 'done');
  assert.match(card(await text(`/owner/${t}`)), /Your page is set up[\s\S]*Change something\?/);
  assert.match(card(await text(`/fr/owner/${t}`)), /Votre page est configurée/);
  const html = await text(`/owner/${t}/setup`);
  assert.equal(cfgOf(html).progress.done.instagram, 'no');
  // The help fallback says it in the owner's words.
  assert.match(html, /Instagram: not on Instagram/);
  // Other types: no card, no progress.
  const pub = mk('pub');
  assert.equal(card(await text(`/owner/${tokenFor(pub.id)}`)), '');
  assert.equal((await get(`/owner/${tokenFor(pub.id)}/setup/progress`)).status, 404);
});

test('Facebook / Instagram by name: a note for us to find the link, never published as typed; a real link still goes live', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  // A plain name is not a link: the owner path refuses it (so it can never be published as typed)…
  const bad = await change(t, { facebook_url: 'Copper Pot Kitchen Penticton' });
  assert.equal(bad.status, 400);
  // …and the setup sends it as a note instead, into the same queue as "type it up for me".
  const r = await post(`/owner/${t}/menu/help`, { note: 'Our Facebook page is called: “Copper Pot Kitchen Penticton”. Please find the link and add it to our page.', sheet: 'facebook', contact_email: '', contact_phone: '' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = db.prepare("SELECT * FROM venue_menus WHERE venue_id = ? AND help_kind = 'facebook'").get(v.id);
  assert.equal(row.status, 'help');
  assert.match(row.help_note, /Copper Pot Kitchen Penticton/);
  const link = db.prepare('SELECT facebook_url FROM venue_links WHERE venue_id = ?').get(v.id);
  assert.ok(!link || !link.facebook_url, 'nothing published');
  assert.match(sent[sent.length - 1]._subject, /\[FIND LINK\].*Facebook page/);
  assert.match(app.renderAdminReviewPage(), /Find their Facebook page link and add it/);
  assert.equal(cfgOf(await text(`/owner/${t}/setup`)).socialSent.facebook, true, 'the setup says the name was sent');
  // The portal: Facebook is waiting, not "left"; "Your updates" has it.
  const portal = await text(`/owner/${t}`);
  assert.match(portal, /Your Facebook page name/);
  // The menu itself is untouched by a note (no menu draft, nothing published).
  assert.equal(app.activeMenuDraft(v.id), null);
  // A real link still goes live from the setup, normalised.
  const ok = await change(t, { facebook_url: 'facebook.com/copperpotkitchen' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(db.prepare('SELECT facebook_url FROM venue_links WHERE venue_id = ?').get(v.id).facebook_url, 'https://www.facebook.com/copperpotkitchen');
  // Other types can't use the note kinds (they have no setup): it falls back to a plain menu help request.
  const cafe = mk('cafe');
  await post(`/owner/${tokenFor(cafe.id)}/menu/help`, { note: 'Our Facebook page is X', sheet: 'facebook', contact_email: '', contact_phone: '' });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM venue_menus WHERE venue_id = ? AND help_kind = 'facebook'").get(cafe.id).n, 0);
  // The page script: a name is never an error; a link the server refuses falls back to the name path.
  const script = scriptOf(await text(`/owner/${t}/setup`));
  assert.match(script, /if \(!link\) return asName\(\);/);
  assert.match(script, /return change\(ch\)\.then\(function\(r\)\{\s*if \(!r\) return asName\(\);/);
});

test('sent to type up (menu, happy hour, specials): waiting in the portal and in "Your updates", not "left"', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const before = await text(`/owner/${t}`);
  assert.doesNotMatch(before, /Menu sent to us/);
  const jpg = `data:image/jpeg;base64,${fs.readFileSync(path.join(__dirname, '..', 'public', 'images', 'venues', fs.readdirSync(path.join(__dirname, '..', 'public', 'images', 'venues')).find((f) => /-2610\.jpg$/.test(f)))).toString('base64')}`;
  assert.ok([200, 201].includes((await post(`/owner/${t}/menu/pages`, { image: jpg })).status));
  assert.equal((await post(`/owner/${t}/menu/help`, { note: 'Sent from the easy setup.', contact_email: '', contact_phone: '' })).status, 200);
  assert.equal((await post(`/owner/${t}/menu/help`, { note: 'Our happy hour is on our website: example.com/happy', sheet: 'happy_hour', contact_email: '', contact_phone: '' })).status, 200);
  await prog(t, 'menu', 'day');
  const portal = await text(`/owner/${t}`);
  assert.match(portal, /Menu sent to us/);
  assert.match(portal, /Happy hour sent to us/);
  // The score: menu and happy hour are waiting (they count in "once we add what you sent"), not left.
  const j = await get(`/owner/${t}/setup/progress`).then((r) => r.json());
  assert.ok(j.score.soon > j.score.pct, `soon ${j.score.soon} > now ${j.score.pct}`);
  // After the setup the card says it in one plain sentence, not a count.
  const cb = portal.slice(portal.indexOf('id="opComplete"'), portal.indexOf('id="opCbPanel"'));
  assert.match(cb, /Menu and happy hour sent\. We’ll add them within a day\./);
  assert.doesNotMatch(cb, /\d waiting for our check|check your \d changes/);
  assert.match(portal, /once we add what you sent/);
});

test('scorer: pendingHelp marks menu / happy hour / specials / Facebook / Instagram as waiting; the plain sentence is opt-in', () => {
  const today = app.todayLocal();
  const base0 = { address: '1 Main St', latitude: 1, longitude: 1, phone: '250-555-0100', hasHours: true, hoursCheckedAt: today };
  const a = pc.scoreCompleteness(base0, { today });
  const b = pc.scoreCompleteness({ ...base0, pendingHelp: { menu: true, happy_hour: true, facebook: true } }, { today });
  const waiting = (r) => r.missing.filter((i) => i.waiting).map((i) => i.key).sort();
  assert.deepEqual(waiting(a), []);
  assert.deepEqual(waiting(b), ['facebook', 'happy_hour', 'menu']);
  assert.equal(b.pct, a.pct, 'waiting never counts as done');
  assert.ok(b.pctWithWaiting > b.pct);
  const counted = pc.renderCompleteness(b, {});
  assert.match(counted, /3 waiting for our check/, 'the classic wording stays unless asked');
  const plain = pc.renderCompleteness(b, { plainWaiting: true });
  assert.match(plain, /sent\. We’ll add them within a day\./);
  assert.doesNotMatch(plain.slice(0, plain.indexOf('op-cb-panel')), /3 waiting for our check/);
  assert.match(pc.renderCompleteness(b, { plainWaiting: true, fr: true }), /envoyé\. Nous l’ajouterons d’ici un jour\./);
});

test('reservations, takeout and groups: saying how sets the feature; only an explicit No clears it; No then Yes restores it', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const feats = () => app.venueOwnerFeatures(v.id);
  // Ticked on "What you offer".
  assert.equal((await change(t, { badges: { takes_reservations: true } })).status, 201);
  assert.equal(!!feats().takes_reservations, true);
  // "How do people book?" keeps it on.
  assert.equal((await change(t, { badges: { takes_reservations: true } })).status, 400, 'unchanged: nothing new to send (the page counts that as saved)');
  assert.equal((await change(t, { visit_rows: { reservations: 'Call us. Walk-ins welcome too.' } })).status, 201);
  assert.equal(!!feats().takes_reservations, true);
  // An explicit No: the line goes, the feature goes, "we don't" is stored.
  assert.equal((await change(t, { visit_rows: { reservations: '' }, badges: { takes_reservations: false } })).status, 201);
  assert.equal((await change(t, { not_offered: ['pyv_reservations'] })).status, 201);
  assert.equal(!!feats().takes_reservations, false);
  // Yes again: "we don't" is dropped first, then the feature and the line come back.
  assert.equal((await change(t, { not_offered: [] })).status, 201);
  assert.equal((await change(t, { badges: { takes_reservations: true } })).status, 201);
  assert.equal((await change(t, { visit_rows: { reservations: 'Call us.' } })).status, 201);
  assert.equal(!!feats().takes_reservations, true);
  // Groups: Yes sets Great for groups (live from the setup).
  assert.equal((await change(t, { badges: { great_groups: true } })).status, 201);
  assert.equal(db.prepare('SELECT great_groups FROM venues WHERE id = ?').get(v.id).great_groups, 1);
  // The page script does exactly this, in this order.
  const script = scriptOf(await text(`/owner/${t}/setup`));
  assert.match(script, /var bk = \{ reservations: 'takes_reservations', takeout: 'takeout', groups: 'great_groups' \}\[key\];/);
  assert.match(script, /if \(step === 'book' && \(S\.badges\.takes_reservations \|\| S\.visit\.reservations\)\) return 'book:yes';/);
  assert.match(script, /if \(step === 'takeout' && \(S\.badges\.takeout \|\| S\.visit\.takeout\)\) return 'takeout:yes';/);
  // The classic edit page's rule for badges is unchanged: without the setup flag they wait for review.
  const w = mk('restaurant');
  const r = await change(tokenFor(w.id), { badges: { great_groups: true } }, false);
  assert.equal(r.status, 201);
  assert.equal(db.prepare('SELECT great_groups FROM venues WHERE id = ?').get(w.id).great_groups, 0);
});

test('specials: a bare number price gets its dollar sign; events keep their start time; no days are pre-picked for happy hour', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const r = await change(t, { specials: [{ days: ['thu'], title: 'Fish and chips', deal: 'Fish and chips', price: '18', kind: 'food' }, { days: ['sun'], title: 'Prime rib', deal: 'Prime rib dinner', price: '$29', kind: 'food' }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(db.prepare('SELECT price FROM venue_specials WHERE venue_id = ? ORDER BY id').all(v.id).map((x) => x.price), ['$18', '$29']);
  const e = await change(t, { weekly_nights: [{ days: ['wed'], kind: 'trivia', title: 'Trivia', start: '19:00', frequency: 'weekly' }] });
  assert.equal(e.status, 201, JSON.stringify(e.body));
  assert.equal(db.prepare('SELECT start_time FROM venue_weekly_nights WHERE venue_id = ?').get(v.id).start_time, '19:00');
  const html = await text(`/owner/${t}/setup`);
  assert.equal(cfgOf(html).cur.weekly_nights[0].start, '19:00', 'the setup shows the time again');
  const script = scriptOf(html);
  assert.match(script, /if \(!S\.happy\.length\) S\.happy\.push\(\{ days: \{\}, from: '15:00', to: '17:00', what: '' \}\);/);
  assert.doesNotMatch(script, /placeholder="' \+ h\(T\.(whatsOnEx|specialEx|priceEx|eventEx)\)/, 'examples sit under the box, never inside it');
});

test('the page script: never "Saved" on a failed save; help reads progress fresh; Back shows the answer; dogs get their own screen', async () => {
  const v = mk('restaurant');
  const html = await text(`/owner/${tokenFor(v.id)}/setup`);
  const script = scriptOf(html);
  assert.doesNotThrow(() => new (require('node:vm').Script)(script));
  // progress() only marks a step done when the server said ok, and every caller checks it.
  assert.match(script, /if \(j && j\.ok\) \{ S\.done\[step\] = [^;]+; if \(j\.score\) S\.score = j\.score; [^}]*return true; \} S\.error = why\(j\); return false;/);
  assert.equal((script.match(/progress\([^)]*\)\.then\(function\(\)\{/g) || []).length, 0, 'no caller ignores the answer');
  assert.match(script, /if \(S\.error && x\.indexOf\('su-error'\) < 0\) x = msgs\(\) \+ x;/, 'an error shows on every screen');
  // "nothing new to send" for an unchanged answer counts as saved (it is already true on the server).
  assert.match(script, /if \(nothingChanged\(j\)\) return 'live';/);
  // Help: "did it go through?" is answered from a fresh read of the progress, through the help bot's hook.
  assert.match(script, /window\.ohbLive\['setup-status'\] = function\(lang, update\)\{/);
  assert.match(script, /fetch\(C\.base \+ '\/setup\/progress', \{ headers: \{ 'Accept': 'application\/json' \}, credentials: 'same-origin', cache: 'no-store' \}\)/);
  assert.match(html, /var lv = \(window\.ohbLive \|\| \{\}\)\[id\];/);
  // Back on an answered question says which answer we have.
  assert.match(script, /fill\(T\.youSaid, \{ a: T\.noLabels\[step\] \|\| T\.no \}\)/);
  // Dogs: asked on its own small screen after the tiles are saved (no jump mid-list).
  assert.match(script, /S\.badges\.dog_friendly \? 'offer:dogs' : null/);
  assert.doesNotMatch(script, /suDogBox/);
  // Welcome back: the button comes before the list.
  assert.ok(script.indexOf("big('➜', T.carryOn") < script.indexOf('+ statusRows(P1)'));
});

test('other types and public pages: nothing new; the portal has no empty box rule for restaurants only', async () => {
  // The setup page still redirects other types, and their edit pages have no setup card.
  for (const type of ['pub', 'cafe', 'winery']) {
    const v = mk(type);
    assert.equal((await get(`/owner/${tokenFor(v.id)}/setup`)).status, 302);
    assert.doesNotMatch(await text(`/owner/${tokenFor(v.id)}`), /opSetupCard/);
  }
  // A restaurant's public page carries no setup or portal words.
  const v = mk('restaurant');
  await prog(tokenFor(v.id), 'hours', 'live');
  const pub = app.renderVenuePage(app.getVenue(v.id), [], [], []);
  assert.doesNotMatch(pub, /The essentials|Carry on where you left off|quick ones|waiting for our check/);
});
