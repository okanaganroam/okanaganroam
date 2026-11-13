// Owner portal: "Plan your visit" lines (2026-11-08), restaurants only. Five short boxes on the edit page (Known for,
// Reservations, Takeout and delivery, Dietary note, Groups and good to know), each one row of the public "Plan your
// visit" box (venue_visit_info). Plain text, 180 characters, no < > and no links. Live at once from the edit link
// (logged, "Your updates", Undo). Research never replaces, removes or brings back a row the owner wrote or cleared.
// Also: the French for the PR 788 "Your page already shows this" error.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-plan-visit-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
const app = require('../server.js');
const db = require('../db.js');
const pc = require('../portal-completeness.js');

const today = app.todayLocal();
const meta = { reason: 'research fixture', batch_id: 'test-plan-visit' };
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Plan Visit ${type} ${++n}`, slug: `plan-visit-${type}-${n}`, region: 'kelowna', type, latitude: 49.885 + n / 1000, longitude: -119.49,
  rating: 4.4, description: 'A fixture used only by the owner plan-your-visit tests.', ...o });
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
const postTo = (prefix, token, changes) => fetch(`${base}${prefix}/owner/${token}/changes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.5.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 }) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const post = (token, changes) => postTo('', token, changes);
const postFr = (token, changes) => postTo('/fr', token, changes);
const lastInstantId = (id) => db.prepare('SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 ORDER BY id DESC').get(id).id;
const panel = (html) => { const a = html.indexOf('id="opComplete"'); return a < 0 ? '' : html.slice(a, html.indexOf('</section>', a)); };
const rows = (id) => ((app.venueVisitInfo(id) || {}).rows || []);
const rowText = (id, label) => (rows(id).find((r) => r.label === label) || {}).text;
const research = (id, visit) => app.guardedVisitInfoUpdate(id, app.currentVisitInfoJson(id), visit, meta);
const box = (rowsIn, extra = {}) => ({ rows: rowsIn, booking_url: null, source_url: 'https://example.com/', checked_at: today, ...extra });

test('edit page (restaurant): the five boxes, pre-filled from the box we hold, with examples, in English and French', async () => {
  const v = mk('restaurant');
  assert.equal(research(v.id, box([{ label: 'Known for', text: 'Smash burgers' }, { label: 'To go', text: 'Order by phone' }, { label: 'Patio', text: 'Heated patio' }])).ok, true);
  const html = await get(`/owner/${tokenFor(v.id)}`);
  for (const id of ['opVisitKnown', 'opVisitReservations', 'opVisitTakeout', 'opVisitDietary', 'opVisitGroups']) assert.ok(html.includes(`id="${id}"`), id);
  // Final fresh-eyes (2026-11-09): the boxes are textareas that grow as the owner types (still one line of text, 180 max).
  assert.match(html, /<textarea id="opVisitKnown" class="op-visit-ta" rows="1" data-visit-key="known_for" maxlength="180"[^>]*placeholder="e\.g\. Wood-fired pizza and the lakeside patio">Smash burgers<\/textarea>/);
  assert.match(html, /id="opVisitTakeout"[^>]*>Order by phone<\/textarea>/, 'reads the "To go" row');
  assert.ok(html.includes('Save these lines'));
  const fr = await get(`/fr/owner/${tokenFor(v.id)}`);
  assert.ok(fr.includes('Planifier la visite') && fr.includes('Enregistrer ces lignes') && fr.includes('Connu pour'));
});

test('save from the edit link: live at once, logged, in "Your updates"; other rows kept; clearing a box removes the row; Undo puts it back', async () => {
  const v = mk('restaurant');
  assert.equal(research(v.id, box([{ label: 'Menu', text: 'Burgers and bowls' }, { label: 'Reservations', text: 'Walk-ins only', url: 'https://example.com/book' }])).ok, true);
  const token = tokenFor(v.id);
  const r = await post(token, { visit_rows: { known_for: '  Wood-fired   pizza and the lakeside patio ', reservations: 'Book online or call' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.live, ['visit_rows']);
  assert.equal(rowText(v.id, 'Known for'), 'Wood-fired pizza and the lakeside patio');
  assert.equal(rowText(v.id, 'Reservations'), 'Book online or call');
  assert.equal(rows(v.id).find((x) => x.label === 'Reservations').url, undefined, 'a changed line drops its old link');
  assert.equal(rowText(v.id, 'Menu'), 'Burgers and bowls', 'rows the owner did not touch stay');
  const info = app.venueVisitInfo(v.id);
  assert.deepEqual(info.owner_labels, ['Known for', 'Reservations']);
  assert.equal(info.checked_at, today);
  const log = db.prepare("SELECT source, reviewed_by, new_value FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'visit_info' ORDER BY id DESC").get(v.id);
  assert.equal(log.source, 'venue_owner');
  assert.equal(log.reviewed_by, 'owner:edit-link');
  assert.ok(log.new_value.includes('Wood-fired pizza'));
  assert.ok(app.ownerVenueActivity(v.id, 12, 'en').some((a) => a.status === 'approved' && /plan your visit/i.test(a.title)));
  // The same again: nothing changed.
  assert.equal((await post(token, { visit_rows: { known_for: 'Wood-fired pizza and the lakeside patio' } })).status, 400);
  // Clearing a box removes that row (and only that row).
  assert.equal((await post(token, { visit_rows: { reservations: '' } })).status, 201);
  assert.equal(rowText(v.id, 'Reservations'), undefined);
  assert.equal(rowText(v.id, 'Known for'), 'Wood-fired pizza and the lakeside patio');
  // Undo (from /admin/review) puts the line back.
  const u = app.undoOwnerInstantChange(lastInstantId(v.id), 'dayton', new Date(), 'test');
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.equal(rowText(v.id, 'Reservations'), 'Book online or call');
  // A whole box written from nothing (no research box before).
  const w = mk('restaurant');
  assert.equal((await post(tokenFor(w.id), { visit_rows: { dietary: 'Gluten-free buns', groups: 'Groups of 10+ please call ahead', takeout: 'Takeout by phone' } })).status, 201);
  assert.deepEqual(rows(w.id).map((x) => x.label).sort(), ['Dietary', 'Good to know', 'Takeout']);
});

test('validation: length, < >, links and unknown keys are refused, in English and French', async () => {
  const v = mk('restaurant');
  const token = tokenFor(v.id);
  const cases = [
    [{ known_for: 'x'.repeat(181) }, /180 characters or less/, /180 caractères ou moins/],
    [{ dietary: 'Vegan <b>options</b>' }, /plain words only/, /sans < ni >/],
    [{ reservations: 'Book at https://opentable.ca/r/x' }, /leave links out/, /Laissez les liens hors/],
    [{ reservations: 'Book at www.example.com' }, /leave links out/, /Laissez les liens hors/],
    [{ takeout: 'Order at ourplace.ca' }, /leave links out/, /Laissez les liens hors/],
    [{ patio: 'Yes' }, /could not be read/, /illisible/],
  ];
  for (const [rowsIn, en, fr] of cases) {
    const r = await post(token, { visit_rows: rowsIn });
    assert.equal(r.status, 400, JSON.stringify(rowsIn));
    assert.match(r.body.errors.visit_rows, en);
    const f = await postFr(token, { visit_rows: rowsIn });
    assert.match(f.body.errors.visit_rows, fr);
  }
  assert.equal((await post(token, { visit_rows: 'nope' })).status, 400);
  assert.equal((await post(token, { visit_rows: { known_for: 'x'.repeat(180) } })).status, 201, '180 is fine');
  assert.deepEqual(rows(v.id), [{ label: 'Known for', text: 'x'.repeat(180) }]);
});

test('research never replaces, removes or brings back a row the owner wrote or cleared; its other rows still go in', async () => {
  const v = mk('restaurant');
  assert.equal(research(v.id, box([{ label: 'Known for', text: 'Research words' }, { label: 'Takeout', text: 'Research takeout' }, { label: 'Groups', text: 'Research groups' }])).ok, true);
  const token = tokenFor(v.id);
  assert.equal((await post(token, { visit_rows: { known_for: 'Owner words', takeout: '', groups: 'Owner groups' } })).status, 201);
  assert.equal(rowText(v.id, 'Groups'), 'Owner groups', 'an existing "Groups" row is the groups line');
  // Research rewrites the box: the owner's lines stay, the cleared one stays gone, new research rows go in.
  const r = research(v.id, box([{ label: 'Known for', text: 'Research again' }, { label: 'To go', text: 'Research to go' }, { label: 'Good to know', text: 'Research gtk' }, { label: 'Patio', text: 'Heated patio' }]));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(rowText(v.id, 'Known for'), 'Owner words');
  assert.equal(rowText(v.id, 'Takeout'), undefined);
  assert.equal(rowText(v.id, 'To go'), undefined, 'the same slot under its other label is blocked too');
  assert.equal(rowText(v.id, 'Good to know'), undefined);
  assert.equal(rowText(v.id, 'Groups'), 'Owner groups');
  assert.equal(rowText(v.id, 'Patio'), 'Heated patio');
  // Research clearing the box keeps the owner's lines.
  assert.equal(research(v.id, null).ok, true);
  assert.deepEqual(rows(v.id).map((x) => x.text).sort(), ['Owner groups', 'Owner words']);
  // Before an owner touches a venue, research works as it always did.
  const w = mk('restaurant');
  assert.equal(research(w.id, box([{ label: 'Known for', text: 'A' }])).ok, true);
  assert.equal(research(w.id, box([{ label: 'Known for', text: 'B' }])).ok, true);
  assert.equal(rowText(w.id, 'Known for'), 'B');
  assert.equal(app.venueVisitInfo(w.id).owner_labels, undefined);
});

test('completeness: all five Plan your visit items are in "Still to add" with buttons; only "Confirmed by you" is still coming', async () => {
  // The dietary line counts toward Dietary options since the live check (2026-11-08); its box stays.
  assert.ok(!pc.ITEMS.some((i) => i.key === 'pyv_dietary'));
  for (const k of ['pyv_known', 'pyv_reservations', 'pyv_takeout', 'pyv_groups']) assert.equal(pc.ITEMS.find((i) => i.key === k).fix, true, k);
  const v = mk('restaurant');
  const p = panel(await get(`/owner/${tokenFor(v.id)}`));
  assert.ok(p.includes('data-cb-task="more" data-cb-id="opVisitKnown">Write it<'));
  assert.ok(p.includes('data-cb-task="more" data-cb-id="opVisitReservations">Add it<'));
  const soon = p.slice(p.indexOf('We’re adding these'));
  assert.ok(p.indexOf('We’re adding these') > 0);
  for (const name of ['Known for', 'Reservations', 'Takeout and delivery', 'Dietary note', 'Groups and good to know']) assert.ok(!soon.includes(`<strong>${name}</strong>`), name);
  assert.ok(soon.includes('Confirmed by you'));
  assert.ok(!p.includes('Don’t offer these?'), 'no separate list any more: the buttons sit with their items');
  const pctOf = (html) => Number((html.match(/data-cb-pct="(\d+)"/) || [])[1]);
  const before = pctOf(p);
  assert.equal((await post(tokenFor(v.id), { visit_rows: { known_for: 'Pizza', reservations: 'Walk-ins only', takeout: 'By phone', dietary: 'Vegan pizza', groups: 'Call for 8+' } })).status, 201);
  const after = panel(await get(`/owner/${tokenFor(v.id)}`));
  assert.ok(pctOf(after) > before, `${before} -> ${pctOf(after)}`);
  assert.ok(!after.includes('data-cb-id="opVisitKnown"'));
});

test('"We don\'t have one" still works for Reservations and Takeout when the box is empty; a written line makes the item done', async () => {
  const v = mk('restaurant');
  const token = tokenFor(v.id);
  const p = panel(await get(`/owner/${token}`));
  assert.ok(p.includes('data-cb-none="pyv_reservations"') && p.includes('data-cb-none="pyv_takeout"'));
  assert.ok(p.includes('&quot;key&quot;:&quot;pyv_reservations&quot;,&quot;id&quot;:&quot;opVisitReservations&quot;'), 'the inline button sits under the Reservations box');
  assert.equal((await post(token, { not_offered: ['pyv_takeout'] })).status, 201);
  // With a line written, saying "we don't have one" for it is refused (the PR 788 rule), in English and French.
  assert.equal((await post(token, { visit_rows: { reservations: 'Walk-ins welcome' } })).status, 201);
  const r = await post(token, { not_offered: ['pyv_reservations', 'pyv_takeout'] });
  assert.equal(r.status, 400);
  assert.match(r.body.errors.not_offered, /Your page already shows this/);
  const f = await postFr(token, { not_offered: ['pyv_reservations', 'pyv_takeout'] });
  assert.match(f.body.errors.not_offered, /Votre fiche le montre déjà/);
  // A takeout line written after "no takeout": the item is simply done.
  assert.equal((await post(token, { visit_rows: { takeout: 'Pickup at the bar' } })).status, 201);
  const s = pc.scoreCompleteness({ visitLabels: rows(v.id).map((x) => x.label), declaredNone: ['pyv_takeout'] }, { today });
  assert.ok(!s.declined.some((i) => i.key === 'pyv_takeout'));
  assert.ok(!s.missing.some((i) => i.key === 'pyv_takeout'));
});

test('public page: the owner\'s lines show in the Plan your visit box, escaped; a French page leaves untranslated lines off', async () => {
  const v = mk('restaurant');
  assert.equal((await post(tokenFor(v.id), { visit_rows: { known_for: 'Fish & chips "the best"', dietary: 'Ask about gluten-free' } })).status, 201);
  const page = await get(app.venuePagePath(app.getVenue(v.id)));
  assert.ok(page.includes('Plan your visit'));
  assert.ok(page.includes('Fish &amp; chips &quot;the best&quot;'));
  assert.ok(page.includes('Ask about gluten-free'));
  assert.ok(/From the venue, checked/.test(page), 'owner lines are credited to the venue');
  assert.ok(!page.includes('Fish & chips "the best"'));
  // A French page shows a line only once it is translated (the box's existing rule): no English line there.
  const f = mk('restaurant', { description_fr: 'Un restaurant de test utilisé seulement par ces essais.' });
  assert.equal((await post(tokenFor(f.id), { visit_rows: { known_for: 'Owner line in English only' } })).status, 201);
  const frPage = await get(app.venuePagePath(app.getVenue(f.id), 'fr'));
  assert.ok(frPage.includes('lang="fr'), 'a real French page');
  assert.ok(!frPage.includes('Owner line in English only'));
});

test('indexing: Plan your visit lines are not owner content (yet); like any live owner edit they show the Verified tick', async () => {
  const v = mk('restaurant');
  assert.equal(app.venueIsClaimed(v.id), false);
  assert.equal((await post(tokenFor(v.id), { visit_rows: { known_for: 'Pizza' } })).status, 201);
  assert.equal(app.venueIsClaimed(v.id), true);
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /WHERE key NOT IN \('avg_spend', 'not_offered', 'cuisine', (?:'[a-z_]+', )*'hours_checked', 'visit_rows'(?:, 'pub_info')?(?:, 'cafe_info')?(?:, 'winery_info', 'tasting_fee')?(?:, 'brewery_info', 'flight_fee')?\)/);
});

test('other types: no Plan your visit section, and the field is refused (EN + FR pages)', async () => {
  for (const t of ['cocktail', 'golf', 'beach', 'shop', 'tour', 'outdoor']) { // distilleries have the setup since 2026-11-13
    const v = mk(t);
    for (const lang of ['', '/fr']) {
      const html = await get(`${lang}/owner/${tokenFor(v.id)}`);
      for (const word of ['opVisitKnown', 'data-visit-key', 'Save these lines', 'Enregistrer ces lignes', '"id":"plan-visit"']) { const at = html.indexOf(word); assert.ok(at < 0, `${t}${lang}: ${word}: ${html.slice(at - 120, at + 40)}`); }
    }
    assert.equal((await post(tokenFor(v.id), { visit_rows: { known_for: 'x' } })).status, 400, t);
  }
});

test('help bot: the Plan your visit topic is on restaurant edit pages only and answers the obvious question', async () => {
  const t = app.OWNER_HELP_TOPICS.find((x) => x.id === 'plan-visit');
  assert.ok(t && t.a && t.aFr && t.q && t.qFr && t.completenessOnly);
  const cfg = (html) => JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
  assert.ok(!cfg(app.ownerHelpWidgetHtml('edit', { avgSpend: true })).topics.some((x) => x.id === 'plan-visit'));
  const vm = require('node:vm');
  const html = app.ownerHelpWidgetHtml('edit', { completeness: true, avgSpend: true });
  const c = cfg(html);
  const ctx = { T: c.topics, cfg: c };
  vm.runInNewContext(`${html.slice(html.indexOf('function norm(s)'), html.indexOf('function ask(q)'))}; this.best = best;`, ctx);
  const misses = [];
  for (const [q, want, lang] of [['how do i fill in plan your visit', 'plan-visit'], ['where do i add the known for line', 'plan-visit'], ['planifier la visite', 'plan-visit', 'fr'],
    ['how do i change my cuisine', 'cuisine-pick'], ['we dont have a happy hour', 'dont-have'], ['how do i set my hours', 'hours']]) {
    const r = ctx.best(q);
    if (r.id !== want || r.lang !== (lang || 'en')) misses.push(`"${q}" -> ${r.id} (${r.lang}), want ${want}`);
  }
  assert.deepEqual(misses, [], misses.join('\n'));
});
