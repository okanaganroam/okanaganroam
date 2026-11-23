// Tour portal pre-launch fixes (2026-11-22, Dayton's check of the mock tour portal):
//   1. the season's day lists follow their month (no "February 31"), February is handled the same way everywhere, and the
//      server refuses a date that isn't on the calendar; winter seasons across New Year still work;
//   2. the unsent-changes warning compares the form with what it held when the page opened;
//   3. the Price step asks how the operator charges (per person, private groups only, free, by donation) and every price
//      says its currency and unit; a by-donation tour says "By donation";
//   4. a reopened tour list is labelled a saved draft and says what the big button does; "Move down" is off on the last
//      line; the tour portal's examples use tour words.
// Runs on a throwaway database (like server.test.js); the runner puts okanagan.db back afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'tour-prelaunch-admin-token';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const text = require('../owner-setup-text.js');
const completeness = require('../portal-completeness.js');
app.setVenueSubmissionTransport(async () => {});

const ROOT = path.join(__dirname, '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'owner-setup-client.js'), 'utf8');
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WK = (o, c) => Object.fromEntries(DAYS.map((d) => [d, [[o, c]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `Prelaunch Tours ${++n}`, slug: `prelaunch-tours-${n}`, region: 'penticton', type, latitude: 49.49 + n / 2000, longitude: -119.59,
  rating: 4.6, reviews: 120, address: `${500 + n} Main St, Penticton`, phone: '250-555-0188', website: 'https://example.com', hours: JSON.stringify(WK('09:00', '17:00')),
  description: 'A fixture used only by the tour pre-launch tests.', ...o });
const tokenFor = (id) => app.createOwnerLink(id, {}).url.split('/owner/')[1];
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p, { redirect: 'manual' }).then(async (r) => ({ status: r.status, text: await r.text() }));
const postJson = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.48.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
const change = (t, changes) => postJson(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 60000 })
  .then((r) => ({ ...r, status: r.status === 201 ? 200 : r.status }));
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r; };
const page = (v, lang = 'en') => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const plain = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const cardOf = (html, name) => (html.split('<li class="venue-card"').slice(1).find((x) => x.includes(name)) || '');
const seasonOf = (id) => (app.venueLinks(id) || {}).open_months || '';
const daysIn = (html, id) => { const m = new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html); assert.ok(m, id); return { count: (m[1].match(/<option/g) || []).length, picked: Number((/<option value="(\d+)" selected/.exec(m[1]) || [])[1]) }; };

test('1. season dates: only real days are offered and accepted; February is "to the end of February"; winter seasons cross New Year', async () => {
  const v = mk('tour'), t = tokenFor(v.id);
  // The server refuses a day that month never has, in the opening or the closing date.
  for (const bad of ['05-01:02-31', '05-01:02-30', '04-31:10-15', '06-31:09-30', '05-01:11-31', '13-01:02-10']) {
    const r = await change(t, { open_months: bad });
    assert.equal(r.status, 400, bad); assert.ok(r.body.errors && r.body.errors.open_months, bad);
    assert.equal(seasonOf(v.id), '', bad);
  }
  assert.match((await change(t, { open_months: '05-01:02-31' })).body.errors.open_months, /isn’t on the calendar/);
  // Opening on Feb 29 is refused (most years have none).
  const leap = await change(t, { open_months: '02-29:06-30' });
  assert.equal(leap.status, 400); assert.match(leap.body.errors.open_months, /February 29/);
  // Closing on Feb 28 is "to the end of February": stored 02-29 (covers a leap day), read "end of February".
  ok(await change(t, { open_months: '12-15:02-28' }));
  assert.equal(seasonOf(v.id), '12-15:02-29');
  assert.equal(app.openMonthsText('12-15:02-29'), 'December 15 – end of February');
  assert.equal(app.openMonthsText('12-15:02-29', 'fr'), '15 décembre à la fin de février');
  // The edit page offers February 1 to 28 and shows the 28th picked; December keeps 31 days.
  let html = (await get(`/owner/${t}`)).text;
  assert.deepEqual(daysIn(html, 'opSeasonToD'), { count: 28, picked: 28 });
  assert.deepEqual(daysIn(html, 'opSeasonFromD'), { count: 31, picked: 15 });
  // Winter seasons that cross New Year still work, whole months and exact days.
  ok(await change(t, { open_months: '11-15:03-31' })); assert.equal(seasonOf(v.id), '11-15:03-31');
  assert.equal(app.openMonthsText('11-15:03-31'), 'November 15 – March 31');
  ok(await change(t, { open_months: '11-4' })); assert.equal(seasonOf(v.id), '11-4');
  ok(await change(t, { open_months: '12-2' })); assert.equal(seasonOf(v.id), '12-2');
  html = (await get(`/owner/${t}`)).text;
  assert.deepEqual(daysIn(html, 'opSeasonToD'), { count: 28, picked: 28 }, 'a whole-month season ending in February shows the 28th');
  // A 30-day month offers 30 days.
  ok(await change(t, { open_months: '04-10:09-20' }));
  html = (await get(`/owner/${t}`)).text;
  assert.deepEqual(daysIn(html, 'opSeasonFromD'), { count: 30, picked: 10 });
  assert.deepEqual(daysIn(html, 'opSeasonToD'), { count: 30, picked: 20 });
  // The page's own script: both day lists are rebuilt when their month changes, and the submit clamps to the month.
  assert.match(html, /var SEASON_DAYS = \[31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31\];/);
  assert.match(html, /\[\['opSeasonFrom', 'opSeasonFromD'\], \['opSeasonTo', 'opSeasonToD'\]\]\.forEach/);
  assert.match(html, /mEl\.addEventListener\('change', fit\)/);
  assert.match(html, /p2\(tm === 2 && td === 28 \? 29 : td\)/);
  // Open all year again.
  ok(await change(t, { open_months: '' })); assert.equal(seasonOf(v.id), '');
});

test('2. unsent-changes warning: compares the form with its opening state; hidden season dates don’t count while Open all year', async () => {
  const v = mk('tour'), t = tokenFor(v.id);
  const html = (await get(`/owner/${t}`)).text;
  assert.match(html, /function listingState\(\)\{/);
  assert.match(html, /if \(mode && !mode\.value && \/\^opSeason\(From\|To\)D\?\$\/\.test\(c\.id\)\) return;/);
  assert.match(html, /var listingBase = listingState\(\);/);
  assert.match(html, /function refreshListingDirty\(\)\{ setListingDirty\(listingState\(\) !== listingBase\); \}/);
  assert.match(html, /form\.addEventListener\('input', function\(e\)\{ if \(e\.target\.id !== 'opHp'\) refreshListingDirty\(\); \}\);/);
  assert.match(html, /form\.addEventListener\('change', function\(\)\{ refreshListingDirty\(\); \}\);/);
  assert.doesNotMatch(html, /setListingDirty\(true\)/, 'nothing marks the form unsent without comparing');
  assert.match(html, /listingBase = listingState\(\); setListingDirty\(false\);/, 'a save becomes the new starting point');
});

test('3. price: by donation says so, a private charter says "for the group", saved prices are kept, and the step asks how you charge', async () => {
  // By donation: the card and the page say so (never "Free").
  const d = mk('tour', { name: 'Prelaunch Donation Walks' }), dt = tokenFor(d.id);
  ok(await change(dt, { tour_price: 'donation' }));
  assert.equal(app.tourPriceValue(d.id), 'donation');
  assert.equal(app.cardPriceFor(d.id), 'By donation');
  assert.match(plain(page(d)), /Prices By donation \(pay what you want\)\./);
  assert.match(plain(page(d, 'fr')), /Tarifs Contribution volontaire \(payez ce que vous voulez\)\./);
  assert.match(cardOf((await get('/penticton/tours')).text, d.name), /chip-price">(?:<svg[\s\S]*?<\/svg>)?By donation<\/span>/);
  assert.equal(app.ownerValueText('tour_price', 'donation'), 'By donation (pay what you want)');
  // Free stays "Free".
  const f = mk('tour', { name: 'Prelaunch Free Walks' }), ft = tokenFor(f.id);
  ok(await change(ft, { tour_price: 'free' }));
  assert.equal(app.cardPriceFor(f.id), 'Free');
  assert.match(plain(page(f)), /Prices Free\./);
  // A $450 private charter with no price per person: $450 for the group, on the card and the page.
  const c = mk('tour', { name: 'Prelaunch Lake Charters' }), ct = tokenFor(c.id);
  ok(await change(ct, { tour_info: { private: 450 } }));
  assert.equal(app.tourPrice(c.id), null);
  assert.match(plain(cardOf((await get('/penticton/tours')).text, c.name)), /From \$450 \/ group/);
  assert.match(plain(page(c)), /Prices Private tours from \$450 for the group\./);
  assert.match(plain(page(c, 'fr')), /Tarifs Sorties privées à partir de 450 \$ pour le groupe\./);
  assert.doesNotMatch(plain(page(c)), /\$450 a person/);
  assert.match(plain((await get(`/owner/${ct}`)).text), /From \$450 for the group \(private tours\)/, 'the edit page reviews it with its unit');
  assert.ok(completeness.scoreCompleteness({ type: 'tour', tourInfo: app.tourInfoAnswers(c.id), tourPrice: null }));
  // An adult rate saved before is untouched, and reads per person.
  const a = mk('tour', { name: 'Prelaunch Paddle Tours' }), at = tokenFor(a.id);
  ok(await change(at, { tour_price: 129 })); ok(await change(at, { tour_info: { private: 900 } }));
  assert.equal(app.tourPrice(a.id), 129);
  assert.match(plain(page(a)), /Prices From \$129 a person\. Private tours from \$900 for the group\./);
  assert.match(plain((await get(`/owner/${at}`)).text), /From \$129 a person/);
  // The setup's words: the four ways to charge, with currency and unit on every box.
  const en = text.en.tour, fr = text.fr.tour;
  assert.deepEqual(en.tmodes, { person: 'Per person', private: 'Private groups only', free: 'Free', donation: 'By donation' });
  assert.deepEqual(Object.keys(fr.tmodes), ['person', 'private', 'free', 'donation']);
  assert.equal(en.tpriceLabel, 'Lowest adult price, per person (CAD $)');
  assert.equal(en.tprivLabel, 'Private tours from, for the whole group (CAD $)');
  assert.equal(en.tprivLabelHour, 'Private tours from, per hour (CAD $)');
  assert.match(fr.tpriceLabel, /par personne \(\$\sCA\)/); assert.match(fr.tprivLabel, /pour tout le groupe \(\$\sCA\)/);
  assert.equal(en.tpriceLeadDonation, 'Your card will say “By donation”, and your page “By donation (pay what you want)”.');
  assert.equal(en.tpriceCardPerson, 'From {x} a person'); assert.equal(en.tpriceCardGroup, 'From {x} / group');
  for (const k of ['tmodeQ', 'tpriceLeadPriv', 'tpriceLeadPrivPick', 'tprivQOnly', 'tprivNeedOnly', 'tpriceSavedPriv', 'tpriceSavedDonation']) { assert.ok(en[k], `en ${k}`); assert.ok(fr[k], `fr ${k}`); }
  assert.doesNotMatch(JSON.stringify([en.tpriceNeed, en.tpriceFreeTip, en.tpriceFreeHint]), /Type free/);
  // The checklist no longer tells a free operator to type a word in a dollar box.
  const item = completeness.ITEMS ? completeness.ITEMS.find((x) => x.key === 'tour_price') : null;
  if (item) { assert.doesNotMatch(item.whyEn, /Type free/); assert.match(item.whyEn, /private group, free, or by donation/); }
  // The setup screen: the chips, the dollar box only for Per person, and Private groups only needs its price.
  assert.match(CLIENT, /function tourMode\(\)\{ return S\.tour\.free \|\| \(S\.tour\.privOnly \? 'private' : 'person'\); \}/);
  assert.match(CLIENT, /\['person', 'private', 'free', 'donation'\]\.map\(function\(m\)\{ return '<button type="button" class="su-chip su-chip-wide" aria-pressed="'/);
  assert.match(CLIENT, /\+ \(tmode !== 'person' \? '' : field\('suTprice', T\.tpriceLabel/);
  assert.match(CLIENT, /if \(S\.tour\.privOnly && !pfree\) \{ pp = null; if \(pv == null \|\| isNaN\(pv\)\)/);
  assert.match(CLIENT, /var privOnly = !pfree && pp == null && pv != null && !isNaN\(pv\);/);
});

test('4. tour list: a reopened list is a labelled saved draft, Move down is off on the last line, and the examples use tour words', async () => {
  const v = mk('tour'), t = tokenFor(v.id);
  const html = (await get(`/owner/${t}/menu`)).text;
  assert.match(html, /draftTitle/); assert.match(html, /Saved draft/);
  assert.match(html, /sends it to us for a quick check/); assert.match(html, /because you&rsquo;re signed in/);
  assert.match(html, /resumed = true/);
  assert.match(html, /C\.mode === 'token' \? T\.draftSend : T\.draftPublish/);
  assert.match(html, /id="mnDraft"/);
  assert.match(html, /data-act="down"' \+ \(si === data\.sections\.length - 1 && ii === data\.sections\[si\]\.items\.length - 1 \? ' disabled' : ''\)/);
  const fr = (await get(`/fr/owner/${t}/menu`)).text;
  assert.match(fr, /Brouillon enregistr&eacute;/);
  // The edit page of a tour: no happy hour page, no new menu.
  const edit = (await get(`/owner/${t}`)).text;
  assert.doesNotMatch(edit, /happy hour page/); assert.doesNotMatch(edit, /new menu, anything/);
  assert.match(edit, /a new tour, anything we should know/);
  // A pub keeps its own examples.
  const p = mk('pub'), pe = (await get(`/owner/${tokenFor(p.id)}`)).text;
  assert.match(pe, /new menu, anything we should know/);
});
