// Complete & Verified badge (2026-11-09, Dayton): a restaurant at 100% (live items only), managed by the business, with
// hours checked in the last 30 days shows one navy-and-gold chip; the other "verified" lines on its page are left out
// (say it once). Cards, related cards and the Roam Now map mark it too. The portal says how to earn it, that it was
// earned, or that it is paused. Day-25 reminders are off unless BADGE_REMINDERS=1, never sent twice, honour opt-outs.
// Display only: ranking, sitemap and robots never read it. Runs on a throwaway database; `git checkout -q okanagan.db` after.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'complete-verified-admin-token';
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const pc = require('../portal-completeness.js');

const today = app.todayLocal();
const daysAgo = (d) => app.addLocalDays(today, -d);
const WEEK = JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, d === 'mon' ? [] : [['11:30', '21:00']]])));
const meta = { reason: 'complete verified fixture', batch_id: 'test-cv' };
let n = 0;
// A restaurant with every checklist item done by the business.
function full(o = {}) {
  n += 1;
  const v = app.createVenue({ name: `Complete Bistro ${n}`, slug: `complete-bistro-${n}`, region: 'penticton', type: 'restaurant', latitude: 49.49 + n / 1000, longitude: -119.59,
    rating: 4.6, address: `${n} Lakeshore Dr W, Penticton, BC`, phone: '250-555-0142', website: 'https://example.com', cuisine: 'Italian', hours: WEEK,
    image_url: '/images/venues/15-park-bistro-2610.jpg', vegan: 1, vegetarian: 1, gluten_free: 1, patio: 1, happy_hour: 1, live_music: 1,
    description: 'A neighbourhood bistro on the Penticton lakefront serving seasonal plates built around Okanagan produce, with a sunny patio facing the lake.', ...o });
  db.prepare("UPDATE venues SET hours_source = 'venue_owner', hours_checked_at = ?, happy_hour_times = ? WHERE id = ?")
    .run(today, JSON.stringify({ tue: [['15:00', '17:00']] }), v.id);
  db.prepare('INSERT INTO venue_links (venue_id, menu_url, booking_url, instagram_url, facebook_url) VALUES (?, ?, ?, ?, ?)')
    .run(v.id, 'https://example.com/menu', 'https://example.com/book', 'https://www.instagram.com/completebistro/', 'https://www.facebook.com/completebistro');
  const ph = db.prepare("INSERT INTO owner_photos (venue_id, file, preview_key, credit, rights_confirmed_at, status) VALUES (?, ?, ?, 'Complete Bistro', datetime('now'), 'approved')");
  for (let i = 0; i < 3; i++) ph.run(v.id, `cv-${n}-${i}.jpg`, `cvpk-${n}-${i}`);
  db.prepare("INSERT INTO venue_arrival_points (venue_id, file, preview_key, lat, lng, status) VALUES (?, ?, ?, 49.49, -119.59, 'approved')").run(v.id, `door-${n}.jpg`, `door-${n}`);
  assert.equal(app.guardedSpecialsUpdate(v.id, app.currentSpecialsJson(v.id), { specials: [{ days: ['tue'], title: 'Taco Tuesday', deal: '3 fish tacos', price: '$18', kind: 'food' }], source_url: 'venue_owner', checked_at: today }, meta).ok, true);
  db.prepare("INSERT INTO venue_weekly_nights (venue_id, days, kind, title, source, checked_at) VALUES (?, '[\"thu\"]', 'live-music', 'Live music', 'venue_owner', ?)").run(v.id, today);
  assert.equal(app.guardedVisitInfoUpdate(v.id, null, { rows: [
    { label: 'Known for', text: 'Wood-fired flatbreads' }, { label: 'Reservations', text: 'Book online or call' },
    { label: 'Takeout', text: 'Takeout by phone' }, { label: 'Dietary', text: 'Vegan and gluten-free options' }, { label: 'Good to know', text: 'Groups of 10+ call ahead' }],
    booking_url: null, source_url: 'https://example.com/', checked_at: today }, meta).ok, true);
  assert.equal(app.guardedAvgSpendUpdate(v.id, null, { amount: 32, source: 'owner', source_url: null, basis: 'From the owner', checked_at: today }, meta).ok, true);
  db.prepare("INSERT INTO venue_claims (venue_id, name, role, email, phone, verify_method, status) VALUES (?, 'Owner', 'owner', 'owner@example.com', '250-555-0142', 'call', 'approved')").run(v.id);
  app.resetCompleteVerifiedCache();
  return app.getVenue(v.id);
}
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const setChecked = (v, d) => { db.prepare('UPDATE venues SET hours_checked_at = ? WHERE id = ?').run(d, v.id); app.resetCompleteVerifiedCache(); };

let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => { srv && srv.close(); app.setOwnerEmailTransport(null); });
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));

test('rule: earned at 100% (live only) + managed by the business + hours checked within 30 days; paused when only the check is old', () => {
  assert.equal(pc.HOURS_FRESH_DAYS, 30, 'hours count as fresh for 30 days (Dayton)');
  const v = full();
  assert.equal(app.venueBadgeState(v), 'earned');
  setChecked(v, daysAgo(30)); assert.equal(app.venueBadgeState(app.getVenue(v.id)), 'earned', '30 days is still fresh');
  setChecked(v, daysAgo(31)); assert.equal(app.venueBadgeState(app.getVenue(v.id)), 'paused');
  // Waiting items never count: the storefront spot only sent (pending), not approved.
  const w = full(); db.prepare("UPDATE venue_arrival_points SET status = 'pending' WHERE venue_id = ?").run(w.id); app.resetCompleteVerifiedCache();
  assert.equal(app.venueBadgeState(app.getVenue(w.id)), 'none');
  // Other types never get it (pubs can since 2026-11-10: tests/owner-pubs.test.js).
  const brew = app.createVenue({ name: 'Complete Brewery', slug: 'complete-brewery', region: 'penticton', type: 'brewery', latitude: 49.5, longitude: -119.6 });
  assert.equal(app.venueBadgeState(brew), 'none');
  assert.equal(pc.badgeState({ complete: false, missing: [{ key: 'hours_fresh', waiting: false }] }, true), 'paused');
  assert.equal(pc.badgeState({ complete: false, missing: [{ key: 'hours_fresh' }, { key: 'arrival' }] }, true), 'none');
  assert.equal(pc.badgeState({ complete: true, missing: [] }, false), 'none');
});

test('venue page: one chip with its explanation; the other verified lines are left out (say it once); EN and FR', () => {
  const v = full();
  const en = page(v);
  assert.equal((en.match(/class="chip complete-verified-badge"/g) || []).length, 1, 'the chip once');
  assert.match(en, /<button type="button" class="chip complete-verified-badge" aria-expanded="false" aria-controls="cvExplain">/);
  assert.match(en, /<span class="cv-explain" id="cvExplain" hidden><strong>Complete &amp; Verified<\/strong>Every detail on this page was checked by the business\. Last updated /);
  assert.doesNotMatch(en, /<p class="venue-verified-wrap">|<span class="venue-verified"/, 'no green pill');
  assert.doesNotMatch(en, /<span class="venue-confirmed">/, 'no "Confirmed by" lines');
  assert.doesNotMatch(en, /<p class="venue-hours-checked">/, 'no "Hours checked" line');
  assert.match(en, /Taco Tuesday/, 'the specials themselves stay');
  const fr = page(v, 'fr');
  assert.match(fr, /Complète et vérifiée/);
  assert.match(fr, /Chaque détail de cette fiche a été vérifié par l’entreprise\./);
  assert.doesNotMatch(fr, /<p class="venue-verified-wrap">|<span class="venue-confirmed">/);
  // Paused: no chip, and the page is exactly as it was before the badge existed (pill and lines back).
  setChecked(v, daysAgo(40));
  const paused = page(v);
  assert.doesNotMatch(paused, /class="chip complete-verified-badge"|id="cvExplain"/);
  assert.match(paused, /<span class="venue-verified"[^>]*>.*Verified by the business/);
  assert.match(paused, /<span class="venue-confirmed">/);
});

test('wording: "Verified by the business" / « Vérifié par l’entreprise » (was "by the venue")', () => {
  const v = full(); setChecked(v, daysAgo(60));
  assert.match(page(v), /Verified by the business/);
  assert.match(page(v, 'fr'), /Vérifié par l’entreprise/);
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(!src.includes('Verified by the venue') && !src.includes('Vérifié par l’établissement'));
});

test('cards and the Roam Now map: the chip on cards, a navy pin ([18] = 2) only for badge places', async () => {
  const v = full();
  app.resetCompleteVerifiedCache();
  const list = await get('/penticton/restaurants');
  assert.equal(list.status, 200);
  const m = list.text.match(new RegExp(`<li class="venue-card[^"]*"[^>]*>(?:(?!</li>)[\\s\\S])*?/penticton/restaurants/${v.slug}"(?:(?!</li>)[\\s\\S])*</li>`));
  assert.ok(m, 'the card is on the page');
  const card = m[0];
  assert.match(card, /class="chip complete-verified-badge"/);
  const rows = app.mapPlacesData().p || app.mapPlacesData().places || app.mapPlacesData();
  const arr = Array.isArray(rows) ? rows : [];
  const row = arr.find((r) => Array.isArray(r) && r[2] === v.name);
  assert.ok(row, 'the place is on the map');
  assert.equal(row[18], 2);
  const other = full(); setChecked(other, daysAgo(45));
  const row2 = (Array.isArray(app.mapPlacesData().p) ? app.mapPlacesData().p : arr).find((r) => Array.isArray(r) && r[2] === other.name);
  if (row2) assert.equal(row2[18], 1, 'claimed without the badge keeps the plain tick');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8'), /\.pm-pin-cv span \{ background: #1B2B3A; border-color: #C9A34A; \}/);
});

test('portal: how to earn it, earned, paused (EN and FR)', () => {
  const input = { hasHours: true };
  const none = pc.renderCompleteness(pc.scoreCompleteness(input, { today }), { claimed: true });
  assert.match(none, /Reach 100% to earn the Complete &amp; Verified badge for your page\./);
  const fakeEarned = { pct: 100, complete: true, missing: [], quick: [], later: [], coming: [], groups: [], declined: [], declared: [], minutes: 0, quickSeconds: 0 };
  const earned = pc.renderCompleteness(fakeEarned, { claimed: true });
  assert.match(earned, /You earned the/); assert.match(earned, /every 30 days\. We’ll send a reminder\./);
  const paused = pc.renderCompleteness({ ...fakeEarned, pct: 96, complete: false, missing: [{ key: 'hours_fresh', w: 4, waiting: false }] }, { claimed: true });
  assert.match(paused, /badge is paused\. Are your hours still right\?/);
  assert.match(paused, /data-cb-save="\{&quot;hours_checked&quot;:true\}"/);
  assert.match(pc.renderCompleteness(fakeEarned, { claimed: true, fr: true }), /Vous avez obtenu le badge/);
  assert.match(pc.renderCompleteness({ ...fakeEarned, pct: 96, complete: false, missing: [{ key: 'hours_fresh', w: 4 }] }, { claimed: true, fr: true }), /est en pause/);
  assert.doesNotMatch(pc.renderCompleteness(fakeEarned, {}), /opCbBadge/, 'nothing when the caller does not say who manages it');
});

test('reminders: off by default; one per cycle; opt-out honoured; the one-tap link confirms the hours as the business', async () => {
  const sent = [];
  app.setOwnerEmailTransport(async (m) => { sent.push(m); });
  const v = full();
  app.createOwnerLink(v.id, { contact_email: 'Owner@Example.com' });
  setChecked(v, daysAgo(26));
  assert.deepEqual(app.badgeRemindersDue().filter((d) => d.venue_id === v.id).map((d) => d.email), ['owner@example.com']);
  assert.deepEqual(await app.badgeReminderTick(), { sent: 0, skipped: 'off' }, 'flag off: nothing sent');
  assert.equal(sent.length, 0);
  process.env.BADGE_REMINDERS = '1';
  try {
    const r1 = await app.badgeReminderTick();
    assert.equal(r1.sent >= 1, true);
    const mine = sent.filter((m) => m.to === 'owner@example.com');
    assert.equal(mine.length, 1);
    assert.equal(mine[0].subject, 'Are your hours still right? One tap keeps your badge');
    assert.match(mine[0].text, /https:\/\/okanaganroam\.com\/owner\/hours-check\/[A-Za-z0-9_-]+\n/);
    assert.match(mine[0].text, /Don’t want these reminders\? https:\/\/okanaganroam\.com\/owner\/hours-check\/[A-Za-z0-9_-]+\/stop/);
    await app.badgeReminderTick();
    assert.equal(sent.filter((m) => m.to === 'owner@example.com').length, 1, 'never twice in one cycle');
    // The one-tap page and its confirm.
    const token = mine[0].text.match(/hours-check\/([A-Za-z0-9_-]+)\n/)[1];
    const pg = await get(`/owner/hours-check/${token}`);
    assert.equal(pg.status, 200); assert.match(pg.text, /Are your hours still right\?/); assert.match(pg.text, /Yes, these are right/);
    const ok = await fetch(`${base}/owner/hours-check/${token}`, { method: 'POST' });
    assert.equal(ok.status, 200);
    assert.equal(db.prepare('SELECT hours_checked_at, hours_source FROM venues WHERE id = ?').get(v.id).hours_checked_at, today);
    assert.ok(db.prepare("SELECT 1 FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'hours_checked_at' AND new_value = ?").get(v.id, today), 'logged');
    // Opt-out: the stop link, then a new cycle sends nothing to that address.
    assert.equal((await get(`/owner/hours-check/${token}/stop`)).status, 200);
    setChecked(v, daysAgo(27));
    assert.equal(app.badgeRemindersDue().filter((d) => d.email === 'owner@example.com').length, 0);
    assert.equal((await get('/owner/hours-check/not-a-real-token-at-all')).status, 410);
  } finally { delete process.env.BADGE_REMINDERS; }
  // Admin preview (no sending).
  const pv = await fetch(`${base}/admin/badge-reminders/preview`, { headers: { Authorization: 'Bearer complete-verified-admin-token' } }).then((r) => r.json());
  assert.equal(pv.on, false); assert.ok(Array.isArray(pv.due));
});

test('SEO: display only. Sitemap and robots identical with and without the badge; ranking and sorting never read it', async () => {
  const v = full();
  setChecked(v, daysAgo(50));
  const a = [await get('/sitemap.xml'), await get('/robots.txt')].map((r) => r.text);
  setChecked(v, today);
  const b = [await get('/sitemap.xml'), await get('/robots.txt')].map((r) => r.text);
  assert.equal(a[0], b[0]); assert.equal(a[1], b[1]);
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').split('\n');
  const uses = src.map((l, i) => [l, i]).filter(([l]) => /completeVerifiedIds\(|venueBadgeState\(/.test(l));
  for (const [l] of uses) assert.doesNotMatch(l, /rank|sortBy|orderBy|sitemap|robots|noindex/i, `badge read only for display: ${l.trim().slice(0, 120)}`);
  const json = page(v).match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || [];
  assert.ok(json.every((j) => !/award|Review|AggregateRating.*Complete/.test(j)), 'no award or review markup');
});
