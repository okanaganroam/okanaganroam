// Owner portal: "We don't have one" (2026-11-08). On a restaurant's completeness panel, the items a place may not offer
// (happy hour, specials, music or events, website, Instagram, Facebook, dietary options, reservations, takeout) get a
// second button. Tapping it goes live at once, counts the item as done, shows under "You told us you don't have these"
// with an Undo, is logged and shown in "Your updates", and research never adds that item back. Nothing public changes:
// not the venue page, not the API, not the Verified tick. Every other type's edit page is untouched.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-not-offered-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
const app = require('../server.js');
const db = require('../db.js');
const pc = require('../portal-completeness.js');

const today = app.todayLocal();
const meta = { reason: 'research fixture', batch_id: 'test-not-offered' };
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `None Portal ${type} ${++n}`, slug: `none-portal-${type}-${n}`, region: 'kelowna', type, latitude: 49.885 + n / 1000, longitude: -119.49,
  rating: 4.4, description: 'A fixture used only by the owner "we don\'t have one" tests.', ...o });
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
const get = (p) => fetch(base + p).then((r) => r.text());
const post = (token, changes) => fetch(`${base}/owner/${token}/changes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.2.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 }) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const lastInstantId = (id) => db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 ORDER BY id DESC").get(id).id;
const panel = (html) => { const a = html.indexOf('id="opComplete"'); return a < 0 ? '' : html.slice(a, html.indexOf('</section>', a)); };

test('items: the nine optional ones get the button; the core of a page never does', () => {
  assert.deepEqual([...pc.NONE_KEYS].sort(), ['dietary', 'entertainment', 'facebook', 'happy_hour', 'instagram', 'pyv_reservations', 'pyv_takeout', 'specials', 'website']);
  for (const core of ['address_pin', 'phone', 'hours', 'hours_fresh', 'photo_main', 'photo_extra', 'avg_spend', 'menu', 'description', 'arrival', 'cuisine', 'owner_confirmed']) {
    assert.ok(!pc.NONE_KEYS.includes(core), `${core} never offers "we don't have one"`);
  }
  for (const it of pc.ITEMS.filter((i) => i.noneEn)) assert.ok(it.noneFr && it.noneFr !== it.noneEn, `${it.key} has French words`);
});

test('score: a "not offered" answer counts as done, and lists under declined; data we hold wins over the answer', () => {
  const input = { address: '1 Main St', latitude: 1, longitude: 1, phone: '250-555-0100', hasHours: true, hoursCheckedAt: today };
  const before = pc.scoreCompleteness(input, { today });
  const after = pc.scoreCompleteness({ ...input, declaredNone: ['happy_hour', 'instagram'] }, { today });
  assert.ok(after.got === before.got + 4 + 3, `${before.got} -> ${after.got}`);
  assert.ok(after.pct > before.pct);
  assert.deepEqual(after.declined.map((i) => i.key).sort(), ['happy_hour', 'instagram']);
  assert.ok(!after.missing.some((i) => i.key === 'happy_hour' || i.key === 'instagram'));
  // Reservations is a "coming" item: answering it makes it count (no longer left out of the total).
  const r = pc.scoreCompleteness({ ...input, declaredNone: ['pyv_reservations'] }, { today });
  assert.equal(r.max, before.max + 3);
  assert.ok(!r.coming.some((i) => i.key === 'pyv_reservations'));
  // Unknown or core keys are ignored.
  assert.equal(pc.scoreCompleteness({ ...input, declaredNone: ['hours', 'photo_main', 'nope'] }, { today }).got, before.got);
  // Instagram on file and an old "not on Instagram" answer: it is simply done, not shown as declined.
  const both = pc.scoreCompleteness({ ...input, instagramUrl: 'https://instagram.com/x', declaredNone: ['instagram'] }, { today });
  assert.ok(!both.declined.some((i) => i.key === 'instagram'));
});

test('edit page (restaurant): the buttons show in English and French, never on photos, hours or average spend', async () => {
  const v = mk('restaurant');
  const html = await get(`/owner/${tokenFor(v.id)}`);
  const p = panel(html);
  for (const [key, words] of [['happy_hour', 'We don’t have a happy hour'], ['specials', 'We don’t run specials'], ['entertainment', 'We don’t host music or events'],
    ['instagram', 'We’re not on Instagram'], ['facebook', 'We’re not on Facebook'], ['website', 'We don’t have a website'], ['pyv_reservations', 'We don’t take reservations'], ['pyv_takeout', 'No takeout or delivery']]) {
    assert.match(p, new RegExp(`data-cb-none="${key}">${words}<`), key);
  }
  for (const core of ['photo_main', 'photo_extra', 'hours', 'avg_spend', 'menu', 'description', 'phone', 'address_pin']) assert.ok(!p.includes(`data-cb-none="${core}"`), core);
  assert.match(p, /data-cb-declared="\[\]"/);
  assert.match(p, /data-cb-inline="\[/);
  const fr = panel(await get(`/fr/owner/${tokenFor(v.id)}`));
  assert.match(fr, /data-cb-none="happy_hour">Nous n’avons pas de happy hour</);
  assert.match(fr, /data-cb-none="instagram">Nous ne sommes pas sur Instagram</);
  assert.match(fr, /data-cb-none="pyv_takeout">Ni plats à emporter ni livraison</);
});

test('saving from the edit link: live at once, logged, in "Your updates"; the panel shows Not offered with Undo; the score goes up', async () => {
  const v = mk('restaurant');
  const token = tokenFor(v.id);
  const pctOf = (html) => Number((html.match(/Your page is (\d+)% complete/) || [])[1]);
  const before = pctOf(await get(`/owner/${token}`));
  const r = await post(token, { not_offered: ['instagram', 'happy_hour'] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.live, ['not_offered']);
  assert.deepEqual(app.venueNotOffered(v.id), ['happy_hour', 'instagram']);
  const log = db.prepare("SELECT old_value, new_value, source, reviewed_by FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'not_offered' ORDER BY id DESC").get(v.id);
  assert.deepEqual({ ...log }, { old_value: null, new_value: '["happy_hour","instagram"]', source: 'venue_owner', reviewed_by: 'owner:edit-link' });
  const req = db.prepare('SELECT status, instant FROM owner_change_requests WHERE venue_id = ? ORDER BY id DESC').get(v.id);
  assert.deepEqual({ ...req }, { status: 'approved', instant: 1 });
  assert.ok(app.ownerVenueActivity(v.id, 12, 'en').some((a) => a.status === 'approved' && /things you don’t offer/i.test(a.title)));
  assert.ok(app.ownerVenueActivity(v.id, 12, 'fr').some((a) => /ce que vous n’offrez pas/i.test(a.title)));
  const html = await get(`/owner/${token}`);
  const p = panel(html);
  assert.ok(pctOf(html) > before, `${before} -> ${pctOf(html)}`);
  assert.match(p, /You told us you don’t have these/);
  assert.match(p, /data-cb-undo="happy_hour">Undo</);
  assert.match(p, /data-cb-undo="instagram">Undo</);
  assert.match(p, /Not offered ✓/);
  assert.ok(!p.includes('data-cb-none="happy_hour"'), 'no second button once answered');
  assert.match(p, /data-cb-declared="\[&quot;happy_hour&quot;,&quot;instagram&quot;\]"/);
  const fr = panel(await get(`/fr/owner/${token}`));
  assert.match(fr, /Vous nous avez dit ne pas avoir ceci/);
  assert.match(fr, /Non offert ✓/);
  assert.match(fr, /data-cb-undo="instagram">Annuler</);
  // The owner's Undo button sends the list without that item.
  assert.equal((await post(token, { not_offered: ['happy_hour'] })).status, 201);
  assert.deepEqual(app.venueNotOffered(v.id), ['happy_hour']);
  // Sending the same list again is "nothing changed".
  const same = await post(token, { not_offered: ['happy_hour'] });
  assert.equal(same.status, 400);
});

test('our Undo from /admin/review puts the old list back', async () => {
  const v = mk('restaurant');
  const token = tokenFor(v.id);
  assert.equal((await post(token, { not_offered: ['specials'] })).status, 201);
  assert.equal((await post(token, { not_offered: ['facebook', 'specials'] })).status, 201);
  const u = app.undoOwnerInstantChange(lastInstantId(v.id), 'dayton', new Date(), 'test');
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.deepEqual(app.venueNotOffered(v.id), ['specials']);
});

test('refused: an item the page already shows, an unknown or core item, a repeat, and any type but restaurant', async () => {
  const v = mk('restaurant');
  const hh = app.guardedHappyHourUpdate(v.id, null, { times: { tue: [['16:00', '18:00']] }, source_url: 'https://example.com/hh', checked_at: today }, meta);
  assert.equal(hh.ok, true, JSON.stringify(hh));
  const token = tokenFor(v.id);
  const has = await post(token, { not_offered: ['happy_hour'] });
  assert.equal(has.status, 400);
  assert.match(has.body.errors.not_offered, /already shows this/);
  // ...and the panel doesn't offer it either (happy hour is done).
  assert.ok(!panel(await get(`/owner/${token}`)).includes('data-cb-none="happy_hour"'));
  for (const bad of [['hours'], ['photo_main'], ['nope'], ['specials', 'specials'], 'specials', [1], null]) {
    const r = await post(token, { not_offered: bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.deepEqual(app.venueNotOffered(v.id), []);
  for (const t of ['pub', 'cafe', 'winery', 'brewery']) {
    const w = mk(t);
    const r = await post(tokenFor(w.id), { not_offered: ['instagram'] });
    assert.equal(r.status, 400, t);
    assert.ok(r.body.errors.form, t);
    assert.deepEqual(app.venueNotOffered(w.id), [], t);
  }
});

test('research can\'t add back what the owner said they don\'t have; the owner\'s own saves still can', async () => {
  const v = mk('restaurant');
  const token = tokenFor(v.id);
  assert.equal((await post(token, { not_offered: ['dietary', 'entertainment', 'facebook', 'happy_hour', 'instagram', 'pyv_reservations', 'specials', 'website'] })).status, 201);
  const blocked = (r) => assert.equal(r.reason, 'owner_marked_not_offered', JSON.stringify(r));
  blocked(app.guardedHappyHourUpdate(v.id, null, { times: { fri: [['15:00', '17:00']] }, source_url: 'https://example.com/hh', checked_at: today }, meta));
  blocked(app.guardedHappyHourDealsUpdate(v.id, null, { deals: [{ text: 'Pints', price: '$6' }], source_url: 'https://example.com/hh', checked_at: today }, meta));
  blocked(app.guardedSpecialsUpdate(v.id, app.currentSpecialsJson(v.id), { specials: [{ days: ['tue'], title: 'Taco Tuesday', deal: '$3 tacos', price: '$3 each', kind: 'food' }], source_url: 'https://example.com/s', checked_at: today }, meta));
  blocked(app.guardedWeeklyNightsUpdate(v.id, app.currentWeeklyNightsJson(v.id), { nights: [{ days: ['thu'], kind: 'trivia', title: 'Trivia' }], source_url: 'https://example.com/n', checked_at: today }, meta));
  for (const [field, url] of [['instagram_url', 'https://www.instagram.com/someplace'], ['facebook_url', 'https://www.facebook.com/someplace'], ['booking_url', 'https://example.com/book']]) {
    blocked(app.guardedVenueLinkUpdate(v.id, field, null, url, meta));
  }
  blocked(app.guardedVisitInfoUpdate(v.id, app.currentVisitInfoJson(v.id), { rows: [{ label: 'Reservations', text: 'Book online.' }], booking_url: 'https://example.com/book', source_url: 'https://example.com', checked_at: today }, meta));
  const site = app.guardedWebsiteEnrichUpdate(v.id, 'https://example.com', { reason: 'r', batch_id: 'b', reviewed_by: null });
  assert.equal(site.blocked, 'owner_marked_not_offered');
  assert.equal(app.getVenue(v.id).website || null, null);
  const am = app.guardedAmenityCorrectUpdate(v.id, { vegan: { expectedCurrent: false, corrected: true }, live_music: { expectedCurrent: false, corrected: true }, patio: { expectedCurrent: false, corrected: true } }, meta);
  assert.equal(am.results.vegan, 'rejected_owner_not_offered');
  assert.equal(am.results.live_music, 'rejected_owner_not_offered');
  assert.equal(am.results.patio, 'written', 'unrelated badges are not affected');
  // A walk-ins-only row (no booking link) still goes in: it agrees with the owner.
  assert.equal(app.guardedVisitInfoUpdate(v.id, app.currentVisitInfoJson(v.id), { rows: [{ label: 'Reservations', text: 'Walk-ins only.' }], source_url: 'https://example.com', checked_at: today }, meta).ok, true);
  // Clearing is never blocked.
  assert.equal(app.guardedSpecialsUpdate(v.id, app.currentSpecialsJson(v.id), { specials: null }, meta).ok, true);
  assert.equal(app.notOfferedBlocked(v.id, 'happy_hour'), true);
  assert.equal(app.notOfferedBlocked(v.id, 'pyv_takeout'), false);
  // Another venue is not affected.
  const w = mk('restaurant');
  assert.equal(app.guardedVenueLinkUpdate(w.id, 'instagram_url', null, 'https://www.instagram.com/otherplace', meta).ok, true);
  // The owner changes their mind and sends happy hour times from their link: they wait for review, and our approval
  // (an owner change) goes through even with the old answer stored.
  const week = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, d === 'tue' ? [['16:00', '18:00']] : []]));
  const r = await post(token, { happy_hour: week });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const pending = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND status = 'pending' ORDER BY id DESC").get(v.id);
  const ok = app.approveOwnerChange(pending.id, 'dayton');
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.ok(app.getVenue(v.id).happy_hour_times || db.prepare('SELECT happy_hour_times FROM venues WHERE id = ?').get(v.id).happy_hour_times);
});

test('nothing public changes: the venue page, the API and the Verified tick stay exactly as they were', async () => {
  const v = mk('restaurant', { price: 2 });
  const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(v.id);
  const page = app.venuePagePath(app.rowToVenue ? app.rowToVenue(venue) : venue);
  const strip = (t) => t.replace(/"updated_at":"[^"]*"/g, '').replace(/"updatedAt":"[^"]*"/g, '');
  const htmlBefore = await get(page);
  const apiBefore = await get(`/api/venues/${v.id}`);
  assert.equal(app.venueIsClaimed(v.id), false);
  assert.equal((await post(tokenFor(v.id), { not_offered: ['happy_hour', 'instagram', 'pyv_takeout'] })).status, 201);
  assert.equal(await get(page), htmlBefore, 'public venue page is byte for byte the same');
  assert.equal(strip(await get(`/api/venues/${v.id}`)), strip(apiBefore), 'public API is the same');
  assert.equal(app.venueIsClaimed(v.id), false, 'a "we don\'t have one" answer alone does not claim the listing');
  assert.ok(!app.claimedVenueIds().has(v.id), 'no Verified tick');
  assert.ok(!/not_offered|Not offered|venue_not_offered/.test(await get(page)));
});

test('other types: no buttons, no data, no field word, no help topic (EN + FR)', async () => {
  for (const t of ['pub', 'cafe', 'winery', 'brewery', 'distillery', 'cocktail', 'golf', 'beach', 'shop', 'tour', 'outdoor']) {
    const v = mk(t);
    for (const lang of ['', '/fr']) {
      const html = await get(`${lang}/owner/${tokenFor(v.id)}`);
      for (const word of ['data-cb-none', 'data-cb-undo', 'data-cb-declared', 'not_offered', 'op-cb-none', 'dont-have', 'don’t offer', 'n’offrez pas']) {
        assert.ok(!html.includes(word), `${t}${lang}: page must not contain ${word}`);
      }
    }
  }
});

test('help bot: the "we don\'t have one" topic is on restaurant edit pages only, in English and French', async () => {
  const t = app.OWNER_HELP_TOPICS.find((x) => x.id === 'dont-have');
  assert.ok(t && t.a && t.aFr && t.q && t.qFr && t.completenessOnly);
  assert.match(t.a, /Undo/);
  assert.match(t.aFr, /Annuler/);
  const cfg = (html) => JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
  assert.ok(cfg(app.ownerHelpWidgetHtml('edit', { completeness: true })).topics.some((x) => x.id === 'dont-have'));
  assert.ok(!cfg(app.ownerHelpWidgetHtml('edit', { avgSpend: true })).topics.some((x) => x.id === 'dont-have'));
  const vm = require('node:vm');
  const html = app.ownerHelpWidgetHtml('edit', { completeness: true, avgSpend: true });
  const c = cfg(html);
  const ctx = { T: c.topics, cfg: c };
  vm.runInNewContext(`${html.slice(html.indexOf('function norm(s)'), html.indexOf('function ask(q)'))}; this.best = best;`, ctx);
  const misses = [];
  for (const [q, want, lang] of [['we dont have a happy hour', 'dont-have'], ['what if we dont offer that', 'dont-have'], ['we are not on instagram', 'dont-have'],
    ['nous n en avons pas', 'dont-have', 'fr'], ['what does your page is 79% complete mean', 'page-complete'], ['how do i set the average spend per person', 'avg-spend'], ['how do i add my menu', 'menu-add']]) {
    const r = ctx.best(q);
    if (r.id !== want || r.lang !== (lang || 'en')) misses.push(`"${q}" -> ${r.id} (${r.lang}), want ${want}`);
  }
  assert.deepEqual(misses, [], misses.join('\n'));
});
