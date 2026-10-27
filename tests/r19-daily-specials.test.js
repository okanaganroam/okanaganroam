// Weekly specials (2026-10-27): the deals tied to a day of the week ("Wing Wednesday" · "60¢ wings"), from the venue's
// own page or the owner. Stored in db.js venue_specials, written only by guardedSpecialsUpdate (POST /admin/set-specials
// and the owner portal), the whole list at once with compare-and-set. Shown on the venue page ("Weekly specials"),
// Roam Now (today's line, the "Specials today" chip, the search) and Build My Trip; drink specials only where alcohol
// is served; hidden once checked over 120 days ago.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'r19-specials-admin-token';
const app = require('../server.js');
const db = require('../db.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
let n = 0;
const mk = (o) => app.createVenue({ slug: `specials-fixture-${++n}`, region: 'kelowna', type: 'pub', latitude: 49.885 + n / 1000, longitude: -119.48, rating: 4.3,
  description: 'A fixture pub used only by the weekly specials tests.', hours: JSON.stringify(open('11:00', '23:00')), ...o });
const meta = { reason: 'specials fixture', batch_id: 'test-specials' };
const today = app.todayLocal();
const daysAgo = (d) => app.addLocalDays(today, -d);
const SRC = 'https://example.com/specials';
const TACO = { days: ['tue'], title: 'Taco Tuesday', deal: '$3 tacos', price: '$3 each', kind: 'food' };
const WINGS = { days: ['wed'], title: 'Wing Wednesday', deal: '60¢ wings, dine-in only', price: '60¢ each', kind: 'food', start: '16:00', end: 'close' };
const WINE = { days: ['tue'], title: 'Wine Tuesday', deal: 'Half-price bottles', kind: 'drink' };
const RIB = { days: ['mon', 'tue', 'wed'], title: 'Prime rib night', deal: '10 oz prime rib dinner', price: '$29', kind: 'food', title_fr: 'Soirée côte de bœuf', deal_fr: 'Souper de côte de bœuf 10 oz' };
const set = (v, specials, extra = {}) => {
  const r = app.guardedSpecialsUpdate(v.id, app.currentSpecialsJson(v.id), { specials, source_url: SRC, checked_at: today, ...extra }, meta);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r;
};
// Pacific (PDT, UTC−7) wall-clock time on a date.
const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.parse(`${date}T00:00:00Z`) + ((h + 7) * 60 + m) * 60000); };
const TUE = '2026-10-27';
const WED = '2026-10-28';
const page = (v, now, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { now, lang });
// The weekly specials live in the deals card (2026-10-27).
const spRow = (html) => (/<div class="venue-deals-block" data-block="sp">(?:<h3>[^<]*<\/h3>)?<div class="venue-deals-body">([\s\S]*?)<\/div><\/div>/.exec(html) || [])[1] || '';
const todayNames = (v, now) => (app.specialsTodayFor([app.getVenue(v.id)].map((x) => ({ ...x, hours: db.prepare('SELECT hours FROM venues WHERE id = ?').get(v.id).hours })), now).byId.get(v.id) || { today: [] }).today.map((s) => s.title);

test('validateSpecials: canonical list, days, lengths, kinds, times, French pairs, seasons, source and date; same text rules as the deals', () => {
  const v = (list, opts = { source: SRC, checked_at: today }) => app.validateSpecials(list, opts);
  const ok = v([{ days: ['wed', 'mon', 'wed'], title: '  Wing   Wednesday ', deal: '60¢ wings', kind: 'food', start: '16:00', end: 'close' }]);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(ok.specials[0], { days: ['mon', 'wed'], title: 'Wing Wednesday', deal: '60¢ wings', price: null, kind: 'food', start: '16:00', end: 'close',
    title_fr: null, deal_fr: null, season_from: null, season_to: null, source: SRC, checked_at: today });
  assert.deepEqual(v([]), { ok: true, specials: [] });
  assert.equal(v(Array.from({ length: 8 }, () => TACO)).ok, false, 'at most 7');
  assert.equal(v(Array.from({ length: 7 }, () => TACO)).ok, true);
  assert.match(v([{ ...TACO, days: [] }]).detail, /at least one day/);
  assert.equal(v([{ ...TACO, days: ['tuesday'] }]).ok, false);
  assert.equal(v([{ ...TACO, title: 'x'.repeat(41) }]).ok, false, 'title over 40');
  assert.equal(v([{ ...TACO, title: 'x'.repeat(40) }]).ok, true);
  assert.equal(v([{ ...TACO, deal: 'x'.repeat(81) }]).ok, false, 'deal over 80');
  assert.equal(v([{ ...TACO, deal: 'x'.repeat(80) }]).ok, true);
  assert.equal(v([{ ...TACO, price: 'x'.repeat(21) }]).ok, false, 'price over 20');
  assert.equal(v([{ ...TACO, deal: '' }]).ok, false, 'a deal is needed');
  assert.equal(v([{ ...TACO, title: '  ' }]).ok, false, 'a title is needed');
  for (const bad of ['See www.pub.com', 'Menu at https://pub.ca/specials', 'Order at pub.ca', 'Email us@pub.ca', 'Follow @thepub', 'Call 250-555-0123', 'Tacos 🌮', '<b>Tacos</b>']) {
    assert.equal(v([{ ...TACO, deal: bad }]).ok, false, bad);
    assert.equal(v([{ ...TACO, title: bad.slice(0, 40) }]).ok, false, `title: ${bad}`);
  }
  assert.equal(v([{ ...TACO, kind: 'drinks' }]).ok, false);
  assert.equal(v([{ ...TACO, kind: undefined }]).ok, false, 'kind is required');
  assert.equal(v([{ ...TACO, start: '4pm' }]).ok, false);
  assert.equal(v([{ ...TACO, end: 'late' }]).ok, false);
  assert.equal(v([{ ...TACO, start: '16:00', end: '16:00' }]).ok, false);
  assert.equal(v([{ ...TACO, start: '21:00', end: '01:00' }]).ok, true, 'past midnight is fine');
  assert.match(v([{ ...TACO, title_fr: 'Mardi tacos' }]).detail, /both the French title and the French deal/);
  assert.equal(v([{ ...TACO, title_fr: 'Mardi tacos', deal_fr: 'Tacos à 3 $' }]).ok, true);
  assert.equal(v([{ ...TACO, season_from: '06-01' }]).ok, false, 'both season dates');
  assert.equal(v([{ ...TACO, season_from: '02-30', season_to: '09-30' }]).ok, false, 'a real day');
  assert.equal(v([{ ...TACO, season_from: '06-01', season_to: '09-30' }]).ok, true);
  assert.equal(v([{ ...TACO, note: 'x' }]).ok, false, 'unexpected field');
  assert.equal(v([TACO], {}).ok, false, 'needs a source');
  assert.equal(v([TACO], { source: 'ftp://x.example', checked_at: today }).ok, false);
  assert.equal(v([TACO], { source: 'venue_owner', checked_at: today }).ok, true);
  assert.equal(v([TACO], { source: SRC, checked_at: '2999-01-01' }).ok, false, 'never in the future');
  assert.equal(v([TACO], { source: SRC, checked_at: '2026-02-30' }).ok, false, 'a real date');
  assert.equal(v([{ ...TACO, source: 'https://example.com/own', checked_at: daysAgo(3) }], {}).ok, true, 'each special may carry its own');
  assert.equal(v('tacos').ok, false);
  // Ordinary specials wording passes.
  assert.equal(v([{ days: ['mon'], title: 'Dry rib Monday', deal: '$9.99 dry ribs (1 lb)', price: '$9.99', kind: 'food' }, { days: ['sun'], title: 'Kids eat free', deal: 'One kids meal free with each adult entrée', kind: 'food' },
    { days: ['thu'], title: 'Caesar Thursday', deal: 'Double Caesars', price: '$2 off', kind: 'drink' }]).ok, true);
});

test('guardedSpecialsUpdate: reason + batch_id, compare-and-set on the canonical current list, one audit row, null clears', () => {
  const v = mk({ name: 'Specials Guard Pub' });
  const g = app.guardedSpecialsUpdate;
  const input = { specials: [TACO, WINGS], source_url: SRC, checked_at: today };
  assert.equal(g(v.id, null, input, { reason: '', batch_id: 'x' }).reason, 'invalid_meta');
  assert.equal(g(v.id, null, input, { reason: 'x' }).reason, 'invalid_meta');
  assert.equal(g(v.id, null, { ...input, specials: [] }, meta).reason, 'invalid_specials', 'an empty list is not a clear');
  assert.equal(g(v.id, null, { ...input, specials: [{ ...TACO, deal: 'See pub.com' }] }, meta).reason, 'invalid_specials');
  assert.equal(g(999999, null, input, meta).reason, 'venue_not_found');
  assert.equal(app.currentSpecialsJson(v.id), null, 'no specials yet');
  const ok = g(v.id, null, input, meta);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(ok.changedFields, ['specials']);
  const cur = app.currentSpecialsJson(v.id);
  assert.equal(ok.specials, cur, 'the result is the new compare-and-set value');
  assert.deepEqual(JSON.parse(cur).map((s) => s.title), ['Taco Tuesday', 'Wing Wednesday'], 'input order kept');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM venue_specials WHERE venue_id = ?').get(v.id).n, 2);
  // A stale expected value is refused, nothing changes, and the live list comes back.
  const miss = g(v.id, null, { ...input, specials: [TACO] }, meta);
  assert.equal(miss.reason, 'mismatch');
  assert.equal(miss.live.specials, cur);
  assert.equal(app.currentSpecialsJson(v.id), cur);
  // The same list again: ok, nothing logged.
  assert.deepEqual(g(v.id, cur, input, meta).changedFields, []);
  const log = db.prepare("SELECT field_name, old_value, new_value, source, source_ref FROM venue_enrichment_log WHERE venue_id = ? AND batch_id = 'test-specials'").all(v.id);
  assert.equal(log.length, 1);
  assert.deepEqual({ ...log[0] }, { field_name: 'specials', old_value: null, new_value: cur, source: 'specials_research', source_ref: 'specials fixture' });
  // From the owner: logged as venue_owner.
  const own = g(v.id, cur, { specials: [TACO], source_url: 'venue_owner', checked_at: today }, { ...meta, batch_id: 'test-specials-owner' });
  assert.equal(own.ok, true);
  assert.equal(db.prepare("SELECT source FROM venue_enrichment_log WHERE venue_id = ? AND batch_id = 'test-specials-owner'").get(v.id).source, 'venue_owner');
  // null clears the list.
  const cleared = g(v.id, own.specials, { specials: null }, meta);
  assert.equal(cleared.ok, true);
  assert.equal(cleared.specials, null);
  assert.equal(app.currentSpecialsJson(v.id), null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM venue_specials WHERE venue_id = ?').get(v.id).n, 0);
});

test('POST /admin/set-specials + GET /admin/specials/:id: bearer token, strict keys, 409 on a stale expected value, null clears', async () => {
  const v = mk({ name: 'Specials Route Pub' });
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const auth = (token) => (token ? { Authorization: `Bearer ${token}` } : {});
  const post = async (body, token = process.env.ENRICHMENT_ADMIN_TOKEN) => {
    const res = await fetch(`${base}/admin/set-specials`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const read = async (id, token = process.env.ENRICHMENT_ADMIN_TOKEN) => {
    const res = await fetch(`${base}/admin/specials/${id}`, { headers: auth(token) });
    return { status: res.status, body: await res.json() };
  };
  try {
    assert.equal((await read(v.id, 'wrong')).status, 401);
    assert.equal((await read(v.id, null)).status, 401);
    assert.equal((await read(999999)).status, 404);
    const first = await read(v.id);
    assert.equal(first.status, 200);
    assert.deepEqual(first.body, { id: v.id, name: 'Specials Route Pub', redirect_to: null, expected_current: null, specials: [] });
    const body = { id: v.id, expected_current: null, specials: [TACO, RIB], source_url: SRC, checked_at: today, reason: 'venue specials page', batch_id: 'specials-http' };
    assert.equal((await post(body, 'wrong')).status, 401);
    assert.equal((await post(body, null)).status, 401);
    assert.equal((await post({ ...body, extra: 1 })).status, 400, 'unexpected key');
    assert.equal((await post({ ...body, deals: [] })).status, 400, 'unexpected key');
    const { expected_current: _e, ...noExpected } = body;
    assert.equal((await post(noExpected)).status, 400, 'expected_current is required');
    assert.equal((await post({ ...body, expected_current: 5 })).status, 400);
    const { specials: _s, ...noSpecials } = body;
    assert.equal((await post(noSpecials)).status, 400, 'specials is required');
    assert.equal((await post({ ...body, id: 'x' })).status, 400);
    assert.equal((await post({ ...body, reason: '' })).body.error, 'invalid_meta');
    const bad = await post({ ...body, specials: [{ ...TACO, deal: 'Call 250 555 0123' }] });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, 'invalid_specials');
    const ok = await post(body);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.deepEqual(ok.body.changedFields, ['specials']);
    assert.deepEqual(ok.body.specials.map((s) => [s.title, s.source, s.checked_at]), [['Taco Tuesday', SRC, today], ['Prime rib night', SRC, today]]);
    // The read path gives the compare-and-set value a script sends back.
    const now = await read(v.id);
    assert.equal(now.body.expected_current, ok.body.expected_current);
    assert.deepEqual(JSON.parse(now.body.expected_current), now.body.specials);
    const stale = await post(body);
    assert.equal(stale.status, 409, 'expected_current no longer matches');
    assert.equal(stale.body.error, 'mismatch');
    assert.equal(stale.body.live.specials, now.body.expected_current);
    const cleared = await post({ id: v.id, expected_current: now.body.expected_current, specials: null, reason: 'clear', batch_id: 'specials-http' });
    assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
    assert.deepEqual(cleared.body.specials, []);
    assert.equal(cleared.body.expected_current, null);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('Today helper: the Okanagan day, days of the week, a closed day, season dates, advisories and closures, time state', () => {
  const v = mk({ name: 'Specials Today Pub' });
  set(v, [TACO, WINGS, WINE, { days: ['tue'], title: 'Summer patio pitchers', deal: 'Pitchers on the patio', kind: 'drink', season_from: '06-01', season_to: '09-30' },
    { days: ['tue'], title: 'Winter chili', deal: 'Chili bowl and a bun', kind: 'food', season_from: '10-15', season_to: '03-31' }]);
  assert.deepEqual(todayNames(v, at(TUE, '12:00')), ['Taco Tuesday', 'Wine Tuesday', 'Winter chili'], 'Tuesday, in season (a season may wrap the new year)');
  assert.deepEqual(todayNames(v, at(WED, '12:00')), ['Wing Wednesday']);
  // 11:30 PM Tuesday in Kelowna is already Wednesday in UTC: still Tuesday's specials.
  assert.deepEqual(todayNames(v, at(TUE, '23:30')), ['Taco Tuesday', 'Wine Tuesday', 'Winter chili']);
  assert.equal(at(TUE, '23:30').getUTCDay(), 3);
  // Time state: Wing Wednesday runs 4 PM to close.
  const wings = app.validateSpecials([WINGS], { source: SRC, checked_at: today }).specials[0];
  assert.equal(app.specialTimeState(wings, 12 * 60), 'later');
  assert.equal(app.specialTimeState(wings, 18 * 60), 'now');
  assert.equal(app.specialTimeState({ start: '11:00', end: '14:00' }, 15 * 60), 'over');
  assert.equal(app.specialTimeState({ start: '21:00', end: '01:00' }, 30), 'now', 'past midnight');
  assert.equal(app.specialTimeState({ start: null, end: null }, 600), 'allday');
  // A day the place's own hours call closed: nothing.
  const closedTue = mk({ name: 'Specials Closed Tuesday', hours: JSON.stringify({ ...open('11:00', '22:00'), tue: null }) });
  set(closedTue, [TACO]);
  assert.deepEqual(todayNames(closedTue, at(TUE, '12:00')), []);
  assert.equal(app.specialsTodayFor([app.getVenue(closedTue.id)], at(TUE, '12:00')).byId.get(closedTue.id).closedToday, true);
  // An advisory: nothing.
  const adv = mk({ name: 'Specials Advisory Pub' });
  set(adv, [TACO]);
  assert.deepEqual(todayNames(adv, at(TUE, '12:00')), ['Taco Tuesday']);
  assert.equal(app.guardedCollectionMembershipUpdate('advisory', adv.id, 'add', 'Kitchen closed for renovations this week. https://example.com/specials-notice', meta).ok, true);
  assert.deepEqual(todayNames(adv, at(TUE, '12:00')), []);
  assert.equal(app.specialsTodayFor([app.getVenue(adv.id)], at(TUE, '12:00')).byId.get(adv.id).blocked, true);
  // Closed for the season: nothing, and no Weekly specials row on the page.
  const season = mk({ name: 'Specials Season Pub' });
  set(season, [TACO]);
  assert.equal(app.guardedSeasonUpdate(season.id, { status: 'closed', source_url: 'https://example.com/season', checked_at: today }, meta).ok, true);
  assert.deepEqual(todayNames(season, at(TUE, '12:00')), []);
  assert.equal(spRow(page(season, at(TUE, '12:00'))), '');
});

test('Alcohol rule: drink specials only where alcohol is served; food specials anywhere (cafés too)', () => {
  const cafe = mk({ name: 'Specials Cafe', type: 'cafe' });
  set(cafe, [{ ...WINE, title: 'Mimosa Tuesday' }, { days: ['tue'], title: 'Soup Tuesday', deal: '$5 soup and a roll', kind: 'food' }, { days: ['tue'], title: 'Brunch and bubbles', deal: 'Brunch with a mimosa', kind: 'both' }]);
  assert.equal(app.venueServesAlcohol(app.getVenue(cafe.id)), false);
  assert.equal(app.venueServesAlcohol({ type: 'pub' }), true);
  assert.equal(app.venueServesAlcohol({ type: 'cafe', happy_hour: 1 }), true, 'the happy_hour badge counts');
  assert.deepEqual(todayNames(cafe, at(TUE, '12:00')), ['Soup Tuesday']);
  const html = spRow(page(cafe, at(TUE, '12:00')));
  assert.match(html, /Soup Tuesday/);
  assert.doesNotMatch(html, /Mimosa|Brunch and bubbles/);
  const row = JSON.parse(app.mapLiveData(at(TUE, '12:00')).json).p.find((p) => p[2] === 'Specials Cafe');
  assert.deepEqual(row[17], ['tue', 'Soup Tuesday · $5 soup and a roll']);
  // A pub shows the drink special.
  const pub = mk({ name: 'Specials Drink Pub' });
  set(pub, [WINE]);
  assert.deepEqual(todayNames(pub, at(TUE, '12:00')), ['Wine Tuesday']);
});

test('Venue page: a "Weekly specials" row under Happy hour, week order, today marked with a "Today" tag, one checked date; French lines or English marked lang="en"', () => {
  const v = mk({ name: 'Specials Page Pub' });
  set(v, [WINGS, TACO, RIB]);
  const html = page(v, at(TUE, '12:00'));
  const en = spRow(html);
  assert.ok(en, 'the row is there');
  assert.match(en, /^<span class="venue-sp-list" role="list" aria-label="Weekly specials">/);
  // Week order: Mon–Wed (prime rib), Tue (tacos), Wed (wings).
  assert.deepEqual([...en.matchAll(/class="venue-sp-title"[^>]*>([^<]+)</g)].map((m) => m[1]), ['Prime rib night', 'Taco Tuesday', 'Wing Wednesday']);
  assert.ok(en.includes('<span class="venue-sp is-today" role="listitem"><span class="venue-sp-days">Mon–Wed</span><span class="venue-sp-main"><span class="venue-sp-title">Prime rib night</span> <span class="venue-sp-price">$29</span> <span class="venue-sp-today">Today</span><span class="venue-sp-deal">10 oz prime rib dinner</span></span></span>'), en);
  assert.ok(en.includes('<span class="venue-sp is-today" role="listitem"><span class="venue-sp-days">Tue</span><span class="venue-sp-main"><span class="venue-sp-title">Taco Tuesday</span> <span class="venue-sp-price">$3 each</span> <span class="venue-sp-today">Today</span></span></span>'), 'card polish (2026-10-27): "$3 tacos" only repeats the title and price');
  assert.ok(en.includes('<span class="venue-sp" role="listitem"><span class="venue-sp-days">Wed</span><span class="venue-sp-main"><span class="venue-sp-title">Wing Wednesday</span> <span class="venue-sp-price">60¢ each</span><span class="venue-sp-deal">60¢ wings, dine-in only</span><span class="venue-sp-time">from 4 PM</span></span></span>'), 'not today: no tag');
  assert.equal((en.match(/venue-sp-today/g) || []).length, 2);
  const checked = `Checked ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(today.slice(5, 7)) - 1]} ${Number(today.slice(8, 10))}, ${today.slice(0, 4)}`;
  assert.equal((en.match(/venue-sp-checked/g) || []).length, 1, 'one checked line');
  assert.ok(en.endsWith(`<span class="venue-hours-checked venue-sp-checked">${checked}</span>`));
  // The row comes after the Happy hour row when there is one, and is a sidebar detail row like it.
  assert.ok(html.indexOf('<span class="label">Weekly specials</span>') > html.indexOf('<span class="label">Price</span>') || !html.includes('<span class="label">Price</span>'));
  // French: French lines where given, the English ones marked lang="en" (the day and the tag stay French).
  const fr = spRow(page(v, at(TUE, '12:00'), 'fr'));
  assert.match(fr, /aria-label="Spéciaux de la semaine"/);
  assert.ok(fr.includes('<span class="venue-sp-days">Lun–mer</span><span class="venue-sp-main"><span class="venue-sp-title">Soirée côte de bœuf</span> <span class="venue-sp-price">$29</span> <span class="venue-sp-today">Aujourd’hui</span><span class="venue-sp-deal">Souper de côte de bœuf 10 oz</span></span>'), fr);
  assert.ok(fr.includes('<span class="venue-sp-days">Mar</span><span class="venue-sp-main"><span class="venue-sp-title" lang="en">Taco Tuesday</span> <span class="venue-sp-price" lang="en">$3 each</span> <span class="venue-sp-today">Aujourd’hui</span></span>'));
  assert.match(fr, /<span class="venue-sp-time">dès 16 h<\/span>/);
  assert.match(fr, /venue-sp-checked">Vérifié le /);
  // A place closed today shows the week but marks no row.
  const shut = mk({ name: 'Specials Page Closed Tue', hours: JSON.stringify({ ...open('11:00', '22:00'), tue: null }) });
  set(shut, [TACO]);
  const s = spRow(page(shut, at(TUE, '12:00')));
  assert.match(s, /Taco Tuesday/);
  assert.doesNotMatch(s, /venue-sp-today|is-today/);
  // Every day: "Daily" / « Tous les jours ».
  const daily = mk({ name: 'Specials Daily Pub' });
  set(daily, [{ ...TACO, days: WEEK, title: 'Lunch special' }]);
  assert.match(spRow(page(daily, at(TUE, '12:00'))), /venue-sp-days">Daily</);
  assert.match(spRow(page(daily, at(TUE, '12:00'), 'fr')), /venue-sp-days">Tous les jours</);
  // No offers markup, no new links.
  assert.doesNotMatch(html, /"@type":\s*"Offer"|"offers"/);
  // No specials: no row.
  assert.equal(spRow(page(mk({ name: 'Specials None Pub' }), at(TUE, '12:00'))), '');
});

test('Stale rule: specials checked more than 120 days ago are hidden on the page, the map and Build My Trip, and listed on /admin/review', () => {
  assert.equal(app.SPECIALS_STALE_DAYS, 120);
  assert.equal(app.specialsStale(daysAgo(120)), false);
  assert.equal(app.specialsStale(daysAgo(121)), true);
  assert.equal(app.specialsStale(null), true);
  const edge = mk({ name: 'Specials Edge Pub' });
  set(edge, [{ ...TACO, days: WEEK }], { checked_at: daysAgo(120) });
  assert.match(spRow(page(edge, undefined)), /Taco Tuesday/, '120 days old still shows');
  const old = mk({ name: 'Specials Stale Pub' });
  set(old, [{ ...TACO, days: WEEK }, { ...RIB, days: WEEK, checked_at: daysAgo(10), source: SRC }], { checked_at: daysAgo(121) });
  const html = spRow(page(old, undefined));
  assert.doesNotMatch(html, /Taco Tuesday/, 'the stale one is hidden');
  assert.match(html, /Prime rib night/, 'the fresh one stays');
  const mapRow = JSON.parse(app.mapLiveData().json).p.find((p) => p[2] === 'Specials Stale Pub');
  assert.doesNotMatch(JSON.stringify(mapRow[17]), /Taco/);
  const plan = { schedule: [{ day: 1, date: today, venueId: old.id, startMinutes: 1080 }], days: [{ day: 1, stops: [{ venue: { id: old.id } }] }] };
  assert.doesNotMatch(app.withTripSpecials(plan).days[0].stops[0].specialLine, /Taco/);
  const review = app.renderAdminReviewPage();
  assert.match(review, /<h2>Stale weekly specials \(over 120 days\) <span class="rv-meta">\(\d+\)<\/span><\/h2>/);
  const sec = review.slice(review.indexOf('id="stalespecials"'));
  assert.match(sec, /Specials Stale Pub/);
  assert.match(sec, /Taco Tuesday · \$3 tacos/);
  assert.doesNotMatch(sec.slice(0, sec.indexOf('</section>')), /Specials Edge Pub/);
  assert.ok(app.staleVenueSpecials().some((r) => r.id === old.id && r.specials.length === 1));
});

test('Roam Now: today\'s specials ride as [17] (small), the card says "Today: …", the "Specials today" chip filters, and the search matches special words', async () => {
  const v = mk({ name: 'Specials Map Pub' });
  set(v, [TACO, WINGS]);
  const fr = mk({ name: 'Specials Map Pub FR' });
  set(fr, [RIB]);
  const plain = mk({ name: 'Specials Map Plain' });
  const tue = JSON.parse(app.mapLiveData(at(TUE, '12:00')).json).p;
  const r = tue.find((p) => p[2] === 'Specials Map Pub');
  assert.equal(r.length, 18);
  assert.equal(r[16], 0, 'no deals: [16] is 0');
  // Card polish (2026-10-27): the deal only repeats the title and price, so the price stands in.
  assert.deepEqual(r[17], ['tue', 'Taco Tuesday · $3 each'], 'today only, not the whole week');
  assert.deepEqual(tue.find((p) => p[2] === 'Specials Map Pub FR')[17], ['tue', 'Prime rib night · 10 oz prime rib dinner', 'Soirée côte de bœuf · Souper de côte de bœuf 10 oz']);
  assert.equal(tue.find((p) => p[2] === plain.name).length, 16, 'a place without specials today keeps 16 fields');
  assert.ok(JSON.stringify(r[17]).length < 60, 'one short field');
  const wed = JSON.parse(app.mapLiveData(at(WED, '12:00')).json).p.find((p) => p[2] === 'Specials Map Pub');
  assert.deepEqual(wed[17], ['wed', 'Wing Wednesday · 60¢ wings, dine-in only']);
  // The page: the chip in the quick row and the panel, read from [17], the card line, the filter.
  const html = app.renderPlacesMapPage();
  assert.equal(html.split(`data-pm-feat="specials" aria-pressed="false"><span aria-hidden="true">${app.uiIcon('tag')}</span> Specials today</button>`).length - 1, 2);
  assert.ok(html.indexOf('data-pm-feat="specials"') < html.indexOf('data-pm-feat="patio"'), 'beside Happy hour now, at the front of the row');
  assert.ok(html.includes('"specials":32768'));
  assert.ok(html.includes("if (a[17] && a[17][1]) { p.spDay = a[17][0]; p.sp = FR && a[17][2] ? a[17][2] : a[17][1]; p.spEn = !!(FR && !a[17][2]);"));
  assert.ok(html.includes("p.spOn = !!(p.sp && p.spDay === wd);"));
  assert.ok(html.includes(`if (p.spOn) out += '<span class="pm-sp' + (feats.specials ? ' is-on' : '') + '">' + esc(T.spToday) + ' <span' + (p.spEn ? ' lang="en"' : '') + '>' + esc(p.sp) + '</span></span>';`));
  assert.ok(html.includes("k === 'specials' ? !p.spOn :"));
  assert.ok(html.includes("spToday: 'Today:'") && html.includes("spToday: 'Aujourd’hui :'"));
  assert.ok(html.includes("specials: 'Specials today', ") && html.includes("specials: 'Spéciaux du jour', "));
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  try {
    const frHtml = await fetch(`http://127.0.0.1:${srv.address().port}/fr/map`).then((x) => x.text());
    assert.ok(frHtml.includes(`data-pm-feat="specials" aria-pressed="false"><span aria-hidden="true">${app.uiIcon('tag')}</span> Spéciaux du jour</button>`));
  } finally {
    srv.closeAllConnections();
    await new Promise((resolve) => srv.close(resolve));
  }
  // The search: the page's own deal matcher over the deal + special words, run with the page's mapNameKey.
  const keySrc = html.match(/function mapNameKey\(name\)\{[^\n]*\}/)[0];
  const dealSrc = html.slice(html.indexOf('  var DEAL_SKIP'), html.indexOf('  function matchesPlace(p){'));
  const ctx = {};
  vm.runInNewContext(`${keySrc}\nvar dealQuery = '', dealWordsFor = null, dealWords = [];\n${dealSrc}\nthis.hit = function(q, a){ var p = {}; if (a[17] && a[17][1]) p.dk = (p.dk || ' ') + mapNameKey(a[17].slice(1).join(' ')).slice(1); dealQuery = q; return dealHit(p); };`, ctx);
  const ribRow = tue.find((p) => p[2] === 'Specials Map Pub FR');
  assert.equal(ctx.hit('tacos', r), true);
  assert.equal(ctx.hit('taco tuesday', r), true);
  assert.equal(ctx.hit('prime rib', ribRow), true);
  assert.equal(ctx.hit('cote de boeuf', ribRow), true, 'French words too');
  assert.equal(ctx.hit('wings', wed), true);
  assert.equal(ctx.hit('wings', r), false, 'not on Tuesday');
  assert.equal(ctx.hit('specials', r), false, 'the word "specials" is the chip, not a deal word');
  // "specials" / « spéciaux » turn the chip on; "happy hour specials" stays happy hour.
  assert.ok(html.includes("specials: 'specials special spéciaux speciaux spécial',"));
  assert.ok(html.includes("[/ happy\\s+(?:specials?|spéciaux|speciaux|spécial|deals?)(?=\\s)/g, ' happy ']"));
  // ?f=specials works like any feature key; every inline script still parses.
  for (const s of html.split(/<script(?![^>]*\bsrc=)(?![^>]*application\/(?:ld\+)?json)[^>]*>/).slice(1).map((x) => x.split('</script>')[0])) new vm.Script(s);
});

test('Build My Trip: a stop on its special\'s day says "Tonight: …" (or "Today: …" before 4 PM), EN/FR; others do not; the plan is unchanged', () => {
  const v = mk({ name: 'Specials Trip Pub' });
  set(v, [TACO]);
  const lunch = mk({ name: 'Specials Trip Lunch' });
  set(lunch, [{ days: ['tue'], title: 'Lunch bowl Tuesday', deal: '$12 rice bowls', kind: 'food', start: '11:00', end: '14:00' }]);
  const plan = {
    kind: 'itinerary',
    schedule: [{ day: 1, date: TUE, venueId: lunch.id, startMinutes: 720 }, { day: 1, date: TUE, venueId: v.id, startMinutes: 1080 }, { day: 2, date: WED, venueId: v.id, startMinutes: 1080 }],
    days: [{ day: 1, stops: [{ day: 1, venue: { id: lunch.id } }, { day: 1, venue: { id: v.id } }] }, { day: 2, stops: [{ day: 2, venue: { id: v.id } }] }],
  };
  const before = JSON.stringify(plan.days.map((d) => d.stops.map((s) => s.venue.id)));
  const out = app.withTripSpecials(plan, at(TUE, '09:00'));
  const [l, dinner] = out.days[0].stops;
  assert.equal(dinner.specialLine, 'Tonight: Taco Tuesday · $3 each');
  assert.equal(dinner.specialLineFr, 'Ce soir : Taco Tuesday · $3 each');
  assert.equal(dinner.specialLineFrLang, 'en', 'French falls back to the English lines');
  assert.equal(l.specialLine, 'Today: Lunch bowl Tuesday · $12 rice bowls', 'before 4 PM');
  assert.equal(l.specialLineFr, 'Aujourd’hui : Lunch bowl Tuesday · $12 rice bowls');
  assert.equal(out.days[1].stops[0].specialLine, undefined, 'Wednesday has no special');
  assert.equal(JSON.stringify(out.days.map((d) => d.stops.map((s) => s.venue.id))), before, 'order unchanged');
  // A special with a time the stop is outside of is left out (a lunch special at a dinner stop).
  const late = app.withTripSpecials({ schedule: [{ day: 1, date: TUE, venueId: lunch.id, startMinutes: 1140 }], days: [{ day: 1, stops: [{ venue: { id: lunch.id } }] }] }, at(TUE, '09:00'));
  assert.equal(late.days[0].stops[0].specialLine, undefined);
  // With French lines: those, not marked.
  const frv = mk({ name: 'Specials Trip FR' });
  set(frv, [RIB]);
  const f = app.withTripSpecials({ schedule: [{ day: 1, date: TUE, venueId: frv.id, startMinutes: 1110 }], days: [{ day: 1, stops: [{ venue: { id: frv.id } }] }] }, at(TUE, '09:00')).days[0].stops[0];
  assert.equal(f.specialLineFr, 'Ce soir : Soirée côte de bœuf · Souper de côte de bœuf 10 oz');
  assert.equal(f.specialLineFrLang, undefined);
  // A drink special at a café never shows.
  const cafe = mk({ name: 'Specials Trip Cafe', type: 'cafe' });
  set(cafe, [WINE]);
  assert.equal(app.withTripSpecials({ schedule: [{ day: 1, date: TUE, venueId: cafe.id, startMinutes: 1080 }], days: [{ day: 1, stops: [{ venue: { id: cafe.id } }] }] }, at(TUE, '09:00')).days[0].stops[0].specialLine, undefined);
  // The planner page prints it on the stop's card; the trip API adds it after planning; the planner never reads it.
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(v3.includes(`(stop.specialLine ? '<p class="t3-sp">' + (lang() === 'fr' && stop.specialsFr ? esc(stop.specialLineLabelFr) + ' : <span' + (stop.specialLineFrLang ? ' lang="en"' : '') + '>' + esc(stop.specialsFr) + '</span>' : esc(stop.specialLine)) + '</p>' : '')`));
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(src.includes('withTripSpecials(withTripFrenchUrls(withTripHappyHourDeals(runTripPlan(parsed.value))))'));
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'trip-planner.js'), 'utf8'), /venue_specials|withTripSpecials/, 'ranking unchanged');
});

test('Owner portal: a Weekly specials editor; a signed-in save goes live (venue_owner, today) with an audit row and Undo; cafés get food only', async () => {
  const v = mk({ name: 'Specials Owner Pub' });
  const researched = set(v, [{ ...TACO, season_from: '10-01', season_to: '04-30' }], { checked_at: daysAgo(30) });
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  let ip = 1;
  const post = (p, body, cookie) => fetch(`${base}${p}`, { method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.89.0.${ip++ % 250}`, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, cookie: (r.headers.get('set-cookie') || '').split(';')[0], body: await r.json().catch(() => ({})) }));
  const get = (p, cookie) => fetch(`${base}${p}`, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} }).then((r) => r.text());
  try {
    const token = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
    const made = await post(`/owner/${token}/account`, { email: 'specials-owner@example.com', password: 'a long enough password' });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const cookie = made.cookie;
    const pg = await get(`/owner/account/venue/${v.id}`, cookie);
    assert.match(pg, /id="opSpecialsLabel">Weekly specials</);
    assert.equal((pg.match(/<fieldset class="op-sp" data-sp="\d"/g) || []).length, 7, 'seven boxes, the unused ones hidden');
    assert.match(pg, /<fieldset class="op-sp" data-sp="1" data-season-from="10-01" data-season-to="04-30">/, 'the researched season rides along');
    assert.match(pg, /<input type="checkbox" class="op-sp-d" value="tue" checked> Tue<\/label>/);
    assert.match(pg, /class="op-sp-title" maxlength="40" value="Taco Tuesday" aria-label="Special 1: name"/);
    assert.match(pg, /<select class="op-sp-kind" aria-label="Special 1: food or drinks"><option value="food" selected>Food<\/option><option value="drink">Drinks<\/option>/);
    assert.match(pg, /until close<\/label>/);
    const frPage = await get(`/fr/owner/account/venue/${v.id}`, cookie);
    assert.match(frPage, /id="opSpecialsLabel">Spéciaux de la semaine</);
    // Errors: a link, no day, too many.
    const send = (specials) => post(`/owner/account/venue/${v.id}/changes`, { changes: { specials }, started_at: Date.now() - 10000 }, cookie);
    const bad = await send([{ ...TACO, deal: 'See thepub.ca' }]);
    assert.equal(bad.status, 400);
    assert.match(bad.body.errors.specials, /links, email addresses, phone numbers and emoji/);
    assert.match((await send([{ ...TACO, days: [] }])).body.errors.specials, /at least one day/);
    assert.match((await send(Array.from({ length: 8 }, () => TACO))).body.errors.specials, /up to 7 specials/);
    assert.match((await send([{ ...TACO, source: 'venue_owner' }])).body.errors.specials, /could not be read/, 'owners never send a source');
    // Save: live at once, source venue_owner, today's date.
    const next = [{ ...WINGS, title_fr: 'Mercredi des ailes', deal_fr: 'Ailes à 60 ¢' }, { ...WINE }];
    const r = await send(next);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.live, ['specials']);
    const rows = app.venueSpecialsList(v.id);
    assert.deepEqual(rows.map((s) => [s.title, s.source, s.checked_at, s.kind, s.end]), [['Wing Wednesday', 'venue_owner', today, 'food', 'close'], ['Wine Tuesday', 'venue_owner', today, 'drink', null]]);
    assert.equal(rows[0].deal_fr, 'Ailes à 60 ¢');
    assert.match(spRow(page(v, at(WED, '12:00'))), /Wing Wednesday<\/span> <span class="venue-sp-price">60¢ each<\/span> <span class="venue-sp-today">Today/);
    const logged = db.prepare("SELECT field_name, source, reviewed_by FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'specials' ORDER BY id DESC LIMIT 1").get(v.id);
    assert.deepEqual({ ...logged }, { field_name: 'specials', source: 'venue_owner', reviewed_by: 'owner:specials-owner@example.com' });
    // The same specials again: nothing changed.
    assert.equal((await send(next)).status, 400);
    // /admin/review lists the live change; Undo puts back the researched special with its own source, date and season.
    const audit = app.recentInstantOwnerChanges().find((x) => x.venue_id === v.id);
    assert.ok(audit && 'specials' in audit.changes);
    const review = app.renderAdminReviewPage();
    assert.match(review, new RegExp(`data-kind="change" data-id="${audit.id}"[\\s\\S]*?<th>Weekly specials</th><td class="rv-old">Tue: Taco Tuesday · \\$3 tacos · \\$3 each \\(food, season 10-01–04-30\\) \\(checked ${daysAgo(30)}, https://example.com/specials\\)</td><td class="rv-new">Wed: Wing Wednesday · 60¢ wings, dine-in only · 60¢ each \\(food, 16:00–close\\) \\| FR: Mercredi des ailes · Ailes à 60 ¢; Tue: Wine Tuesday · Half-price bottles \\(drink\\)</td>`));
    const u = app.undoOwnerInstantChange(audit.id, 'dayton');
    assert.equal(u.ok, true, JSON.stringify(u));
    assert.deepEqual(u.restored, ['specials']);
    assert.equal(app.currentSpecialsJson(v.id), researched.specials, 'exactly the researched list again');
    // Clearing every box removes them (instant).
    const clear = await send(null);
    assert.equal(clear.status, 201, JSON.stringify(clear.body));
    assert.equal(app.currentSpecialsJson(v.id), null);
    // An edit link alone waits for review; approving applies it as the owner's.
    const viaLink = await post(`/owner/${token}/changes`, { changes: { specials: [TACO] }, started_at: Date.now() - 10000 });
    assert.equal(viaLink.status, 201, JSON.stringify(viaLink.body));
    assert.deepEqual(viaLink.body.review, ['specials']);
    const pending = app.pendingOwnerChange(v.id);
    assert.equal(app.approveOwnerChange(pending.id, 'dayton').ok, true);
    assert.deepEqual(app.venueSpecialsList(v.id).map((s) => [s.title, s.source]), [['Taco Tuesday', 'venue_owner']]);
    // A café: food only (no kind picker), and a drink special is refused.
    const cafe = mk({ name: 'Specials Owner Cafe', type: 'cafe' });
    const checked = app.validateOwnerChanges(app.getVenue(cafe.id), null, { changes: { specials: [WINE] } });
    assert.match(checked.errors.specials, /Drink specials are only listed for places that serve alcohol/);
    assert.deepEqual(Object.keys(app.validateOwnerChanges(app.getVenue(cafe.id), null, { changes: { specials: [TACO] } }).changes), ['specials']);
    // A beach: no specials at all.
    const beach = mk({ name: 'Specials Beach', type: 'beach' });
    assert.match(app.validateOwnerChanges(app.getVenue(beach.id), null, { changes: { specials: [TACO] } }).errors.specials, /serve food or drinks/);
  } finally {
    srv.closeAllConnections();
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('Owner help bot: "How do I add my weekly specials?" in English and French', () => {
  const cfg = JSON.parse(app.ownerHelpWidgetHtml('edit', { signedIn: true }).match(/id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
  const t = cfg.topics.find((x) => x.id === 'specials');
  assert.ok(t, 'the topic is there');
  assert.equal(t.q, 'How do I add my weekly specials?');
  assert.equal(t.qFr, 'Comment ajouter mes spéciaux de la semaine?');
  assert.match(JSON.stringify(t), /Weekly specials/);
  assert.match(JSON.stringify(t), /Spéciaux de la semaine/);
  for (const lang of ['en', 'fr']) {
    const html = app.ownerHelpWidgetHtml('edit', { lang, signedIn: true });
    const c = JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
    const ctx = { T: c.topics, cfg: c };
    vm.runInNewContext(`${html.slice(html.indexOf('function norm(s)'), html.indexOf('function ask(q)'))}; this.best = best;`, ctx);
    for (const q of ['How do I add my weekly specials?', 'weekly specials', 'add taco tuesday', 'wing night special', 'daily specials', 'Comment ajouter mes spéciaux de la semaine?', 'spéciaux du jour']) assert.equal(ctx.best(q).id, 'specials', `${lang}: ${q}`);
    // The happy hour deals topic keeps its questions.
    for (const q of ['How do I add my happy hour deals?', 'happy hour specials', 'add drink specials']) assert.equal(ctx.best(q).id, 'hh-deals', `${lang}: ${q}`);
    assert.equal(ctx.best('how do I set my hours').id, 'hours', 'other topics unchanged');
  }
});
