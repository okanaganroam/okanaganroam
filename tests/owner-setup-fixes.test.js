// Owner portal: fresh-eyes fixes on the easy setup in two parts (2026-11-10).
// A first-time tester (62, nervous with websites) found Part 1 "very easy, just" (8/10) but hit these:
//   - a menu already sent turned into "skipped" (the only way forward was "Skip this for now");
//   - "The essentials are done!" beside 43%; the finish said "everything from home is done" while the portal asked for more;
//   - ticks lost on Exit setup; a new closure row hidden under the Save button; "Change something?" led nowhere;
//   - "No" to groups not carried to the portal; dietary never asked; happy hour deals and chip not on the page.
// Tested here: progress never downgrades, the score's `left` list, groups / dietary "no" answers, the happy hour path
// (source, feature, deals on the page), "Your updates" in the owner's words, the bar's "sent" line on its own line, the
// honest time, and the page script's rules. The click-through is drafts/setup-fixes-2026-11-10/shoot.js.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-setup-fixes-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
const app = require('../server.js');
const db = require('../db.js');
const pc = require('../portal-completeness.js');
const strings = require('../owner-setup-text.js');
const sent = [];
app.setVenueSubmissionTransport(async (m) => { sent.push(m); });

let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Setup Fixes ${type} ${++n}`, slug: `setup-fixes-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.4, address: '214 Main St, Penticton', phone: '250-555-0142', website: 'https://example.com', hours: JSON.stringify({ mon: [], tue: [['11:00', '21:00']], wed: [['11:00', '21:00']], thu: [['11:00', '21:00']], fri: [['11:00', '22:00']], sat: [['11:00', '22:00']], sun: [['11:00', '20:00']] }),
  description: 'A fixture used only by the setup fixes tests.', ...o });
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
const json = (p) => get(p).then((r) => r.json());
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.43.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes, setup = true) => post(`/owner/${t}/changes${setup ? '?from=setup' : ''}`, { changes, ...(setup ? { from_setup: true } : {}), note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const prog = (t, step, status) => post(`/owner/${t}/setup/progress`, { step, status });
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/.exec(html)[1]);
const scriptOf = (html) => /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];

test('progress never goes backwards: Skip or "later" can’t replace an answer, "I’ll email it" can’t replace something sent', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  assert.equal((await prog(t, 'menu', 'day')).status, 200);
  const skipped = await prog(t, 'menu', 'skip');
  assert.equal(skipped.status, 200, 'the skip is accepted quietly');
  assert.equal(skipped.body.progress.done.menu, 'day', 'and the menu is still sent');
  assert.equal(app.setupProgress(v.id).done.menu, 'day');
  assert.equal((await prog(t, 'menu', 'email')).body.progress.done.menu, 'day', '"I’ll email it" does not replace a menu already sent');
  for (const [step, had] of [['hours', 'live'], ['instagram', 'no'], ['door', 'day']]) {
    await prog(t, step, had);
    assert.equal((await prog(t, step, 'skip')).body.progress.done[step], had, `${step}: skip keeps ${had}`);
    assert.equal((await prog(t, step, 'later')).body.progress.done[step], had, `${step}: later keeps ${had}`);
  }
  // A skipped step can still be answered, and an answer can still change.
  await prog(t, 'story', 'skip');
  assert.equal((await prog(t, 'story', 'day')).body.progress.done.story, 'day');
  await prog(t, 'photos', 'email');
  assert.equal((await prog(t, 'instagram', 'live')).body.progress.done.instagram, 'live');
  // Help and Welcome back read the same progress, so the menu is listed as sent.
  const html = await text(`/owner/${t}/setup`);
  assert.match(html, /Menu: on your page within a day/);
});

test('the score says what the portal still asks for, so the setup’s finish and the portal agree', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const before = (await json(`/owner/${t}/setup/progress`)).score;
  assert.ok(Array.isArray(before.left) && before.left.length > 3);
  const keys = (s) => s.left.map((x) => x.k).sort();
  assert.ok(keys(before).includes('dietary') && keys(before).includes('pyv_groups'));
  assert.ok(before.left.every((x) => x.en && x.fr), 'each has its name in English and French');
  // "None of these" (dietary) and "No" to groups are answers: the portal stops asking.
  assert.equal((await change(t, { not_offered: ['dietary'] })).status, 201);
  assert.equal((await change(t, { not_offered: ['dietary', 'pyv_groups'] })).status, 201);
  const after = (await prog(t, 'groups', 'no')).body.score;
  assert.ok(!keys(after).includes('dietary') && !keys(after).includes('pyv_groups'));
  assert.ok(after.pct > before.pct);
  // Something sent and waiting is not "left".
  assert.equal((await change(t, { description: 'A family bistro by the lake with handmade pasta, a sunny patio and a short list of Okanagan wines. Open for lunch and dinner.' })).status, 201);
  const waiting = (await json(`/owner/${t}/setup/progress`)).score;
  assert.ok(!keys(waiting).includes('description'));
  assert.ok(waiting.soon > waiting.pct, 'it counts in "once we add what you sent"');
  // The portal checklist agrees.
  const portal = await text(`/owner/${t}`);
  assert.match(portal, /data-cb-undo="pyv_groups">Undo</, 'groups is listed under "You told us you don’t have these"');
  assert.match(portal, /data-cb-undo="dietary">Undo</);
  assert.ok(!portal.includes('data-cb-none="pyv_groups"') && !portal.includes('data-cb-none="dietary"'), 'and the portal no longer asks');
});

test('groups: a "we can’t take big groups" answer and the Great for groups feature never contradict each other', async () => {
  assert.ok(pc.NONE_KEYS.includes('pyv_groups'));
  assert.ok(pc.GOT_TEXT.pyv_groups.en.startsWith('Got it: ') && pc.GOT_TEXT.pyv_groups.fr.startsWith('C’est noté : '));
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  assert.equal((await change(t, { not_offered: ['pyv_groups'] })).status, 201);
  const clash = await change(t, { badges: { great_groups: true } });
  assert.equal(clash.status, 400);
  assert.match(JSON.stringify(clash.body), /You told us you can’t take big groups/);
  // Taking the answer back first, then ticking it, is fine (what the setup does).
  assert.equal((await change(t, { not_offered: [] })).status, 201);
  assert.equal((await change(t, { badges: { great_groups: true } })).status, 201);
  // A groups line on the page blocks the "no" answer, like every other item.
  const w = mk('restaurant');
  const tw = tokenFor(w.id);
  assert.equal((await change(tw, { visit_rows: { groups: 'Groups of 10 or more, please call ahead' } })).status, 201);
  assert.equal((await change(tw, { not_offered: ['pyv_groups'] })).status, 400);
});

test('happy hour typed in the setup: logged as the business’s own, the feature goes on, and the deals show on the page', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const week = { mon: [], tue: [['15:00', '17:00']], wed: [['15:00', '17:00']], thu: [['15:00', '17:00']], fri: [['14:00', '18:00']], sat: [], sun: [] };
  // What the setup's happySave sends.
  const r = await change(t, { happy_hour: week, happy_hour_deals: { deals: [{ text: '$5 draft beer and $8 appetizers' }], deals_fr: [] }, badges: { happy_hour: true } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual([...r.body.live].sort(), ['badges', 'happy_hour', 'happy_hour_deals']);
  const row = db.prepare('SELECT happy_hour, happy_hour_times, happy_hour_deals, happy_hour_deals_source FROM venues WHERE id = ?').get(v.id);
  assert.equal(row.happy_hour, 1, 'the Happy hour feature is on');
  assert.equal(row.happy_hour_deals_source, 'venue_owner');
  const log = db.prepare("SELECT field_name, source FROM venue_enrichment_log WHERE venue_id = ? AND field_name LIKE 'happy_hour%' ORDER BY id").all(v.id);
  assert.ok(log.length >= 2);
  assert.ok(log.every((l) => l.source === 'venue_owner'), `every happy hour line is logged as the business’s: ${JSON.stringify(log)}`);
  // On the public page: the deals and the chip.
  const page = app.renderVenuePage(app.getVenue(v.id), [], [], []);
  assert.match(page, /\$5 draft beer and \$8 appetizers/);
  // Research still logs as research.
  const x = mk('restaurant');
  const rr = app.guardedHappyHourUpdate(x.id, null, { times: { tue: [['15:00', '17:00']] }, source_url: 'https://example.com/happy', checked_at: app.todayLocal() }, { reason: 'research fixture', batch_id: 'test-hh' });
  assert.equal(rr.ok, true, JSON.stringify(rr));
  assert.ok(db.prepare("SELECT source FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'happy_hour_times'").all(x.id).every((l) => l.source === 'happy_hour_research'));
  // The page script sends the feature with the times, and "No" still switches it off.
  const s = scriptOf(await text(`/owner/${t}/setup`));
  assert.match(s, /list\.push\(\{ happy_hour: week, happy_hour_deals: [^}]+\} : null, badges: \{ happy_hour: true \} \}\);/);
  assert.match(s, /badges: \{ happy_hour: false \}/);
});

test('"Your updates" in the owner’s words (restaurants): "What you offer", "You told us you don’t have: …"', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  assert.equal((await change(t, { badges: { patio: true } })).status, 201);
  assert.equal((await change(t, { not_offered: ['pyv_groups', 'specials'] })).status, 201);
  const en = app.ownerVenueActivity(v.id, 12, 'en').map((a) => a.title);
  assert.ok(en.includes('Listing update: What you offer'), JSON.stringify(en));
  assert.ok(en.some((x) => /^You told us you don’t have: (weekly specials, room for big groups|room for big groups, weekly specials)$/.test(x)), JSON.stringify(en));
  assert.ok(!en.some((x) => /Badges|Things you don’t offer/.test(x)));
  const fr = app.ownerVenueActivity(v.id, 12, 'fr').map((a) => a.title);
  assert.ok(fr.includes('Mise à jour de la fiche : Ce que vous offrez'), JSON.stringify(fr));
  assert.ok(fr.some((x) => /^Vous nous avez dit que vous n’avez pas : /.test(x)));
  // Only the newly added answer is named the second time.
  assert.equal((await change(t, { not_offered: ['instagram', 'pyv_groups', 'specials'] })).status, 201);
  assert.equal(app.ownerVenueActivity(v.id, 12, 'en')[0].title, 'You told us you don’t have: Instagram');
  // Other types keep the old wording.
  const pub = mk('brewery');
  assert.equal((await change(tokenFor(pub.id), { badges: { patio: true } }, false)).status, 201);
  assert.ok(app.ownerVenueActivity(pub.id, 12, 'en').some((a) => a.title === 'Listing update: Badges'));
});

test('the portal bar: the "sent" sentence is on its own line; the honest time on the card and in help', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  await prog(t, 'hours', 'live');
  assert.equal((await change(t, { menu_url: 'https://example.com/menu' })).status, 201);
  const html = await text(`/owner/${t}`);
  const head = html.slice(html.indexOf('id="opCbToggle"'), html.indexOf('id="opCbPanel"'));
  assert.match(head, /<span class="op-cb-sentline">Menu sent\. We’ll add it within a day\.<\/span>/);
  const sub = /id="opCbSub"[^>]*>([^<]*)</.exec(head)[1];
  assert.ok(!/sent\./.test(sub), `the bar's own line has no "sent" sentence: ${sub}`);
  assert.doesNotMatch(sub, /Tap to/, 'no second call to action while the setup card is the way in (fresh-eyes 3)');
  const fresh = mk('restaurant');
  const card = (/id="opSetupCard"[^>]*>([\s\S]*?)<\/a>/.exec(await text(`/owner/${tokenFor(fresh.id)}`)) || [])[1];
  assert.match(card, /The essentials take about 10 to 15 minutes \(a bit longer if you change your hours\)/, 'card matches the start screen');
  assert.match((/id="opSetupCard"[^>]*>([\s\S]*?)<\/a>/.exec(await text(`/fr/owner/${tokenFor(fresh.id)}`)) || [])[1], /de 10 à 15 minutes \(un peu plus si vous changez vos heures\)/);
  assert.match(strings.en.hiLead, /about 10 to 15 minutes \(a bit longer if you change your hours\)/);
  assert.match(strings.fr.hiLead, /de 10 à 15 minutes \(un peu plus si vous changez vos heures\)/);
  const topic = app.OWNER_HELP_TOPICS.find((x) => x.id === 'easy-setup');
  assert.match(topic.a, /about 10 to 15 minutes, a bit longer if you change your hours/);
  assert.match(topic.aFr, /de 10 à 15 minutes, un peu plus si vous changez vos heures/);
});

test('the page script: answered steps offer Next (never Skip), Exit asks to save, lists are tappable, Yes comes first', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const html = await text(`/owner/${t}/setup`);
  const s = scriptOf(html);
  const cfg = cfgOf(html);
  // Skip can't overwrite an answer.
  assert.match(s, /function skip\(step\)\{\s*if \(answered\(step\)\) return '<div class="su-stack" style="margin-top:14px">' \+ big\('➜', nextLabel\(step\), '', true, 'after:' \+ step\)/);
  assert.match(s, /if \(k === 'skip'\) \{ if \(answered\(v\)\) return after\(v\);/);
  // The menu step says what was sent.
  assert.match(s, /sentM \? q\(T\.menuSentQ\)/);
  // Exit setup: "Save these first?" with Save and exit first; saving goes through the step's own save.
  assert.match(html, /<a class="su-exit" id="suExit" href="/);
  assert.match(s, /el\('suExit'\)\.onclick = function\(e\)\{ if \(S\.busy\) \{ e\.preventDefault\(\); return; \} if \(unsaved\(\)\) \{ e\.preventDefault\(\); askExit\(\); \} \};/);
  assert.ok(s.indexOf('id="suExitSave"') < s.indexOf('id="suExitDrop"'), 'Save and exit comes first');
  assert.match(s, /if \(S\.exitAfter\) return leave\(\);/);
  assert.match(s, /if \(S\.error \|\| S\.nudge\) S\.exitAfter = false;/, 'a save that needs fixing keeps her on the page');
  assert.equal(cfg.t.exitQ, 'Save these first?');
  assert.equal(cfg.t.exitSave, 'Save and exit');
  assert.equal(cfg.t.exitDrop, 'Exit without saving');
  // "Change something?": every row opens its question, with the answer shown.
  assert.match(s, /class="su-rowbtn" data-act="edit:' \+ s \+ '"/);
  assert.match(s, /if \(k === 'edit'\) \{ S\.toList = true;/);
  assert.match(s, /if \(step === 'happy' && S\.done\.happy === 'live' && S\.happy\.length\) return 'happy:type';/);
  assert.equal(cfg.t.changeQ, 'Change something?');
  // Yes first on yes/no questions.
  assert.match(s, /big\('✓', yesText \|\| T\.yes, '', false, 'go:' \+ step \+ ':yes'\) \+ big\('✕', noText \|\| T\.no, '', true, 'no:' \+ step\)/);
  // Finish: the "once we add what you sent" figure leads; what is left comes from the setup and the portal together.
  assert.match(s, /fill\(T\.pctAbout, \{ n: sc\.soon \}\)/);
  assert.match(s, /function leftList\(\)/);
  assert.equal(cfg.t.pctWill, 'Your page will be about {n}% complete');
  assert.ok(Array.isArray(cfg.progress.score.left));
  // Dietary "None of these", closures "Added:", menu choices, kinds folded, "A few more", bigger menu pages, the cursor.
  assert.match(s, /data-off="none_diet"/);
  assert.equal(cfg.t.noneDiet, 'None of these');
  assert.match(s, /fill\(T\.added, \{ x: S\.added \}\)/);
  assert.ok(s.indexOf("big('📷', T.snap, T.snapSub, sentM, 'go:menu:cam')") > 0 && s.indexOf("big('📷', T.snap, T.snapSub, sentM, 'go:menu:cam')") < s.indexOf("big('📄', T.upload, T.uploadSub, true, 'go:menu:upload')"), 'Take photos of my menu leads');
  assert.equal(cfg.t.upload, 'Upload my menu (a file or photos)');
  // Pub fresh-eyes (2026-11-10): the 6 most common kinds show open; the rest sit under "More kinds".
  assert.match(s, /<div class="su-chips su-kinds">/); assert.match(s, /h\(T\.moreKinds\)/);
  assert.match(s, /h\(T\.fewMore\)/);
  assert.match(s, /su-pages su-pages-big/);
  assert.match(s, /var n = inp\.value\.length; if \(!n\) return;/, 'the cursor is left alone in an empty box');
  // Average spend isn't shown publicly yet: the Saved screen says "soon", not "now".
  assert.equal(cfg.spendPublic, false);
  assert.match(s, /if \(!C\.spendPublic\) S\.savedLine\.spend = T\.savedSoon;/);
  assert.equal(cfg.t.savedSoon, 'It’ll show on your page soon.');
  // French has every new line.
  const fr = cfgOf(await text(`/fr/owner/${t}/setup`)).t;
  for (const k of ['exitQ', 'exitSave', 'exitDrop', 'exitStay', 'changeQ', 'changeLead', 'pctWill', 'pctWillSub', 'pctRightNow', 'added', 'holidaysH', 'noneDiet', 'noneDietSub', 'savedSoon', 'pickKind', 'kindIs', 'fewMore', 'tapBigger', 'nextPlain', 'backToList', 'finishAlmost', 'menuSentEmail']) {
    assert.ok(fr[k] && fr[k] !== cfg.t[k], `French: ${k}`);
  }
  assert.equal(fr.noLabels.groups, 'pas de grands groupes');
});

test('other types are untouched: no setup, no new "we don’t" button, the classic rules', async () => {
  for (const type of ['brewery', 'cafe', 'winery']) {
    const v = mk(type);
    const t = tokenFor(v.id);
    const r = await get(`/owner/${t}/setup`);
    assert.equal(r.status, 302, `${type}: no setup page`);
    assert.equal((await change(t, { not_offered: ['pyv_groups'] }, false)).status, 400, `${type}: no "we don't have one" answers`);
    const html = await text(`/owner/${t}`);
    assert.ok(!html.includes('op-cb-sentline') && !html.includes('opSetupCard'), type);
  }
});
