// Owner portal, fresh-eyes fixes (2026-11-08). A first-time-owner test on a phone found that "We don't have one" reloaded
// the page and lost unsent typing, jump buttons missed their field, sent changes still counted as "left", "Confirm
// hours" was not one tap, saving was unclear, and a few bugs. This file covers what can be checked without a browser:
//   - the bar redraws from GET .../completeness (restaurants only) instead of reloading;
//   - waiting-for-review is field-precise (a vegetarian badge flags Dietary options, never Live music) and is never "left";
//   - "Are your hours still right?" and the average-spend estimate are one tap in the row; the estimate earns its
//     points once confirmed;
//   - photos waiting for review count as waiting; the badges summary names the ticked badges; time inputs fit;
//   - the edit-link send step says it is checked first, the live saves say they go live, contact fields hide until needed.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-fresh-eyes-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
const app = require('../server.js');
const db = require('../db.js');
const pc = require('../portal-completeness.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const week = JSON.stringify({ mon: [], tue: [['11:30', '21:00']], wed: [['11:30', '21:00']], thu: [['11:30', '21:00']], fri: [['11:30', '22:00']], sat: [['11:00', '22:00']], sun: [['11:00', '20:00']] });
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Fresh Eyes ${type} ${++n}`, slug: `fresh-eyes-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.4, address: '214 Main St', phone: '250-555-0142', description: 'A fixture used only by the fresh-eyes tests.', ...o });
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
const post = (token, changes, lang = '') => fetch(`${base}${lang}/owner/${token}/changes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.7.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 }) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const bar = async (token, lang = '') => { const r = await fetch(`${base}${lang}/owner/${token}/completeness`); return { status: r.status, headers: r.headers, body: await r.json() }; };
const pctOf = (html) => Number((/Your page is (\d+)% complete/.exec(html) || /complète à (\d+) %/.exec(html) || [])[1]);
const research = (amount) => ({ amount, source: 'research', source_url: 'https://example.com/menu', basis: 'Estimated from the menu: median main $26 plus a soft drink', checked_at: today });

test('redraw instead of reload: GET .../completeness gives the bar for a restaurant (EN + FR), nothing for other types', async () => {
  const v = mk('restaurant', { hours: week });
  const token = tokenFor(v.id);
  const en = await bar(token);
  assert.equal(en.status, 200);
  assert.equal(en.headers.get('cache-control'), 'no-store');
  assert.match(en.headers.get('x-robots-tag'), /noindex/);
  assert.equal(en.body.ok, true);
  assert.match(en.body.html, /^<section class="op-cb" id="opComplete"/);
  const page = await get(`/owner/${token}`);
  const inPage = page.slice(page.indexOf('<section class="op-cb" id="opComplete"'), page.indexOf('</section>', page.indexOf('id="opComplete"')) + 10);
  assert.equal(en.body.html, inPage, 'the redraw is exactly the bar on the page');
  const fr = await bar(token, '/fr');
  assert.match(fr.body.html, /Votre fiche est complète à \d+ %/);
  for (const type of ['cafe', 'pub', 'winery']) assert.equal((await bar(tokenFor(mk(type).id))).status, 404, type);
  assert.equal((await bar('not-a-real-token')).status, 404);
  // After a live save the redraw shows the new score (this is what the page swaps in, with no reload).
  const before = pctOf(en.body.html);
  assert.equal((await post(token, { not_offered: ['facebook'] })).status, 201);
  assert.ok(pctOf((await bar(token)).body.html) > before);
  // Nothing in the bar's script or the live saves reloads the page any more.
  assert.ok(!pc.COMPLETENESS_SCRIPT.includes('location.reload'), 'bar script never reloads');
  const script = page.slice(page.indexOf('(function(){', page.indexOf('<script>')));
  const cuisineHours = script.slice(script.indexOf("var hb = document.getElementById('opHoursOkBtn')"), script.indexOf('function gather') > 0 ? script.indexOf('function gather') : script.indexOf("var cs = document.getElementById('opCuisineSave')") + 2000);
  assert.ok(!cuisineHours.includes('location.reload'), 'cuisine, hours and Plan your visit saves never reload');
  assert.ok(page.includes("if (window.opCbRefresh) window.opCbRefresh('');"), 'live saves redraw the bar');
});

test('waiting is field-precise: a vegetarian badge flags Dietary options, never Live music; waiting is never "left"', async () => {
  const v = mk('restaurant', { hours: week });
  const token = tokenFor(v.id);
  const r = await post(token, { badges: { vegetarian: true, kid_friendly: true } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.review, ['badges']);
  const html = (await bar(token)).body.html;
  const waiting = html.slice(html.indexOf('>Waiting for our check<'));
  assert.ok(waiting.includes('Dietary options'), 'dietary is waiting');
  assert.ok(!waiting.includes('Live music or events'), 'live music is not waiting');
  assert.match(html, / · 1 waiting for our check\. Tap to start\./);
  // Pure: badge keys map to their own items.
  const score = (pending) => pc.scoreCompleteness({ address: 'x', latitude: 1, longitude: 1, phone: 'x', hasHours: true }, { today, pending: new Set(pending) });
  const s1 = score(['badges', 'badge:vegetarian']);
  assert.deepEqual(s1.waiting.map((i) => i.key), ['dietary']);
  const s2 = score(['badges', 'badge:live_music']);
  assert.deepEqual(s2.waiting.map((i) => i.key), ['entertainment']);
  assert.deepEqual(score(['badges', 'badge:patio']).waiting, [], 'a badge no item asks about flags nothing');
  assert.equal(pc.ITEMS.find((i) => i.key === 'entertainment').fields.includes('badges'), false);
});

test('header: quick ones, then "N waiting for our check"; nothing left but waiting says so (EN + FR)', () => {
  const base0 = { address: 'x', latitude: 1, longitude: 1, phone: 'x', website: 'x', cuisine: 'x', hasHours: true, hoursCheckedAt: today, imageUrl: '/images/a.jpg', photoCount: 3, avgSpend: 20, avgSpendSource: 'owner',
    menuUrl: 'x', vegan: true, hasHappyHour: true, specialsCount: 1, liveMusic: true, visitLabels: ['Known for', 'Reservations', 'Takeout', 'Dietary', 'Groups'], description: 'z'.repeat(130), instagramUrl: 'x', facebookUrl: 'x', hasArrival: true, claimed: true };
  const r = pc.scoreCompleteness({ ...base0, description: '', instagramUrl: '' }, { today, pending: new Set(['description', 'instagram_url']) });
  assert.equal(r.quick.length, 0);
  assert.equal(r.waiting.length, 2);
  const head = (h) => h.slice(0, h.indexOf('op-cb-panel'));
  assert.match(head(pc.renderCompleteness(r, {})), /Nothing left for you to do · 2 waiting for our check \(usually within a day\)\./);
  assert.match(head(pc.renderCompleteness(r, { fr: true })), /Rien d’autre à faire pour vous · 2 en attente de notre vérification \(habituellement en moins d’une journée\)\./);
  assert.ok(r.pctWithWaiting > r.pct, 'the ring shows what will count once approved');
  assert.match(pc.renderCompleteness(r, {}), new RegExp(`style="--p:${r.pct};--w:${r.pctWithWaiting}"`));
  const r2 = pc.scoreCompleteness({ ...base0, description: '', facebookUrl: '' }, { today, pending: new Set(['description']) });
  assert.match(head(pc.renderCompleteness(r2, {})), /1 quick one, under a minute · 1 waiting for our check\. Tap to start\./);
  assert.match(head(pc.renderCompleteness(r2, { fr: true })), /1 élément rapide, moins d’une minute · 1 en attente de notre vérification\. Touchez pour commencer\./);
});

test('"Are your hours still right?": the hours as text with one-tap yes; not offered without hours or while new hours wait', async () => {
  assert.equal(pc.hoursLine(JSON.parse(week)), 'Mon closed · Tue–Thu 11:30 AM–9 PM · Fri 11:30 AM–10 PM · Sat 11 AM–10 PM · Sun 11 AM–8 PM');
  assert.equal(pc.hoursLine(JSON.parse(week), true), 'lun. fermé · mar.–jeu. 11 h 30–21 h · ven. 11 h 30–22 h · sam. 11 h–22 h · dim. 11 h–20 h');
  const v = mk('restaurant', { hours: week });
  db.prepare('UPDATE venues SET hours_source = ?, hours_checked_at = ? WHERE id = ?').run('official_website', '2026-01-02', v.id);
  const token = tokenFor(v.id);
  const html = (await bar(token)).body.html;
  assert.ok(html.includes('Are your hours still right?'));
  assert.ok(html.includes('Mon closed<br>Tue–Thu 11:30 AM–9 PM<br>'), 'one day group per line');
  assert.ok(html.includes('data-cb-save="{&quot;hours_checked&quot;:true}"'));
  assert.ok(html.includes('data-cb-task="hours" data-cb-id="hours">Change them<'));
  const before = pctOf(html);
  const r = await post(token, { hours_checked: true });
  assert.equal(r.status, 201);
  const after = (await bar(token)).body.html;
  assert.ok(pctOf(after) > before, `${before} -> ${pctOf(after)}`);
  assert.ok(!after.includes('Are your hours still right?'));
  // No hours on file: "Add hours" only, never "Yes, these are right".
  const bare = (await bar(tokenFor(mk('restaurant').id))).body.html;
  assert.ok(!bare.includes('Yes, these are right'));
  assert.ok(bare.includes('>Add your hours<'));
  // New hours waiting for review: no one-tap yes on the old ones.
  const w = mk('restaurant', { hours: week });
  assert.equal((await post(tokenFor(w.id), { hours: JSON.parse(week.replace('"21:00"', '"20:00"')) })).status, 201);
  assert.ok(!(await bar(tokenFor(w.id))).body.html.includes('Yes, these are right'));
});

test('average spend: a research estimate counts once confirmed; the row offers "Yes, that’s right" and earns the points', async () => {
  const done = (src) => pc.doneMap({ avgSpend: 30, avgSpendSource: src }, today).avg_spend;
  assert.equal(done('research'), false);
  assert.equal(done('owner'), true);
  assert.equal(done(undefined), true, 'a value with no source (older callers) still counts');
  const v = mk('restaurant', { hours: week });
  assert.equal(app.guardedAvgSpendUpdate(v.id, app.currentAvgSpendJson(v.id), research(32), { reason: 'fixture', batch_id: 'fresh-eyes' }).ok, true);
  const token = tokenFor(v.id);
  const html = (await bar(token)).body.html;
  assert.ok(html.includes('Our estimate from your menu: about $32'));
  assert.ok(html.includes('data-cb-save="{&quot;avg_spend&quot;:&quot;32&quot;}"'));
  assert.ok(html.includes('>Yes, that’s right<'));
  assert.ok(html.slice(0, html.indexOf('When you have a few minutes')).includes('Average spend per person'), 'it is one of the quick ones');
  const before = pctOf(html);
  assert.equal((await post(token, { avg_spend: '32' })).status, 201);
  const after = (await bar(token)).body.html;
  assert.ok(pctOf(after) > before, `confirming adds points: ${before} -> ${pctOf(after)}`);
  assert.ok(!after.includes('Average spend per person'));
  const fr = (await bar(tokenFor(mk('restaurant').id), '/fr')).body.html;
  assert.ok(!fr.includes('Oui, c’est exact'), 'no estimate, no one-tap yes');
});

test('photos sent and waiting count as waiting ("2 photos sent"), not as left', async () => {
  const v = mk('restaurant', { hours: week, image_url: '/images/venues/fresh-own.jpg' });
  const add = db.prepare(`INSERT INTO owner_photos (venue_id, file, preview_key, width, height, bytes, credit, rights_confirmed_at, status) VALUES (?, ?, ?, 1600, 1067, 1000, 'Fresh', CURRENT_TIMESTAMP, 'pending')`);
  add.run(v.id, `fresh-${v.id}-a.jpg`, `fresh-${v.id}-a`); add.run(v.id, `fresh-${v.id}-b.jpg`, `fresh-${v.id}-b`);
  const html = (await bar(tokenFor(v.id))).body.html;
  const waiting = html.slice(html.indexOf('>Waiting for our check<'));
  assert.ok(waiting.includes('At least 3 photos') && waiting.includes('2 photos sent'), 'listed as sent and waiting');
  assert.ok(!html.slice(0, html.indexOf('>Waiting for our check<')).includes('data-cb-id="photos">Add photos<'), 'not still asked for');
  // One photo waiting is not enough to reach 3: still asked for.
  const s = pc.scoreCompleteness({ imageUrl: '/images/a.jpg', photoCount: 1, pendingPhotos: 1 }, { today });
  assert.equal(s.missing.find((i) => i.key === 'photo_extra').waiting, false);
  assert.equal(pc.scoreCompleteness({ imageUrl: '', photoCount: 0, pendingPhotos: 1 }, { today }).missing.find((i) => i.key === 'photo_main').sent, 1);
});

test('badges summary names the ticked badges (every type), and the phone time inputs leave room for "AM"', async () => {
  const cafe = mk('cafe', { vegan: true, patio: true, dog_friendly: true });
  const html = await get(`/owner/${tokenFor(cafe.id)}`);
  assert.match(html, /<span class="op-fold-hint">3 ticked: Dog-Friendly, Vegan-Friendly and more<\/span>/);
  const one = await get(`/owner/${tokenFor(mk('restaurant', { patio: true }).id)}`);
  assert.match(one, /<span class="op-fold-hint">1 ticked: Patio[^<]*<\/span>/);
  assert.ok(!one.includes('ticked, like dog friendly or patio'));
  const fr = await get(`/fr/owner/${tokenFor(cafe.id)}`);
  assert.match(fr, /3 cochés : [^<]+ et plus</);
  assert.match(html, /\.op-times input \{ min-width: 0; flex: 1 1 96px; padding: 6px 4px 6px 8px; \}/);
  assert.match(html, /\.op-times input::-webkit-calendar-picker-indicator \{ margin: 0; padding: 0; width: 14px; \}/);
});

test('saving is clear: one-line intro, "Saves now and goes live" on live saves, "checked first" on Send, contact fields hidden until needed (restaurants on the edit link)', async () => {
  const v = mk('restaurant', { hours: week });
  const html = await get(`/owner/${tokenFor(v.id)}`);
  assert.equal(html.split('Saves now and goes live').length - 1, 2, 'cuisine and Plan your visit');
  assert.ok(html.includes('Goes live as soon as you save it.'), 'average spend');
  assert.match(html, /<p class="op-hint op-send-extra op-check-note"[^>]*>Sent to us to check, usually within a day\.<\/p><button type="submit" class="venue-form-submit op-send-extra" id="opSubmit"/);
  assert.match(html, /<div class="form-row op-send-extra" data-task="hours contact happy more all">\s*<div class="form-field"><label for="opName">/);
  assert.ok(html.includes('body.owner-page:not(.op-dirty) .op-send-extra { display: none; }'));
  assert.ok(html.includes("document.body.classList.toggle('op-dirty', !!v);"));
  assert.ok(html.includes('aren&rsquo;t sent yet. We check them first, usually within a day.'));
  const fr = await get(`/fr/owner/${tokenFor(v.id)}`);
  assert.ok(fr.includes('Enregistré et en ligne tout de suite') && fr.includes('Envoyé pour vérification'));
  // Every other type keeps its send step as it was.
  for (const type of ['pub', 'cafe', 'winery']) {
    const o = await get(`/owner/${tokenFor(mk(type).id)}`);
    assert.ok(!o.includes('op-send-extra') && !o.includes('op-dirty') && !o.includes('Saves now and goes live') && !o.includes('/completeness'), type);
  }
});

test('help bot: "my score didn\'t go up, did it work?" gets the completeness answer, which explains waiting', () => {
  const cfg = (html) => JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
  const vm = require('node:vm');
  const html = app.ownerHelpWidgetHtml('edit', { avgSpend: true, completeness: true });
  const c = cfg(html);
  const ctx = { T: c.topics, cfg: c };
  vm.runInNewContext(`${html.slice(html.indexOf('function norm(s)'), html.indexOf('function ask(q)'))}; this.best = best;`, ctx);
  for (const [q, lang] of [['my score didnt go up, did it work?', 'en'], ['why is it waiting for our check', 'en'], ['mon pointage n a pas monté', 'fr']]) {
    const r = ctx.best(q);
    assert.equal(r.id, 'page-complete', q);
    assert.equal(r.lang, lang, q);
  }
  const t = c.topics.find((x) => x.id === 'page-complete');
  assert.match(t.a, /Score didn’t go up\?/);
  assert.match(t.a, /Waiting for our check/);
  assert.match(t.aFr, /En attente de notre vérification/);
});
