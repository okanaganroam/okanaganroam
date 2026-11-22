// Sport tests 8 and 9 (2026-11-21; Marg, a 9-hole walk-on course in Lumby, and Gord, an 18-hole semi-private course in
// Summerland; drafts/fresh-eyes-sport8-2026-11-21 and -sport9-2026-11-21): the page. One price story once the owner's own
// price is in (research's fee table, its headline and the value index go), a call link with an extension, « Voir les droits
// de jeu et tarifs », Facebook in the Website button's place, an owner's dictated line as a sentence, "Free", every kind in
// the top line, the French closure line without an English reason (and the note queued for French), and the chip join.
// Runs on a throwaway database (like server.test.js); put okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
for (const s of ['', '-wal', '-shm', '-journal']) { try { fs.unlinkSync(DB_FILE + s); } catch (e) { /* not there */ } }
process.env.ENRICHMENT_ADMIN_TOKEN = 'sport-test8-page-admin-token';
delete process.env.BREVO_API_KEY;
delete process.env.BADGE_REMINDERS;
const app = require('../server.js');
const db = require('../db.js');
const IK = require('../indoor-kinds.js');
const { telHref } = require('../tel-href.js');
app.setVenueSubmissionTransport(async () => {});
if (app.setOwnerEmailTransport) app.setOwnerEmailTransport(async () => {});

let srv, base, ipN = 0, n = 0;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const WK = (o, c) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[o, c]]]));
const tokenFor = (id) => app.createOwnerLink(id, { reset: true }).url.split('/owner/')[1];
const change = (t, changes) => fetch(`${base}/owner/${t}/changes?from=setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.128.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` },
  body: JSON.stringify({ changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 }) }).then((r) => { assert.ok([200, 201].includes(r.status), `change ${r.status}`); return r; });
const plain = (h) => String(h).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/[\s  ]+/g, ' ');
const NOV = new Date('2026-11-21T12:00:00-08:00');
const html = (v, lang = 'en', now = NOV) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now });
const mk = (o = {}) => app.createVenue({ name: `Sport Eight Page ${++n}`, slug: `sport-eight-page-${n}`, region: 'lumby', type: 'golf', latitude: 50.25 + n / 4000, longitude: -118.97, rating: 4.4, reviews: 40,
  address: `${n} Hwy 6, Lumby`, website: `https://eight-${n}.example.com/`, hours: JSON.stringify(WK('07:00', '20:00')), description: 'A nine-hole village course with sand greens, and a disc golf course too.', description_fr: 'Un parcours de neuf trous.', ...o });
const clear = () => { if (app.clearVenueCaches) app.clearVenueCaches(); if (app.clearHoursExtraCache) app.clearHoursExtraCache(); };

test('1. one price story: once the owner types his green fee (a website rates link or not), research\'s fee table, its headline and the value index go, EN and FR; the course facts stay', async () => {
  const v = mk({ name: 'Penticton Golf & Country Club Eight', slug: 'penticton-golf-country-club', region: 'penticton', latitude: 49.49, longitude: -119.6 });
  clear();
  assert.match(html(v), /Standard adult rate/, 'research\'s fee table before his price');
  assert.match(html(v, 'fr'), /voir la page en anglais/, 'before his price');
  const t = tokenFor(v.id);
  await change(t, { indoor_info: { kinds: ['golf'], length: 'half', book: 'busy', age: 'all', year: 'all' }, indoor_price: 76.19 });
  db.prepare('INSERT INTO venue_links (venue_id, menu_url) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET menu_url = excluded.menu_url').run(v.id, 'https://example.com/rates');
  clear();
  const en = html(v), fr = html(v, 'fr');
  assert.doesNotMatch(en, /Standard adult rate|<table class="golf-fees-table"|<div class="venue-section golf-value/);
  assert.match(plain(en), /Green fees from \$76\.19/);
  assert.match(plain(en), /Par 70/, 'the course facts stay in At a glance');
  assert.doesNotMatch(fr, /voir la page en anglais/);
  // Research's price rows a full box set aside don't come back beside his price and rates link.
  const vi = { rows: [{ label: 'Known for', text: 'Old course.' }], owner_labels: [], owner_dropped: [{ label: 'Rentals', text: 'Power carts $42 for 18 holes (2026).' }] };
  db.prepare('INSERT INTO venue_visit_info (venue_id, info) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET info = excluded.info').run(v.id, JSON.stringify(vi));
  clear();
  assert.doesNotMatch(html(v), /Power carts \$42/);
});

test('2. a call link with an extension dials the digits and the extension ("tel:+12504949554,1"); the number shows as typed; a plain number is as before', async () => {
  assert.equal(telHref('250-494-9554 ext. 1'), 'tel:+12504949554,1');
  assert.equal(telHref('250 494 9554 x12'), 'tel:+12504949554,12');
  assert.equal(telHref('+1 250-555-0100'), 'tel:+1 250-555-0100');
  const v = mk({ phone: '250-494-9554 ext. 1' });
  const h = html(v);
  assert.match(h, /href="tel:\+12504949554,1"/);
  assert.doesNotMatch(h, /href="tel:250-494-9554 ext/);
  assert.match(plain(h), /250-494-9554 ext\. 1/);
});

test('3. French prices link words: « Voir les droits de jeu et tarifs », « Voir les cours et tarifs », « Voir la carte des soins »', () => {
  const words = [...new Set([...(IK.INDOOR_KIND_TEXT_KINDS || []), ...(IK.SPORT_KIND_TEXT_KINDS || [])].map((k) => { try { return IK.indoorKindText([k], 'fr').prices.see; } catch (e) { return null; } }).filter(Boolean))];
  assert.ok(words.includes('Voir les droits de jeu et tarifs'), words.join(' | '));
  assert.ok(!words.some((w) => /^Voir la (?:droits|cours)\b/.test(w)), words.join(' | '));
});

test('4. no website, a Facebook page only: Facebook takes the Website button\'s place (EN + FR)', async () => {
  const v = mk({ website: '' });
  db.prepare('INSERT INTO venue_links (venue_id, facebook_url) VALUES (?, ?) ON CONFLICT(venue_id) DO UPDATE SET facebook_url = excluded.facebook_url').run(v.id, 'https://www.facebook.com/lumbygolfclub');
  clear();
  for (const lang of ['en', 'fr']) {
    const h = html(v, lang);
    assert.match(h, /<a class="cta[^"]*" href="https:\/\/www\.facebook\.com\/lumbygolfclub"[^>]*>Facebook ↗<\/a>/, lang);
  }
  // With a website, as before.
  const w = mk();
  db.prepare('INSERT INTO venue_links (venue_id, facebook_url) VALUES (?, ?)').run(w.id, 'https://www.facebook.com/other');
  clear();
  assert.doesNotMatch(html(w), />Facebook ↗<\/a>/);
});

test('5. her dictated lines read as sentences (a capital and a full stop; Known for stays a phrase); a free price says "Free"', async () => {
  const v = mk();
  const t = tokenFor(v.id);
  await change(t, { indoor_info: { kinds: ['golf', 'discgolf'], length: '1-2h', book: 'no', age: 'all', year: 'all' }, indoor_price: 20 });
  const info = JSON.parse(db.prepare('SELECT info FROM venue_visit_info WHERE venue_id = ?').get(v.id).info);
  info.rows.push({ label: 'Dogs', text: 'dogs on a leash are welcome on the course please pick up after your dog' }, { label: 'Known for', text: 'sand greens and the friendliest volunteers' });
  info.owner_labels = [...new Set([...(info.owner_labels || []), 'Dogs', 'Known for'])];
  db.prepare('UPDATE venue_visit_info SET info = ? WHERE venue_id = ?').run(JSON.stringify(info), v.id);
  clear();
  const p = plain(html(v));
  assert.match(p, /Dogs on a leash are welcome on the course please pick up after your dog\./);
  assert.match(p, /Sand greens and the friendliest volunteers(?!\.)/);
  assert.equal(app.menuPriceLabel('free'), 'Free');
  assert.match(app.menuPriceLabel('free', 'fr'), /^gratuit$/i);
});

test('6. the top line says every kind she picked: "Golf course & disc golf" (EN), its French on the French page', async () => {
  const v = mk();
  const t = tokenFor(v.id);
  await change(t, { indoor_info: { kinds: ['golf', 'discgolf'], length: '1-2h', book: 'no', age: 'all', year: 'all' }, indoor_price: 20 });
  clear();
  const cuisine = app.getVenue(v.id).cuisine;
  assert.match(String(cuisine), /disc golf/i, cuisine);
  const en = html(v);
  assert.match(en, /<span class="venue-hero-type">Golf course &amp; disc golf<\/span>|Golf course &amp; disc golf · <a href="\/lumby"/);
  const fr = html(v, 'fr');
  assert.match(plain(fr), /[Dd]isque-golf/);
});

test('7. French closure line: an English note with no French yet is left off (« Fermé aujourd’hui · ouvre … »); the note is queued in the French lines item', async () => {
  const s = app.frStatusText('Closed today (closed to the public for the club championship) · Opens tomorrow 7 AM');
  assert.doesNotMatch(s, /closed to the public|championship/);
  assert.match(s, /^Fermé aujourd’hui · ouvre demain/);
  assert.match(app.frStatusText('Closed today (Christmas Day)'), /Fermé aujourd’hui \(Noël\)/, 'a note with French keeps it');
  const v = mk();
  const t = tokenFor(v.id);
  await change(t, { indoor_info: { kinds: ['golf'], length: '1-2h', book: 'no', age: 'all', year: 'all' }, indoor_price: 20 });
  await change(t, { closures: [{ from: '2027-08-21', to: '2027-08-21', note: 'closed to the public for the club championship' }] });
  const row = db.prepare("SELECT help_note FROM venue_menus WHERE venue_id = ? AND help_kind = 'fr_lines' AND status = 'help'").get(v.id);
  assert.ok(row && /Closures: closed to the public for the club championship/.test(row.help_note), row && row.help_note);
});

test('8. chips then typing: a bare "up to" starts its own sentence ("Weddings and private events. Up to 120 golfers"); "for up to" still carries the chip on', async () => {
  const { openSetup } = require('./setup-sim.js');
  const v = mk({ region: 'summerland', latitude: 49.6, longitude: -119.67 });
  const t = tokenFor(v.id);
  await change(t, { indoor_info: { kinds: ['golf'], length: 'half', book: 'busy', age: 'all', year: 'all' }, indoor_price: 76 });
  const sim = await openSetup(base, t, { hash: 'groups' });
  const box = sim.doc.getElementById('suGroupsLine');
  await sim.type('suGroupsLine', '');
  await sim.click('[data-quick="Weddings and private events"]');
  await sim.type('suGroupsLine', `${box.value} up to 120 golfers`);
  assert.equal(box.value, 'Weddings and private events. Up to 120 golfers');
  await sim.type('suGroupsLine', '');
  await sim.click('[data-quick="Tournaments and corporate golf"]');
  await sim.type('suGroupsLine', `${box.value} for up to 144 golfers`);
  assert.equal(box.value, 'Tournaments and corporate golf for up to 144 golfers');
});
