// Verified mark (2026-10-27): a listing the business manages (venueIsClaimed: an owner login on it, an approved claim
// or an approved owner update) shows a "Verified by the venue" pill under its name, with the date of the last approved
// owner update when there is one. Deals and weekly specials the owner entered (source 'venue_owner') say "Confirmed by
// <venue> · date" instead of the grey checked date. Roam Now ([18] = 1) and the town Happy Hour pages put a small
// green tick after the name.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'r20-verified-admin-token';
const app = require('../server.js');
const db = require('../db.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
let n = 0;
const mk = (o) => app.createVenue({ slug: `verified-fixture-${++n}`, region: 'kelowna', type: 'pub', latitude: 49.885 + n / 1000, longitude: -119.47, rating: 4.2,
  happy_hour: true, description: 'A fixture pub used only by the verified mark tests.', hours: JSON.stringify(open('11:00', '23:00')), ...o });
const meta = { reason: 'verified fixture', batch_id: 'test-verified' };
const today = app.todayLocal();
const daysAgo = (d) => app.addLocalDays(today, -d);
const DEALS = [{ text: 'House pints (20 oz)', price: '$6' }, { text: 'Cocktails', price: '$10' }];
const TACO = { days: ['tue'], title: 'Taco Tuesday', deal: '$3 tacos', price: '$3 each', kind: 'food' };
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const setDeals = (v, source_url, checked_at) => {
  const cur = db.prepare('SELECT happy_hour_deals FROM venues WHERE id = ?').get(v.id).happy_hour_deals;
  const r = app.guardedHappyHourDealsUpdate(v.id, cur, { deals: DEALS, source_url, checked_at }, meta);
  assert.equal(r.ok, true, JSON.stringify(r));
};
const setSpecials = (v, source_url, checked_at) => {
  const r = app.guardedSpecialsUpdate(v.id, app.currentSpecialsJson(v.id), { specials: [TACO], source_url, checked_at }, meta);
  assert.equal(r.ok, true, JSON.stringify(r));
};
// Ways a venue becomes claimed.
const approveClaim = (v) => db.prepare(`INSERT INTO venue_claims (venue_id, name, role, email, phone, verify_method, status)
  VALUES (?, 'Test Owner', 'owner', 'owner@example.com', '250-555-0100', 'call', 'approved')`).run(v.id);
const approveOwnerUpdate = (v, at) => db.prepare(`INSERT INTO owner_change_requests (venue_id, status, changes, previous, submitted_at)
  VALUES (?, 'approved', '{}', '{}', ?)`).run(v.id, at);
const ownerLogin = (v) => {
  const acc = db.prepare('INSERT INTO owner_accounts (email, password_hash) VALUES (?, ?)').run(`verified-${v.id}@example.com`, 'x');
  db.prepare('INSERT INTO owner_account_venues (account_id, venue_id) VALUES (?, ?)').run(acc.lastInsertRowid, v.id);
};
const pill = (html) => (/<p class="venue-verified-wrap">([\s\S]*?)<\/p>/.exec(html) || [])[1] || '';
const dealsBody = (html, block) => (new RegExp(`<div class="venue-deals-block" data-block="${block}">(?:<h3>[^<]*</h3>)?<div class="venue-deals-body">([\\s\\S]*?)</div></div>`).exec(html) || [])[1] || '';

test('Venue page pill: "Verified by the venue" on a claimed listing (EN/FR, with and without a date), none on an unclaimed one', () => {
  const plain = mk({ name: 'Verified Plain Pub' });
  assert.equal(app.venueIsClaimed(plain.id), false);
  assert.equal(pill(page(plain)), '');
  assert.doesNotMatch(page(plain), /Verified by the venue|venue-owner-updated|Updated by the business/);
  assert.doesNotMatch(page(plain, 'fr'), /Vérifié par l’établissement/);

  // An approved claim: the pill, no date.
  const claimed = mk({ name: 'Verified Claimed Pub' });
  approveClaim(claimed);
  assert.equal(app.venueIsClaimed(claimed.id), true);
  assert.equal(pill(page(claimed)), '<span class="venue-verified" title="The business manages this listing on Okanagan Roam"><span class="venue-verified-tick" aria-hidden="true">&#10003;</span>Verified by the venue</span>');
  assert.equal(pill(page(claimed, 'fr')), '<span class="venue-verified" title="L’établissement gère cette fiche sur Okanagan Roam"><span class="venue-verified-tick" aria-hidden="true">&#10003;</span>Vérifié par l’établissement</span>');

  // An owner login on it counts too.
  const login = mk({ name: 'Verified Login Pub' });
  ownerLogin(login);
  assert.match(pill(page(login)), /Verified by the venue<\/span>$/);

  // An approved owner update: the pill with its date (Okanagan time, the same date text as before).
  const dated = mk({ name: 'Verified Dated Pub' });
  approveOwnerUpdate(dated, '2026-10-20 18:30:00');
  assert.match(pill(page(dated)), /Verified by the venue <span class="venue-verified-date">&middot; updated Oct 20, 2026<\/span><\/span>$/);
  assert.match(pill(page(dated, 'fr')), /Vérifié par l’établissement <span class="venue-verified-date">&middot; mis à jour le 20 oct\. 2026<\/span><\/span>$/);
  // A rejected update alone does not count.
  const rejected = mk({ name: 'Verified Rejected Pub' });
  db.prepare("INSERT INTO owner_change_requests (venue_id, status, changes, previous) VALUES (?, 'rejected', '{}', '{}')").run(rejected.id);
  assert.equal(pill(page(rejected)), '');

  // The look: a green pill with the tick in a circle, the date lighter.
  const css = page(dated);
  assert.match(css, /body\.golf-page \.venue-verified \{ display: inline-flex;[^}]*padding: 5px 12px 5px 6px; border: 1px solid rgba\(30,107,58,\.25\); border-radius: 999px; background: #E8F3EC; color: #1E6B3A; font-size: \.84rem; font-weight: 700;/);
  assert.match(css, /body\.golf-page \.venue-verified-wrap \{ margin: 10px 0 0; \}/);
  assert.match(css, /body\.golf-page \.venue-verified-date \{ font-weight: 500; opacity: \.8; \}/);
});

test('Deals card: "Confirmed by <venue>" only for owner-entered deals and specials; researched ones keep the grey checked date', () => {
  const d = daysAgo(2);
  const owner = mk({ name: 'Confirmed Owner Pub' });
  setDeals(owner, 'venue_owner', d);
  setSpecials(owner, 'venue_owner', d);
  const en = page(owner), fr = page(owner, 'fr');
  const dateEn = app.ownerUpdatedDate(`${d} 19:00:00`, false), dateFr = app.ownerUpdatedDate(`${d} 19:00:00`, true);
  assert.ok(dateEn && dateFr);
  assert.ok(dealsBody(en, 'hh').includes(`<span class="venue-hours-checked venue-hh-deals-checked"><span class="venue-confirmed"><span class="venue-confirmed-tick" aria-hidden="true">&#10003;</span><span>Confirmed by Confirmed Owner Pub <span class="venue-confirmed-date">&middot; ${dateEn}</span></span></span></span>`), dealsBody(en, 'hh'));
  assert.doesNotMatch(dealsBody(en, 'hh'), /Checked /);
  assert.ok(dealsBody(fr, 'hh').includes(`<span>Confirmé par Confirmed Owner Pub <span class="venue-confirmed-date">&middot; ${dateFr}</span></span>`));
  assert.ok(dealsBody(en, 'sp').includes(`<span class="venue-hours-checked venue-sp-checked"><span class="venue-confirmed">`), dealsBody(en, 'sp'));
  assert.ok(dealsBody(en, 'sp').includes(`Confirmed by Confirmed Owner Pub <span class="venue-confirmed-date">&middot; ${dateEn}</span>`));
  // The gap after the tick sits on an inline-flex wrapper (the checked line around it is display: block).
  assert.match(en, /body\.golf-page \.venue-confirmed \{ display: inline-flex; align-items: center; gap: 6px; color: #1E6B3A;/);
  assert.match(en, /body\.golf-page \.venue-confirmed-tick \{ width: 15px; height: 15px;/);

  // Researched deals and specials: the grey date, no "Confirmed by".
  const research = mk({ name: 'Confirmed Research Pub' });
  setDeals(research, 'https://example.com/happy-hour', d);
  setSpecials(research, 'https://example.com/specials', d);
  const r = page(research);
  assert.doesNotMatch(r, /class="venue-confirmed"|<span>Confirmed by/);
  assert.match(dealsBody(r, 'hh'), /<span class="venue-hours-checked venue-hh-deals-checked">Checked [A-Z][a-z]{2} \d+, \d{4}<\/span>/);
  assert.match(dealsBody(r, 'sp'), /<span class="venue-hours-checked venue-sp-checked">Checked [A-Z][a-z]{2} \d+, \d{4}<\/span>/);
});

test('Roam Now: [18] = 1 on a claimed place (others keep their length), and the card shows a small green tick after the name', () => {
  const claimed = mk({ name: 'Map Verified Pub', happy_hour: false });
  approveClaim(claimed);
  const plain = mk({ name: 'Map Plain Pub', happy_hour: false });
  const rows = JSON.parse(app.mapLiveData(new Date()).json).p;
  const c = rows.find((p) => p[2] === 'Map Verified Pub');
  assert.equal(c.length, 19);
  assert.equal(c[16], 0);
  assert.equal(c[17], 0);
  assert.equal(c[18], 1);
  assert.equal(rows.find((p) => p[2] === 'Map Plain Pub').length, 16, 'an unclaimed place keeps 16 fields');
  assert.ok(app.claimedVenueIds().has(claimed.id));
  assert.ok(!app.claimedVenueIds().has(plain.id));
  const html = app.renderPlacesMapPage();
  assert.ok(html.includes('vf: a[18] || 0'));
  assert.ok(html.includes(`(x.vf ? '<span class="pm-vf" role="img" aria-label="' + esc(T.verified) + '" title="' + esc(T.verified) + '">&#10003;</span>' : '')`));
  assert.ok(html.includes("verified: 'Verified by the venue'"));
  assert.ok(html.includes("verified: 'Vérifié par l’établissement'"));
  assert.match(html, /body\.map-page \.pm-vf \{ margin-left: 4px; font-size: 0\.8em; font-weight: 800; color: #1E6B3A; \}/);
});

test('Town Happy Hour page: a small green tick after the name of a claimed place only (EN/FR)', () => {
  const claimed = mk({ name: 'Town Verified Pub' });
  approveClaim(claimed);
  const plain = mk({ name: 'Town Plain Pub' });
  const list = [claimed, plain].map((v) => app.getVenue(v.id));
  const cardOf = (html, v) => { const i = html.indexOf(`data-venue-id="${v.id}"`); return html.slice(i, html.indexOf('</li>', i)); };
  const html = app.renderGuidePage('kelowna', 'happy_hour', list, null, new Date());
  assert.match(cardOf(html, claimed), /Town Verified Pub[\s\S]*? <span class="guide-hh-vf" role="img" aria-label="Verified by the venue" title="Verified by the venue">&#10003;<\/span><\/h2>/);
  assert.doesNotMatch(cardOf(html, plain), /guide-hh-vf/);
  assert.match(html, /body\.guide-page \.guide-hh-vf \{ font-size: 0\.8em; font-weight: 800; color: #1E6B3A; \}/);
  const fr = app.renderGuidePage('kelowna', 'happy_hour', list, null, new Date(), { lang: 'fr' });
  assert.match(cardOf(fr, claimed), /<span class="guide-hh-vf" role="img" aria-label="Vérifié par l’établissement" title="Vérifié par l’établissement">&#10003;<\/span><\/h2>/);
  // Other guide pages are unchanged.
  assert.doesNotMatch(app.renderGuidePage('kelowna', 'patio', list, null, new Date()), /guide-hh-vf/);
});
