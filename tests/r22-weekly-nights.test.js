// Weekly nights (2026-10-27): the regular nights a place hosts (trivia Tuesday, karaoke Thursday, open mic, bingo, a run
// club), from the venue's own page or the owner. Stored in db.js venue_weekly_nights, written only by
// guardedWeeklyNightsUpdate (POST /admin/set-weekly-nights and the owner portal), the whole list at once with
// compare-and-set. Shown on the venue page ("Weekly nights" card, tonight marked), Roam Now (tonight's line as [19], the
// "Weekly nights tonight" chip, the search), What's On ("Every week", no new URLs) and Build My Trip; hidden once checked
// over 120 days ago; only for restaurants, cafés, pubs, breweries, lounges, distilleries and wineries.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'r22-nights-admin-token';
const app = require('../server.js');
const db = require('../db.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
let n = 0;
const mk = (o) => app.createVenue({ slug: `nights-fixture-${++n}`, region: 'kelowna', type: 'pub', latitude: 49.875 + n / 1000, longitude: -119.46, rating: 4.1,
  description: 'A fixture pub used only by the weekly nights tests.', hours: JSON.stringify(open('11:00', '23:59')), ...o });
const meta = { reason: 'nights fixture', batch_id: 'test-nights' };
const today = app.todayLocal();
const daysAgo = (d) => app.addLocalDays(today, -d);
const SRC = 'https://example.com/events';
const TRIVIA = { days: ['tue'], kind: 'trivia', title: 'Trivia Tuesday', start: '19:00', end: '21:00', detail: 'Teams up to 6, prizes for the top 3', host: 'Dave', cost: 'Free' };
const KARAOKE = { days: ['thu'], kind: 'karaoke', title: 'Karaoke Thursday', start: '21:00' };
const BINGO = { days: ['tue'], kind: 'bingo', title: 'Bingo night', start: '18:00', frequency: 'biweekly' };
const set = (v, nights, extra = {}) => {
  const r = app.guardedWeeklyNightsUpdate(v.id, app.currentWeeklyNightsJson(v.id), { nights, source_url: SRC, checked_at: today, ...extra }, meta);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r;
};
// Pacific (UTC−7) wall-clock time on a date.
const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.parse(`${date}T00:00:00Z`) + ((h + 7) * 60 + m) * 60000); };
const TUE = '2026-10-27';
const WED = '2026-10-28';
const page = (v, now, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { now, lang });
const card = (html) => (/<section class="venue-section venue-nights-card" id="venueNights"[\s\S]*?<\/section>/.exec(html) || [])[0] || '';
const tonightKinds = (v, now) => (app.weeklyNightsTodayFor([{ ...app.getVenue(v.id), hours: db.prepare('SELECT hours FROM venues WHERE id = ?').get(v.id).hours }], now).byId.get(v.id) || { today: [] }).today.map((s) => s.kind);

test('validateWeeklyNights: canonical list, kinds, frequencies, lengths, times, French, source and date, venue types; same text rules as the specials', () => {
  const v = (list, opts = { source: SRC, checked_at: today }) => app.validateWeeklyNights(list, opts);
  const ok = v([{ days: ['thu', 'tue', 'thu'], kind: 'trivia', title: '  Trivia   Night ', start: '19:00' }]);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(ok.nights[0], { days: ['tue', 'thu'], kind: 'trivia', title: 'Trivia Night', start: '19:00', end: null, detail: null, host: null, cost: null, frequency: 'weekly',
    title_fr: null, detail_fr: null, source: SRC, checked_at: today });
  assert.deepEqual(v([]), { ok: true, nights: [] });
  assert.equal(v(Array.from({ length: 8 }, () => TRIVIA)).ok, false, 'at most 7');
  assert.equal(v(Array.from({ length: 7 }, () => TRIVIA)).ok, true);
  for (const k of app.NIGHT_KINDS) assert.equal(v([{ ...TRIVIA, kind: k }]).ok, true, k);
  assert.deepEqual(app.NIGHT_KINDS, ['trivia', 'karaoke', 'open_mic', 'bingo', 'comedy', 'dj', 'live_music', 'games', 'sports', 'run_club', 'paint', 'other']);
  assert.equal(v([{ ...TRIVIA, kind: 'quiz' }]).ok, false);
  assert.equal(v([{ ...TRIVIA, kind: undefined }]).ok, false, 'kind is required');
  for (const f of ['weekly', 'biweekly', 'monthly-1st', 'monthly-last', 'monthly-1st-3rd', 'monthly-2nd-4th']) assert.equal(v([{ ...TRIVIA, frequency: f }]).nights[0].frequency, f);
  assert.equal(v([{ ...TRIVIA, frequency: 'monthly' }]).ok, false);
  assert.match(v([{ ...TRIVIA, days: [] }]).detail, /at least one day/);
  assert.equal(v([{ ...TRIVIA, days: ['tuesday'] }]).ok, false);
  assert.equal(v([{ ...TRIVIA, title: 'x'.repeat(41) }]).ok, false, 'title over 40');
  assert.equal(v([{ ...TRIVIA, title: 'x'.repeat(40) }]).ok, true);
  assert.equal(v([{ ...TRIVIA, detail: 'x'.repeat(81) }]).ok, false, 'detail over 80');
  assert.equal(v([{ ...TRIVIA, cost: 'x'.repeat(21) }]).ok, false, 'cost over 20');
  assert.equal(v([{ ...TRIVIA, host: 'x'.repeat(41) }]).ok, false, 'host over 40');
  assert.equal(v([{ ...TRIVIA, title: '  ' }]).ok, false, 'a title is needed');
  for (const bad of ['See www.pub.com', 'Sign up at pub.ca', 'Email us@pub.ca', 'Follow @thepub', 'Call 250-555-0123', 'Trivia 🧠', '<b>Trivia</b>']) {
    assert.equal(v([{ ...TRIVIA, detail: bad }]).ok, false, bad);
    assert.equal(v([{ ...TRIVIA, title: bad.slice(0, 40) }]).ok, false, `title: ${bad}`);
  }
  assert.equal(v([{ ...TRIVIA, start: '7pm' }]).ok, false);
  assert.equal(v([{ ...TRIVIA, end: 'late' }]).ok, false);
  assert.equal(v([{ ...TRIVIA, start: '19:00', end: '19:00' }]).ok, false);
  assert.equal(v([{ ...TRIVIA, start: null, end: '21:00' }]).ok, false, 'an end needs a start');
  assert.equal(v([{ ...TRIVIA, start: '21:00', end: '01:00' }]).ok, true, 'past midnight is fine');
  assert.equal(v([{ ...TRIVIA, title_fr: 'Quiz du mardi' }]).ok, true, 'a French title alone');
  assert.match(v([{ ...KARAOKE, detail_fr: 'Micro ouvert' }]).detail, /French detail needs the English detail/);
  assert.equal(v([{ ...TRIVIA, note: 'x' }]).ok, false, 'unexpected field');
  assert.equal(v([TRIVIA], {}).ok, false, 'needs a source');
  assert.equal(v([TRIVIA], { source: 'venue_owner', checked_at: today }).ok, true);
  assert.equal(v([TRIVIA], { source: SRC, checked_at: '2999-01-01' }).ok, false, 'never in the future');
  assert.equal(v([TRIVIA], { source: SRC, checked_at: '2026-02-30' }).ok, false, 'a real date');
  // Only the food and drink places that host them.
  for (const t of ['restaurant', 'cafe', 'pub', 'brewery', 'cocktail', 'distillery', 'winery']) assert.equal(v([TRIVIA], { source: SRC, checked_at: today, type: t }).ok, true, t);
  for (const t of ['beach', 'outdoor', 'golf', 'tour', 'indoor', 'shop']) assert.match(v([TRIVIA], { source: SRC, checked_at: today, type: t }).detail, /only listed for restaurants/, t);
  assert.equal(v('trivia').ok, false);
});

test('guardedWeeklyNightsUpdate: reason + batch_id, compare-and-set, one audit row, null clears, venue type checked', () => {
  const v = mk({ name: 'Nights Guard Pub' });
  const g = app.guardedWeeklyNightsUpdate;
  const input = { nights: [TRIVIA, KARAOKE], source_url: SRC, checked_at: today };
  assert.equal(g(v.id, null, input, { reason: '', batch_id: 'x' }).reason, 'invalid_meta');
  assert.equal(g(v.id, null, { ...input, nights: [] }, meta).reason, 'invalid_nights', 'an empty list is not a clear');
  assert.equal(g(v.id, null, { ...input, nights: [{ ...TRIVIA, detail: 'See pub.com' }] }, meta).reason, 'invalid_nights');
  assert.equal(g(999999, null, input, meta).reason, 'venue_not_found');
  const ok = g(v.id, null, input, meta);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.deepEqual(ok.changedFields, ['weekly_nights']);
  const cur = app.currentWeeklyNightsJson(v.id);
  assert.equal(ok.nights, cur);
  assert.deepEqual(JSON.parse(cur).map((s) => s.title), ['Trivia Tuesday', 'Karaoke Thursday']);
  const miss = g(v.id, null, { ...input, nights: [TRIVIA] }, meta);
  assert.equal(miss.reason, 'mismatch');
  assert.equal(miss.live.nights, cur);
  assert.deepEqual(g(v.id, cur, input, meta).changedFields, [], 'the same list: nothing logged');
  const log = db.prepare("SELECT field_name, old_value, new_value, source, source_ref FROM venue_enrichment_log WHERE venue_id = ? AND batch_id = 'test-nights'").all(v.id);
  assert.equal(log.length, 1);
  assert.deepEqual({ ...log[0] }, { field_name: 'weekly_nights', old_value: null, new_value: cur, source: 'weekly_nights_research', source_ref: 'nights fixture' });
  const cleared = g(v.id, cur, { nights: null }, meta);
  assert.equal(cleared.ok, true);
  assert.equal(app.currentWeeklyNightsJson(v.id), null);
  // A beach or a golf course: refused.
  const beach = mk({ name: 'Nights Beach', type: 'beach' });
  const b = g(beach.id, null, input, meta);
  assert.equal(b.reason, 'invalid_nights');
  assert.match(b.detail, /only listed for restaurants/);
});

test('POST /admin/set-weekly-nights + GET /admin/weekly-nights/:id: bearer token, strict keys, 409 on a stale expected value, null clears', async () => {
  const v = mk({ name: 'Nights Route Pub' });
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const auth = (token) => (token ? { Authorization: `Bearer ${token}` } : {});
  const post = async (body, token = process.env.ENRICHMENT_ADMIN_TOKEN) => {
    const res = await fetch(`${base}/admin/set-weekly-nights`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  const read = async (id, token = process.env.ENRICHMENT_ADMIN_TOKEN) => {
    const res = await fetch(`${base}/admin/weekly-nights/${id}`, { headers: auth(token) });
    return { status: res.status, body: await res.json() };
  };
  try {
    assert.equal((await read(v.id, 'wrong')).status, 401);
    assert.equal((await read(999999)).status, 404);
    const first = await read(v.id);
    assert.deepEqual(first.body, { id: v.id, name: 'Nights Route Pub', type: 'pub', redirect_to: null, expected_current: null, nights: [] });
    const body = { id: v.id, expected_current: null, nights: [TRIVIA, BINGO], source_url: SRC, checked_at: today, reason: 'venue events page', batch_id: 'nights-http' };
    assert.equal((await post(body, 'wrong')).status, 401);
    assert.equal((await post({ ...body, extra: 1 })).status, 400, 'unexpected key');
    const { expected_current: _e, ...noExpected } = body;
    assert.equal((await post(noExpected)).status, 400, 'expected_current is required');
    const { nights: _n, ...noNights } = body;
    assert.equal((await post(noNights)).status, 400, 'nights is required');
    assert.equal((await post({ ...body, reason: '' })).body.error, 'invalid_meta');
    const bad = await post({ ...body, nights: [{ ...TRIVIA, detail: 'Call 250 555 0123' }] });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, 'invalid_nights');
    const ok = await post(body);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.deepEqual(ok.body.changedFields, ['weekly_nights']);
    assert.deepEqual(ok.body.nights.map((s) => [s.title, s.frequency, s.source]), [['Trivia Tuesday', 'weekly', SRC], ['Bingo night', 'biweekly', SRC]]);
    const now = await read(v.id);
    assert.equal(now.body.expected_current, ok.body.expected_current);
    const stale = await post(body);
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, 'mismatch');
    const cleared = await post({ id: v.id, expected_current: now.body.expected_current, nights: null, reason: 'clear', batch_id: 'nights-http' });
    assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
    assert.deepEqual(cleared.body.nights, []);
    // A golf course is refused by the route too.
    const golf = mk({ name: 'Nights Golf', type: 'golf' });
    assert.equal((await post({ ...body, id: golf.id })).status, 400);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('Frequency: weekly, every other week, and set weeks of the month (1st, last, 1st & 3rd, 2nd & 4th)', () => {
  const on = (frequency, date) => app.nightOnDate({ days: ['tue'], frequency }, date);
  // November 2026: Tuesdays 3, 10, 17, 24. December 2026: 1, 8, 15, 22, 29.
  assert.equal(on('weekly', '2026-11-10'), true);
  assert.equal(on('weekly', '2026-11-11'), false, 'a Wednesday');
  assert.equal(on('biweekly', '2026-11-10'), true, 'every other week may be tonight');
  assert.equal(on('monthly-1st', '2026-11-03'), true);
  assert.equal(on('monthly-1st', '2026-11-10'), false);
  assert.equal(on('monthly-last', '2026-11-24'), true);
  assert.equal(on('monthly-last', '2026-12-22'), false);
  assert.equal(on('monthly-last', '2026-12-29'), true);
  assert.deepEqual(['2026-12-01', '2026-12-08', '2026-12-15', '2026-12-22', '2026-12-29'].map((d) => on('monthly-1st-3rd', d)), [true, false, true, false, false]);
  assert.deepEqual(['2026-12-01', '2026-12-08', '2026-12-15', '2026-12-22', '2026-12-29'].map((d) => on('monthly-2nd-4th', d)), [false, true, false, true, false]);
  // The days column: "1st & 3rd Tue" / « 1er et 3e mar. ».
  const d = (frequency, fr, days = ['tue']) => app.nightDaysText({ days, frequency }, fr);
  assert.equal(d('monthly-1st-3rd', false), '1st & 3rd Tue');
  assert.equal(d('monthly-1st-3rd', true), '1er et 3e mar.');
  assert.equal(d('monthly-2nd-4th', false), '2nd & 4th Tue');
  assert.equal(d('monthly-2nd-4th', true), '2e et 4e mar.');
  assert.equal(d('monthly-1st', false), '1st Tue');
  assert.equal(d('monthly-last', true), 'dernier mar.');
  assert.equal(d('weekly', false), 'Tue');
  assert.equal(d('biweekly', false, ['mon', 'tue', 'wed']), 'Mon–Wed');
  // The today helper follows the frequency on the Okanagan clock.
  const v = mk({ name: 'Nights Frequency Pub' });
  set(v, [{ ...TRIVIA, frequency: 'monthly-1st-3rd' }, { ...BINGO, frequency: 'monthly-2nd-4th' }]);
  assert.deepEqual(tonightKinds(v, at('2026-12-01', '12:00')), ['trivia']);
  assert.deepEqual(tonightKinds(v, at('2026-12-08', '12:00')), ['bingo']);
  assert.deepEqual(tonightKinds(v, at('2026-12-29', '12:00')), []);
});

test('Today helper: the Okanagan day, a closed day, advisories and closures, season', () => {
  const v = mk({ name: 'Nights Today Pub' });
  set(v, [TRIVIA, KARAOKE, BINGO]);
  assert.deepEqual(tonightKinds(v, at(TUE, '12:00')), ['bingo', 'trivia'], 'Tuesday, by start time');
  assert.deepEqual(tonightKinds(v, at(WED, '12:00')), []);
  // 11:30 PM Tuesday in Kelowna is already Wednesday in UTC: still Tuesday's nights.
  assert.deepEqual(tonightKinds(v, at(TUE, '23:30')), ['bingo', 'trivia']);
  const closedTue = mk({ name: 'Nights Closed Tuesday', hours: JSON.stringify({ ...open('11:00', '22:00'), tue: null }) });
  set(closedTue, [TRIVIA]);
  assert.deepEqual(tonightKinds(closedTue, at(TUE, '12:00')), []);
  const adv = mk({ name: 'Nights Advisory Pub' });
  set(adv, [TRIVIA]);
  assert.equal(app.guardedCollectionMembershipUpdate('advisory', adv.id, 'add', 'Closed for renovations this week. https://example.com/nights-notice', meta).ok, true);
  assert.deepEqual(tonightKinds(adv, at(TUE, '12:00')), []);
  assert.equal(card(page(adv, at(TUE, '12:00'))), '');
  const season = mk({ name: 'Nights Season Pub' });
  set(season, [TRIVIA]);
  assert.equal(app.guardedSeasonUpdate(season.id, { status: 'closed', source_url: 'https://example.com/season', checked_at: today }, meta).ok, true);
  assert.deepEqual(tonightKinds(season, at(TUE, '12:00')), []);
  assert.equal(card(page(season, at(TUE, '12:00'))), '');
});

test('Venue page: a "Weekly nights" card after the deals card and before Hours, tonight tagged, one checked date or "Confirmed by", EN/FR', () => {
  const v = mk({ name: 'Nights Page Pub' });
  set(v, [KARAOKE, TRIVIA, BINGO, { days: ['wed'], kind: 'open_mic', title: 'Open mic', start: '20:00', frequency: 'monthly-1st-3rd', title_fr: 'Scène ouverte du mercredi' }]);
  const html = page(v, at(TUE, '12:00'));
  const en = card(html);
  assert.ok(en, 'the card is there');
  assert.match(en, /<h2 id="venueNightsTitle">Weekly nights<\/h2><span class="venue-wn-list" role="list" aria-label="Weekly nights">/);
  // Week order, then by time: Tue 6 PM bingo, Tue 7 PM trivia, Wed open mic, Thu karaoke.
  assert.deepEqual([...en.matchAll(/class="venue-wn-title"[^>]*>([^<]+)</g)].map((m) => m[1]), ['Bingo night', 'Trivia Tuesday', 'Open mic', 'Karaoke Thursday']);
  assert.ok(en.includes('<span class="venue-wn is-today" role="listitem"><span class="venue-wn-days">Tue</span><span class="venue-wn-main"><span class="venue-wn-title">Trivia Tuesday</span> <span class="venue-wn-time">7–9 PM</span> <span class="venue-wn-today">Tonight</span><span class="venue-wn-meta"><span class="venue-wn-kind">'), en);
  // Card polish (2026-10-27): "Trivia Tuesday" already says trivia, so the kind label goes (the icon stays).
  assert.match(en, /<span class="venue-wn-kind"><svg[^>]*>[\s\S]*?<\/svg><\/span> <span>Teams up to 6, prizes for the top 3<\/span> &middot; <span>Hosted by Dave<\/span> &middot; <span>Free<\/span><\/span>/);
  assert.match(en, /Bingo night<\/span> <span class="venue-wn-time">6 PM<\/span> <span class="venue-wn-today">Tonight<\/span>[\s\S]*?<span>every other week<\/span>/);
  assert.match(en, /<span class="venue-wn" role="listitem"><span class="venue-wn-days">1st &amp; 3rd Wed<\/span>/);
  assert.equal((en.match(/venue-wn-today/g) || []).length, 2, 'only tonight');
  assert.doesNotMatch(en, /[\u{1F300}-\u{1FAFF}]/u, 'no emoji');
  assert.match(en, /<span class="venue-hours-checked venue-wn-checked">Checked [A-Z][a-z]{2} \d+, \d{4}<\/span><\/section>$/);
  // Placement: inside .venue-extra, before the hours.
  const extra = html.indexOf('<div class="venue-extra">'), at1 = html.indexOf('id="venueNights"'), hours = html.indexOf('id="venueHours"');
  assert.ok(extra > 0 && at1 > extra && (hours === -1 || at1 < hours));
  // French: kinds in French, English title marked lang="en", the French title where given, « Ce soir ».
  const fr = card(page(v, at(TUE, '12:00'), 'fr'));
  assert.match(fr, /<h2 id="venueNightsTitle">Soirées de la semaine<\/h2>/);
  assert.match(fr, /<span class="venue-wn-days">Mar<\/span><span class="venue-wn-main"><span class="venue-wn-title" lang="en">Trivia Tuesday<\/span> <span class="venue-wn-time">19 h–21 h<\/span> <span class="venue-wn-today">Ce soir<\/span>/);
  assert.match(fr, /<\/svg><\/span> <span lang="en">Teams up to 6/);
  assert.match(fr, /<span>Animé par Dave<\/span>/);
  assert.match(fr, /<span class="venue-wn-days">1er et 3e mer\.<\/span><span class="venue-wn-main"><span class="venue-wn-title">Scène ouverte du mercredi<\/span>/);
  assert.match(fr, /une semaine sur deux/);
  assert.match(fr, /venue-wn-checked">Vérifié le /);
  // French kind labels.
  const kinds = mk({ name: 'Nights Kinds Pub' });
  // Titles that don't name the kind (card polish 2026-10-27: a title that does drops the label).
  set(kinds, app.NIGHT_KINDS.slice(0, 7).map((k, i) => ({ days: ['mon'], kind: k, title: `Monday ${['one', 'two', 'three', 'four', 'five', 'six', 'seven'][i]}` })));
  const frKinds = card(page(kinds, at(TUE, '12:00'), 'fr'));
  for (const w of ['Quiz', 'Karaoké', 'Scène ouverte', 'Bingo', 'Humour', 'Soirée DJ', 'Musique live']) assert.ok(frKinds.includes(` ${w}</span>`), w);
  // Owner-entered nights: "Confirmed by <venue>" (the #501 line), not the grey date.
  const own = mk({ name: 'Nights Owner Pub' });
  set(own, [TRIVIA], { source_url: 'venue_owner' });
  assert.match(card(page(own, at(TUE, '12:00'))), /<span class="venue-hours-checked venue-wn-checked"><span class="venue-confirmed"><span class="venue-confirmed-tick" aria-hidden="true">&#10003;<\/span><span>Confirmed by Nights Owner Pub/);
  // A place closed today shows the week but tags nothing; no nights: no card; a beach never has one.
  const shut = mk({ name: 'Nights Page Closed Tue', hours: JSON.stringify({ ...open('11:00', '22:00'), tue: null }) });
  set(shut, [TRIVIA]);
  assert.doesNotMatch(card(page(shut, at(TUE, '12:00'))), /venue-wn-today|is-today/);
  assert.equal(card(page(mk({ name: 'Nights None Pub' }), at(TUE, '12:00'))), '');
  assert.doesNotMatch(html, /"@type":\s*"Event"[^}]*Trivia Tuesday/, 'no event markup');
});

test('Stale rule: nights checked more than 120 days ago are hidden everywhere and listed on /admin/review; live music nights without the badge listed', () => {
  assert.equal(app.NIGHTS_STALE_DAYS, 120);
  assert.equal(app.nightsStale(daysAgo(120)), false);
  assert.equal(app.nightsStale(daysAgo(121)), true);
  const old = mk({ name: 'Nights Stale Pub' });
  set(old, [{ ...TRIVIA, days: WEEK }, { ...KARAOKE, days: WEEK, checked_at: daysAgo(5), source: SRC }], { checked_at: daysAgo(121) });
  const c = card(page(old, undefined));
  assert.doesNotMatch(c, /Trivia Tuesday/, 'the stale one is hidden');
  assert.match(c, /Karaoke Thursday/);
  const row = JSON.parse(app.mapLiveData().json).p.find((p) => p[2] === 'Nights Stale Pub');
  assert.deepEqual(row[19][1].map((x) => x[0]), ['karaoke']);
  const plan = { schedule: [{ day: 1, date: today, venueId: old.id, startMinutes: 1080 }], days: [{ day: 1, stops: [{ venue: { id: old.id } }] }] };
  assert.doesNotMatch(app.withTripWeeklyNights(plan).days[0].stops[0].nightLine || '', /Trivia/);
  assert.doesNotMatch(app.whatsOnWeeklyNightsHtml(), /Nights Stale Pub[^<]*<\/a> <span class="whatson-nights-meta">[^<]*<span class="desc-en" lang="en">[^<]*Trivia/);
  // Live music on file without the badge.
  const music = mk({ name: 'Nights Music No Badge' });
  set(music, [{ days: ['fri'], kind: 'live_music', title: 'Friday live music', start: '20:00' }]);
  const badged = mk({ name: 'Nights Music Badge', live_music: true });
  set(badged, [{ days: ['fri'], kind: 'live_music', title: 'Friday live music', start: '20:00' }]);
  assert.ok(app.weeklyNightsLiveMusicWithoutBadge().some((r) => r.id === music.id));
  assert.ok(!app.weeklyNightsLiveMusicWithoutBadge().some((r) => r.id === badged.id));
  assert.equal(Number(db.prepare('SELECT live_music FROM venues WHERE id = ?').get(music.id).live_music || 0), 0, 'the badge is never changed');
  const review = app.renderAdminReviewPage();
  assert.match(review, /<h2>Stale weekly nights \(over 120 days\) <span class="rv-meta">\(\d+\)<\/span><\/h2>/);
  const sec = review.slice(review.indexOf('id="stalenights"'));
  assert.match(sec.slice(0, sec.indexOf('</section>')), /Nights Stale Pub[\s\S]*Trivia Tuesday \(trivia, 19:00–21:00\)/);
  const ms = review.slice(review.indexOf('id="nightsmusic"'));
  assert.match(ms.slice(0, ms.indexOf('</section>')), /Nights Music No Badge/);
  assert.doesNotMatch(ms.slice(0, ms.indexOf('</section>')), /Nights Music Badge</);
});

test('Roam Now: tonight\'s nights ride as [19] (small), the card says "Tonight: Trivia 7 PM", the "Weekly nights tonight" chip filters, and the search matches kind words', async () => {
  const v = mk({ name: 'Nights Map Pub' });
  set(v, [TRIVIA, KARAOKE, BINGO]);
  const other = mk({ name: 'Nights Map Other' });
  set(other, [{ days: ['tue'], kind: 'other', title: 'Drag bingo brunch' }, { days: ['tue'], kind: 'open_mic', title: 'Open mic night', start: '20:30' }]);
  const plain = mk({ name: 'Nights Map Plain' });
  const tue = JSON.parse(app.mapLiveData(at(TUE, '12:00')).json).p;
  const r = tue.find((p) => p[2] === 'Nights Map Pub');
  assert.equal(r.length, 20);
  assert.deepEqual(r.slice(16, 19), [0, 0, 0], 'no deals, specials or verified mark: zeros');
  assert.deepEqual(r[19], ['tue', [['bingo', '18:00', 1], ['trivia', '19:00']]], 'tonight only, by time, every other week flagged');
  assert.deepEqual(tue.find((p) => p[2] === 'Nights Map Other')[19], ['tue', [['open_mic', '20:30'], ['other', 0, 0, 'Drag bingo brunch']]]);
  assert.equal(tue.find((p) => p[2] === plain.name).length, 16, 'a place without a night tonight keeps 16 fields');
  assert.ok(JSON.stringify(r[19]).length < 60, 'one short field');
  const thu = JSON.parse(app.mapLiveData(at('2026-10-29', '12:00')).json).p.find((p) => p[2] === 'Nights Map Pub');
  assert.deepEqual(thu[19], ['thu', [['karaoke', '21:00']]]);
  // The page: the chip (quick row and panel), the format bump, the card line and the filter.
  const html = app.renderPlacesMapPage();
  assert.equal(html.split(`data-pm-feat="nights" aria-pressed="false"><span aria-hidden="true">${app.uiIcon('calendar')}</span> Weekly nights tonight</button>`).length - 1, 2);
  assert.ok(html.indexOf('data-pm-feat="nights"') < html.indexOf('data-pm-feat="patio"'), 'beside Specials today');
  assert.ok(html.includes('"nights":65536'));
  assert.ok(html.includes('if (a[19] && a[19][1]) { p.wnDay = a[19][0]; p.wn = a[19][1];'));
  assert.ok(html.includes('p.wnOn = !!(p.wn && p.wnDay === wd);'));
  assert.ok(html.includes(`if (p.wnOn) out += '<span class="pm-wn' + (feats.nights ? ' is-on' : '') + '">${app.uiIcon('calendar')} ' + esc(T.wnTonight) + ' ' + wnHtml(p) + '</span>';`));
  assert.ok(html.includes("k === 'nights' ? !p.wnOn :"));
  assert.ok(html.includes("wnTonight: 'Tonight:'") && html.includes("wnTonight: 'Ce soir :'"));
  assert.ok(html.includes("trivia: 'Trivia'") && html.includes("trivia: 'Quiz'"));
  // The card line, run with the page's own wnHtml: "Tonight: Bingo 6 PM (every other week); Trivia 7 PM".
  const wnSrc = html.match(/function wnHtml\(p\)\{[^\n]*\}/)[0];
  const T = { wn: { trivia: 'Trivia', bingo: 'Bingo', open_mic: 'Open mic' }, wnEow: 'every other week' };
  const ctx0 = { T, FR: false, esc: (s) => String(s), timeText: (t) => ({ '18:00': '6 PM', '19:00': '7 PM', '20:30': '8:30 PM' }[t]) };
  vm.runInNewContext(`${wnSrc}; this.out = wnHtml({ wn: ${JSON.stringify(r[19][1])} }); this.other = wnHtml({ wn: ${JSON.stringify(tue.find((p) => p[2] === 'Nights Map Other')[19][1])} });`, ctx0);
  assert.equal(ctx0.out, 'Bingo 6 PM (every other week); Trivia 7 PM');
  assert.equal(ctx0.other, 'Open mic 8:30 PM; Drag bingo brunch');
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  try {
    const frHtml = await fetch(`http://127.0.0.1:${srv.address().port}/fr/map`).then((x) => x.text());
    assert.ok(frHtml.includes(`data-pm-feat="nights" aria-pressed="false"><span aria-hidden="true">${app.uiIcon('calendar')}</span> Soirées ce soir</button>`));
  } finally {
    srv.closeAllConnections();
    await new Promise((resolve) => srv.close(resolve));
  }
  // The search: the page's deal matcher over tonight's kind words, run with the page's mapNameKey.
  const keySrc = html.match(/function mapNameKey\(name\)\{[^\n]*\}/)[0];
  const wnWords = html.match(/var WN_WORDS = \{[^\n]*\};/)[0];
  const dealSrc = html.slice(html.indexOf('  var DEAL_SKIP'), html.indexOf('  function matchesPlace(p){'));
  const ctx = {};
  vm.runInNewContext(`${keySrc}\n${wnWords}\nvar dealQuery = '', dealWordsFor = null, dealWords = [];\n${dealSrc}\nthis.hit = function(q, a){ var p = {}; if (a[19] && a[19][1]) p.dk = ' ' + mapNameKey(a[19][1].map(function(n){ return (WN_WORDS[n[0]] || '') + ' ' + (n[3] || ''); }).join(' ')).slice(1); dealQuery = q; return dealHit(p); };`, ctx);
  const o = tue.find((p) => p[2] === 'Nights Map Other');
  for (const q of ['trivia', 'trivia night', 'quiz', 'pub quiz', 'bingo']) assert.equal(ctx.hit(q, r), true, q);
  assert.equal(ctx.hit('karaoke', r), false, 'not on Tuesday');
  assert.equal(ctx.hit('karaoke', thu), true);
  for (const q of ['open mic', 'scène ouverte', 'drag brunch']) assert.equal(ctx.hit(q, o), true, q);
  // "open mic" is one idea (not "open now"); "weekly nights" turns the chip on.
  assert.ok(html.includes("[/open[ -]?mics?|sc[eè]nes? ouvertes?/g, ' openmic ']"));
  assert.ok(html.includes("nights: 'nights',"));
  for (const s of html.split(/<script(?![^>]*\bsrc=)(?![^>]*application\/(?:ld\+)?json)[^>]*>/).slice(1).map((x) => x.split('</script>')[0])) new vm.Script(s);
});

test('What\'s On: an "Every week" section, tonight first and open, the rest folded, linking to venue pages; French on /fr/whats-on; no new URLs', async () => {
  const a = mk({ name: 'Nights WO Pub A' });
  set(a, [TRIVIA, KARAOKE]);
  const b = mk({ name: 'Nights WO Pub B', region: 'penticton' });
  set(b, [{ ...TRIVIA, title: 'Pub quiz' }]);
  const html = app.whatsOnWeeklyNightsHtml(at(TUE, '12:00'));
  assert.match(html, /^<section class="whatson-nights" id="whatsOnNights" aria-labelledby="whatsOnNightsHeading">/);
  assert.match(html, /<span class="desc-en" lang="en">Every week<\/span><span class="desc-fr" lang="fr">Chaque semaine<\/span>/);
  const groups = [...html.matchAll(/<details class="whatson-nights-group" data-kind="([a-z_]+)"( open)?><summary>[\s\S]*?<span class="desc-en" lang="en">([^<]+)<\/span><span class="desc-fr" lang="fr">([^<]+)<\/span>/g)];
  const trivia = groups.find((g) => /^Tonight · Trivia at \d+ places$/.test(g[3]));
  assert.ok(trivia, groups.map((g) => g[3]).join(' | '));
  assert.equal(trivia[2], ' open', 'tonight starts open');
  assert.match(trivia[4], /^Ce soir · Quiz à \d+ endroits$/);
  const thu = groups.find((g) => /^Thursday · Karaoke at \d+ places?$/.test(g[3]));
  assert.ok(thu && !thu[2], 'later days start folded');
  assert.match(thu[4], /^Jeudi · Karaoké à \d+ endroits?$/);
  assert.ok(html.indexOf('Tonight · ') < html.indexOf('Thursday · '), 'tonight first');
  assert.match(html, /<a href="\/kelowna\/pubs\/nights-fixture-\d+">Nights WO Pub A<\/a> <span class="whatson-nights-meta"><span class="desc-en" lang="en">7–9 PM · Kelowna<\/span><span class="desc-fr" lang="fr">19 h–21 h · Kelowna<\/span><\/span>/);
  assert.match(html, /Nights WO Pub B<\/a> <span class="whatson-nights-meta"><span class="desc-en" lang="en">7–9 PM · Penticton · Pub quiz<\/span>/);
  // Every link is a venue page.
  for (const m of html.matchAll(/href="([^"]+)"/g)) assert.match(m[1], /^\/[a-z-]+\/(pubs|restaurants|cafes|breweries|wineries|distilleries|cocktail-lounges)\/[a-z0-9-]+$/);
  // On the page itself, after the results.
  const pg = app.renderWhatsOnPage(null, { now: at(TUE, '12:00') });
  assert.ok(pg.indexOf('id="whatsOnNights"') > pg.indexOf('id="whatsOnResultsTop"'));
  assert.doesNotMatch(app.renderWhatsOnPage(null, { now: at(TUE, '12:00'), scope: { region: 'kelowna' } }), /id="whatsOnNights"/, 'only on the main page');
  // French twin and no new URLs.
  const daily = mk({ name: 'Nights WO Daily' });
  set(daily, [{ days: WEEK, kind: 'trivia', title: 'Daily quiz', start: '19:00' }]);
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const en = await fetch(`${base}/whats-on`).then((x) => x.text());
    assert.match(en, /Tonight · Trivia at \d+ places?/);
    assert.doesNotMatch(en, /Ce soir · Quiz/, 'the English page carries English only');
    const fr = await fetch(`${base}/fr/whats-on`).then((x) => x.text());
    assert.match(fr, /Ce soir · Quiz à \d+ endroits?/);
    assert.match(fr, /Chaque semaine/);
    assert.doesNotMatch(fr, /Tonight · Trivia/);
    assert.match(fr, /href="\/fr\/kelowna\/pubs\/nights-fixture-\d+">Nights WO Daily<\/a>/);
    for (const p of ['/whats-on/weekly-nights', '/weekly-nights', '/whats-on/trivia']) assert.equal((await fetch(`${base}${p}`, { redirect: 'manual' })).status, 404, p);
  } finally {
    srv.closeAllConnections();
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('Build My Trip: an evening stop on a night says "Tonight: Trivia at 7 PM" (EN/FR); daytime and other days do not; the plan is unchanged', () => {
  const v = mk({ name: 'Nights Trip Pub' });
  set(v, [TRIVIA]);
  const plan = {
    kind: 'itinerary',
    schedule: [{ day: 1, date: TUE, venueId: v.id, startMinutes: 720 }, { day: 1, date: TUE, venueId: v.id, startMinutes: 1080 }, { day: 2, date: WED, venueId: v.id, startMinutes: 1080 }],
    days: [{ day: 1, stops: [{ day: 1, venue: { id: v.id } }] }, { day: 2, stops: [{ day: 2, venue: { id: v.id } }] }],
  };
  const before = JSON.stringify(plan.days.map((d) => d.stops.map((s) => s.venue.id)));
  const out = app.withTripWeeklyNights(plan, at(TUE, '09:00'));
  const s = out.days[0].stops[0];
  assert.equal(s.nightLine, 'Tonight: Trivia 7–9 PM'); // audit fix (2026-10-27): a range reads without "at"
  assert.equal(s.nightLineFr, 'Ce soir : Quiz 19 h–21 h');
  assert.equal(s.nightLineFrLang, undefined);
  assert.equal(out.days[1].stops[0].nightLine, undefined, 'Wednesday has none');
  assert.equal(JSON.stringify(out.days.map((d) => d.stops.map((x) => x.venue.id))), before, 'order unchanged');
  // A lunch stop only: nothing. After the night is over: nothing.
  const lunch = app.withTripWeeklyNights({ schedule: [{ day: 1, date: TUE, venueId: v.id, startMinutes: 720 }], days: [{ day: 1, stops: [{ venue: { id: v.id } }] }] }, at(TUE, '09:00'));
  assert.equal(lunch.days[0].stops[0].nightLine, undefined);
  const late = app.withTripWeeklyNights({ schedule: [{ day: 1, date: TUE, venueId: v.id, startMinutes: 1290 }], days: [{ day: 1, stops: [{ venue: { id: v.id } }] }] }, at(TUE, '09:00'));
  assert.equal(late.days[0].stops[0].nightLine, undefined);
  // Monthly: only on its week.
  const m = mk({ name: 'Nights Trip Monthly' });
  set(m, [{ ...KARAOKE, days: ['tue'], frequency: 'monthly-1st' }]);
  const t = (date) => app.withTripWeeklyNights({ schedule: [{ day: 1, date, venueId: m.id, startMinutes: 1200 }], days: [{ day: 1, stops: [{ venue: { id: m.id } }] }] }, at(TUE, '09:00')).days[0].stops[0].nightLine;
  assert.equal(t('2026-11-03'), 'Tue Nov 3: Karaoke at 9 PM', 'audit fix (2026-10-27): a week ahead is named by its date, never "Tonight"');
  assert.equal(t('2026-11-10'), undefined);
  // The planner page prints it; the trip API adds it after planning; the planner never reads it.
  const v3 = fs.readFileSync(path.join(__dirname, '..', 'trip-planner-v3-page.js'), 'utf8');
  assert.ok(v3.includes(`(stop.nightLine ? '<p class="t3-wn">' + (lang() === 'fr' && stop.nightsFr ? esc(stop.nightLineLabelFr || 'Ce soir') + ' : <span' + (stop.nightLineFrLang ? ' lang="en"' : '') + '>' + esc(stop.nightsFr) + '</span>' : esc(stop.nightLine)) + '</p>' : '')`));
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(src.includes('withTripWeeklyNights(withTripSpecials(withTripFrenchUrls(withTripHappyHourDeals(runTripPlan(parsed.value)))))'));
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'trip-planner.js'), 'utf8'), /venue_weekly_nights|withTripWeeklyNights/, 'ranking unchanged');
});

test('Owner portal: a Weekly nights editor; a signed-in save goes live (venue_owner, today) with an audit row and Undo; other types get none', async () => {
  const v = mk({ name: 'Nights Owner Portal Pub' });
  const researched = set(v, [{ ...TRIVIA, frequency: 'monthly-2nd-4th' }], { checked_at: daysAgo(30) });
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  let ip = 1;
  const post = (p, body, cookie) => fetch(`${base}${p}`, { method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.92.0.${ip++ % 250}`, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, cookie: (r.headers.get('set-cookie') || '').split(';')[0], body: await r.json().catch(() => ({})) }));
  const get = (p, cookie) => fetch(`${base}${p}`, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} }).then((r) => r.text());
  try {
    const token = app.createOwnerLink(v.id, {}).url.split('/owner/')[1];
    const made = await post(`/owner/${token}/account`, { email: 'nights-owner@example.com', password: 'a long enough password' });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const cookie = made.cookie;
    const pg = await get(`/owner/account/venue/${v.id}`, cookie);
    assert.match(pg, /id="opNightsLabel">Weekly nights</);
    assert.equal((pg.match(/<fieldset class="op-sp op-wn" data-wn="\d"/g) || []).length, 7, 'seven boxes, the unused ones hidden');
    assert.match(pg, /<input type="checkbox" class="op-wn-d" value="tue" checked> Tue<\/label>/);
    assert.match(pg, /class="op-wn-title" maxlength="40" value="Trivia Tuesday" aria-label="Night 1: name"/);
    assert.match(pg, /<option value="trivia" selected>Trivia<\/option>/);
    assert.match(pg, /<option value="monthly-2nd-4th" selected>2nd &amp; 4th of the month<\/option>/);
    for (const s of pg.split(/<script(?![^>]*\bsrc=)(?![^>]*application\/(?:ld\+)?json)[^>]*>/).slice(1).map((x) => x.split('</script>')[0])) new vm.Script(s);
    const frPage = await get(`/fr/owner/account/venue/${v.id}`, cookie);
    assert.match(frPage, /id="opNightsLabel">Soirées de la semaine</);
    assert.match(frPage, /<option value="trivia" selected>Quiz<\/option>/);
    const send = (weekly_nights) => post(`/owner/account/venue/${v.id}/changes`, { changes: { weekly_nights }, started_at: Date.now() - 10000 }, cookie);
    const bad = await send([{ ...TRIVIA, detail: 'See thepub.ca' }]);
    assert.equal(bad.status, 400);
    assert.match(bad.body.errors.weekly_nights, /links, email addresses, phone numbers and emoji/);
    assert.match((await send([{ ...TRIVIA, days: [] }])).body.errors.weekly_nights, /at least one day/);
    assert.match((await send(Array.from({ length: 8 }, () => TRIVIA))).body.errors.weekly_nights, /up to 7 weekly nights/);
    assert.match((await send([{ ...TRIVIA, start: null, end: '21:00' }])).body.errors.weekly_nights, /check the night’s times/);
    assert.match((await send([{ ...TRIVIA, source: 'venue_owner' }])).body.errors.weekly_nights, /could not be read/, 'owners never send a source');
    const next = [{ ...KARAOKE, title_fr: 'Karaoké du jeudi' }, { ...BINGO }];
    const r = await send(next);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.deepEqual(r.body.live, ['weekly_nights']);
    const rows = app.venueWeeklyNightsList(v.id);
    assert.deepEqual(rows.map((s) => [s.title, s.source, s.checked_at, s.frequency]), [['Karaoke Thursday', 'venue_owner', today, 'weekly'], ['Bingo night', 'venue_owner', today, 'biweekly']]);
    assert.match(card(page(v, at(TUE, '12:00'))), /Confirmed by Nights Owner Portal Pub/);
    const logged = db.prepare("SELECT field_name, source, reviewed_by FROM venue_enrichment_log WHERE venue_id = ? AND field_name = 'weekly_nights' ORDER BY id DESC LIMIT 1").get(v.id);
    assert.deepEqual({ ...logged }, { field_name: 'weekly_nights', source: 'venue_owner', reviewed_by: 'owner:nights-owner@example.com' });
    assert.equal((await send(next)).status, 400, 'nothing changed');
    // /admin/review lists the live change with the field's name; Undo puts back the researched night exactly.
    const audit = app.recentInstantOwnerChanges().find((x) => x.venue_id === v.id);
    assert.ok(audit && 'weekly_nights' in audit.changes);
    const review = app.renderAdminReviewPage();
    assert.match(review, new RegExp(`data-kind="change" data-id="${audit.id}"[\\s\\S]*?<th>Weekly nights</th><td class="rv-old">Tue: Trivia Tuesday \\(trivia, 19:00–21:00, monthly-2nd-4th\\)`));
    const u = app.undoOwnerInstantChange(audit.id, 'dayton');
    assert.equal(u.ok, true, JSON.stringify(u));
    assert.deepEqual(u.restored, ['weekly_nights']);
    assert.equal(app.currentWeeklyNightsJson(v.id), researched.nights, 'exactly the researched list again');
    const clear = await send(null);
    assert.equal(clear.status, 201, JSON.stringify(clear.body));
    assert.equal(app.currentWeeklyNightsJson(v.id), null);
    // An edit link alone waits for review; approving applies it as the owner's.
    const viaLink = await post(`/owner/${token}/changes`, { changes: { weekly_nights: [TRIVIA] }, started_at: Date.now() - 10000 });
    assert.equal(viaLink.status, 201, JSON.stringify(viaLink.body));
    assert.deepEqual(viaLink.body.review, ['weekly_nights']);
    assert.equal(app.approveOwnerChange(app.pendingOwnerChange(v.id).id, 'dayton').ok, true);
    assert.deepEqual(app.venueWeeklyNightsList(v.id).map((s) => [s.title, s.source]), [['Trivia Tuesday', 'venue_owner']]);
    // Other types: no editor, and a save is refused.
    const golf = mk({ name: 'Nights Owner Golf', type: 'golf' });
    assert.match(app.validateOwnerChanges(app.getVenue(golf.id), null, { changes: { weekly_nights: [TRIVIA] } }).errors.weekly_nights, /Weekly nights are listed for restaurants/);
    const cafe = mk({ name: 'Nights Owner Cafe', type: 'cafe' });
    assert.deepEqual(Object.keys(app.validateOwnerChanges(app.getVenue(cafe.id), null, { changes: { weekly_nights: [{ ...TRIVIA, kind: 'open_mic' }] } }).changes), ['weekly_nights']);
  } finally {
    srv.closeAllConnections();
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('Owner help bot: "How do I add my trivia or karaoke night?" in English and French', () => {
  const cfg = JSON.parse(app.ownerHelpWidgetHtml('edit', { signedIn: true }).match(/id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
  const t = cfg.topics.find((x) => x.id === 'weekly-nights');
  assert.ok(t, 'the topic is there');
  assert.equal(t.q, 'How do I add my trivia or karaoke night?');
  assert.equal(t.qFr, 'Comment ajouter ma soirée quiz ou karaoké?');
  assert.match(JSON.stringify(t), /Weekly nights/);
  assert.match(JSON.stringify(t), /Soirées de la semaine/);
  for (const lang of ['en', 'fr']) {
    const html = app.ownerHelpWidgetHtml('edit', { lang, signedIn: true });
    const c = JSON.parse(html.match(/<script type="application\/json" id="ohbCfg">([\s\S]*?)<\/script>/)[1]);
    const ctx = { T: c.topics, cfg: c };
    vm.runInNewContext(`${html.slice(html.indexOf('function norm(s)'), html.indexOf('function ask(q)'))}; this.best = best;`, ctx);
    for (const q of ['How do I add my trivia or karaoke night?', 'trivia night', 'add our karaoke', 'open mic night', 'pub quiz', 'bingo night', 'run club', 'Comment ajouter ma soirée quiz ou karaoké?', 'soirée karaoké']) assert.equal(ctx.best(q).id, 'weekly-nights', `${lang}: ${q}`);
    // The other topics keep their questions.
    assert.equal(ctx.best('How do I add an event?').id, 'event-add', `${lang}: event`);
    assert.equal(ctx.best('Add a repeating or weekly event').id, 'event-repeat', `${lang}: repeating event`);
    assert.equal(ctx.best('How do I add my weekly specials?').id, 'specials');
    assert.equal(ctx.best('How do I add my happy hour deals?').id, 'hh-deals');
  }
});
