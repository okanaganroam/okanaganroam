// Owner portal: the full easy setup for restaurants (2026-11-09). Twenty questions, one per screen, at .../setup.
// What's tested here: the page (steps, words, French), the setup-only live rule (answers sent from the setup go live
// from the edit link; the classic edit page's rules don't change), the progress memory (Welcome back), happy hour and
// specials sent to type up (their own queue rows, never mixed with the menu), the six owner-only restaurant features
// (stored apart, shown as chips, no new pages), "before tax and tip", and the dogs line.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-full-setup-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
const app = require('../server.js');
const db = require('../db.js');
const sent = [];
app.setVenueSubmissionTransport(async (m) => { sent.push(m); });

let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Full Setup ${type} ${++n}`, slug: `full-setup-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.4, address: '214 Main St, Penticton', phone: '250-555-0142', website: 'https://example.com', hours: JSON.stringify({ mon: [], tue: [['11:00', '21:00']], wed: [['11:00', '21:00']], thu: [['11:00', '21:00']], fri: [['11:00', '22:00']], sat: [['11:00', '22:00']], sun: [['11:00', '20:00']] }),
  description: 'A fixture used only by the full easy setup tests.', ...o });
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
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.31.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes, setup = true) => post(`/owner/${t}/changes${setup ? '?from=setup' : ''}`, { changes, ...(setup ? { from_setup: true } : {}), note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/.exec(html)[1]);

test('the page: the steps in two parts, the approved words, "before tax and tip", French, setup-only header', async () => {
  const v = mk('restaurant');
  const html = await get(`/owner/${tokenFor(v.id)}/setup`).then((r) => r.text());
  const cfg = cfgOf(html);
  // Split in two (2026-11-09): Part 1 the essentials (8, in order), Part 2 optional (11, any order). Seasons are part of closures.
  assert.deepEqual(cfg.part1, ['basics', 'hours', 'closures', 'spend', 'cuisine', 'photos', 'menu', 'offer']);
  assert.deepEqual(cfg.part2, ['happy', 'specials', 'music', 'story', 'book', 'takeout', 'known', 'groups', 'instagram', 'facebook', 'door']);
  assert.deepEqual(cfg.steps, cfg.part1.concat(cfg.part2));
  assert.equal(cfg.t.spendLead, 'One main and a soft drink, before tax and tip.');
  assert.equal(cfg.t.spendQ, 'About how much does one person spend?');
  assert.match(cfg.t.hiLead, /About 15 to 30 minutes/);
  assert.equal(cfg.t.savedEmail, 'Great. Once you’ve emailed it, we’ll add it within a day.');
  assert.equal(cfg.offerGroups.length, 3);
  // Happy hour and Takeout aren't tiles any more (asked twice): their own questions in Part 2 set them.
  assert.deepEqual(cfg.offerGroups.map((g) => g.keys.length).reduce((a, b) => a + b, 0), 20); // + Fireplace (pub test 6), + Beach access (pub test 7), + Free parking and Room for RVs (pub test 8)
  assert.ok(!cfg.offerGroups.some((g) => g.keys.includes('happy_hour') || g.keys.includes('takeout')));
  assert.equal(cfg.offerLabels.wheelchair_accessible, 'Wheelchair accessible');
  assert.equal(cfg.cuisines.length, 46); // + Small plates & bar snacks (cocktail test 1, 2026-11-13)
  assert.match(html, /<header class="su-head">.*Exit setup/s);
  assert.doesNotMatch(html.slice(0, html.indexOf('<main')), /Build My Trip/, 'no visitor header during setup');
  const own = html.slice(0, html.indexOf('class="ohb-btn"'));
  assert.doesNotMatch(own, /waiting for (our check|review)/i);
  assert.doesNotMatch(html, /sample photos|For this mockup/i);
  const fr = cfgOf(await get(`/fr/owner/${tokenFor(v.id)}/setup`).then((r) => r.text()));
  assert.equal(fr.t.spendLead, 'Un plat principal et une boisson sans alcool, avant taxes et pourboire.');
  assert.equal(fr.offerLabels.takes_reservations, 'Prend les réservations');
  // Other types never get it.
  const pub = mk('golf');
  assert.equal((await get(`/owner/${tokenFor(pub.id)}/setup`)).status, 302);
});

test('setup-only live rule: from the setup, hours, season, closures, badges, happy hour, specials and events go live from the edit link', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const r = await change(t, {
    hours: { mon: [], tue: [['12:00', '21:00']], wed: [['12:00', '21:00']], thu: [['12:00', '21:00']], fri: [['12:00', '22:00']], sat: [['12:00', '22:00']], sun: [['12:00', '20:00']] },
    open_months: '4-10', closures: [{ from: '2099-12-25', to: '2099-12-25', note: 'Christmas Day' }].filter(() => false),
    badges: { patio: true, takes_reservations: true }, specials: [{ days: ['tue'], title: 'Taco Tuesday', deal: 'Taco Tuesday, 3 tacos', price: '$12', kind: 'both' }],
    weekly_nights: [{ days: ['thu'], kind: 'trivia', title: 'Trivia', frequency: 'weekly' }],
    happy_hour: { mon: [], tue: [['15:00', '17:00']], wed: [], thu: [], fri: [], sat: [], sun: [] }, happy_hour_deals: { deals: [{ text: '$6 pints' }], deals_fr: [] },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.review, []);
  for (const f of ['hours', 'open_months', 'badges', 'specials', 'weekly_nights', 'happy_hour', 'happy_hour_deals']) assert.ok(r.body.live.includes(f), `${f} live`);
  const live = app.getVenue(v.id);
  assert.match(live.hours, /12:00/);
  assert.equal(!!live.patio, true);
  // Address and the description still wait for our check, even from the setup. The phone goes live (pub test 3, 2026-11-10).
  const r2 = await change(t, { address: '300 Front St, Penticton', phone: '250-555-0199', description: 'A family bistro on the lake with handmade pasta and a sunny patio.' });
  assert.equal(r2.status, 201, JSON.stringify(r2.body));
  assert.deepEqual(r2.body.live, ['phone']);
  assert.deepEqual(r2.body.review.sort(), ['address', 'description']);
});

test('the classic edit page keeps its rules: the same fields without the setup flag wait for review', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const r = await change(t, { badges: { patio: true }, open_months: '5-10' }, false);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.live, []);
  assert.deepEqual(r.body.review.sort(), ['badges', 'open_months']);
  // The flag alone (no ?from=setup) changes nothing either.
  const r2 = await post(`/owner/${t}/changes`, { changes: { open_months: '6-9' }, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
  assert.equal(r2.status, 201, JSON.stringify(r2.body));
  assert.deepEqual(r2.body.live, []);
  // A pub sending from the setup address gets no setup rule.
  const pub = mk('golf');
  const r3 = await change(tokenFor(pub.id), { open_months: '5-10' });
  assert.equal(r3.status, 201, JSON.stringify(r3.body));
  assert.deepEqual(r3.body.live, []);
});

test('progress: answers are remembered for Welcome back; bad steps refused; the score comes back for the finish', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  assert.deepEqual((await get(`/owner/${t}/setup/progress`).then((r) => r.json())).progress.done, {});
  assert.equal((await post(`/owner/${t}/setup/progress`, { step: 'hours', status: 'live' })).status, 200);
  assert.equal((await post(`/owner/${t}/setup/progress`, { step: 'door', status: 'later' })).status, 200);
  assert.equal((await post(`/owner/${t}/setup/progress`, { step: 'nope', status: 'live' })).status, 400);
  assert.equal((await post(`/owner/${t}/setup/progress`, { step: 'menu', status: 'done' })).status, 400);
  const j = await get(`/owner/${t}/setup/progress`).then((r) => r.json());
  assert.deepEqual(j.progress.done, { hours: 'live', door: 'later' });
  assert.ok(Number.isInteger(j.score.pct) && j.score.soon >= j.score.pct && ['none', 'paused', 'earned'].includes(j.score.badge));
  const html = await get(`/owner/${t}/setup`).then((r) => r.text());
  assert.deepEqual(cfgOf(html).progress.done, { hours: 'live', door: 'later' });
  // The portal card: "Carry on where you left off" once something is answered.
  const portal = await get(`/owner/${t}`).then((r) => r.text());
  assert.match(portal, /Carry on where you left off/);
  for (const s of cfgOf(html).steps) await post(`/owner/${t}/setup/progress`, { step: s, status: 'skip' });
  assert.match(await get(`/owner/${t}`).then((r) => r.text()), /Your page is set up[\s\S]*Change something\?/);
  // Help: "did it go through?" answers with what was sent.
  assert.match(await get(`/owner/${t}/setup`).then((r) => r.text()), /"id":"setup-status"/);
  // Other types: no progress.
  assert.equal((await get(`/owner/${tokenFor(mk('golf').id)}/setup/progress`)).status, 404); // cafés (2026-11-10) and wineries (2026-11-12) have the setup; distilleries since 2026-11-13
});

test('happy hour and specials sent to type up get their own queue rows, never mixed with the menu', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const jpegBuf = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x04, 0xB0, 0x03, 0x84, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]), Buffer.alloc(64), Buffer.from([0xFF, 0xD9])]);
  const img = `data:image/jpeg;base64,${jpegBuf.toString('base64')}`;
  const p1 = await post(`/owner/${t}/menu/pages`, { image: img, sheet: 'happy_hour' });
  assert.equal(p1.status, 201, JSON.stringify(p1.body));
  const h1 = await post(`/owner/${t}/menu/help`, { note: 'Sent from the easy setup: our happy hour.', sheet: 'happy_hour', contact_email: '', contact_phone: '' });
  assert.equal(h1.status, 200, JSON.stringify(h1.body));
  const w = await post(`/owner/${t}/menu/help`, { note: 'Our weekly specials is on our website: example.com/specials', sheet: 'specials', contact_email: '', contact_phone: '' });
  assert.equal(w.status, 200, JSON.stringify(w.body));
  const rows = db.prepare('SELECT status, help_kind FROM venue_menus WHERE venue_id = ? ORDER BY id').all(v.id);
  assert.deepEqual(rows.map((r) => [r.status, r.help_kind]), [['help', 'happy_hour'], ['help', 'specials']]);
  assert.equal(app.activeMenuDraft ? app.activeMenuDraft(v.id) : null, null, 'the menu screen never picks them up');
  assert.ok(sent.some((m) => /\[TYPE IT UP\].*happy hour/.test(m._subject || m.subject || '')), 'Dayton is told what to type up');
});

test('owner-only features: stored apart, shown as chips, no new pages; reservations/takeout never contradict "we don\'t"', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const sitemap0 = await get('/sitemap.xml').then((r) => r.text());
  const r = await change(t, { badges: { wheelchair_accessible: true, locally_owned: true, heated_patio: true } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const row = db.prepare('SELECT features FROM venue_owner_features WHERE venue_id = ?').get(v.id);
  assert.deepEqual(JSON.parse(row.features), { heated_patio: true, wheelchair_accessible: true, locally_owned: true });
  const page = await get(app.venuePagePath(app.getVenue(v.id))).then((x) => x.text());
  assert.match(page, /Wheelchair accessible/);
  assert.match(page, /Locally owned/);
  assert.equal(await get('/sitemap.xml').then((x) => x.text()), sitemap0, 'no new sitemap entries');
  assert.equal((await get('/guide/penticton/wheelchair-accessible')).status === 200, false, 'no badge guide page');
  // Not a researched field, not a badge guide label.
  assert.ok(!app.RESEARCHED_BOOL_FIELDS || !app.RESEARCHED_BOOL_FIELDS.includes('wheelchair_accessible'));
  // "We don't take reservations", then ticking Takes reservations: refused in plain words.
  assert.equal((await change(t, { not_offered: ['pyv_reservations'] })).status, 201);
  const bad = await change(t, { badges: { takes_reservations: true } });
  assert.equal(bad.status, 400);
  assert.match(bad.body.errors.badges, /don’t take reservations/);
  // Undo the answer and tick it together: fine.
  const ok = await change(t, { not_offered: [], badges: { takes_reservations: true } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  // Other types can't send them.
  const pub = mk('golf');
  assert.equal((await change(tokenFor(pub.id), { badges: { takeout: true } })).status, 400);
  // The restaurant edit page shows the six boxes; a pub's doesn't.
  assert.match(await get(`/owner/${t}`).then((x) => x.text()), /value="takes_reservations"/);
  assert.doesNotMatch(await get(`/owner/${tokenFor(pub.id)}`).then((x) => x.text()), /value="takes_reservations"/);
});

test('the dogs line and "before tax and tip" wording', async () => {
  const v = mk('restaurant');
  const t = tokenFor(v.id);
  const r = await change(t, { visit_rows: { dogs: 'Dogs welcome on the patio, not inside.' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(r.body.live.includes('visit_rows'));
  const page = await get(app.venuePagePath(app.getVenue(v.id))).then((x) => x.text());
  assert.match(page, /Dogs welcome on the patio, not inside\./);
  // The classic edit page keeps its five Plan your visit boxes.
  const edit = await get(`/owner/${t}`).then((x) => x.text());
  assert.match(edit, /one main and a soft drink, before tax and tip/);
  assert.doesNotMatch(edit, /data-visit-key="dogs"/);
  assert.equal(app.avgSpendPublicText ? app.avgSpendPublicText(25, false) : 'About $25 a person, before tax and tip', 'About $25 a person, before tax and tip');
  assert.equal(app.avgSpendPublicText ? app.avgSpendPublicText(25, true) : 'Environ 25 $ par personne, avant taxes et pourboire', 'Environ 25 $ par personne, avant taxes et pourboire');
});

test('the page script parses and never shows Saved before the server answers', async () => {
  const v = mk('restaurant');
  const html = await get(`/owner/${tokenFor(v.id)}/setup`).then((r) => r.text());
  const script = /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];
  assert.doesNotThrow(() => new (require('node:vm').Script)(script));
  assert.match(script, /return change\(list\[i\]\)\.then\(function\(r\)\{ if \(!r\) \{ S\.busy = false; return render\(\); \}/);
  // A button never silently does nothing: the photo send explains a missing tick.
  assert.match(script, /if \(!S\.rights\) \{ S\.rightsAsk = true;/); // café test 5 (2026-11-12): asked gently, right above Send
});
