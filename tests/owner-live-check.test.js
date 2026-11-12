// Owner portal, live-check fixes (2026-11-08). A read-only check of all 552 live restaurants found five things:
//   1. "Are your hours still right?" was offered (as a quick one) to 42 restaurants with no hours at all;
//   2. 21 restaurants show a Happy Hour badge but no times, and the panel offered "We don't have a happy hour";
//   3. dietary was asked twice ("Dietary options" and the Plan your visit "Dietary note");
//   4. 24 restaurants have a "Menu" line in Plan your visit but no menu link, and "Your menu" read as already answered;
//   5. no restaurant can reach 100% without photos and the storefront spot, and nothing said so.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-live-check-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
const app = require('../server.js');
const pc = require('../portal-completeness.js');
app.setVenueSubmissionTransport(async () => {}); // never a real notification email from a test
if (typeof app.setOwnerEmailTransport === 'function') app.setOwnerEmailTransport(async () => ({ ok: true }));

const TODAY = app.todayLocal();
const week = JSON.stringify({ mon: [], tue: [['11:30', '21:00']], wed: [['11:30', '21:00']], thu: [['11:30', '21:00']], fri: [['11:30', '22:00']], sat: [['11:00', '22:00']], sun: [['11:00', '20:00']] });
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Live Check ${type} ${++n}`, slug: `live-check-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.4, address: '214 Main St', phone: '250-555-0142', description: 'A fixture used only by the live-check tests.', ...o });
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
const post = (token, changes) => fetch(`${base}/owner/${token}/changes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.9.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 }) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const panelOf = (html) => { const a = html.indexOf('id="opComplete"'); return a < 0 ? '' : html.slice(a, html.indexOf('</section>', a)); };
const keys = (list) => list.map((i) => i.key);
const base0 = { address: '1 Main St', latitude: 1, longitude: 1, phone: '250-555-0100', website: 'https://x.ca', cuisine: 'Canadian' };

test('1. no hours: "Are your hours still right?" is never a row or a quick one; "Add your hours" leads; points still count', () => {
  const r = pc.scoreCompleteness({ ...base0, hasHours: false }, { today: TODAY });
  assert.ok(!keys(r.missing).includes('hours_fresh'), 'no hours check row');
  assert.ok(!keys(r.quick).includes('hours_fresh'), 'not a quick one');
  assert.ok(keys(r.missing).includes('hours'));
  assert.equal(r.later.filter((i) => i.w === 8)[0].key, 'hours', 'Add your hours leads the longer list');
  assert.equal(r.max, 100 - 3, 'hours check still counts in the total (only "Confirmed by you" is left out)');
  const html = pc.renderCompleteness(r, {});
  assert.ok(!html.includes('Are your hours still right?'));
  assert.match(html, />Add your hours</);
  assert.match(pc.renderCompleteness(r, { fr: true }), />Ajouter vos heures</);
  // With hours but never checked, the one-tap check is back (and quick).
  const withHours = pc.scoreCompleteness({ ...base0, hasHours: true }, { today: TODAY });
  assert.ok(keys(withHours.quick).includes('hours_fresh'));
  // Saving hours from the portal sets the checked date to today (applyOwnerFields), so both count at once.
  const saved = pc.scoreCompleteness({ ...base0, hasHours: true, hoursCheckedAt: TODAY }, { today: TODAY });
  assert.ok(!keys(saved.missing).includes('hours') && !keys(saved.missing).includes('hours_fresh'));
});

test('2. Happy Hour badge with no times: "Add your happy hour times", no "We don\'t have a happy hour"; the server refuses it', async () => {
  const r = pc.scoreCompleteness({ ...base0, happyHourBadge: true, declaredNone: ['happy_hour'] }, { today: TODAY });
  const hh = r.missing.find((i) => i.key === 'happy_hour');
  assert.ok(hh, 'still missing: a stored "we don\'t have one" contradicts the badge and does not count');
  assert.equal(hh.en, 'Add your happy hour times');
  assert.equal(hh.noneEn, undefined);
  assert.deepEqual(r.declared, ['happy_hour'], 'the stored answer is kept as is (only the score ignores it)');
  const en = pc.renderCompleteness(r, { canDecline: true });
  assert.match(en, /Your page shows a Happy Hour badge\. Add when it runs and what’s on special\./);
  assert.ok(!en.includes('data-cb-none="happy_hour"'));
  assert.match(pc.renderCompleteness(r, { fr: true, canDecline: true }), /Ajoutez les heures de votre happy hour/);
  // Without the badge, nothing changes.
  const plain = pc.scoreCompleteness({ ...base0 }, { today: TODAY }).missing.find((i) => i.key === 'happy_hour');
  assert.equal(plain.en, 'Happy hour times and deals');
  assert.equal(plain.noneEn, 'We don’t have a happy hour');
  // Times on the page: done, badge or not.
  assert.ok(!keys(pc.scoreCompleteness({ ...base0, happyHourBadge: true, hasHappyHour: true }, { today: TODAY }).missing).includes('happy_hour'));

  const v = mk('restaurant', { hours: week, happy_hour: 1 });
  const token = tokenFor(v.id);
  const p = panelOf(await get(`/owner/${token}`));
  assert.match(p, /Add your happy hour times/);
  assert.ok(!p.includes('data-cb-none="happy_hour"'));
  const refused = await post(token, { not_offered: ['happy_hour'] });
  assert.equal(refused.status, 400, JSON.stringify(refused.body));
  assert.match(JSON.stringify(refused.body), /already shows this/);
  // Without the badge the same answer is taken.
  const w = mk('restaurant', { hours: week });
  assert.equal((await post(tokenFor(w.id), { not_offered: ['happy_hour'] })).status, 201);
});

test('3. dietary asked once: one "Dietary options" item (6 points) done by a badge or the Plan your visit dietary line', () => {
  assert.ok(!pc.ITEMS.some((i) => i.key === 'pyv_dietary'), 'no separate "Dietary note" item');
  assert.equal(pc.ITEMS.reduce((a, i) => a + i.w, 0), 100);
  assert.equal(pc.ITEMS.find((i) => i.key === 'dietary').w, 6);
  assert.ok(!('pyv_dietary' in pc.SECONDS));
  const none = pc.scoreCompleteness({ ...base0 }, { today: TODAY });
  assert.ok(keys(none.missing).includes('dietary'));
  assert.ok(!keys(pc.scoreCompleteness({ ...base0, vegetarian: 1 }, { today: TODAY }).missing).includes('dietary'), 'a badge');
  assert.ok(!keys(pc.scoreCompleteness({ ...base0, visitLabels: ['Dietary'] }, { today: TODAY }).missing).includes('dietary'), 'the note line');
  const d = none.missing.find((i) => i.key === 'dietary');
  assert.match(d.whyEn, /A dietary note in Plan your visit counts too\./);
  assert.equal(d.noneEn, 'No vegan, veggie or gluten-free options', '"we don\'t have one" stays');
});

test('4. menu: "Link to your menu, or snap a photo of it", and a Menu line is not the menu', () => {
  const r = pc.scoreCompleteness({ ...base0, visitLabels: ['Menu'] }, { today: TODAY });
  assert.ok(keys(r.missing).includes('menu'), 'a Menu line in Plan your visit does not count as the menu');
  const en = pc.renderCompleteness(r, { menuHref: '/owner/abc/menu' });
  assert.match(en, /Link to your menu, or snap a photo of it/);
  assert.match(en, /A “Menu” line in Plan your visit doesn’t count as the menu\./);
  assert.match(pc.renderCompleteness(r, { fr: true }), /Lien vers votre menu, ou une photo de celui-ci/);
});

test('5. the ceiling: photos and the storefront spot are named as the last steps; header says so when only they are left', () => {
  const full = { ...base0, hasHours: true, hoursCheckedAt: TODAY, imageUrl: '/images/venues/x.jpg', photoCount: 1, avgSpend: 25, avgSpendSource: 'owner', menuUrl: 'https://x.ca/menu',
    vegan: 1, hasHappyHour: true, specialsCount: 1, liveMusic: 1, visitLabels: ['Known for', 'Reservations', 'Takeout', 'Good to know'], description: 'x'.repeat(130),
    instagramUrl: 'https://instagram.com/x', facebookUrl: 'https://facebook.com/x', claimed: true };
  const last = pc.scoreCompleteness(full, { today: TODAY });
  assert.deepEqual(keys(last.missing).sort(), ['arrival', 'photo_extra']);
  const en = pc.renderCompleteness(last, {});
  const head = en.slice(0, en.indexOf('op-cb-panel'));
  assert.match(head, /Last steps: photos and your storefront spot\. Tap to see\./);
  assert.match(en, /<p class="op-cb-note op-cb-ceiling">Photos and your storefront spot are the last steps to 100%\.<\/p>/);
  const fr = pc.renderCompleteness(last, { fr: true });
  assert.match(fr, /Dernières étapes : les photos et l’emplacement de votre devanture/);
  assert.match(fr, /sont les dernières étapes vers 100 %/);
  // Only the storefront left.
  const door = pc.renderCompleteness(pc.scoreCompleteness({ ...full, photoCount: 3 }, { today: TODAY }), {});
  assert.match(door, /Last steps: your storefront spot\./);
  assert.match(door, /Your storefront spot is the last step to 100%\./);
  // Other things left too: the line still names the ceiling, with a "when you're at your place" hint; the header is unchanged.
  const more = pc.renderCompleteness(pc.scoreCompleteness({ ...full, facebookUrl: '' }, { today: TODAY }), {});
  assert.match(more, /Photos and your storefront spot are the last steps to 100%\. Do them when you’re at your place with a few minutes\./);
  assert.ok(!/Last steps:/.test(more.slice(0, more.indexOf('op-cb-panel'))));
  // Nothing about it once complete.
  assert.ok(!pc.renderCompleteness(pc.scoreCompleteness({ ...full, photoCount: 3, hasArrival: true }, { today: TODAY }), {}).includes('op-cb-ceiling'));
});

test('other types: no bar, and their edit pages carry none of the new words', async () => {
  for (const type of ['brewery', 'distillery']) { // cafés have the setup and checklist since 2026-11-10
    const html = await get(`/owner/${tokenFor(mk(type, { hours: week, happy_hour: 1 }).id)}`);
    assert.ok(!html.includes('id="opComplete"'), type);
    for (const w of ['Add your happy hour times', 'last steps to 100%', 'Link to your menu, or snap a photo of it']) assert.ok(!html.includes(w), `${type}: ${w}`);
  }
});
