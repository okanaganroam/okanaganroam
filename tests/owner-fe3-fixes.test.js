// Owner portal, fresh-eyes test 3 fixes (2026-11-09). A neutral first-time-owner test scored 7.5/10: the score sat at
// 61% while eight sent changes waited for review, Instagram and Facebook were "quick ones" that went to review, the
// send confirmation landed off screen, the storefront step hung when location was denied, and the portal said average
// spend was on the page while it is hidden. Dayton: Instagram and Facebook links go live straight away (validated).
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'owner-fe3-fixes-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
const app = require('../server.js');
const db = require('../db.js');
const pc = require('../portal-completeness.js');
app.setVenueSubmissionTransport(async () => {});

const today = app.todayLocal();
const week = JSON.stringify({ mon: [], tue: [['11:30', '21:00']], wed: [['11:30', '21:00']], thu: [['11:30', '21:00']], fri: [['11:30', '22:00']], sat: [['11:00', '22:00']], sun: [['11:00', '20:00']] });
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `FE3 Fixes ${type} ${++n}`, slug: `fe3-fixes-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.4, address: '214 Main St', phone: '250-555-0142', description: 'A fixture used only by the fresh-eyes 3 tests.', ...o });
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
const post = (token, changes) => fetch(`${base}/owner/${token}/changes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.13.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 }) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const bar = async (token) => (await fetch(`${base}/owner/${token}/completeness`).then((r) => r.json())).html;
const headOf = (h) => h.slice(0, h.indexOf('op-cb-panel'));
const meta = { reason: 'fe3 research fixture', batch_id: 'test-fe3' };

test('social links: only a real Instagram profile or Facebook page passes, in canonical form', () => {
  const ig = (v) => app.ownerSocialLink('instagram_url', v);
  const fb = (v) => app.ownerSocialLink('facebook_url', v);
  assert.equal(ig('@copper.pot'), 'https://www.instagram.com/copper.pot/');
  assert.equal(ig('instagram.com/copper.pot'), 'https://www.instagram.com/copper.pot/');
  assert.equal(ig('https://m.instagram.com/copper.pot/?hl=en'), 'https://www.instagram.com/copper.pot/');
  for (const bad of ['copper.pot', 'https://www.instagram.com/p/AbC123/', 'https://www.instagram.com/reel/x', 'https://instagram.com.evil.com/x', 'https://evil.com/instagram.com/x', '@bad handle', 'https://www.facebook.com/copper', '']) {
    assert.equal(ig(bad), null, `Instagram refuses ${JSON.stringify(bad)}`);
  }
  assert.equal(fb('facebook.com/copperpotkitchen'), 'https://www.facebook.com/copperpotkitchen');
  assert.equal(fb('https://m.facebook.com/copperpotkitchen/'), 'https://www.facebook.com/copperpotkitchen');
  assert.equal(fb('https://web.facebook.com/copperpotkitchen?ref=x'), 'https://www.facebook.com/copperpotkitchen');
  assert.equal(fb('https://www.facebook.com/profile.php?id=100064123456789'), 'https://www.facebook.com/profile.php?id=100064123456789');
  for (const bad of ['https://www.facebook.com/', 'https://www.facebook.com/sharer/sharer.php?u=x', 'https://www.facebook.com/events/123', 'https://www.facebook.com/groups/x', 'https://facebook.com.evil.com/x',
    'https://fb.me/x', 'https://www.facebook.com/profile.php', 'javascript:alert(1)', 'https://www.facebook.com/a b', '@copper']) {
    assert.equal(fb(bad), null, `Facebook refuses ${JSON.stringify(bad)}`);
  }
});

test('Instagram and Facebook go live straight away from the edit link, logged, with Undo; research cannot replace them; other links still wait', async () => {
  const v = mk('restaurant', { hours: week, website: 'https://fe3.example' });
  const token = tokenFor(v.id);
  const bad = await post(token, { instagram_url: 'not-a-handle', facebook_url: 'twitter.com/x' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.errors.instagram_url, /@yourbusiness/);
  const r = await post(token, { instagram_url: '@fe3.kitchen', facebook_url: 'facebook.com/fe3kitchen', menu_url: 'fe3.example/menu' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual([...r.body.live].sort(), ['facebook_url', 'instagram_url']);
  assert.deepEqual(r.body.review, ['menu_url'], 'a menu link still waits for our check');
  const links = app.venueLinks(v.id);
  assert.equal(links.instagram_url, 'https://www.instagram.com/fe3.kitchen/');
  assert.equal(links.facebook_url, 'https://www.facebook.com/fe3kitchen');
  assert.equal(links.menu_url, null);
  const logged = db.prepare("SELECT field_name, source FROM venue_enrichment_log WHERE venue_id = ? AND field_name IN ('instagram_url','facebook_url')").all(v.id);
  assert.deepEqual(logged.map((x) => `${x.field_name}:${x.source}`).sort(), ['facebook_url:venue_owner', 'instagram_url:venue_owner']);
  // Public page shows them right away.
  const pub = await get('/penticton/restaurants/' + v.slug);
  assert.match(pub, /href="https:\/\/www\.instagram\.com\/fe3\.kitchen\/"/);
  // Research can't replace an owner's link.
  const research = app.guardedVenueLinkUpdate(v.id, 'instagram_url', links.instagram_url, 'https://www.instagram.com/someone.else/', meta);
  assert.equal(research.ok, false);
  assert.equal(research.reason, 'owner_value');
  assert.equal(app.venueLinks(v.id).instagram_url, 'https://www.instagram.com/fe3.kitchen/');
  // Undo puts the old (empty) values back.
  const audit = db.prepare('SELECT id FROM owner_change_requests WHERE venue_id = ? AND instant = 1 ORDER BY id DESC').get(v.id).id;
  assert.equal(app.undoOwnerInstantChange(audit, 'dayton').ok, true);
  assert.equal(app.venueLinks(v.id).instagram_url, null);
  assert.equal(app.venueLinks(v.id).facebook_url, null);
  // Other types too (Dayton: owners' social links go live).
  const cafe = mk('cafe', { hours: week });
  const rc = await post(tokenFor(cafe.id), { instagram_url: '@fe3.cafe' });
  assert.deepEqual(rc.body.live, ['instagram_url']);
  assert.equal(app.venueLinks(cafe.id).instagram_url, 'https://www.instagram.com/fe3.cafe/');
});

test('quick ones only hold things that go live for this owner (edit link: no phone, website or dietary ticks)', () => {
  const linkLive = app.ownerCompletenessLiveFields(false);
  const signedLive = app.ownerCompletenessLiveFields(true);
  for (const f of ['instagram_url', 'facebook_url', 'cuisine', 'avg_spend', 'hours_checked', 'visit_rows']) assert.ok(linkLive.has(f), f);
  for (const f of ['phone', 'website', 'badges', 'menu_url']) assert.ok(!linkLive.has(f), `${f} waits for review from an edit link`);
  // A page missing nearly everything: every quick one goes live on save.
  const input = { address: '1 Main', latitude: 1, longitude: 1, hasHours: true, hoursCheckedAt: '2026-01-01', imageUrl: '/images/x.jpg', photoCount: 1, description: 'short' };
  const r = pc.scoreCompleteness(input, { today, liveFields: linkLive });
  assert.ok(r.quick.length > 0);
  for (const it of r.quick) assert.ok(linkLive.has(pc.QUICK_FIELD[it.key]), `${it.key} is quick and goes live`);
  assert.ok(!r.quick.some((it) => ['phone', 'website', 'dietary'].includes(it.key)));
  // Every item that can ever be quick has a field.
  for (const it of pc.ITEMS) if (pc.SECONDS[it.key] <= pc.QUICK_SECONDS && it.fix) assert.ok(pc.QUICK_FIELD[it.key], `${it.key} has a QUICK_FIELD`);
  // Signed in, the phone can be a quick one again.
  const r2 = pc.scoreCompleteness({ ...input, phone: '' }, { today, liveFields: signedLive });
  assert.ok(r2.quick.some((it) => it.key === 'phone') || r2.quickSeconds >= 40, 'phone is quick for a login');
});

test('score while waiting: "61% now · about 95% once we check your N changes", with a legend; the real score never counts them', async () => {
  const v = mk('restaurant', { hours: week, website: 'https://fe3w.example' });
  const token = tokenFor(v.id);
  const before = await bar(token);
  assert.doesNotMatch(before, /op-cb-prov/, 'nothing waiting: no provisional line');
  const r = await post(token, { description: 'A family-run spot on Main Street with wood-fired pizza, house-made pasta and a sunny patio for long summer evenings with friends.', menu_url: 'fe3w.example/menu' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const after = await bar(token);
  // Pub test 3 (2026-11-10): one number. The headline and ring count what was sent; the ring's dark part stays the real score.
  const pct = Number(/--p:(\d+);/.exec(after)[1]);
  const shown = Number(/Your page is about (\d+)% complete/.exec(after)[1]);
  const m = /<strong>(\d+)%<\/strong> counts what you sent\. We check your (\d+) changes, usually within a day\./.exec(after);
  assert.ok(m, 'provisional line shown');
  assert.equal(Number(/--p:(\d+);/.exec(before)[1]), pct, 'the real score is unchanged');
  assert.ok(shown > pct);
  assert.equal(Number(m[1]), shown);
  assert.equal(Number(m[2]), 2);
  assert.match(after, new RegExp(`<b>${shown}%</b>`));
  assert.match(after, /class="op-cb-key op-cb-key-done"><\/i>Done <i class="op-cb-key op-cb-key-wait"><\/i>Sent, we’re checking/);
  assert.match(after, /--w:\d+/);
  const fr = (await fetch(`${base}/fr/owner/${token}/completeness`).then((x) => x.json())).html;
  assert.match(fr, /<strong>\d+ %<\/strong> compte ce que vous avez envoyé\. Nous vérifions vos 2 modifications, habituellement d’ici un jour\./);
});

test('storefront: a spot sent for our check shows as waiting and counts in the provisional score', () => {
  const base0 = { address: '1 Main', latitude: 1, longitude: 1, hasHours: true, hoursCheckedAt: today, imageUrl: '/images/x.jpg', photoCount: 3, description: 'x'.repeat(130), cuisine: 'Italian', phone: '1', website: 'https://a.example' };
  const off = pc.scoreCompleteness(base0, { today });
  assert.ok(off.missing.some((it) => it.key === 'arrival' && !it.waiting));
  const on = pc.scoreCompleteness({ ...base0, pendingArrival: true }, { today });
  const a = on.missing.find((it) => it.key === 'arrival');
  assert.ok(a && a.waiting, 'storefront is waiting');
  assert.ok(on.pctWithWaiting > on.pct);
  assert.equal(on.pct, off.pct, 'the real score is the same');
  const html = pc.renderCompleteness(on, {});
  assert.match(html, /Waiting for our check[\s\S]*Storefront photo and exact spot/);
  // The browser script: a denied location stops watching and says "Drag the pin", not "Finding your location…" forever.
  const ap = fs.readFileSync(path.join(__dirname, '..', 'arrival-points.js'), 'utf8');
  assert.match(ap, /function\(\)\{if\(!best\)\{stop\(\);noLoc=true;say\(T\.noGps\);show\(\);\}\}/);
  assert.match(ap, /say\(noLoc&&!best\?T\.noGps:T\.finding\)/);
});

test('average spend: no "your page shows $X" while it is hidden publicly; the live wording only when AVG_SPEND_PUBLIC is on', async () => {
  const r = pc.scoreCompleteness({ avgSpend: 32, avgSpendSource: 'research' }, { today });
  const hidden = pc.renderCompleteness(r, { avgEstimate: 32, avgPublic: false });
  assert.match(hidden, /Thanks! Saved\. It’ll show on your page soon\./);
  assert.doesNotMatch(hidden, /Your page shows about \$32/);
  const shown = pc.renderCompleteness(r, { avgEstimate: 32, avgPublic: true });
  assert.match(shown, /Thanks! Your page shows about \$32\./);
  const v = mk('restaurant', { hours: week });
  const page = await get(`/owner/${tokenFor(v.id)}`);
  assert.match(page, /Saved as soon as you tap Save\. It’ll show on your page soon\./);
  assert.doesNotMatch(page, /Goes live as soon as you save it\./);
  assert.match(page, /Saved \{amount\} as the average spend per person\. It’ll show on your page soon\./);
  assert.doesNotMatch(page, /Your page now shows \{amount\}/);
  process.env.AVG_SPEND_PUBLIC = '1';
  try {
    const live = await get(`/owner/${tokenFor(v.id)}`);
    assert.match(live, /Goes live as soon as you save it\./);
    assert.match(live, /Your page now shows \{amount\}/);
  } finally { delete process.env.AVG_SPEND_PUBLIC; }
});

test('edit page: after-send line, toast, back-to-my-list, description goal, happy hour copy, photo previews, URL fields, email hint', async () => {
  const v = mk('restaurant', { hours: week });
  const page = await get(`/owner/${tokenFor(v.id)}`);
  // Each sent block can say "Sent Nov 9 · waiting for our check".
  for (const f of ['hours open_months hours_seasons closures', 'badges', 'description', 'name address website menu_url booking_url', 'happy_hour happy_hour_deals', 'specials', 'weekly_nights']) {
    assert.ok(page.includes(`data-fields="${f}"`), f);
  }
  assert.match(page, /"sentLine":"Sent \{date\} · waiting for our check"/);
  assert.match(page, /<p class="op-toast" id="opToast" role="status" hidden><\/p>/);
  assert.equal(page.split('data-cb-back="1">Done, back to my list<').length - 1, 3, 'cuisine, Plan your visit, average spend');
  assert.match(page, /id="opDescGoal" data-min="120"/);
  assert.match(page, /<div id="opHappy" class="op-hh-stable">/);
  assert.equal(page.split('data-copy-from="weekdays"').length - 1, 7, 'every happy-hour day can be copied');
  assert.match(page, /id="ofPreviews"/);
  for (const id of ['opWebsite', 'opMenu', 'opBooking', 'opFacebook']) assert.match(page, new RegExp(`type="text" inputmode="url" spellcheck="false" id="${id}"`), id);
  assert.match(page, /Add your email and we&rsquo;ll tell you when it&rsquo;s live\. Leave it blank and we won&rsquo;t email you\./);
  assert.doesNotMatch(page, /then tap <strong>Make main photo<\/strong>/, 'no Make main photo promise on the edit link');
  assert.match(page, /<details class="op-tips"><summary>Tips<\/summary>/);
  // The page script still parses.
  const vm = require('node:vm');
  for (const m of page.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    if (m[1] && /type="application\/(ld\+)?json"/.test(m[1])) continue;
    assert.doesNotThrow(() => new vm.Script(m[2]), 'inline script parses');
  }
  // Help answer leads with "Score didn't go up?".
  const topic = app.OWNER_HELP_TOPICS.find((t) => t.id === 'page-complete');
  assert.match(topic.a, /^<p><strong>Score didn’t go up\?<\/strong> It worked\./);
  assert.match(topic.aFr, /^<p><strong>Le pointage n’a pas monté\?<\/strong> Ça a marché\./);
});

test('last step wording: "Do it" for one step, "Do them" for two', () => {
  const base0 = { address: '1 Main', latitude: 1, longitude: 1, hasHours: true, hoursCheckedAt: today, imageUrl: '/images/x.jpg', photoCount: 3, description: 'x'.repeat(130), cuisine: 'Italian', phone: '1', website: 'https://a.example' };
  const one = pc.renderCompleteness(pc.scoreCompleteness(base0, { today }), {});
  assert.match(one, /Your storefront spot is the last step to 100%\. Do it when/);
  const two = pc.renderCompleteness(pc.scoreCompleteness({ ...base0, photoCount: 1 }, { today }), {});
  assert.match(two, /Photos and your storefront spot are the last steps to 100%\. Do them when/);
});

test('other types: no completeness extras on a pub or a cafe edit page', async () => {
  for (const type of ['brewery', 'cafe', 'winery']) {
    const page = await get(`/owner/${tokenFor(mk(type, { hours: week }).id)}`);
    for (const s of ['op-cb-prov', 'opToast', 'data-cb-back', 'opDescGoal', 'op-hh-stable', 'data-copy-from', 'ofPreviews', 'op-tips', 'data-fields=']) assert.ok(!page.includes(s), `${type}: no ${s}`);
  }
});
