// Owner portal: average spend per person (2026-11-08). Restaurants and pubs get an "Average spend per person" box on the
// owner edit page (pre-filled with our menu estimate, with a "That's right" button); every other type's edit page is
// untouched. The owner's number goes live at once as source 'owner', is logged, shows in "Your updates", can be undone,
// and is never replaced by research. Public pages and the public API stay as they were while AVG_SPEND_PUBLIC is off.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-avg-spend-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
const app = require('../server.js');
const db = require('../db.js');

const today = app.todayLocal();
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Avg Portal ${type} ${++n}`, slug: `avg-portal-${type}-${n}`, region: 'kelowna', type, latitude: 49.885 + n / 1000, longitude: -119.49,
  rating: 4.4, description: 'A fixture used only by the owner average spend tests.', ...o });
const research = (amount = 25) => ({ amount, source: 'research', source_url: 'https://example.com/menu', basis: 'Estimated from the menu: median main $20 plus a soft drink', checked_at: today });
const setResearch = (id, amount = 25) => {
  const r = app.guardedAvgSpendUpdate(id, app.currentAvgSpendJson(id), research(amount), { reason: 'fixture', batch_id: 'test-owner-avg' });
  assert.equal(r.ok, true);
};
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0; // each request from its own address, so the 20-an-hour limit per address never gets in the way

let srv, base;
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then((r) => r.text());
const post = (token, changes, extra = {}) => fetch(`${base}/owner/${token}/changes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.1.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000, ...extra }) })
  .then(async (r) => ({ status: r.status, body: await r.json() }));
const stored = (id) => app.venueAvgSpend(id);

test('field map: only restaurants and pubs are offered average spend; an unknown type is not', () => {
  const on = Object.keys(app.PORTAL_FIELDS_BY_TYPE).filter((t) => app.portalFields(t).avgSpend).sort();
  // Cafés too since 2026-11-10, as "Price per person" in café words (SPEC-cafes.md Decided 2; tests/owner-cafes.test.js).
  assert.deepEqual(on, ['cafe', 'pub', 'restaurant']);
  for (const t of ['distillery', 'cocktail', 'golf', 'beach', 'shop', 'tour', 'outdoor']) assert.equal(app.portalFields(t).avgSpend, false, t);
  assert.equal(app.portalFields('a-type-added-later').avgSpend, false);
});

test('amount parsing: whole dollars 5 to 300, with or without a $; anything else is a friendly error', () => {
  for (const [raw, amount] of [[25, 25], ['25', 25], [' $25 ', 25], ['25 $', 25], ['$ 5', 5], ['300', 300], [5, 5]]) assert.deepEqual(app.ownerAvgSpendAmount(raw), { amount }, String(raw));
  for (const raw of [null, '', '   ', '$']) assert.deepEqual(app.ownerAvgSpendAmount(raw), { blank: true }, String(raw));
  for (const raw of ['4', '301', '0', '-5', '25.50', '2,5', '1e2', '0x19', 'abc', '25 dollars', 25.5, {}, [], true, '1000']) {
    const r = app.ownerAvgSpendAmount(raw);
    assert.ok(r.error && /whole number of dollars from \$5 to \$300/.test(r.error), `${JSON.stringify(raw)} -> ${JSON.stringify(r)}`);
  }
});

test('edit page: the box shows for a restaurant (with our estimate) and a pub, in English and French', async () => {
  const rest = mk('restaurant');
  setResearch(rest.id, 25);
  const html = await get(`/owner/${tokenFor(rest.id)}`);
  assert.match(html, /id="opAvg"/);
  assert.match(html, /About how much does one person spend\? \(one main and a soft drink, before tax and tip\)/);
  assert.match(html, /id="opAvg"[^>]*value="25"/, 'the estimate is pre-filled');
  assert.match(html, /Our estimate from your menu: \$25\. Change it if it&rsquo;s off, or tap That's right/);
  assert.match(html, /id="opAvgConfirm"[^>]*>That's right</);
  assert.match(html, /min="5" max="300" step="1"/);
  const fr = await get(`/fr/owner/${tokenFor(rest.id)}`);
  assert.match(fr, /Dépense moyenne par personne/);
  assert.match(fr, /un plat principal et une boisson sans alcool/);
  assert.match(fr, /Notre estimation selon votre menu\u00a0: 25 \$/);
  assert.match(fr, /id="opAvgConfirm"[^>]*>C’est exact</);
  const pub = mk('pub');
  const pubHtml = await get(`/owner/${tokenFor(pub.id)}`);
  assert.match(pubHtml, /id="opAvg"[^>]*value=""/, 'no estimate: empty box');
  assert.doesNotMatch(pubHtml, /id="opAvgConfirm"|Our estimate from your menu/);
});

test('edit page: cafes, breweries, wineries, beaches and shops do not get the box (or any of its code)', async () => {
  for (const t of ['cocktail', 'beach', 'shop', 'golf', 'tour']) { // cafés have Price per person since 2026-11-10; distilleries since 2026-11-13
    const v = mk(t);
    const html = await get(`/owner/${tokenFor(v.id)}`);
    for (const word of ['opAvg', 'avg_spend', 'avgspend', 'Average spend', 'op-money', 'That\'s right', 'avgThanks', 'dépense moyenne']) {
      assert.ok(!html.includes(word), `${t}: page must not contain ${word}`);
    }
    assert.ok(!/"id":"avg-spend"/.test(html), `${t}: help bot has no average spend topic`);
    const frHtml = await get(`/fr/owner/${tokenFor(v.id)}`);
    assert.ok(!/opAvg|Dépense moyenne/.test(frHtml), `${t}: French page has none either`);
  }
  // An average spend row for a distillery (research could have written one) still does not show on its edit page.
  // (Cafés have Price per person since 2026-11-10.)
  const cafe = mk('cocktail'); // distilleries have the setup since 2026-11-13
  setResearch(cafe.id, 14);
  assert.ok(!(await get(`/owner/${tokenFor(cafe.id)}`)).includes('opAvg'));
});

test('help bot: the average spend topic is on restaurant and pub edit pages only, in English and French', async () => {
  const t = app.OWNER_HELP_TOPICS.find((x) => x.id === 'avg-spend');
  assert.ok(t && t.a && t.aFr && t.q && t.qFr, 'topic with English and French text');
  assert.match(t.a, /That\\?'s right/);
  assert.match(t.aFr, /C’est exact/);
  const cfg = (html) => JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
  assert.ok(cfg(app.ownerHelpWidgetHtml('edit', { avgSpend: true })).topics.some((x) => x.id === 'avg-spend'));
  assert.ok(!cfg(app.ownerHelpWidgetHtml('edit', {})).topics.some((x) => x.id === 'avg-spend'));
  assert.ok(!cfg(app.ownerHelpWidgetHtml('account', { signedIn: true })).topics.some((x) => x.id === 'avg-spend'));
});

// The browser's own matcher (as in server.test.js "Help bot v2"), run in a VM with the restaurant/pub edit page's real config.
function ohbMatcher(page, opts) {
  const vm = require('node:vm');
  const html = app.ownerHelpWidgetHtml(page, opts);
  const cfg = JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
  const ctx = { T: cfg.topics, cfg };
  vm.runInNewContext(`${html.slice(html.indexOf('function norm(s)'), html.indexOf('function ask(q)'))}; this.best = best;`, ctx);
  return (q) => ctx.best(q);
}
// [question, topic it should answer, language of the answer]
const AVG_QUESTIONS = [
  ['how do i set the average spend per person', 'avg-spend'], ['what is average spend', 'avg-spend'], ['change our estimate', 'avg-spend'], ['the estimate is wrong', 'avg-spend'],
  ['how much does one person spend', 'avg-spend'], ['what does thats right do', 'avg-spend'], ['average bill is wrong', 'avg-spend'], ['spend per person', 'avg-spend'],
  ['dépense moyenne par personne', 'avg-spend', 'fr'], ['comment changer notre estimation', 'avg-spend', 'fr'], ['c’est exact', 'avg-spend', 'fr'], ['combien une personne dépense', 'avg-spend', 'fr'],
  // Questions that already had an answer keep it with the new topic present.
  ['how do i change our price range $$', 'price-range'], ['what does $$ mean', 'price-range'], ['we are cheap', 'price-range'], ['changer notre gamme de prix', 'price-range', 'fr'],
  ['is this free', 'cost'], ['how much does it cost to be featured', 'cost'], ['est-ce que c’est gratuit', 'cost', 'fr'], ['how do i add my menu', 'menu-add'], ['how do i set our hours', 'hours'],
  ['how do i add our trivia night every thursday', 'weekly-nights'], ['how do i log out', 'logout'], ['hello', null],
];
test('help bot: average spend questions get the new answer (EN + FR) on restaurant and pub pages; the old answers do not move', () => {
  const withTopic = ohbMatcher('edit', { avgSpend: true });
  const misses = [];
  for (const [q, want, lang] of AVG_QUESTIONS) {
    const r = withTopic(q);
    if (r.id !== want || r.lang !== (lang || 'en')) misses.push(`"${q}" -> ${r.id} (${r.lang}), want ${want} (${lang || 'en'})`);
  }
  assert.deepEqual(misses, [], misses.join('\n'));
  // Without the topic (every other type's page) nothing about average spend is answered.
  const without = ohbMatcher('edit', {});
  assert.notEqual(without('how do i set the average spend per person').id, 'avg-spend');
  // And every question the bot answered before still gets the same answer there.
  for (const [q, want, lang] of AVG_QUESTIONS.filter(([, w]) => w !== 'avg-spend')) assert.equal(without(q).id, want, q);
});

test('save: a typed number goes live at once from the edit link, as the owner\'s own, with a log row and a "Your updates" line', async () => {
  const v = mk('restaurant');
  setResearch(v.id, 25);
  const token = tokenFor(v.id);
  const r = await post(token, { avg_spend: '32' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.live, ['avg_spend']);
  assert.deepEqual(r.body.review, []);
  const s = stored(v.id);
  assert.equal(s.amount, 32);
  assert.equal(s.source, 'owner');
  assert.equal(s.checked_at, today);
  const log = db.prepare("SELECT old_value, new_value, source, reviewed_by FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'avg_spend' ORDER BY id DESC").get(v.id);
  assert.equal(log.source, 'venue_owner');
  assert.equal(JSON.parse(log.new_value).amount, 32);
  assert.equal(JSON.parse(log.old_value).source, 'research');
  assert.equal(log.reviewed_by, 'owner:edit-link');
  const req = db.prepare("SELECT status, instant FROM owner_change_requests WHERE venue_id = ? ORDER BY id DESC").get(v.id);
  assert.deepEqual({ status: req.status, instant: req.instant }, { status: 'approved', instant: 1 }, 'no /admin/review step');
  const activity = app.ownerVenueActivity(v.id, 12, 'en');
  assert.ok(activity.some((a) => a.kind === 'change' && a.status === 'approved' && /average spend per person/i.test(a.what || JSON.stringify(a))), 'shown as applied in Your updates');
  const frActivity = app.ownerVenueActivity(v.id, 12, 'fr');
  assert.ok(frActivity.some((a) => /dépense moyenne par personne/i.test(JSON.stringify(a))));
  // The edit page now shows it as theirs, without the estimate block.
  const html = await get(`/owner/${token}`);
  assert.match(html, /id="opAvg"[^>]*value="32"/);
  assert.doesNotMatch(html, /Our estimate from your menu/);
});

test('"That\'s right": the same number as our estimate is saved as the owner\'s own (a change from research to owner)', async () => {
  const v = mk('pub');
  setResearch(v.id, 21);
  const token = tokenFor(v.id);
  const r = await post(token, { avg_spend: '21' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.live, ['avg_spend']);
  const s = stored(v.id);
  assert.deepEqual({ amount: s.amount, source: s.source }, { amount: 21, source: 'owner' });
  // Sending it again changes nothing.
  const again = await post(token, { avg_spend: '21' });
  assert.equal(again.status, 400);
  assert.match(again.body.errors.form, /Nothing has changed/);
});

test('blank keeps what is stored (no clear): nothing changes, the number stays', async () => {
  const v = mk('restaurant');
  setResearch(v.id, 28);
  const token = tokenFor(v.id);
  const r = await post(token, { avg_spend: '' });
  assert.equal(r.status, 400);
  assert.match(r.body.errors.form, /Nothing has changed/);
  assert.equal(stored(v.id).amount, 28);
  assert.equal(stored(v.id).source, 'research');
  // Blank alongside a real change: only the change is made.
  const both = await post(token, { avg_spend: '', phone: '250-555-0147' });
  assert.equal(both.status, 201);
  assert.ok(!both.body.live.includes('avg_spend'));
  assert.equal(stored(v.id).amount, 28);
});

test('validation: whole dollars 5 to 300, a friendly error, nothing written', async () => {
  const v = mk('restaurant');
  setResearch(v.id, 25);
  const token = tokenFor(v.id);
  for (const bad of ['4', '301', '12.50', 'lots', '1e2', '-20', '$']) {
    const r = await post(token, { avg_spend: bad });
    if (bad === '$') { assert.equal(r.status, 400); continue; } // a lone $ is blank
    assert.equal(r.status, 400, bad);
    assert.match(r.body.errors.avg_spend, /Please enter a whole number of dollars from \$5 to \$300, like 25\./, bad);
  }
  assert.deepEqual({ a: stored(v.id).amount, s: stored(v.id).source }, { a: 25, s: 'research' });
  assert.equal(db.prepare("SELECT COUNT(*) c FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'avg_spend' AND source = 'venue_owner'").get(v.id).c, 0);
  for (const ok of ['5', '300', '$40']) assert.equal((await post(token, { avg_spend: ok })).status, 201, ok);
  assert.equal(stored(v.id).amount, 40);
});

test('only restaurants and pubs can send it: a cafe or a beach is refused and nothing is written', async () => {
  for (const t of ['cocktail', 'beach', 'shop']) { // cafés can since 2026-11-10; distilleries since 2026-11-13
    const v = mk(t);
    const r = await post(tokenFor(v.id), { avg_spend: '25' });
    assert.equal(r.status, 400, t);
    assert.equal(stored(v.id), null, t);
  }
});

test('signed-in owners: the same instant save, logged to their login', async () => {
  const v = mk('restaurant');
  setResearch(v.id, 25);
  // Through the shared writer with a login-style reviewer (what a signed-in Save does).
  const row = db.prepare('SELECT * FROM venues WHERE id = ?').get(v.id);
  const meta = { reason: 'owner request #t', batch_id: 'owner-test' };
  const r = (function () {
    const id = Number(db.prepare('INSERT INTO owner_change_requests (venue_id, changes, previous, instant) VALUES (?, ?, ?, 1)')
      .run(v.id, JSON.stringify({ avg_spend: { amount: 30 } }), JSON.stringify({ avg_spend: app.venueAvgSpend(v.id) })).lastInsertRowid);
    return app.approveOwnerChange(id, 'owner:boss@example.com');
  }());
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.applied, ['avg_spend']);
  const log = db.prepare("SELECT reviewed_by, source FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'avg_spend' ORDER BY id DESC").get(v.id);
  assert.deepEqual({ by: log.reviewed_by, src: log.source }, { by: 'owner:boss@example.com', src: 'venue_owner' });
  assert.ok(row && meta);
});

test('Undo puts back our research value exactly (source, link, date), and an owner value can come back too', async () => {
  const v = mk('restaurant');
  setResearch(v.id, 25);
  const before = app.currentAvgSpendJson(v.id);
  const r = await post(tokenFor(v.id), { avg_spend: '40' });
  assert.equal(r.status, 201);
  assert.equal(stored(v.id).amount, 40);
  const reqId = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 ORDER BY id DESC").get(v.id).id;
  const u = app.undoOwnerInstantChange(reqId, 'dayton', new Date(), 'test');
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.equal(app.currentAvgSpendJson(v.id), before, 'research row restored byte for byte');
  assert.equal(stored(v.id).source, 'research');
  // And from nothing: an owner number on a venue we had no estimate for goes away on Undo.
  const w = mk('pub');
  assert.equal((await post(tokenFor(w.id), { avg_spend: '18' })).status, 201);
  const id2 = db.prepare("SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 ORDER BY id DESC").get(w.id).id;
  assert.equal(app.undoOwnerInstantChange(id2, 'dayton', new Date(), 'test').ok, true);
  assert.equal(stored(w.id), null);
});

test('the owner\'s number is protected from later research writes (admin endpoint rules unchanged)', async () => {
  const v = mk('restaurant');
  setResearch(v.id, 25);
  assert.equal((await post(tokenFor(v.id), { avg_spend: '35' })).status, 201);
  const cur = app.currentAvgSpendJson(v.id);
  const res = app.guardedAvgSpendUpdate(v.id, cur, research(22), { reason: 'research again', batch_id: 'test' });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'owner_value_protected');
  const clear = app.guardedAvgSpendUpdate(v.id, cur, null, { reason: 'research clear', batch_id: 'test' });
  assert.equal(clear.reason, 'owner_value_protected');
  assert.equal(stored(v.id).amount, 35);
});

test('the weekly price check does not read, flag or write average spend', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'price-check.js'), 'utf8');
  assert.ok(!/avg_spend|venue_avg_spend|avgSpend/i.test(src), 'price-check.js never mentions average spend');
  const v = mk('restaurant');
  setResearch(v.id, 25);
  const before = db.prepare('SELECT * FROM venue_avg_spend WHERE venue_id = ?').get(v.id);
  app.priceCheck.listFlagged();
  assert.deepEqual(db.prepare('SELECT * FROM venue_avg_spend WHERE venue_id = ?').get(v.id), before);
});

test('flag off: stored average spend (ours or the owner\'s) shows nowhere on the public venue page or API', async () => {
  const v = mk('restaurant', { price: 2 });
  const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(v.id);
  const page = app.venuePagePath(app.rowToVenue ? app.rowToVenue(venue) : venue);
  const strip = (t) => t.replace(/"updated_at":"[^"]*"/g, '').replace(/"updatedAt":"[^"]*"/g, '');
  const apiBefore = await get(`/api/venues/${v.id}`);
  const htmlBefore = await get(page);
  assert.ok(!/avg_spend/.test(apiBefore) && !/avg_spend/.test(htmlBefore));
  // Our research number: the page is byte for byte the same, the API too.
  setResearch(v.id, 26);
  assert.equal(await get(page), htmlBefore, 'public venue page is byte for byte the same with a research number stored');
  assert.equal(strip(await get(`/api/venues/${v.id}`)), strip(apiBefore));
  // The owner's number: no amount, no avg_spend, nothing about spend per person on the page or in the API. (Like any owner
  // edit that goes live, it marks the listing as managed by its owner: that is the existing claimed rule, not spend.)
  assert.equal((await post(tokenFor(v.id), { avg_spend: '37' })).status, 201);
  const apiAfter = await get(`/api/venues/${v.id}`);
  assert.equal(strip(apiAfter), strip(apiBefore), 'public API has no avg_spend and is otherwise unchanged');
  const htmlAfter = await get(page);
  assert.ok(!/avg_spend|\$37\b|about \$37|per person/i.test(htmlAfter), 'no amount on the public page');
  assert.ok(!/avg_spend|"amount"/.test(apiAfter));
});
