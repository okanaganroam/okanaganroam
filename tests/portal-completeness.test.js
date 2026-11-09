// Owner portal: "Your page is X% complete" (2026-11-08), restaurants only. The score is pure (portal-completeness.js);
// the edit page of a restaurant shows the bar and the missing list, every other type's page is untouched, and nothing
// public changes. Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'portal-completeness-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
const pc = require('../portal-completeness.js');
const app = require('../server.js');
const db = require('../db.js');

const TODAY = '2026-11-08';
// A restaurant with everything filled in that the owner can fill in today (the "we're adding" items are left out).
const FULL = {
  address: '1 Main St', latitude: 49.9, longitude: -119.4, phone: '250-555-0100', website: 'https://example.com', cuisine: 'Italian',
  hasHours: true, hoursCheckedAt: '2026-10-20', imageUrl: '/images/venues/own.jpg', photoCount: 4, avgSpend: 25, menuUrl: 'https://example.com/menu',
  vegan: true, hasHappyHour: true, specialsCount: 1, liveMusic: true, visitLabels: ['Known for', 'Reservations', 'Takeout', 'Dietary', 'Groups'],
  description: 'x'.repeat(130), instagramUrl: 'https://instagram.com/x', facebookUrl: 'https://facebook.com/x', hasArrival: true, claimed: true,
};
const score = (o, opts) => pc.scoreCompleteness({ ...FULL, ...o }, { today: TODAY, ...(opts || {}) });

test('the 24 items are unique and their weights add to 100', () => {
  assert.equal(pc.ITEMS.length, 24);
  assert.equal(new Set(pc.ITEMS.map((i) => i.key)).size, 24);
  assert.equal(pc.ITEMS.reduce((a, i) => a + i.w, 0), 100);
  assert.ok(pc.ITEMS.every((i) => pc.GROUPS.some((g) => g.key === i.group)));
  assert.ok(pc.ITEMS.every((i) => i.fix ? i.target && i.btnEn && i.btnFr : true), 'every item the owner can fix has a button');
  const sums = Object.fromEntries(pc.GROUPS.map((g) => [g.key, pc.ITEMS.filter((i) => i.group === g.key).reduce((a, i) => a + i.w, 0)]));
  assert.deepEqual(sums, { basics: 16, hours: 12, photos: 14, menu: 16, offers: 10, visit: 14, about: 6, social: 6, finding: 3, confirmed: 3 });
});

test('score: everything filled in is 100% and Complete; nothing is missing', () => {
  const r = score({});
  assert.equal(r.pct, 100); assert.equal(r.got, 100); assert.equal(r.max, 100); assert.equal(r.complete, true);
  assert.deepEqual(r.missing, []); assert.deepEqual(r.coming, []);
  assert.ok(r.groups.every((g) => g.full));
});

test('score: an empty restaurant starts low, counts only what it can be asked for, and never shows 100 until nothing is missing', () => {
  const r = pc.scoreCompleteness({}, { today: TODAY });
  assert.equal(r.got, 0);
  assert.equal(r.pct, 0);
  assert.equal(r.complete, false);
  // Items the owner cannot fill in yet are left out of the total, not counted against them.
  // (2026-11-08: cuisine and fresh hours have their own screens now, so they count; so do the five Plan your visit
  // lines. Only "Confirmed by you" is left.)
  assert.deepEqual(r.coming.map((i) => i.key).sort(), ['owner_confirmed']);
  assert.equal(r.max, 100 - 3);
  assert.equal(r.missing.length, 24 - 1);
  const almost = score({ facebookUrl: '' });
  assert.equal(almost.complete, false);
  assert.ok(almost.pct <= 99, `${almost.pct}`);
  assert.deepEqual(almost.missing.map((i) => i.key), ['facebook']);
});

test('score: the percentage is points done over points possible', () => {
  const r = score({ photoCount: 1, instagramUrl: '', facebookUrl: '' }); // photo_extra 6 + instagram 3 + facebook 3 missing
  assert.deepEqual(r.missing.map((i) => i.key).sort(), ['facebook', 'instagram', 'photo_extra']);
  assert.equal(r.got, 100 - 12); assert.equal(r.max, 100); assert.equal(r.pct, 88);
  // Biggest first.
  assert.equal(r.missing[0].key, 'photo_extra');
  assert.equal(r.groups.find((g) => g.key === 'social').got, 0);
  assert.equal(r.groups.find((g) => g.key === 'photos').got, 8);
});

test('score: items we already have count even when the owner cannot edit them yet; items we lack are "coming", not missing', () => {
  const r = score({ claimed: false });
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.coming.map((i) => i.key).sort(), ['owner_confirmed']);
  assert.equal(r.complete, true); assert.equal(r.pct, 100);
  assert.equal(score({ claimed: true }).max, 100, 'Confirmed by you counts once we have it');
  // The Plan your visit lines have their own boxes now (2026-11-08): without them they are missing, not coming.
  assert.deepEqual(score({ visitLabels: ['Known for'] }).missing.map((i) => i.key).sort(), ['pyv_dietary', 'pyv_groups', 'pyv_reservations', 'pyv_takeout']);
  assert.deepEqual(score({ visitLabels: ['Known for', 'To go', 'Good to know', 'Dietary', 'Reservations'] }).missing, [], '"To go" and "Good to know" count');
  // Cuisine has its picker now (2026-11-08): without one it is missing, not coming.
  assert.deepEqual(score({ cuisine: '' }).missing.map((i) => i.key), ['cuisine']);
  const withBooking = score({ visitLabels: [], bookingUrl: 'https://example.com/book' });
  assert.ok(!withBooking.coming.some((i) => i.key === 'pyv_reservations') && !withBooking.missing.some((i) => i.key === 'pyv_reservations'), 'a booking link answers Reservations');
});

test('score: hours count as fresh for 90 days, then "Confirm hours" is missing (one tap, or saving the hours)', () => {
  const day = (n) => { const d = new Date(Date.UTC(2026, 10, 8) - n * 864e5); return d.toISOString().slice(0, 10); };
  assert.equal(score({ hoursCheckedAt: day(90) }).missing.length, 0, '90 days old is still fresh');
  const stale = score({ hoursCheckedAt: day(91) });
  assert.deepEqual(stale.missing.map((i) => i.key), ['hours_fresh']);
  assert.equal(stale.coming.length, 0);
  assert.equal(stale.max, 100); assert.equal(stale.pct, 96);
  assert.equal(score({ hoursCheckedAt: null }).missing[0].key, 'hours_fresh');
  assert.equal(score({ hasHours: false, hoursCheckedAt: day(1) }).missing.some((i) => i.key === 'hours'), true, 'no hours at all is missing');
  const m = score({ hasHours: false });
  assert.equal(m.pct, Math.floor(((m.got) / m.max) * 100));
});

test('score: "we don\'t have one" answers count as done; a non-alcoholic place is not asked for a happy hour', () => {
  const r = score({ instagramUrl: '', facebookUrl: '', specialsCount: 0, website: '', declaredNone: ['instagram', 'facebook', 'specials', 'website'] });
  assert.deepEqual(r.missing, []); assert.equal(r.pct, 100);
  const dry = score({ hasHappyHour: false, nonalcoholic: true });
  assert.equal(dry.complete, true); assert.equal(dry.max, 96);
  const wet = score({ hasHappyHour: false });
  assert.deepEqual(wet.missing.map((i) => i.key), ['happy_hour']);
  // A non-alcoholic place that has a happy hour still gets the credit.
  assert.equal(score({ hasHappyHour: true, nonalcoholic: true }).max, 100);
});

test('score: the other rules (real photo, 3 photos, description length, dietary, entertainment)', () => {
  assert.ok(score({ imageUrl: '' }).missing.some((i) => i.key === 'photo_main'));
  assert.ok(score({ imageUrl: null }).missing.some((i) => i.key === 'photo_main'));
  assert.ok(!score({ imageUrl: 'https://cdn.example.com/a.jpg' }).missing.some((i) => i.key === 'photo_main'));
  assert.ok(score({ photoCount: 2 }).missing.some((i) => i.key === 'photo_extra'));
  assert.ok(!score({ photoCount: 3 }).missing.some((i) => i.key === 'photo_extra'));
  assert.ok(score({ description: 'y'.repeat(119) }).missing.some((i) => i.key === 'description'));
  assert.ok(!score({ description: ` ${'y'.repeat(120)} ` }).missing.some((i) => i.key === 'description'));
  assert.ok(score({ vegan: false, vegetarian: false, glutenFree: false, visitLabels: [] }).missing.some((i) => i.key === 'dietary'));
  assert.ok(!score({ vegan: false, glutenFree: true }).missing.some((i) => i.key === 'dietary'));
  assert.ok(score({ liveMusic: false, sportsTv: false, nightsCount: 0 }).missing.some((i) => i.key === 'entertainment'));
  assert.ok(!score({ liveMusic: false, nightsCount: 2 }).missing.some((i) => i.key === 'entertainment'));
  assert.ok(score({ avgSpend: null }).missing.some((i) => i.key === 'avg_spend'));
  assert.ok(score({ menuUrl: '', hasPublishedMenu: false }).missing.some((i) => i.key === 'menu'));
  assert.ok(!score({ menuUrl: '', hasPublishedMenu: true }).missing.some((i) => i.key === 'menu'));
  assert.ok(score({ latitude: null }).missing.some((i) => i.key === 'address_pin'));
});

test('score: an item waiting for review is flagged and sorted last, not hidden', () => {
  const r = score({ phone: '', instagramUrl: '' }, { pending: new Set(['phone']) });
  const phone = r.missing.find((i) => i.key === 'phone');
  assert.equal(phone.waiting, true);
  assert.equal(r.missing[r.missing.length - 1].key, 'phone');
  const html = pc.renderCompleteness(r, {});
  assert.match(html, /Waiting for review/);
});

test('render: ring, headline, missing rows with buttons, done groups, the "only you see this" line; English and French', () => {
  const r = score({ photoCount: 0, instagramUrl: '' });
  const en = pc.renderCompleteness(r, { menuHref: '/owner/abc/menu' });
  assert.match(en, new RegExp(`Your page is ${r.pct}% complete`));
  assert.match(en, /id="opCbToggle"[^>]*aria-expanded="false"/);
  assert.match(en, /id="opCbPanel" hidden/);
  assert.match(en, /Quick ones|When you have a few minutes/); assert.match(en, /Done so far/);
  assert.match(en, /data-cb-task="photos" data-cb-id="photos">Add photos</);
  assert.match(en, /data-cb-task="contact" data-cb-id="opInstagram">Add Instagram</);
  assert.match(en, /Only you see this score\. It never changes where you show up in search\./);
  const fr = pc.renderCompleteness(r, { fr: true });
  assert.match(fr, /Votre fiche est complète à \d+ %/);
  assert.match(fr, /Vous seul voyez ce pointage/);
  assert.match(fr, />Ajouter des photos</);
  const done = pc.renderCompleteness(score({}), {});
  assert.match(done, /Your page is complete/); assert.doesNotMatch(done, /Quick ones|When you have a few minutes/); assert.match(done, /<b>100%<\/b>/);
  assert.match(pc.renderCompleteness(score({}), { fr: true }), /Votre fiche est complète</);
  const menu = pc.renderCompleteness(score({ menuUrl: '', hasPublishedMenu: false }), { menuHref: '/owner/abc/menu' });
  assert.match(menu, /<a class="op-cb-btn" href="\/owner\/abc\/menu">Add menu<\/a>/);
});

// ---------------------------------------------------------------------------------------------- the pages
const today = app.todayLocal();
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Complete ${type} ${++n}`, slug: `complete-${type}-${n}`, region: 'kelowna', type, latitude: 49.885 + n / 1000, longitude: -119.49,
  rating: 4.4, address: '10 Test St', phone: '250-555-0101', description: 'A fixture used only by the completeness tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let srv, base;
test.before(async () => {
  srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then((r) => r.text());
const cfg = (html) => JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);

test('edit page: a restaurant shows the bar, and the missing list names what the fixture lacks', async () => {
  const v = mk('restaurant');
  const html = await get(`/owner/${tokenFor(v.id)}`);
  assert.match(html, /<section class="op-cb" id="opComplete" data-task="home all"/);
  const pct = Number(/Your page is (\d+)% complete/.exec(html)[1]);
  assert.ok(pct > 0 && pct < 40, `a bare fixture is low: ${pct}`);
  for (const w of ['Add hours', 'Add photos', 'Enter amount', 'Add menu', 'Add Instagram', 'At the door']) assert.ok(html.includes(w), w);
  assert.match(html, /data-cb-task="more" data-cb-id="avgspend"/);
  assert.match(html, /We&rsquo;re adding these|We’re adding these/);
  assert.match(html, /\.op-cb-head \{/, 'the bar CSS is on the page');
  assert.match(html, /getElementById\('opCbToggle'\)/, 'the bar script is on the page');
  assert.match(html, /"id":"page-complete"/, 'the help bot has the topic');
  // The other-task screens still work: the bar shows on the task list and the full page, not inside a task.
  assert.match(html, /data-task="home all" aria-labelledby="opCbHead"/);
  // The jump targets exist on the page.
  for (const id of ['opAddress', 'opPhone', 'opWebsite', 'hours', 'photos', 'avgspend', 'badges', 'happy', 'specials', 'weekly-nights', 'opDescriptionLabel', 'opInstagram', 'opFacebook']) assert.ok(html.includes(`id="${id}"`), `target #${id}`);
});

test('edit page: the bar tracks the data (hours, avg spend, photos, links) and shows Complete when nothing is left', async () => {
  const v = mk('restaurant', { website: 'https://example.com', cuisine: 'Pizza', image_url: '/images/venues/complete-own.jpg', vegan: true, live_music: true, description: 'z'.repeat(140),
    hours: JSON.stringify({ mon: [['11:00', '21:00']], tue: [['11:00', '21:00']], wed: [['11:00', '21:00']], thu: [['11:00', '21:00']], fri: [['11:00', '21:00']], sat: [['11:00', '21:00']], sun: [['11:00', '21:00']] }) });
  const before = Number(/Your page is (\d+)% complete/.exec(await get(`/owner/${tokenFor(v.id)}`))[1]);
  db.prepare('UPDATE venues SET hours_source = ?, hours_checked_at = ? WHERE id = ?').run('venue_owner', today, v.id);
  const withHours = Number(/Your page is (\d+)% complete/.exec(await get(`/owner/${tokenFor(v.id)}`))[1]);
  assert.ok(withHours >= before, `${before} -> ${withHours}`);
  const r = app.guardedAvgSpendUpdate(v.id, app.currentAvgSpendJson(v.id), { amount: 25, source: 'research', source_url: 'https://example.com/menu', basis: 'Estimated from the menu: median main $20 plus a soft drink', checked_at: today }, { reason: 'fixture', batch_id: 'test-complete' });
  assert.equal(r.ok, true);
  const withSpend = Number(/Your page is (\d+)% complete/.exec(await get(`/owner/${tokenFor(v.id)}`))[1]);
  assert.ok(withSpend > withHours, `average spend adds points: ${withHours} -> ${withSpend}`);
  const html = await get(`/owner/${tokenFor(v.id)}`);
  assert.doesNotMatch(html, /data-cb-id="avgspend"/, 'the average spend row is gone once it is filled in');
});

test('edit page: French restaurant page has the bar and the French help topic', async () => {
  const v = mk('restaurant');
  const fr = await get(`/fr/owner/${tokenFor(v.id)}`);
  assert.match(fr, /Votre fiche est complète à \d+ %/);
  assert.match(fr, /Rapides|Quand vous aurez quelques minutes/);
  assert.match(fr, /Vous seul voyez ce pointage/);
  assert.match(fr, /Ajouter des photos/);
  const t = app.OWNER_HELP_TOPICS.find((x) => x.id === 'page-complete');
  assert.ok(t && t.a && t.aFr && t.q && t.qFr && t.completenessOnly);
  assert.match(t.a, /Only you see this score/); assert.match(t.aFr, /Vous seul voyez ce pointage/);
});

test('edit page: every other type (pubs, cafes, wineries, breweries, beaches, shops...) has no bar, no CSS, no script, no help topic; English and French', async () => {
  for (const t of ['pub', 'cafe', 'winery', 'brewery', 'distillery', 'cocktail', 'golf', 'beach', 'shop', 'tour', 'outdoor']) {
    const v = mk(t);
    for (const prefix of ['/owner/', '/fr/owner/']) {
      const html = await get(`${prefix}${tokenFor(v.id)}`);
      for (const word of ['opComplete', 'op-cb', 'opCbToggle', 'data-cb-task', 'page-complete', 'Your page is', 'complète à']) assert.ok(!html.includes(word), `${t} ${prefix}: must not contain ${word}`);
    }
  }
});

test('help bot: the topic is offered on restaurant edit pages only and answers the obvious questions without moving the old answers', () => {
  assert.ok(cfg(app.ownerHelpWidgetHtml('edit', { completeness: true })).topics.some((x) => x.id === 'page-complete'));
  assert.ok(!cfg(app.ownerHelpWidgetHtml('edit', {})).topics.some((x) => x.id === 'page-complete'));
  assert.ok(!cfg(app.ownerHelpWidgetHtml('account', { signedIn: true })).topics.some((x) => x.id === 'page-complete'));
  const vm = require('node:vm');
  const matcher = (opts) => {
    const html = app.ownerHelpWidgetHtml('edit', opts);
    const c = cfg(html);
    const ctx = { T: c.topics, cfg: c };
    vm.runInNewContext(`${html.slice(html.indexOf('function norm(s)'), html.indexOf('function ask(q)'))}; this.best = best;`, ctx);
    return (q) => ctx.best(q);
  };
  const withT = matcher({ avgSpend: true, completeness: true });
  const without = matcher({ avgSpend: true });
  const asks = [['what does 79% complete mean', 'page-complete'], ['what is missing from my page', 'page-complete'], ['does the percentage change my search ranking', 'page-complete'],
    ['who sees the percentage', 'page-complete'], ['que veut dire le pourcentage de la fiche', 'page-complete', 'fr'], ['qui voit le pointage', 'page-complete', 'fr']];
  const old = [['how do i set the average spend per person', 'avg-spend'], ['how do i change our price range $$', 'price-range'], ['is this free', 'cost'], ['how do i add my menu', 'menu-add'],
    ['how do i set our hours', 'hours'], ['how do i add our trivia night every thursday', 'weekly-nights'], ['how do i log out', 'logout']];
  const misses = [];
  for (const [q, want, lang] of asks) { const r = withT(q); if (r.id !== want || r.lang !== (lang || 'en')) misses.push(`"${q}" -> ${r.id} (${r.lang})`); }
  for (const [q, want] of old) { const a = withT(q), b = without(q); if (a.id !== want || b.id !== want) misses.push(`old "${q}" -> ${a.id} / ${b.id}, want ${want}`); }
  assert.deepEqual(misses, [], misses.join('\n'));
});

test('public site: the score never reaches a public page or the public API (before and after the portal computes it)', async () => {
  const v = mk('restaurant', { website: 'https://example.com' });
  const url = app.venuePagePath(v, 'en');
  const frUrl = app.venuePagePath(v, 'fr');
  const norm = (h) => h.replace(/\s+/g, ' ');
  const a = await get(url), aFr = await get(frUrl);
  const api0 = await get(`/api/venues/${v.id}`);
  const list0 = await get('/api/venues?type=restaurant&limit=5');
  await get(`/owner/${tokenFor(v.id)}`); await get(`/fr/owner/${tokenFor(v.id)}`); // the portal computes the score
  const b = await get(url), bFr = await get(frUrl);
  assert.equal(norm(b), norm(a), 'the public venue page is the same after the portal ran');
  assert.equal(norm(bFr), norm(aFr), 'and the French page');
  assert.equal(await get(`/api/venues/${v.id}`), api0, 'the venue API is the same');
  assert.equal(await get('/api/venues?type=restaurant&limit=5'), list0, 'the list API is the same');
  for (const html of [a, aFr, api0, list0]) assert.ok(!/complete(?:ness)?_?(?:score|pct|percent)|op-cb|% complete|opComplete/i.test(html), 'no score on a public page');
});

test('no ranking, sorting or indexing code reads the score', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const uses = [...src.matchAll(/portalCompleteness\.|gatherCompletenessInput|COMPLETENESS_TYPES/g)].map((m) => src.slice(0, m.index).split('\n').length);
  // Only the definition block and the one owner-page render use it.
  const renderFn = src.indexOf('function renderOwnerPageHtml');
  const renderEnd = src.indexOf('\n}\n', renderFn);
  const defStart = src.indexOf('const COMPLETENESS_TYPES');
  const defEnd = src.indexOf('function renderOwnerPage(', defStart);
  const lines = (i) => src.slice(0, i).split('\n').length;
  // "We don't have one" (2026-11-08): the owner's own save path also reads the item list (to check, store and describe
  // the answers). These are owner-portal functions only; none feeds ranking, sorting, indexing or a public page.
  const ownerFns = ['function validateOwnerChanges', 'function ownerVenueSnapshot', 'function applyOwnerFieldsInner', 'function ownerValueText'].map((name) => {
    const a = src.indexOf(name);
    assert.ok(a > 0, `${name} exists`);
    return [lines(a), lines(src.indexOf('\n}\n', a))];
  });
  for (const l of uses) {
    const inDef = l >= lines(defStart) && l <= lines(defEnd);
    const inRender = l >= lines(renderFn) && l <= lines(renderEnd);
    const inRequire = l === 20;
    const inOwnerSave = ownerFns.some(([a, b]) => l >= a && l <= b);
    assert.ok(inDef || inRender || inRequire || inOwnerSave, `line ${l} uses the score outside the portal edit page`);
  }
  const mod = fs.readFileSync(path.join(__dirname, '..', 'portal-completeness.js'), 'utf8');
  assert.ok(!/require\(/.test(mod), 'the module is pure: no requires, no database');
});

test('minutes left: summed from the missing items, waiting items and fresh-hours-with-no-hours skipped, shown in EN and FR', () => {
  const mins = (keys) => pc.minutesLeft(keys.map((key) => ({ key })));
  assert.equal(mins([]), 0);
  assert.equal(mins(['avg_spend']), 1, 'never less than a minute while something is left');
  assert.equal(mins(['description', 'photo_extra']), 6);
  assert.equal(mins(['hours', 'hours_fresh']), mins(['hours']), 'saving hours also makes them fresh');
  assert.equal(pc.minutesLeft([{ key: 'description', waiting: true }]), 0, 'items waiting for review cost the owner nothing');
  for (const it of pc.ITEMS) assert.ok(Number.isFinite(pc.SECONDS[it.key]), `${it.key} has an estimate`);
  const allMissing = pc.ITEMS.filter((it) => it.fix).map((it) => ({ key: it.key }));
  const total = pc.minutesLeft(allMissing);
  assert.ok(total >= 20 && total <= 35, `an empty restaurant page is about 20-35 minutes (got ${total})`);

});

test('quick ones first (busy owners): the bar never shows a big total; quick items lead, longer ones are "when you have a few minutes"', () => {
  const r = pc.scoreCompleteness({ address: '1 Main St', latitude: 1, longitude: 1, phone: '250-555-0100' }, { today: TODAY });
  assert.ok(r.quick.length > 0 && r.later.length > 0);
  assert.ok(r.quick.every((it) => pc.SECONDS[it.key] <= pc.QUICK_SECONDS), 'quick = half a minute or less');
  assert.ok(r.later.every((it) => pc.SECONDS[it.key] > pc.QUICK_SECONDS));
  for (let i = 1; i < r.quick.length; i++) assert.ok(pc.SECONDS[r.quick[i - 1].key] <= pc.SECONDS[r.quick[i].key], 'quickest first');
  assert.equal(r.quick.length + r.later.length, r.missing.length);
  const head = (h) => h.slice(0, h.indexOf('op-cb-panel'));
  const en = pc.renderCompleteness(r, {});
  const qMin = Math.ceil(r.quickSeconds / 60);
  const qText = qMin <= 1 ? 'under a minute' : `about ${qMin} minutes`;
  assert.match(head(en), new RegExp(`${r.quick.length} quick ones, ${qText}\\. Tap to start\\.`));
  assert.ok(!head(en).includes('things left'), 'no "N things left, about X minutes" total');
  assert.ok(en.indexOf('>Quick ones<') < en.indexOf('>When you have a few minutes<'), 'quick list first');
  assert.match(en, /Photos and a description make the biggest difference\./);
  const fr = pc.renderCompleteness(r, { fr: true });
  assert.match(head(fr), new RegExp(`${r.quick.length} éléments rapides, .+\\. Touchez pour commencer\\.`));
  assert.match(fr, />Quand vous aurez quelques minutes</);
  // One quick one, under a minute.
  const one = pc.renderCompleteness({ ...r, quick: [r.quick[0]], quickSeconds: 10 }, {});
  assert.match(head(one), /1 quick one, under a minute\. Tap to start\./);
  // Nothing quick left: no time at all, just "for when you have a few minutes".
  const none = pc.renderCompleteness({ ...r, quick: [], quickSeconds: 0, later: r.missing }, {});
  assert.match(head(none), new RegExp(`${r.missing.length} things left for when you have a few minutes\\. Tap to see\\.`));
  assert.ok(!/>Quick ones</.test(none));
  // Waiting items are never "quick" (nothing the owner can do).
  assert.ok(!pc.isQuick({ key: 'avg_spend', waiting: true }));
  // Progress message: data for the page script, EN and FR.
  assert.match(en, /data-cb-pct="\d+" data-cb-yay="Nice! You’re now at \{p\}%\."/);
  assert.match(fr, /data-cb-yay="Bravo! Vous êtes maintenant à \{p\} %\."/);
  assert.match(en, /<p class="op-cb-yay" id="opCbYay" role="status" hidden><\/p>/);
  const done = pc.renderCompleteness({ ...r, complete: true, pct: 100, missing: [], quick: [], later: [] }, {});
  assert.ok(!/quick|minute/.test(head(done)), 'nothing about time once complete');
});

test('edit page intro: a restaurant on the edit link says which quick answers go live; other types keep the old wording', async () => {
  const r = mk('restaurant');
  const en = await get(`/owner/${tokenFor(r.id)}`);
  assert.match(en, /We check most changes \(usually within a day\) before they go on your page\. Quick answers from the checklist above/);
  assert.ok(!en.includes('Nothing changes until you press the Send button'), 'the old "nothing changes" line is gone for restaurants');
  assert.ok(!en.includes('We review every change'), 'and so is "we review every change"');
  assert.match(en, /Quick answers from the checklist at the top go live as soon as you save them\./);
  const fr = await get(`/fr/owner/${tokenFor(r.id)}`);
  assert.match(fr, /Les réponses rapides de la liste ci-dessus/);
  for (const type of ['pub', 'cafe', 'winery']) {
    const html = await get(`/owner/${tokenFor(mk(type).id)}`);
    assert.ok(html.includes('Nothing changes until you press the Send button'), `${type} keeps its wording`);
    assert.ok(!html.includes('Quick answers from the checklist above'), `${type} has no checklist line`);
    assert.ok(html.includes('We review every change, usually within a day'), `${type} keeps the review line`);
  }
});
