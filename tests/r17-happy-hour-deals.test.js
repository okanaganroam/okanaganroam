// Happy hour deals (2026-10-26): what is on special next to the happy hour times ("House pints (20 oz) · $6"), from
// the venue's own page or the owner. Stored in venues.happy_hour_deals (+ _fr, _source, _checked_at), written only by
// guardedHappyHourDealsUpdate (POST /admin/set-happy-hour-deals and the owner portal). Shown on the venue page, the
// happy hour guides, Roam Now and Build My Trip; only with the happy_hour badge; hidden once checked over 120 days ago.
// Also the "Happy hour on now · ends in 1 hr 20 min" countdown.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'r17-deals-admin-token';
const app = require('../server.js');
const db = require('../db.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
let n = 0;
const mk = (o) => app.createVenue({ slug: `hh-deals-fixture-${++n}`, region: 'kelowna', type: 'pub', latitude: 49.885 + n / 1000, longitude: -119.49, rating: 4.4,
  happy_hour: true, description: 'A fixture pub used only by the happy hour deals tests.', hours: JSON.stringify(open('11:00', '23:00')), ...o });
const meta = { reason: 'hh deals fixture', batch_id: 'test-hh-deals' };
const today = app.todayLocal();
const daysAgo = (d) => app.addLocalDays(today, -d);
const DEALS = [{ text: 'House pints (20 oz)', price: '$6' }, { text: 'Cocktails', price: '$10' }, { text: 'Appies', price: 'half price' }];
const DEALS_FR = [{ text: 'Pintes maison (20 oz)', price: '6 $' }, { text: 'Cocktails', price: '10 $' }];
const setTimes = (v, times) => assert.equal(app.guardedHappyHourUpdate(v.id, null, { times, source_url: 'https://example.com/hh', checked_at: today }, meta).ok, true);
const setDeals = (v, deals, extra = {}) => {
  const cur = db.prepare('SELECT happy_hour_deals FROM venues WHERE id = ?').get(v.id).happy_hour_deals;
  const r = app.guardedHappyHourDealsUpdate(v.id, cur, { deals, source_url: 'https://example.com/happy-hour', checked_at: today, ...extra }, meta);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r;
};
// Pacific (PDT, UTC−7) wall-clock time on a date.
const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.parse(`${date}T00:00:00Z`) + ((h + 7) * 60 + m) * 60000); };
const TUE = '2026-10-27';
const page = (v, now, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { now, lang });
// The deals card (2026-10-27) holds the happy hour times + deals; places with times only keep them in the sidebar row.
const row = (html) => (/<div class="venue-deals-block" data-block="hh">(?:<h3>[^<]*<\/h3>)?<div class="venue-deals-body">([\s\S]*?)<\/div><\/div>/.exec(html) || [])[1] || (/<div class="detail-row"><span class="label">Happy hour<\/span><span>([\s\S]*?)<\/span><\/div>\n/.exec(html) || [])[1] || '';
const line = (html) => (/<p class="venue-hh-status" data-hh="(\w+)" id="venueHappyHour">([\s\S]*?)<\/p>/.exec(html) || []).slice(1);
const TUE_HH = { mon: [['15:00', '18:00']], tue: [['15:00', '18:00']], wed: [['15:00', '18:00']], thu: [['15:00', '18:00']], fri: [['15:00', '18:00']] };

test('validateHappyHourDeals: trims, up to 6 lines of text ≤ 60 and price ≤ 20, no links, emails, phones or emoji', () => {
  const v = app.validateHappyHourDeals;
  assert.deepEqual(v([{ text: '  House   pints (20 oz) ', price: ' $6 ' }, { text: 'Wings', price: '' }, { text: 'Nachos' }]),
    { ok: true, deals: [{ text: 'House pints (20 oz)', price: '$6' }, { text: 'Wings' }, { text: 'Nachos' }] });
  assert.deepEqual(v([]), { ok: true, deals: [] });
  assert.equal(v(Array.from({ length: 7 }, () => ({ text: 'Pints' }))).ok, false, 'at most 6');
  assert.equal(v(Array.from({ length: 6 }, () => ({ text: 'Pints' }))).ok, true);
  assert.equal(v([{ text: 'x'.repeat(61) }]).ok, false, 'text over 60');
  assert.equal(v([{ text: 'x'.repeat(60) }]).ok, true);
  assert.equal(v([{ text: 'Pints', price: 'x'.repeat(21) }]).ok, false, 'price over 20');
  for (const bad of ['See www.pub.com', 'Menu at https://pub.ca/hh', 'Order at pub.ca', 'Email deals@pub.ca', 'Follow @thepub', 'Call 250-555-0123', 'Call (250) 555 0123',
    'Pints 🍺', 'Wings 🔥', '<b>Pints</b>', '', '   ']) {
    assert.equal(v([{ text: bad, price: '$6' }]).ok, false, bad);
  }
  assert.equal(v([{ text: 'Pints', price: '$6 🍺' }]).ok, false, 'emoji in the price');
  assert.equal(v([{ text: 'Pints', price: 'call 2505550123' }]).ok, false, 'phone in the price');
  assert.equal(v([{ text: 'Pints', note: 'x' }]).ok, false, 'unexpected field');
  assert.equal(v([{ text: 6 }]).ok, false);
  assert.equal(v('pints').ok, false);
  // Ordinary deal wording passes: prices as written, sizes, "2 for 1", "$2 off".
  assert.equal(v([{ text: 'Domestic bottles', price: '$5.50' }, { text: 'Oysters', price: '$2 each' }, { text: 'Wine (6 oz)', price: '$2 off' }, { text: 'Tacos 2 for 1' }, { text: 'Caesars', price: 'half price' }, { text: 'Co. Lager pints', price: '$7' }]).ok, true);
});

test('guardedHappyHourDealsUpdate: reason + batch_id, source URL or venue_owner, real past date, compare-and-set, one audit row per column, null clears all four', () => {
  const v = mk({ name: 'Deals Guard Pub' });
  const g = app.guardedHappyHourDealsUpdate;
  const input = { deals: DEALS, source_url: 'https://example.com/hh', checked_at: today };
  assert.equal(g(v.id, null, input, { reason: '', batch_id: 'x' }).reason, 'invalid_meta');
  assert.equal(g(v.id, null, input, { reason: 'x' }).reason, 'invalid_meta');
  assert.equal(g(v.id, null, { ...input, deals: [] }, meta).reason, 'invalid_deals', 'an empty list is not a clear');
  assert.equal(g(v.id, null, { ...input, deals: [{ text: 'See pub.com' }] }, meta).reason, 'invalid_deals');
  assert.equal(g(v.id, null, { ...input, deals_fr: [{ text: 'x'.repeat(70) }] }, meta).reason, 'invalid_deals');
  assert.equal(g(v.id, null, { ...input, source_url: 'not a url' }, meta).reason, 'invalid_source');
  assert.equal(g(v.id, null, { ...input, source_url: 'ftp://example.com' }, meta).reason, 'invalid_source');
  assert.equal(g(v.id, null, { ...input, checked_at: '2999-01-01' }, meta).reason, 'invalid_checked_at');
  assert.equal(g(v.id, null, { ...input, checked_at: '2026-02-30' }, meta).reason, 'invalid_checked_at');
  assert.equal(g(999999, null, input, meta).reason, 'venue_not_found');
  const ok = g(v.id, null, { ...input, deals_fr: DEALS_FR }, meta);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(ok.changedFields.sort(), ['happy_hour_deals', 'happy_hour_deals_checked_at', 'happy_hour_deals_fr', 'happy_hour_deals_source']);
  assert.deepEqual(JSON.parse(ok.happy_hour_deals), DEALS);
  assert.deepEqual(JSON.parse(ok.happy_hour_deals_fr), DEALS_FR);
  // Compare-and-set: a stale expected value is refused and the live value comes back.
  const miss = g(v.id, null, input, meta);
  assert.equal(miss.reason, 'mismatch');
  assert.equal(miss.live.happy_hour_deals, ok.happy_hour_deals);
  const log = db.prepare("SELECT field_name, source FROM venue_enrichment_log WHERE venue_id = ? AND batch_id = 'test-hh-deals'").all(v.id);
  assert.deepEqual(log.map((l) => l.field_name).sort(), ['happy_hour_deals', 'happy_hour_deals_checked_at', 'happy_hour_deals_fr', 'happy_hour_deals_source']);
  assert.ok(log.every((l) => l.source === 'happy_hour_research'));
  // From the owner: source venue_owner, logged as venue_owner; no French lines leaves _fr empty.
  const own = g(v.id, ok.happy_hour_deals, { deals: DEALS.slice(0, 1), source_url: 'venue_owner', checked_at: today }, { ...meta, batch_id: 'test-hh-deals-owner' });
  assert.equal(own.ok, true);
  assert.equal(own.happy_hour_deals_fr, null);
  assert.deepEqual(own.changedFields.sort(), ['happy_hour_deals', 'happy_hour_deals_fr', 'happy_hour_deals_source'], 'only the columns that changed are logged');
  assert.ok(db.prepare("SELECT source FROM venue_enrichment_log WHERE venue_id = ? AND batch_id = 'test-hh-deals-owner'").all(v.id).every((l) => l.source === 'venue_owner'));
  // null clears every column.
  const cleared = g(v.id, own.happy_hour_deals, { deals: null }, meta);
  assert.equal(cleared.ok, true);
  const r = db.prepare('SELECT happy_hour_deals, happy_hour_deals_fr, happy_hour_deals_source, happy_hour_deals_checked_at FROM venues WHERE id = ?').get(v.id);
  assert.deepEqual({ ...r }, { happy_hour_deals: null, happy_hour_deals_fr: null, happy_hour_deals_source: null, happy_hour_deals_checked_at: null });
});

test('POST /admin/set-happy-hour-deals: bearer token, strict key allowlist, 409 on a stale expected value, null clears', async () => {
  const v = mk({ name: 'Deals Route Pub' });
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = async (body, token = process.env.ENRICHMENT_ADMIN_TOKEN) => {
    const res = await fetch(`${base}/admin/set-happy-hour-deals`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  try {
    const body = { id: v.id, expected_current: null, deals: DEALS, deals_fr: DEALS_FR, source_url: 'https://example.com/happy-hour', checked_at: today, reason: 'venue happy hour page', batch_id: 'hh-deals-http' };
    assert.equal((await post(body, 'wrong')).status, 401);
    assert.equal((await post(body, null)).status, 401);
    assert.equal((await post({ ...body, extra: 1 })).status, 400, 'unexpected key');
    assert.equal((await post({ ...body, happy_hour: {} })).status, 400, 'unexpected key');
    const { expected_current: _e, ...noExpected } = body;
    assert.equal((await post(noExpected)).status, 400, 'expected_current is required');
    const { deals: _d, ...noDeals } = body;
    assert.equal((await post(noDeals)).status, 400, 'deals is required');
    assert.equal((await post({ ...body, id: 'x' })).status, 400);
    assert.equal((await post({ ...body, reason: '' })).body.error, 'invalid_meta');
    assert.equal((await post({ ...body, deals: [{ text: 'Call 250 555 0123' }] })).body.error, 'invalid_deals');
    const ok = await post(body);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.deepEqual(JSON.parse(ok.body.venue.happy_hour_deals), DEALS);
    assert.equal(ok.body.venue.happy_hour_deals_source, 'https://example.com/happy-hour');
    assert.equal(ok.body.venue.happy_hour_deals_checked_at, today);
    assert.equal((await post(body)).status, 409, 'expected_current no longer matches');
    const cleared = await post({ id: v.id, expected_current: ok.body.venue.happy_hour_deals, deals: null, reason: 'clear', batch_id: 'hh-deals-http' });
    assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
    assert.equal(cleared.body.venue.happy_hour_deals, null);
    assert.equal(cleared.body.venue.happy_hour_deals_checked_at, null);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('Venue page: a Deals list under the happy hour times with its checked date; French shows French lines, or the English ones marked lang="en"', () => {
  const v = mk({ name: 'Deals Page Pub' });
  setTimes(v, TUE_HH);
  setDeals(v, DEALS);
  const en = row(page(v, at(TUE, '12:00')));
  assert.match(en, /^<span class="venue-hh-times">Mon–⁠Fri\u00a03–⁠6\u00a0PM<\/span><span class="venue-hh-deals">/, 'times, then the deals (one checked date, at the end, when both were checked the same day)');
  // Audit fix (2026-10-27): a card with only the happy hour block has no "Deals" label under its "Happy hour deals"
  // heading; the list is named by aria-label.
  assert.match(en, /<span class="venue-hh-deals"><span class="venue-hh-deal-list" role="list" aria-label="Happy hour deals"><span class="venue-hh-deal" role="listitem"><span class="venue-hh-deal-price">\$6<\/span><span class="venue-hh-deal-text">House pints \(20 oz\)<\/span><\/span><span class="venue-hh-deal" role="listitem"><span class="venue-hh-deal-price">\$10<\/span><span class="venue-hh-deal-text">Cocktails<\/span><\/span><span class="venue-hh-deal" role="listitem"><span class="venue-hh-deal-price">half price<\/span><span class="venue-hh-deal-text">Appies<\/span><\/span><\/span>/);
  assert.doesNotMatch(en, /venue-hh-more/, '3 deals: no "more" toggle');
  const checked = `Checked ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(today.slice(5, 7)) - 1]} ${Number(today.slice(8, 10))}, ${today.slice(0, 4)}`;
  assert.ok(en.includes(`<span class="venue-hours-checked venue-hh-deals-checked">${checked}</span>`), en);
  // French without French lines: the English lines, each marked as English.
  const fr = row(page(v, at(TUE, '12:00'), 'fr'));
  assert.match(fr, /aria-label="Spéciaux du happy hour"/);
  assert.match(fr, /<span class="venue-hh-deal" role="listitem" lang="en"><span class="venue-hh-deal-price">\$6<\/span><span class="venue-hh-deal-text">House pints \(20 oz\)<\/span><\/span>/);
  assert.match(fr, /venue-hh-deals-checked">Vérifié le /);
  // With French lines: those, not marked English.
  setDeals(v, DEALS, { deals_fr: DEALS_FR });
  const fr2 = row(page(v, at(TUE, '12:00'), 'fr'));
  assert.match(fr2, /<span class="venue-hh-deal" role="listitem"><span class="venue-hh-deal-price">6 \$<\/span><span class="venue-hh-deal-text">Pintes maison \(20 oz\)<\/span><\/span><span class="venue-hh-deal" role="listitem"><span class="venue-hh-deal-price">10 \$<\/span><span class="venue-hh-deal-text">Cocktails<\/span><\/span>/);
  assert.doesNotMatch(fr2, /lang="en"/);
  // Deals without times still get the Happy hour row (deals only).
  const only = mk({ name: 'Deals Only Pub' });
  setDeals(only, DEALS.slice(0, 1));
  const o = row(page(only, at(TUE, '12:00')));
  // Audit fix (2026-10-27): no times stored -> "Times vary — check with the venue" in their place, never prices alone.
  assert.match(o, /^<span class="venue-hh-times venue-hh-times-vary">Times vary — check with the venue<\/span>/);
  assert.match(o, /venue-hh-deal-price">\$6<\/span><span class="venue-hh-deal-text">House pints \(20 oz\)</);
  // Up to 6 deals all show in the deals card: no "more" toggle (2026-10-27).
  const six = mk({ name: 'Deals Six Pub' });
  setDeals(six, [1, 2, 3, 4, 5, 6].map((n) => ({ text: `Deal ${n}`, price: `$${n}` })));
  const s6 = row(page(six, at(TUE, '12:00')));
  assert.match(s6, /Deal 4.*Deal 5.*Deal 6/);
  assert.doesNotMatch(s6, /venue-hh-more/, 'no toggle');
  assert.doesNotMatch(row(page(six, at(TUE, '12:00'), 'fr')), /venue-hh-more/);
  // Only on places with the happy_hour badge (alcohol-serving): a place without it shows no deals.
  const noBadge = mk({ name: 'Deals No Badge Pub', happy_hour: false });
  setTimes(noBadge, TUE_HH);
  setDeals(noBadge, DEALS);
  const nb = page(noBadge, at(TUE, '12:00'));
  assert.doesNotMatch(nb, /class="venue-hh-deal/);
  assert.doesNotMatch(nb, /House pints/);
  // No offers markup anywhere (no JSON-LD prices).
  assert.doesNotMatch(page(v, at(TUE, '12:00')), /"@type":\s*"Offer"|"offers"/);
});

test('Stale rule: deals checked more than 120 days ago are hidden on the venue page, the map, the guides and Build My Trip, and listed on /admin/review', () => {
  assert.equal(app.HH_DEALS_STALE_DAYS, 120);
  assert.equal(app.happyHourDealsStale(daysAgo(120)), false);
  assert.equal(app.happyHourDealsStale(daysAgo(121)), true);
  assert.equal(app.happyHourDealsStale(null), true);
  const edge = mk({ name: 'Deals Edge Pub' });
  setTimes(edge, TUE_HH);
  setDeals(edge, DEALS, { checked_at: daysAgo(120) });
  assert.match(row(page(edge, undefined)), /House pints/, '120 days old still shows');
  const old = mk({ name: 'Deals Stale Pub' });
  setTimes(old, TUE_HH);
  setDeals(old, DEALS, { checked_at: daysAgo(121) });
  const html = page(old, undefined);
  assert.doesNotMatch(html, /House pints/);
  assert.match(row(html), /venue-hh-times/, 'the times stay');
  const mapRow = JSON.parse(app.mapLiveData().json).p.find((p) => p[2] === 'Deals Stale Pub');
  assert.equal(mapRow.length, 16, 'no deals field on the map');
  const plan = { schedule: [{ day: 1, date: TUE, venueId: old.id, startMinutes: 960 }], days: [{ day: 1, stops: [{ venue: { id: old.id } }] }] };
  assert.equal(app.withTripHappyHourDeals(plan).days[0].stops[0].happyHourLine, undefined);
  const review = app.renderAdminReviewPage();
  assert.match(review, /<h2>Stale happy hour deals \(over 120 days\) <span class="rv-meta">\(\d+\)<\/span><\/h2>/);
  const sec = review.slice(review.indexOf('id="staledeals"'));
  assert.match(sec, /Deals Stale Pub/);
  assert.doesNotMatch(sec, /Deals Edge Pub/);
  assert.match(sec, /House pints \(20 oz\) · \$6/);
  assert.ok(app.staleHappyHourDeals().some((r) => r.id === old.id));
});

test('Roam Now: the first two deals ride as a new trailing [16] (only on places that have them), the card shows them, and the search matches deal text', () => {
  const v = mk({ name: 'Deals Map Pub' });
  setTimes(v, TUE_HH);
  setDeals(v, DEALS);
  const fr = mk({ name: 'Deals Map Pub FR' });
  setTimes(fr, TUE_HH);
  setDeals(fr, DEALS, { deals_fr: DEALS_FR });
  const plain = mk({ name: 'Deals Map No Deals' });
  const rows = JSON.parse(app.mapLiveData().json).p;
  const r = rows.find((p) => p[2] === 'Deals Map Pub');
  assert.equal(r.length, 17);
  assert.equal(typeof r[11], 'string', 'the happy hour times stay at [11]');
  assert.equal(r[16], '$6 House pints (20 oz), $10 Cocktails', 'first two lines only');
  assert.deepEqual(rows.find((p) => p[2] === 'Deals Map Pub FR')[16], ['$6 House pints (20 oz), $10 Cocktails', '6 $ Pintes maison (20 oz), 10 $ Cocktails']);
  assert.equal(rows.find((p) => p[2] === plain.name).length, 16, 'a place without deals keeps 16 fields');
  // The page reads [16] and shows it after the happy hour line (marked English on /fr/map without French lines).
  const html = app.renderPlacesMapPage();
  assert.ok(html.includes("dl: a[16] ? (typeof a[16] === 'string' ? a[16] : FR ? a[16][1] : a[16][0]) : '', dlEn: !!(FR && typeof a[16] === 'string')"));
  assert.ok(html.includes(`(p.dl ? '<span class="pm-hh-deals"> · <span' + (p.dlEn ? ' lang="en"' : '') + '>' + esc(p.dl) + '</span></span>' : '')`));
  // The search: the page's own deal matcher, run with the page's mapNameKey.
  const keySrc = html.match(/function mapNameKey\(name\)\{[^\n]*\}/)[0];
  const dealSrc = html.slice(html.indexOf('  var DEAL_SKIP'), html.indexOf('  function matchesPlace(p){'));
  const ctx = {};
  vm.runInNewContext(`${keySrc}\nvar dealQuery = '', dealWordsFor = null, dealWords = [];\n${dealSrc}\nthis.hit = function(q, deals){ dealQuery = q; return dealHit({ dk: deals ? mapNameKey(deals) : null }); };`, ctx);
  const pub = r[16];
  assert.equal(ctx.hit('cheap pints', pub), true);
  assert.equal(ctx.hit('pint', pub), true);
  assert.equal(ctx.hit('happy hour cocktails', pub), true);
  assert.equal(ctx.hit('happy hour wings', '$8 Wings (1 lb), $5 Fries'), true);
  assert.equal(ctx.hit('wings', pub), false);
  assert.equal(ctx.hit('happy hour', pub), false, 'the words for happy hour alone match no deal');
  assert.equal(ctx.hit('cheap pints', null), false, 'a place without deals');
  assert.equal(ctx.hit('pintes', rows.find((p) => p[2] === 'Deals Map Pub FR')[16].join(' ')), true, 'French deal words too');
  // A deal hit counts even where the words also set a kind, tag, price or name.
  assert.match(html, /var tk = onTags\(\), byDeal = dealHit\(p\);/);
  assert.match(html, /if \(price === 'cheap' && !byDeal && !\(p\.pr && p\.pr <= 1\)\) return false;/);
  assert.match(html, /return !term \|\| byDeal \|\| mapNameHas\(p\.key, term, termTyping\);/);
  // Every inline script still parses.
  for (const s of html.split(/<script(?![^>]*\bsrc=)(?![^>]*application\/(?:ld\+)?json)[^>]*>/).slice(1).map((x) => x.split('</script>')[0])) new vm.Script(s);
});

test('Countdown: "Happy hour on now · ends in 1 hr 20 min" on the venue page and the Roam Now card (EN + FR)', () => {
  assert.equal(app.happyHourLeftText(80, false), '1 hr 20 min');
  assert.equal(app.happyHourLeftText(80, true), '1 h 20');
  assert.equal(app.happyHourLeftText(45, false), '45 min');
  assert.equal(app.happyHourLeftText(125, true), '2 h 05');
  assert.equal(app.happyHourLeftText(120, false), '2 hr');
  const clock = { weekday: 'tue', minutes: 1000 };
  assert.equal(app.happyHourOnNowText({ state: 'now', until: { weekday: 'tue', minutes: 1080 } }, clock, false), 'Happy hour on now · ends in 1 hr 20 min');
  assert.equal(app.happyHourOnNowText({ state: 'now', until: { weekday: 'tue', minutes: 1080 } }, clock, true), 'Happy hour en cours · se termine dans 1 h 20');
  assert.equal(app.happyHourOnNowText({ state: 'now', until: { weekday: 'wed', minutes: 60 } }, { weekday: 'tue', minutes: 1380 }, false), 'Happy hour on now · ends in 2 hr', 'past midnight');
  assert.equal(app.happyHourOnNowText({ state: 'later', from: { weekday: 'tue', minutes: 900 } }, clock, false), '');
  const v = mk({ name: 'Deals Countdown Pub' });
  setTimes(v, TUE_HH);
  assert.deepEqual(line(page(v, at(TUE, '16:40'))), ['now', `<span aria-hidden="true">${app.uiIcon('cocktail')}</span> Happy hour on now · ends in 1 hr 20 min`]);
  assert.deepEqual(line(page(v, at(TUE, '16:40'), 'fr')), ['now', `<span aria-hidden="true">${app.uiIcon('cocktail')}</span> Happy hour en cours · se termine dans 1 h 20`]);
  assert.deepEqual(line(page(v, at(TUE, '12:00'))), ['later', 'Happy hour today 3–6 PM'], 'later today is unchanged');
  // The map runs the same countdown functions, refreshed every minute with the rest of the status.
  const en = app.renderPlacesMapPage();
  assert.ok(en.includes('function happyHourLeftText(left, fr)') && en.includes('function happyHourMinutesLeft(until, clock)'));
  assert.ok(en.includes("hhOnNow: function(t){ return 'Happy hour on now · ends in ' + t; }"));
  assert.ok(app.renderPlacesMapPage({ lang: 'fr' }).includes("hhOnNow: function(t){ return 'Happy hour en cours · se termine dans ' + t; }") || en.includes("hhOnNow: function(t){ return 'Happy hour en cours · se termine dans ' + t; }"));
  assert.match(en, /if \(h && h\.state === 'now' && left != null\) return \{ now: true, text: T\.hhOnNow\(happyHourLeftText\(left, FR\)\) \};/);
});

test('Happy hour guides: the first two deals under each venue that has them', () => {
  let king = app.findVenueBySlug('kelowna', 'pub', 'king-taps') || app.findVenueBySlug('kelowna', 'restaurant', 'king-taps');
  if (!king) king = app.createVenue({ name: 'King Taps', slug: 'king-taps', region: 'kelowna', type: 'pub', latitude: 49.88, longitude: -119.49, happy_hour: true, description: 'A lakeside fixture used by the guide test.' });
  db.prepare('UPDATE venues SET happy_hour = 1 WHERE id = ?').run(king.id);
  setDeals(king, DEALS);
  const html = app.renderFileGuidePage('/guides/happy-hour-kelowna');
  assert.ok(html, 'the guide renders');
  assert.match(html, /King Taps<\/a><\/strong>[^\n]*<span class="guide-hh-deals">Happy hour deals: \$6 House pints \(20 oz\), \$10 Cocktails\.<\/span><\/li>/);
  assert.doesNotMatch(html, /Appies/, 'two deals only');
  // Other guides never show deals.
  const other = app.renderFileGuidePage('/guides/best-patios-kelowna') || app.renderFileGuidePage('/guides/date-night-kelowna');
  if (other) assert.doesNotMatch(other, /guide-hh-deals"/);
});

test('Build My Trip: a stop timed inside happy hour says "Happy hour: …" (EN/FR), others do not; the plan itself is unchanged', () => {
  const v = mk({ name: 'Deals Trip Pub' });
  setTimes(v, TUE_HH);
  setDeals(v, DEALS);
  const other = mk({ name: 'Deals Trip Lunch' });
  setTimes(other, TUE_HH);
  setDeals(other, DEALS);
  const plan = {
    kind: 'itinerary',
    schedule: [{ day: 1, date: TUE, venueId: other.id, startMinutes: 720, endMinutes: 810 }, { day: 1, date: TUE, venueId: v.id, startMinutes: 960, endMinutes: 1050 }],
    itinerary: { stops: [{ venue: { id: other.id, name: 'Deals Trip Lunch' } }, { venue: { id: v.id, name: 'Deals Trip Pub' } }] },
  };
  const before = JSON.stringify(plan.itinerary.stops.map((s) => s.venue.id));
  const out = app.withTripHappyHourDeals(plan);
  const [lunch, pub] = out.itinerary.stops;
  assert.equal(pub.happyHourLine, 'Happy hour: $6 House pints (20 oz), $10 Cocktails');
  assert.equal(pub.happyHourLineFr, 'Happy hour : $6 House pints (20 oz), $10 Cocktails');
  assert.equal(pub.happyHourLineFrLang, 'en', 'French falls back to the English lines');
  assert.equal(lunch.happyHourLine, undefined, 'noon is outside 3–6 PM');
  assert.equal(JSON.stringify(out.itinerary.stops.map((s) => s.venue.id)), before, 'order unchanged');
  setDeals(v, DEALS, { deals_fr: DEALS_FR });
  const fr = app.withTripHappyHourDeals({ schedule: [{ day: 1, date: TUE, venueId: v.id, startMinutes: 960 }], days: [{ day: 1, stops: [{ venue: { id: v.id } }] }] }).days[0].stops[0];
  assert.equal(fr.happyHourLineFr, 'Happy hour : 6 $ Pintes maison (20 oz), 10 $ Cocktails');
  assert.equal(fr.happyHourLineFrLang, undefined);
  // The planner page prints the line on the stop's card; the trip API adds it after planning.
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(v3.includes(`(stop.happyHourLine ? '<p class="t3-hh">' + (lang() === 'fr' && stop.happyHourDealsFr ? 'Happy hour ' + (stop.happyHourWhenFr ? esc(stop.happyHourWhenFr) + ' ' : '') + ': <span' + (stop.happyHourLineFrLang ? ' lang="en"' : '') + '>' + esc(stop.happyHourDealsFr) + '</span>' : esc(stop.happyHourLine)) + '</p>' : '')`));
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(src.includes('withTripFrenchUrls(withTripHappyHourDeals(runTripPlan(parsed.value)))'));
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'trip-planner.js'), 'utf8'), /happy_hour_deals|happyHourDeals/, 'the planner itself never reads deals (ranking unchanged)');
});

test('Owner portal: a Deals editor under the happy hour times; a signed-in save goes live (venue_owner, today) with an audit row and Undo', async () => {
  const v = mk({ name: 'Deals Owner Pub' });
  setTimes(v, TUE_HH);
  // Researched deals first, from the venue's own page a while ago.
  const researched = setDeals(v, DEALS.slice(0, 2), { checked_at: daysAgo(30) });
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  let ip = 1;
  const post = (p, body, cookie) => fetch(`${base}${p}`, { method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.88.0.${ip++ % 250}`, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, cookie: (r.headers.get('set-cookie') || '').split(';')[0], body: await r.json().catch(() => ({})) }));
  const get = (p, cookie) => fetch(`${base}${p}`, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} }).then((r) => r.text());
  try {
    const token = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
    const made = await post(`/owner/${token}/account`, { email: 'deals-owner@example.com', password: 'a long enough password' });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const cookie = made.cookie;
    const pg = await get(`/owner/account/venue/${v.id}`, cookie);
    assert.match(pg, /id="opDealsLabel">Deals</);
    assert.match(pg, /<input type="text" class="op-deal-text" maxlength="60" value="House pints \(20 oz\)" aria-label="Deal 1: what"/);
    assert.match(pg, /class="op-deal-price" maxlength="20" value="\$10" aria-label="Deal 2: price"/);
    assert.equal((pg.match(/class="op-deal" data-deal="en"/g) || []).length, 6, 'six rows, the unused ones hidden');
    assert.match(pg, /<summary>In French \(optional\)<\/summary>/);
    const frPage = await get(`/fr/owner/account/venue/${v.id}`, cookie);
    assert.match(frPage, /id="opDealsLabel">Spéciaux</);
    // A link in a deal is refused, with the reason.
    const bad = await post(`/owner/account/venue/${v.id}/changes`, { changes: { happy_hour_deals: { deals: [{ text: 'See thepub.ca', price: '$6' }], deals_fr: [] } }, started_at: Date.now() - 10000 }, cookie);
    assert.equal(bad.status, 400);
    assert.match(bad.body.errors.happy_hour_deals, /links, email addresses, phone numbers and emoji/);
    const tooMany = await post(`/owner/account/venue/${v.id}/changes`, { changes: { happy_hour_deals: { deals: Array.from({ length: 7 }, () => ({ text: 'Pints' })), deals_fr: [] } }, started_at: Date.now() - 10000 }, cookie);
    assert.match(tooMany.body.errors.happy_hour_deals, /up to 6 deals/);
    // Save: live at once, source venue_owner, today's date.
    const next = { deals: [{ text: 'Pints', price: '$5' }, { text: 'Wings (1 lb)', price: '$9' }], deals_fr: [{ text: 'Pintes', price: '5 $' }] };
    const r = await post(`/owner/account/venue/${v.id}/changes`, { changes: { happy_hour_deals: next }, started_at: Date.now() - 10000 }, cookie);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.live, ['happy_hour_deals']);
    const row = db.prepare('SELECT happy_hour_deals, happy_hour_deals_fr, happy_hour_deals_source, happy_hour_deals_checked_at FROM venues WHERE id = ?').get(v.id);
    assert.deepEqual(JSON.parse(row.happy_hour_deals), next.deals);
    assert.deepEqual(JSON.parse(row.happy_hour_deals_fr), next.deals_fr);
    assert.equal(row.happy_hour_deals_source, 'venue_owner');
    assert.equal(row.happy_hour_deals_checked_at, today);
    assert.match(row ? page(v, undefined) : '', /venue-hh-deal-price">\$9<\/span><span class="venue-hh-deal-text">Wings \(1 lb\)</);
    const logged = db.prepare("SELECT field_name, source, reviewed_by FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'happy_hour_deals' ORDER BY id DESC LIMIT 1").get(v.id);
    assert.deepEqual({ ...logged }, { field_name: 'happy_hour_deals', source: 'venue_owner', reviewed_by: 'owner:deals-owner@example.com' });
    // The same deals again: nothing changed.
    const same = await post(`/owner/account/venue/${v.id}/changes`, { changes: { happy_hour_deals: next }, started_at: Date.now() - 10000 }, cookie);
    assert.equal(same.status, 400);
    // /admin/review lists the live change; Undo puts back the researched lines with their own source and date.
    const audit = app.recentInstantOwnerChanges().find((x) => x.venue_id === v.id);
    assert.ok(audit && 'happy_hour_deals' in audit.changes);
    const review = app.renderAdminReviewPage();
    assert.match(review, new RegExp(`data-kind="change" data-id="${audit.id}"[\\s\\S]*?<th>Happy hour deals</th><td class="rv-old">House pints \\(20 oz\\) · \\$6; Cocktails · \\$10 \\(checked ${daysAgo(30)}, https://example.com/happy-hour\\)</td><td class="rv-new">Pints · \\$5; Wings \\(1 lb\\) · \\$9 \\| FR: Pintes · 5 \\$</td>`));
    const u = app.undoOwnerInstantChange(audit.id, 'dayton');
    assert.equal(u.ok, true, JSON.stringify(u));
    assert.deepEqual(u.restored, ['happy_hour_deals']);
    const back = db.prepare('SELECT happy_hour_deals, happy_hour_deals_fr, happy_hour_deals_source, happy_hour_deals_checked_at FROM venues WHERE id = ?').get(v.id);
    assert.equal(back.happy_hour_deals, researched.happy_hour_deals);
    assert.equal(back.happy_hour_deals_fr, null);
    assert.equal(back.happy_hour_deals_source, 'https://example.com/happy-hour');
    assert.equal(back.happy_hour_deals_checked_at, daysAgo(30));
    // Clearing every row removes them (instant), and Undo brings them back.
    const clear = await post(`/owner/account/venue/${v.id}/changes`, { changes: { happy_hour_deals: null }, started_at: Date.now() - 10000 }, cookie);
    assert.equal(clear.status, 201, JSON.stringify(clear.body));
    assert.equal(db.prepare('SELECT happy_hour_deals FROM venues WHERE id = ?').get(v.id).happy_hour_deals, null);
    // An edit link alone waits for review; approving applies it as the owner's.
    const viaLink = await post(`/owner/${token}/changes`, { changes: { happy_hour_deals: { deals: [{ text: 'Draft pints', price: '$6' }], deals_fr: [] } }, started_at: Date.now() - 10000 });
    assert.equal(viaLink.status, 201, JSON.stringify(viaLink.body));
    assert.deepEqual(viaLink.body.review, ['happy_hour_deals']);
    const pending = app.pendingOwnerChange(v.id);
    assert.equal(app.approveOwnerChange(pending.id, 'dayton').ok, true);
    assert.equal(db.prepare('SELECT happy_hour_deals_source FROM venues WHERE id = ?').get(v.id).happy_hour_deals_source, 'venue_owner');
    // A place that doesn't serve alcohol can't add deals.
    const cafe = app.createVenue({ name: 'Deals Cafe', slug: 'deals-cafe-fixture', region: 'kelowna', type: 'cafe', latitude: 49.9, longitude: -119.4, description: 'A fixture cafe for the deals tests.' });
    const checked = app.validateOwnerChanges(app.getVenue(cafe.id), null, { changes: { happy_hour_deals: next } });
    assert.match(checked.errors.happy_hour_deals, /serve alcohol/);
  } finally {
    srv.closeAllConnections();
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('Owner help bot: "How do I add my happy hour deals?" in English and French', () => {
  const cfg = JSON.parse(app.ownerHelpWidgetHtml('edit', { signedIn: true }).match(/id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
  const t = cfg.topics.find((x) => x.id === 'hh-deals');
  assert.ok(t, 'the topic is there');
  assert.equal(t.q, 'How do I add my happy hour deals?');
  assert.equal(t.qFr, 'Comment ajouter les spéciaux de mon happy hour?');
  assert.ok(t.keys.includes('happy hour deals') && t.keysFr.includes('speciaux'));
  assert.match(JSON.stringify(t), /Deals/);
  assert.match(JSON.stringify(t), /Spéciaux/);
  // The widget's own matcher sends the questions there (English and French pages).
  for (const lang of ['en', 'fr']) {
    const html = app.ownerHelpWidgetHtml('edit', { lang, signedIn: true });
    const c = JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
    const ctx = { T: c.topics, cfg: c };
    vm.runInNewContext(`${html.slice(html.indexOf('function norm(s)'), html.indexOf('function ask(q)'))}; this.best = best;`, ctx);
    for (const q of ['How do I add my happy hour deals?', 'happy hour specials', 'add drink specials', 'Comment ajouter les spéciaux de mon happy hour?', 'spéciaux du 5 à 7']) assert.equal(ctx.best(q).id, 'hh-deals', `${lang}: ${q}`);
    assert.equal(ctx.best('how do I set my hours').id, 'hours', 'other topics unchanged');
    assert.equal(ctx.best('price range').id, 'price-range');
  }
});
