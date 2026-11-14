// Owner portal: cuisine picker and one-tap "These hours are right" (2026-11-08), restaurants only.
// Cuisine: one label from OWNER_CUISINES (labels the site already uses, each with French), live at once from the edit
// link (logged, "Your updates", Undo); research never replaces a cuisine the owner picked.
// Hours: confirms the hours we show without editing them: hours_checked_at = today (Pacific), hours_source 'venue_owner';
// the hours value is never touched. Both move their completeness items from "We're adding these" to "Still to add".
// Neither makes a thin page indexable. Every other type's edit page is untouched.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-cuisine-hours-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
const app = require('../server.js');
const db = require('../db.js');
const pc = require('../portal-completeness.js');
const frenchText = require('../french-text.js');

const today = app.todayLocal();
const meta = { reason: 'research fixture', batch_id: 'test-cuisine-hours' };
const week = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, d === 'mon' ? [] : [['11:00', '21:00']]])));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Cuisine Hours ${type} ${++n}`, slug: `cuisine-hours-${type}-${n}`, region: 'kelowna', type, latitude: 49.885 + n / 1000, longitude: -119.49,
  rating: 4.4, description: 'A fixture used only by the owner cuisine and hours-confirm tests.', ...o });
const old = (days) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };
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
const post = (token, changes) => fetch(`${base}/owner/${token}/changes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.3.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 }) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const postFr = (token, changes) => fetch(`${base}/fr/owner/${token}/changes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.4.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 }) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const lastInstantId = (id) => db.prepare('SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 ORDER BY id DESC').get(id).id;
const panel = (html) => { const a = html.indexOf('id="opComplete"'); return a < 0 ? '' : html.slice(a, html.indexOf('</section>', a)); };
const row = (id) => db.prepare('SELECT cuisine, hours, hours_source, hours_checked_at FROM venues WHERE id = ?').get(id);
const pctOf = (html) => Number((html.match(/data-cb-pct="(\d+)"/) || [])[1]);

test('cuisine list: labels the site already uses, each with a French name, no duplicates', () => {
  const list = app.OWNER_CUISINES;
  assert.ok(list.length >= 40, `${list.length} labels`);
  assert.equal(new Set(list).size, list.length);
  for (const c of list) {
    assert.ok(Object.prototype.hasOwnProperty.call(frenchText.FR_CUISINE, c), `${c} is a label french-text.js already knows`);
    assert.ok(!/[<>&"]/.test(c) || c.includes('&'), c);
    assert.ok(c.length <= 40, c);
  }
});

test('edit page (restaurant): the picker, pre-selected, in English and French; the hours button only with hours', async () => {
  const v = mk('restaurant', { cuisine: 'Italian', hours: week });
  db.prepare('UPDATE venues SET hours_source = ?, hours_checked_at = ? WHERE id = ?').run('official_website', old(200), v.id);
  const html = await get(`/owner/${tokenFor(v.id)}`);
  assert.match(html, /<details class="op-fold op-sec" id="cuisine" data-task="more"/);
  // Tiles since 2026-11-09 (tests/cuisine-model.test.js covers the picker in full).
  assert.match(html, /data-cu="Italian" data-cu-label="Italian" aria-pressed="true">/);
  assert.equal((html.match(/data-cu="(American|Thai|West Coast)"/g) || []).length, 3);
  assert.match(html, /id="opHoursOkBtn">These hours are right</);
  assert.match(html, /Last checked /);
  const fr = await get(`/fr/owner/${tokenFor(v.id)}`);
  assert.match(fr, /Ce que vous servez/);
  assert.match(fr, /data-cu="Italian" data-cu-label="Italienne" aria-pressed="true">/);
  assert.match(fr, /id="opHoursOkBtn">Ces heures sont exactes</);
  // No hours: no button.
  const w = mk('restaurant');
  const h2 = await get(`/owner/${tokenFor(w.id)}`);
  assert.ok(!h2.includes('id="opHoursOkBtn"'));
  assert.match(h2, /Not set: pick your kind of food/);
  assert.ok(!/aria-pressed="true">[^<]*<\/button>[^]*id="opCuMore"/.test(h2.slice(h2.indexOf('id="opCuTiles"'), h2.indexOf('id="opCuMore"'))), 'nothing picked');
  // A stored label that isn't on the list stays shown and selected.
  const x = mk('restaurant', { cuisine: 'Bistro & bakery' });
  assert.match(await get(`/owner/${tokenFor(x.id)}`), /data-cu="Bistro &amp; bakery"[^>]*aria-pressed="true">Bistro &amp; bakery</);
});

test('cuisine from the edit link: live at once, logged, in "Your updates"; bad values refused; Undo puts the old one back', async () => {
  const v = mk('restaurant', { cuisine: 'Canadian' });
  const token = tokenFor(v.id);
  const bad = await post(token, { cuisine: 'Martian <b>' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.errors.cuisine, /Please pick what you serve from the list/);
  const badFr = await postFr(token, { cuisine: 'Nope' });
  assert.match(badFr.body.errors.cuisine, /Choisissez votre cuisine dans la liste/);
  const r = await post(token, { cuisine: 'West Coast' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.live, ['cuisine']);
  assert.equal(row(v.id).cuisine, 'West Coast');
  const log = db.prepare("SELECT old_value, new_value, source, reviewed_by FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'cuisine' ORDER BY id DESC").get(v.id);
  assert.deepEqual({ ...log }, { old_value: 'Canadian', new_value: 'West Coast', source: 'venue_owner', reviewed_by: 'owner:edit-link' });
  assert.ok(app.ownerVenueActivity(v.id, 12, 'en').some((a) => a.status === 'approved' && /cuisine/i.test(a.title)));
  assert.equal(app.ownerCuisineSet(v.id), true);
  // The same again: nothing changed.
  assert.equal((await post(token, { cuisine: 'West Coast' })).status, 400);
  // Our Undo from /admin/review.
  const u = app.undoOwnerInstantChange(lastInstantId(v.id), 'dayton', new Date(), 'test');
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.equal(row(v.id).cuisine, 'Canadian');
  assert.equal(app.ownerCuisineSet(v.id), false, 'after an Undo, research may correct it again');
  // The public page shows the owner's pick, escaped.
  assert.equal((await post(token, { cuisine: 'Breakfast & Brunch' })).status, 201);
  const page = await get(app.venuePagePath(app.getVenue(v.id)));
  assert.ok(page.includes('Breakfast &amp; Brunch'));
  assert.ok(!page.includes('Breakfast & Brunch<'));
});

test('research never replaces a cuisine the owner picked', async () => {
  const v = mk('restaurant', { cuisine: 'German' });
  // Before the owner: research may correct it.
  assert.equal(app.guardedCuisineUpdate(v.id, 'German', 'French', meta).ok, true);
  assert.equal((await post(tokenFor(v.id), { cuisine: 'Mediterranean' })).status, 201);
  const r = app.guardedCuisineUpdate(v.id, 'Mediterranean', 'Greek', meta);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'owner_value_protected');
  assert.equal(row(v.id).cuisine, 'Mediterranean');
  const res = await fetch(`${base}/admin/set-cuisine`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner-cuisine-hours-admin-token' },
    body: JSON.stringify({ id: v.id, expected_current: 'Mediterranean', cuisine: 'Greek', ...meta }) });
  assert.equal(res.status, 409);
  assert.equal(row(v.id).cuisine, 'Mediterranean');
});

test('"These hours are right": the date and source only, never the hours; the 30-day item flips; Undo restores', async () => {
  const v = mk('restaurant', { hours: week });
  db.prepare('UPDATE venues SET hours_source = ?, hours_checked_at = ? WHERE id = ?').run('official_website', old(200), v.id);
  const token = tokenFor(v.id);
  const before = await get(`/owner/${token}`);
  // One tap right in the row (fresh-eyes 2026-11-08): the hours as text, "Yes, these are right" and "Change them".
  assert.ok(panel(before).includes('data-cb-save="{&quot;hours_checked&quot;:true}"'), 'the row saves hours_checked in one tap');
  assert.ok(panel(before).includes('>Yes, these are right<') && panel(before).includes('data-cb-task="hours" data-cb-id="hours">Change them<'));
  assert.ok(panel(before).includes('Are your hours still right?'));
  const hoursBefore = row(v.id).hours;
  const r = await post(token, { hours_checked: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.live, ['hours_checked']);
  const after = row(v.id);
  assert.equal(after.hours, hoursBefore, 'the hours are byte for byte the same');
  assert.equal(after.hours_checked_at, today);
  assert.equal(after.hours_source, 'venue_owner');
  const logs = db.prepare("SELECT field_name, old_value, new_value, source FROM venue_enrichment_log WHERE venue_id = ? AND field_name IN ('hours', 'hours_source', 'hours_checked_at') ORDER BY id").all(v.id).map((x) => ({ ...x }));
  assert.deepEqual(logs, [
    { field_name: 'hours_source', old_value: 'official_website', new_value: 'venue_owner', source: 'venue_owner' },
    { field_name: 'hours_checked_at', old_value: old(200), new_value: today, source: 'venue_owner' },
  ]);
  assert.ok(app.ownerVenueActivity(v.id, 12, 'en').some((a) => /hours confirmed/i.test(a.title)));
  assert.ok(app.ownerVenueActivity(v.id, 12, 'fr').some((a) => /heures confirmées/i.test(a.title)));
  const html = await get(`/owner/${token}`);
  assert.ok(pctOf(html) > pctOf(before), `${pctOf(before)} -> ${pctOf(html)}`);
  assert.ok(!panel(html).includes('data-cb-id="opHoursOk"'), 'done now');
  assert.match(html, /You confirmed these hours today/);
  assert.match(html, /id="opHoursOkBtn" hidden>/);
  // Again today: nothing changed.
  assert.equal((await post(token, { hours_checked: true })).status, 400);
  // Undo puts back the old date and source; the hours never move.
  const u = app.undoOwnerInstantChange(lastInstantId(v.id), 'dayton', new Date(), 'test');
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.deepEqual({ ...row(v.id) }, { cuisine: null, hours: hoursBefore, hours_source: 'official_website', hours_checked_at: old(200) });
  // Score module agrees: 89 days fresh, 91 stale.
  assert.equal(pc.doneMap({ hasHours: true, hoursCheckedAt: old(29) }, today).hours_fresh, true);
  assert.equal(pc.doneMap({ hasHours: true, hoursCheckedAt: old(31) }, today).hours_fresh, false);
});

test('"These hours are right" is refused without hours, while new hours wait for review, and with anything but true', async () => {
  const none = mk('restaurant');
  const r = await post(tokenFor(none.id), { hours_checked: true });
  assert.equal(r.status, 400);
  assert.match(r.body.errors.hours_checked, /We don’t have your hours yet/);
  assert.equal((await post(tokenFor(none.id), { hours_checked: 'yes' })).status, 400);
  const v = mk('restaurant', { hours: week });
  const token = tokenFor(v.id);
  const newWeek = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['10:00', '20:00']]]));
  const sent = await post(token, { hours: newWeek });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.deepEqual(sent.body.review, ['hours'], 'hours from the link wait for review');
  assert.ok(!(await get(`/owner/${token}`)).includes('id="opHoursOkBtn"'), 'no button while new hours wait');
  const w = await post(token, { hours_checked: true });
  assert.equal(w.status, 400);
  assert.match(w.body.errors.hours_checked, /waiting for review/);
  const wFr = await postFr(token, { hours_checked: true });
  assert.match(wFr.body.errors.hours_checked, /attendent notre vérification/);
});

test('panel: cuisine and fresh hours are in "Still to add", not "We\'re adding these"', async () => {
  const v = mk('restaurant', { hours: week });
  db.prepare('UPDATE venues SET hours_source = ?, hours_checked_at = ? WHERE id = ?').run('official_website', old(120), v.id);
  const p = panel(await get(`/owner/${tokenFor(v.id)}`));
  const soon = p.slice(p.indexOf('We’re adding these'));
  assert.ok(p.includes('data-cb-task="more" data-cb-id="cuisine">Pick cuisine<'));
  assert.ok(p.includes('>Yes, these are right<'));
  assert.ok(!soon.includes('What you serve') && !soon.includes('Are your hours still right?'));
  const fr = panel(await get(`/fr/owner/${tokenFor(v.id)}`));
  assert.ok(fr.includes('>Choisir<') && fr.includes('>Oui, elles sont exactes<') && fr.includes('Vos heures sont-elles toujours exactes\u202f?'));
  for (const k of ['cuisine', 'hours_fresh']) assert.equal(pc.ITEMS.find((i) => i.key === k).fix, true);
});

test('indexing and Verified: a picked cuisine or confirmed hours is a tap, not owner content; it does show the Verified tick like any live owner edit', async () => {
  const v = mk('restaurant', { hours: week });
  db.prepare('UPDATE venues SET hours_source = ?, hours_checked_at = ? WHERE id = ?').run('official_website', old(200), v.id);
  assert.equal(app.venueIsClaimed(v.id), false);
  assert.equal((await post(tokenFor(v.id), { hours_checked: true })).status, 201);
  assert.equal((await post(tokenFor(v.id), { cuisine: 'Thai' })).status, 201);
  assert.equal(app.venueIsClaimed(v.id), true, 'a live owner edit, as before (PR 786 rule)');
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /WHERE key NOT IN \('avg_spend', 'not_offered', 'cuisine'(?:, '[a-z_]+')*, 'hours_checked'(?:, '[a-z_]+')*\)/, 'owner-content check leaves these out');
});

test('other types: no picker, no hours button, no field word (EN + FR)', async () => {
  for (const t of ['cocktail', 'golf', 'beach', 'shop', 'tour', 'outdoor']) { // cafés have the picker (kind of café) since 2026-11-10; distilleries since 2026-11-13
    const v = mk(t, { hours: week });
    for (const lang of ['', '/fr']) {
      const html = await get(`${lang}/owner/${tokenFor(v.id)}`);
      for (const word of ['opCuisine', 'opHoursOk', 'hours_checked', 'These hours are right', 'Ces heures sont exactes', 'hours-right', 'cuisine-pick']) {
        assert.ok(!html.includes(word), `${t}${lang}: page must not contain ${word}`);
      }
    }
    const r = await post(tokenFor(v.id), { cuisine: 'Thai' });
    assert.equal(r.status, 400, `${t}: cuisine is not offered`);
    assert.equal((await post(tokenFor(v.id), { hours_checked: true })).status, 400, `${t}: hours confirm is not offered`);
  }
});

test('help bot: the two new topics are on restaurant edit pages only, and answer the obvious questions', async () => {
  for (const id of ['hours-right', 'cuisine-pick']) {
    const t = app.OWNER_HELP_TOPICS.find((x) => x.id === id);
    assert.ok(t && t.a && t.aFr && t.q && t.qFr && t.completenessOnly, id);
  }
  const cfg = (html) => JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
  assert.ok(!cfg(app.ownerHelpWidgetHtml('edit', { avgSpend: true })).topics.some((x) => x.id === 'hours-right'));
  const vm = require('node:vm');
  const html = app.ownerHelpWidgetHtml('edit', { completeness: true, avgSpend: true });
  const c = cfg(html);
  const ctx = { T: c.topics, cfg: c };
  vm.runInNewContext(`${html.slice(html.indexOf('function norm(s)'), html.indexOf('function ask(q)'))}; this.best = best;`, ctx);
  const misses = [];
  for (const [q, want, lang] of [['my hours havent changed', 'hours-right'], ['how do i confirm my hours', 'hours-right'], ['how do i change my cuisine', 'cuisine-pick'],
    ['confirmer mes heures', 'hours-right', 'fr'], ['how do i set my hours', 'hours'], ['we dont have a happy hour', 'dont-have'], ['what does your page is 79% complete mean', 'page-complete']]) {
    const r = ctx.best(q);
    if (r.id !== want || r.lang !== (lang || 'en')) misses.push(`"${q}" -> ${r.id} (${r.lang}), want ${want}`);
  }
  assert.deepEqual(misses, [], misses.join('\n'));
});
