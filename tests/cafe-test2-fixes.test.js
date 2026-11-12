// Second first-time café test fixes (Dayton, Nov 11 2026: "yes, fix them all in one PR";
// drafts/fresh-eyes-cafe2-2026-11-11/REPORT.md). The tester played Raj, a seasonal gelato shop in Penticton: open Apr 25
// to Oct 12 every year, 12–8 in spring and fall, 11–10 in summer (Jun 21 – Sep 1). The setup and the hours code are
// shared, so restaurants and pubs are checked too, and old month-only seasons and dated closures read as before.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'cafe-test2-admin';
delete process.env.AVG_SPEND_PUBLIC;
delete process.env.BADGE_REMINDERS;
delete process.env.BREVO_API_KEY;
const app = require('../server.js');
const db = require('../db.js');
const hours = require('../hours.js');
const pc = require('../portal-completeness.js');
const TEXT = require('../owner-setup-text.js');
app.setVenueSubmissionTransport(async () => {});

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const week = (a, b) => JSON.stringify(Object.fromEntries(DAYS.map((d) => [d, [[a, b]]])));
const weekObj = (a, b) => Object.fromEntries(DAYS.map((d) => [d, [[a, b]]]));
let n = 0;
const mk = (type, o = {}) => app.createVenue({ name: `CT2 ${type} ${++n}`, slug: `ct2-${type}-${n}`, region: 'penticton', type, latitude: 49.49 + n / 1000, longitude: -119.59,
  rating: 4.6, address: `${n} Lakeshore Dr, Penticton`, phone: '250-555-0199', website: 'https://example.com', hours: week('12:00', '20:00'),
  description: 'A fixture used only by the café test 2 fixes tests.', ...o });
const tokens = new Map();
const tokenFor = (id) => { if (!tokens.has(id)) tokens.set(id, app.createOwnerLink(id, {}).url.split('/owner/')[1]); return tokens.get(id); };
let ipN = 0;
let srv, base;
test.before(async () => { srv = http.createServer(app.server.listeners('request')[0]); await new Promise((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv && srv.close());
const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, 'X-Real-IP': `10.72.${Math.floor(++ipN / 250)}.${ipN % 250 + 1}` }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const change = (t, changes) => post(`/owner/${t}/changes?from=setup`, { changes, from_setup: true, note: '', contact_name: '', contact_email: '', company_website: '', started_at: Date.now() - 5000 });
const ok = (r) => assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
const cfgOf = (html) => JSON.parse(/window\.SETUP_CFG = (\{.*?\});<\/script>/s.exec(html)[1]);
const page = (v, lang, now) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang, now });
const setupOf = async (v, lang) => { const r = await get(`${lang === 'fr' ? '/fr' : ''}/owner/${tokenFor(v.id)}/setup`); assert.equal(r.status, 200); return r.text; };
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&middot;/g, '·').replace(/&ndash;/g, '–').replace(/\s+/g, ' ');
// Pacific wall-clock times (PDT until Nov 1 2026 / from Mar 14 2027, PST between).
const at = (local) => { const d = new Date(`${local}:00-07:00`); const pst = new Date(`${local}:00-08:00`); const m = Number(local.slice(5, 7)), day = Number(local.slice(8, 10));
  const winter = m < 3 || m > 11 || (m === 11 && day >= 1) || (m === 3 && day < 14); return winter ? pst : d; };

// Raj's shop as the new Hours answer saves it: open Apr 25 – Oct 12 every year, 12–8, summer 11–10.
async function raj() {
  const v = mk('cafe', { name: `Sunny Scoops Gelato ${++n}` });
  ok(await change(tokenFor(v.id), { hours: weekObj('12:00', '20:00'), hours_checked: true }));
  ok(await change(tokenFor(v.id), { open_months: '04-25:10-12' }));
  ok(await change(tokenFor(v.id), { hours_seasons: [{ from: '06-21', to: '09-01', label: 'Summer hours', hours: weekObj('11:00', '22:00') }] }));
  return v;
}
const statusAt = (v, local) => {
  const now = at(local);
  const st = app.getSeasonStates(now).get(v.id) || null;
  const line = app.blockedStatusLine(v.id, '', st, app.todayLocal(now));
  const html = page(v, 'en', now);
  const live = hours.hoursStatusLabel(hours.statusAt(hours.parseHours(app.hoursWithExtras(app.getVenue(v.id), now)), app.okanaganClock(now)), app.okanaganClock(now));
  return { st, line: line && line.text, html, txt: text(html), live: live.text };
};

// ---------- 1: "We're closed part of the year" ----------
test('1: Raj (open Apr 25 – Oct 12, summer 11–10): status on every date the report checked', async () => {
  const v = await raj();
  let s = statusAt(v, '2026-11-11T12:00');
  assert.equal(s.st.kind, 'closed');
  assert.equal(s.line, 'Closed for the season · Reopens Apr 25, 2027');
  assert.match(s.txt, /Closed for the season\. Reopens April 25, 2027/);
  assert.ok(!/Open now/.test(s.txt));
  s = statusAt(v, '2027-04-20T12:00');
  assert.equal(s.st.kind, 'closed', 'Apr 20 is before the season');
  assert.equal(s.line, 'Closed for the season · Reopens Apr 25');
  s = statusAt(v, '2027-04-25T12:00');
  assert.ok(!s.st || s.st.kind !== 'closed', 'open on the first day');
  assert.match(s.txt, /Open now · Closes 8 PM/);
  s = statusAt(v, '2027-05-01T20:30');
  assert.match(s.txt, /Closed · Opens tomorrow 12 PM/);
  for (const y of ['2026', '2027']) {
    s = statusAt(v, `${y}-07-15T21:30`);
    assert.match(s.txt, /Open now · Closes 10 PM/, `Jul 15 ${y}: summer hours`);
  }
  s = statusAt(v, '2026-10-12T19:00');
  assert.equal(s.st.kind, 'open_until');
  assert.match(s.txt, /Open now · Closes 8 PM/);
  assert.match(s.txt, /Open for the season until October 12/);
  s = statusAt(v, '2026-10-12T20:30');
  assert.equal(s.st.kind, 'closed', 'after the last opening on Oct 12: closed for the season');
  s = statusAt(v, '2026-10-20T12:00');
  assert.equal(s.st.kind, 'closed', 'Oct 20 is after the season');
  assert.equal(s.line, 'Closed for the season · Reopens Apr 25, 2027');
  assert.ok(!/Open now/.test(s.txt));
  // The page says the season in days, EN + FR.
  assert.match(text(page(v, 'en', at('2026-07-15T12:00'))), /Open April 25 – October 12 each year/);
  assert.match(text(page(v, 'fr', at('2026-07-15T12:00'))), /Ouvert du 25 avril au 12 octobre chaque année/);
  // Build My Trip: closed on a trip date out of season, open in season.
  const facts = app.buildTripPlannerFacts ? app.buildTripPlannerFacts(false, '2026-10-20') : null;
  if (facts) { const f = facts.find((x) => x.id === v.id); if (f) assert.equal(f.openMonths, '04-25:10-12'); }
});

// The month-only rule exactly as it was (origin/main, 6597dc9b), to prove old "4-10" seasons read the same.
function oldRecurringSeasonRow(venueId, openMonths, today) {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(openMonths || ''));
  if (!m) return null;
  const from = Number(m[1]), to = Number(m[2]);
  const y = Number(today.slice(0, 4)), mon = Number(today.slice(5, 7));
  const iso = (yy, mm, dd) => new Date(Date.UTC(yy, mm - 1, dd)).toISOString().slice(0, 10);
  const inSeason = from <= to ? mon >= from && mon <= to : mon >= from || mon <= to;
  if (inSeason) {
    const endYear = from <= to || mon <= to ? y : y + 1;
    const until = iso(endYear, to + 1, 0);
    return app.addLocalDays(today, 30) >= until ? { venue_id: venueId, status: 'open_until', until_date: until, reopens_date: null, source_url: null, checked_at: today } : null;
  }
  const openYear = mon < from ? y : y + 1;
  const closedFrom = mon > to ? iso(y, to + 1, 1) : iso(y - 1, to + 1, 1);
  return { venue_id: venueId, status: 'closed', until_date: null, reopens_date: iso(openYear, from, 1), source_url: null, checked_at: closedFrom };
}
test('1: old month-only seasons give exactly the rows they always gave, every day of 2027 and 2028', () => {
  for (const om of ['4-10', '5-10', '11-4', '6-9', '1-12', '12-2', '2-11', '3-3']) {
    for (let t = Date.UTC(2027, 0, 1); t < Date.UTC(2029, 0, 1); t += 86400000) {
      const d = new Date(t).toISOString().slice(0, 10);
      assert.deepEqual(app.recurringSeasonRow(7, om, d), oldRecurringSeasonRow(7, om, d), `${om} on ${d}`);
    }
  }
  assert.equal(app.openMonthsText('5-10'), 'May – October');
  assert.equal(app.openMonthsText('5-10', 'fr'), 'mai à octobre');
  assert.equal(app.openMonthsText('04-25:10-12'), 'April 25 – October 12');
  assert.equal(app.openMonthsText('04-01:10-12', 'fr'), '1er avril au 12 octobre');
  assert.deepEqual(hours.parseOpenSeason('4-10'), { from: '04-01', to: '10-31', months: [4, 10], exact: false });
  assert.equal(hours.parseOpenSeason('04-25:04-25'), null);
  assert.equal(hours.parseOpenSeason('13-01:10-12'), null);
});
test('1: an exact season can be saved, read back, and goes back to months; bad values are refused', async () => {
  const v = mk('restaurant');
  ok(await change(tokenFor(v.id), { open_months: '05-15:09-30' }));
  assert.equal(app.venueLinks(v.id).open_months, '05-15:09-30');
  ok(await change(tokenFor(v.id), { open_months: '5-9' }));
  assert.equal(app.venueLinks(v.id).open_months, '5-9');
  for (const bad of ['05-15:05-15', '02-30:09-30', '5-5', 'May-Sep']) {
    const r = await change(tokenFor(v.id), { open_months: bad });
    assert.ok(r.status >= 400, bad);
  }
  // A winter business (wraps New Year).
  const w = mk('pub');
  ok(await change(tokenFor(w.id), { open_months: '11-20:04-05' }));
  assert.equal(app.getSeasonStates(at('2027-01-10T12:00')).get(w.id), undefined, 'open in January');
  assert.equal(app.getSeasonStates(at('2027-06-10T12:00')).get(w.id).reopens, '2027-11-20');
});
test('1: old data (months Apr–Oct + an Apr 1–24 closure) reopens Apr 25, not Apr 1: contiguous closures chain', async () => {
  const v = mk('cafe');
  ok(await change(tokenFor(v.id), { open_months: '4-10' }));
  ok(await change(tokenFor(v.id), { closures: [{ from: '2027-04-01', to: '2027-04-24', note: '' }, { from: '2028-04-01', to: '2028-04-24', note: '' }] }));
  const st = app.getSeasonStates(at('2026-11-11T12:00')).get(v.id);
  assert.equal(st.kind, 'closed');
  assert.equal(st.reopens, '2027-04-25');
  assert.match(st.text, /Reopens April 25, 2027/);
  assert.equal(app.blockedStatusLine(v.id, '', st, '2026-11-11').text, 'Closed for the season · Reopens Apr 25, 2027');
  // Chaining steps over back-to-back closures, and leaves a gap alone.
  assert.equal(app.chainReopening('2027-04-01', [{ from: '2027-04-01', to: '2027-04-10' }, { from: '2027-04-11', to: '2027-04-24' }]), '2027-04-25');
  assert.equal(app.chainReopening('2027-04-01', [{ from: '2027-04-02', to: '2027-04-10' }]), '2027-04-01');
  // Without a closure the old date stands.
  const plain = mk('cafe');
  ok(await change(tokenFor(plain.id), { open_months: '4-10' }));
  assert.equal(app.getSeasonStates(at('2026-11-11T12:00')).get(plain.id).reopens, '2027-04-01');
});

// ---------- 2: season hours always shown ----------
test('2: the hours box lists every part of the year, closed for the season (November) and in season (July); EN + FR', async () => {
  const v = await raj();
  for (const when of ['2026-11-11T12:00', '2027-07-15T12:00']) {
    const t = text(page(v, 'en', at(when)));
    assert.match(t, /Hours through the year Apr 25 – Jun 20 and Sep 2 – Oct 12 Daily 12 PM – 8 PM Jun 21 – Sep 1 Daily 11 AM – 10 PM/, when);
    const f = text(page(v, 'fr', at(when)));
    assert.match(f, /Heures selon la saison 25 avr\.? – 20 juin et 2 sept\.? – 12 oct\.? Tous les jours/, when);
  }
  assert.match(text(page(v, 'en', at('2026-11-11T12:00'))), /Closed for the season/);
  // A place with only summer hours (no closed season): the rest of the year and summer.
  const r = mk('restaurant');
  ok(await change(tokenFor(r.id), { hours_seasons: [{ from: '06-01', to: '08-31', label: 'Summer hours', hours: weekObj('10:00', '23:00') }] }));
  assert.match(text(page(r, 'en', at('2026-11-11T12:00'))), /Hours through the year Sep 1 – May 31 Daily 12 PM – 8 PM Jun 1 – Aug 31 Daily 10 AM – 11 PM/);
  // A place with neither gets nothing new.
  const p = mk('pub');
  assert.ok(!/Hours through the year/.test(page(p, 'en', at('2026-11-11T12:00'))));
  // Closed for the season with no seasonal set: the open season with its hours.
  const m = mk('cafe');
  ok(await change(tokenFor(m.id), { open_months: '5-9' }));
  assert.match(text(page(m, 'en', at('2026-11-11T12:00'))), /Hours through the year May 1 – Sep 30 Daily 12 PM – 8 PM/);
});

// ---------- 3: yearly closures ----------
test('3: "Every year" closures are one yearly rule, expanded for Open Now and the notices; old dated rows read the same', async () => {
  const v = mk('cafe');
  ok(await change(tokenFor(v.id), { closures: [{ from: '04-01', to: '04-24', note: 'Getting ready', yearly: true }, { from: '2026-12-25', to: '2026-12-25', note: 'Christmas' }] }));
  const row = JSON.parse(db.prepare('SELECT closures FROM venue_hours_extra WHERE venue_id = ?').get(v.id).closures);
  assert.deepEqual(row, [{ from: '04-01', to: '04-24', note: 'Getting ready', yearly: true }, { from: '2026-12-25', to: '2026-12-25', note: 'Christmas' }].sort((a, b) => a.from.localeCompare(b.from)));
  // Closed on Apr 10 in 2027 and 2028; open Apr 25.
  for (const y of ['2027', '2028']) {
    const now = at(`${y}-04-10T13:00`);
    const s = hours.statusAt(hours.parseHours(app.hoursWithExtras(app.getVenue(v.id), now)), app.okanaganClock(now));
    assert.equal(s.state, 'closed', y);
    assert.equal(s.closedNote, 'Getting ready');
  }
  const open = at('2027-04-25T13:00');
  assert.equal(hours.statusAt(hours.parseHours(app.hoursWithExtras(app.getVenue(v.id), open)), app.okanaganClock(open)).state, 'open');
  // The notice: "Closed Apr 1–24, reopens Apr 25."
  assert.match(app.getSeasonStates(at('2027-04-05T12:00')).get(v.id).text, /Closed Apr 1–24, reopens Apr 25/);
  // The owner's own screens get the rule as one row (and never drop it as "over").
  assert.deepEqual(app.ownerClosuresKept(v.id, '2027-06-01').map((c) => c.from), ['04-01']);
  const cfg = cfgOf(await setupOf(v));
  assert.ok(cfg.cur.closures.some((c) => c.yearly && c.from === '04-01' && c.to === '04-24'));
  // Wraps New Year.
  assert.deepEqual(hours.expandYearlyClosures([{ from: '12-24', to: '01-02', note: '', yearly: true }], 2026, 2026), [{ from: '2026-12-24', to: '2027-01-02', note: '', yearly: true }]);
  // Bad yearly rows are refused.
  const bad = await change(tokenFor(v.id), { closures: [{ from: '02-30', to: '03-01', yearly: true }] });
  assert.ok(bad.status >= 400);
  // Old dated rows: unchanged in storage and reading.
  const d = mk('restaurant');
  ok(await change(tokenFor(d.id), { closures: [{ from: '2027-01-05', to: '2027-01-18', note: '' }] }));
  assert.deepEqual(JSON.parse(db.prepare('SELECT closures FROM venue_hours_extra WHERE venue_id = ?').get(d.id).closures), [{ from: '2027-01-05', to: '2027-01-18', note: '' }]);
  assert.deepEqual(app.venueHoursExtras(d.id).closures, [{ from: '2027-01-05', to: '2027-01-18', note: '' }]);
});

// ---------- 5: seasonal specials and happy hours don't go stale between seasons ----------
test('5: a summer-only special confirmed in November 2026 shows all summer 2027; a year-round one still goes stale', async () => {
  const S = (from, to, checked) => ({ season_from: from, season_to: to, checked_at: checked });
  // Jul–Aug special checked Nov 11 2026.
  const sum = S('07-01', '08-31', '2026-11-11');
  assert.equal(app.specialsStale(sum.checked_at, at('2027-07-15T12:00'), sum), false, 'Jul 15 2027: still fresh');
  assert.equal(app.specialsStale(sum.checked_at, at('2027-08-31T12:00'), sum), false, 'end of summer 2027');
  assert.equal(app.specialsStale(sum.checked_at, at('2028-07-15T12:00'), sum), true, 'summer 2028: re-confirm');
  // Checked in season (Jul 15 2026): fresh through summer 2027.
  const mid = S('07-01', '08-31', '2026-07-15');
  assert.equal(app.specialsStale(mid.checked_at, at('2026-08-31T12:00'), mid), false);
  assert.equal(app.specialsStale(mid.checked_at, at('2027-07-15T12:00'), mid), false);
  // No season: the plain 120-day rule.
  assert.equal(app.specialsStale('2026-11-11', at('2027-03-11T12:00')), false);
  assert.equal(app.specialsStale('2026-11-11', at('2027-07-15T12:00')), true);
  assert.equal(app.specialsStale('2026-11-11', at('2027-07-15T12:00'), { season_from: null, season_to: null }), true);
  // Nights and happy hour deals follow the same rule.
  assert.equal(app.nightsStale('2026-11-11', at('2027-07-15T12:00'), sum), false);
  assert.equal(app.happyHourDealsStale('2026-11-11', at('2027-07-15T12:00'), { from: '07-01', to: '08-31' }), false);
  assert.equal(app.happyHourDealsStale('2026-11-11', at('2027-07-15T12:00')), true);
  // A winter season (wraps New Year), confirmed in May: still shown next January.
  assert.equal(app.specialsStale('2027-05-01', at('2028-01-15T12:00'), S('11-15', '03-31')), false);
});

test('5: end to end: Raj\'s Tuesday kids\' cones (Jul–Aug), confirmed Nov 11 2026, show on Jul 15 2026-style dates in 2027 too', async () => {
  const v = await raj();
  ok(await change(tokenFor(v.id), { specials: [{ days: ['tue'], title: 'Kids’ cones', deal: '$2 kids’ cones', price: null, kind: 'food', start: null, end: null, title_fr: null, deal_fr: null, season_from: '07-01', season_to: '08-31' }] }));
  // Stored as checked today (the test date); move it to Nov 11 2026 like the report.
  db.prepare("UPDATE venue_specials SET checked_at = '2026-11-11' WHERE venue_id = ?").run(v.id);
  const shown = (local) => { const now = at(local); const venue = app.getVenue(v.id); const sp = app.venueSpecials(venue, app.hoursWithExtras(venue, now), false, now); return sp ? sp.rows.map((r) => r.s.title) : []; };
  assert.deepEqual(shown('2026-11-11T12:00'), [], 'November: closed for the season, and out of season');
  assert.deepEqual(shown('2027-07-13T12:00'), ['Kids’ cones'], 'Tue Jul 13 2027: shown');
  assert.deepEqual(shown('2028-07-11T12:00'), [], 'summer 2028: stale until re-confirmed');
});

// ---------- 4: month + day pickers that repeat every year ----------
test('4: the season pickers are month + day (no year, never a past year) and say the dates repeat every year; EN + FR', async () => {
  const v = mk('cafe');
  for (const lang of ['en', 'fr']) {
    const html = await setupOf(v, lang);
    const s = /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];
    assert.ok(!/type="date" id="sxf/.test(s), 'no date input for the season');
    assert.match(s, /function mdPick\(id, md, label\)/);
    assert.match(s, /h\(T\.repeatsYearly\)/);
    const cfg = cfgOf(html);
    assert.equal(cfg.monthLong.length, 12);
    assert.ok(cfg.t.repeatsYearly && cfg.t.mdMonth && cfg.t.mdDay);
  }
  assert.equal(TEXT.en.repeatsYearly, 'These dates repeat every year. No need to pick a year.');
  assert.match(TEXT.fr.repeatsYearly, /chaque année/);
});
test('1 + 3: the Hours step asks "We\'re closed part of the year" for every type; the closures screen points to it; words in EN + FR', async () => {
  for (const type of ['cafe', 'restaurant', 'pub']) {
    const s = /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(await setupOf(mk(type)))[1];
    assert.match(s, /big\('🗓️', T\.allYearClosed, T\.allYearClosedSub, true, 'yearClosed'\)/, type);
    assert.match(s, /\} else if \(s === 'hours:open'\) \{/);
    assert.match(s, /data-act="openEdit">' \+ h\(T\.partYearBtn\)/, 'closures links to the one season answer');
    // The closures save never writes the season (one place for it).
    const save = s.slice(s.indexOf("if (k === 'closuresNone' || k === 'closuresSave')"), s.indexOf("if (k === 'closureAdd')"));
    assert.ok(!/open_months: om/.test(save));
  }
  for (const k of ['allYearClosed', 'allYearClosedSub', 'openQ', 'openLead', 'openFrom', 'openTo', 'openSame', 'openSummer', 'openSaveOnly', 'openMonthsLink', 'openNeed', 'openSameDay', 'openNow', 'openChange', 'partYearBtn', 'everyYearRow', 'yearlyTooLong', 'mdMonth', 'mdDay']) {
    assert.ok(TEXT.en[k] && TEXT.fr[k], k);
  }
  // A café's season answer also says "seasonal" on its checklist.
  const v = mk('cafe');
  ok(await change(tokenFor(v.id), { open_months: '04-25:10-12' }));
  ok(await change(tokenFor(v.id), { cafe_info: { year: 'seasonal' } }));
  const cfg = cfgOf(await setupOf(v));
  assert.equal(cfg.cur.open_months, '04-25:10-12');
  assert.ok(!cfg.progress.score.left.some((x) => x.k === 'season'));
});
test('1: the edit page shows an exact season with its days, and saves whole months the old way', async () => {
  const v = mk('cafe');
  ok(await change(tokenFor(v.id), { open_months: '04-25:10-12' }));
  const html = (await get(`/owner/${tokenFor(v.id)}`)).text;
  assert.match(html, /<select id="opSeasonFromD"[^>]*>[\s\S]*?<option value="25" selected>25<\/option>/);
  assert.match(html, /<select id="opSeasonToD"[^>]*>[\s\S]*?<option value="12" selected>12<\/option>/);
  assert.match(html, /fd === 1 && \(td === last\[tm - 1\]/);
  // Yearly closures show as one row there too.
  ok(await change(tokenFor(v.id), { closures: [{ from: '04-01', to: '04-24', note: '', yearly: true }] }));
  const h2 = (await get(`/owner/${tokenFor(v.id)}`)).text;
  assert.match(h2, /data-yfrom="04-01" data-yto="04-24"/);
  assert.match(h2, /<strong>Every year:<\/strong> Apr 1 – Apr 24/);
});

// ---------- 6: café words by kind ----------
test('6: café words by kind: photos, story, serves, dietary, dog treats, no-Wi-Fi line, takeout tile, no washroom, coffee tile', async () => {
  const kinds = ['Coffee shop', 'Bakery', 'Bakery café', 'Roastery', 'Tea house', 'Bubble tea', 'Ice cream & gelato', 'Dessert & sweets', 'Brunch café', 'Juice & smoothie bar', 'Deli & sandwiches'];
  for (const L of ['en', 'fr']) for (const k of kinds) assert.ok(TEXT[L].cafe.cafeKinds[k] && TEXT[L].cafe.cafeKinds[k].photos && TEXT[L].cafe.cafeKinds[k].story, `${L} ${k}`);
  assert.equal(TEXT.en.cafe.cafeKinds['Ice cream & gelato'].photos, 'Your shop front, your gelato case, a cone. Three photos is perfect.');
  const v = mk('cafe'); ok(await change(tokenFor(v.id), { place_type: 'Ice cream & gelato' }));
  const html = await setupOf(v); const cfg = cfgOf(html); const s = /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(html)[1];
  for (const k of ['sorbet', 'milkshakes', 'cones', 'affogato', 'made_here', 'baked_here']) assert.ok(cfg.serves.some((x) => x.k === k), k);
  assert.match(s, /'Ice cream & gelato': 'ice_cream'/, 'the matching chip is pre-ticked as a suggestion');
  assert.match(s, /\} else if \(s === 'diet' && iceKind\(\)\) \{/);
  assert.equal(cfg.offerLabels.dog_treats, 'Dog treats (e.g. a puppuccino or pup cup)');
  assert.match(s, /data-off="takeout_only"/); assert.match(s, /data-off="no_washroom"/);
  assert.ok(!cfg.steps.includes('coffee') || /syncCoffee\(\)/.test(s));
  // The gelato dietary answers save and show (EN + FR).
  ok(await change(tokenFor(v.id), { cafe_info: { diet: { df_sorbet: true, vegan_ice: true, gf_cones: 'cups', nut_free: true } } }));
  assert.match(page(v, 'en'), /Dairy-free sorbet · vegan gelato or ice cream · gluten-free in a cup \(cones have gluten\) · nut-free options/);
  assert.match(page(v, 'fr'), /Sorbet sans produits laitiers/);
  assert.ok((await change(tokenFor(v.id), { cafe_info: { diet: { gf_cones: 'waffles' } } })).status >= 400);
  // Serves: the new chips save and show.
  ok(await change(tokenFor(v.id), { cafe_info: { serves: ['ice_cream', 'sorbet', 'milkshakes', 'cones', 'affogato', 'made_here'] } }));
  assert.match(page(v, 'en'), /Ice cream &amp; gelato, sorbet, milkshakes, cones &amp; cups, affogato and made here/);
  // No Wi-Fi with no seats inside: no "a place to talk".
  ok(await change(tokenFor(v.id), { not_offered: ['wifi'] }));
  assert.match(page(v, 'en'), /No Wi-Fi: a place to talk/);
  ok(await change(tokenFor(v.id), { cafe_info: { stay: { seats: 'takeout' } } }));
  assert.ok(!/a place to talk/.test(page(v, 'en')), 'takeout only: nothing about talking');
  assert.match(page(v, 'en'), /Takeout only/);
  // "No washroom": stored, unscored, never on the page.
  ok(await change(tokenFor(v.id), { not_offered: ['wifi', 'washroom'] }));
  assert.deepEqual(db.prepare('SELECT item FROM venue_not_offered WHERE venue_id = ? ORDER BY item').all(v.id).map((r) => r.item), ['washroom', 'wifi']);
  assert.ok(!/washroom/i.test(text(page(v, 'en'))));
  // Words in both languages.
  for (const k of ['servePre', 'iceDfQ', 'dfSorbet', 'veganIce', 'gfConesQ', 'nutFreeIce', 'dietNoteExIce', 'noWashroom', 'noWashroomSub', 'takeoutOnly', 'takeoutOnlySub', 'noWifiSubTakeout']) assert.ok(TEXT.en.cafe[k] && TEXT.fr.cafe[k], k);
});

// ---------- 7: pub and restaurant words gone from a café's screens ----------
test('7: a café\'s edit page and header use café words; restaurants keep theirs', async () => {
  const v = mk('cafe');
  ok(await change(tokenFor(v.id), { place_type: 'Ice cream & gelato' }));
  ok(await change(tokenFor(v.id), { cafe_info: { serves: ['espresso', 'ice_cream', 'desserts'] } }));
  ok(await change(tokenFor(v.id), { visit_rows: { known_for: 'Pistachio gelato', dogs: 'Dogs welcome on the patio' } }));
  const edit = (await get(`/owner/${tokenFor(v.id)}`)).text;
  assert.ok(!/<label for="opAvg">[^<]*one main and a soft drink/.test(edit), 'no restaurant spend words');
  assert.match(edit, /About how much is a single scoop\? \(for one person, before tax and tip\)/);
  assert.ok(!/Not set: pick your kind of food/.test(edit));
  assert.match(edit, /id="opCuisineHint">Ice cream &amp; gelato · Espresso drinks, Ice cream \/ gelato, Desserts &amp; cakes</);
  assert.ok(edit.indexOf('data-cu="Breakfast &amp; Brunch"') < edit.indexOf('data-cu="Pub Fare"'), 'café food styles first');
  assert.match(edit, /2 of 4 lines filled in/, 'Known for and Dogs counted, café lines only');
  assert.ok(!/id="opVisitReservations"/.test(edit) && !/id="opVisitTakeout"/.test(edit));
  for (const b of ['sports_tv', 'live_music', 'nonalcoholic', 'great_groups']) assert.match(edit, new RegExp(`<label class="amenity-check" hidden><input type="checkbox" name="badge" value="${b}"`), b);
  // Public header: the kind, EN + FR; no URL changes.
  assert.match(page(v, 'en'), /<p class="venue-at-a-glance">Ice cream &amp; gelato shop &middot; <a href="\/penticton">/);
  assert.match(page(v, 'fr'), /<p class="venue-at-a-glance">Bar laitier et gelato &middot;/);
  assert.ok(app.getVenue(v.id).slug.startsWith('ct2-cafe-'));
  // Restaurants keep their words and their five boxes.
  const r = mk('restaurant');
  const re = (await get(`/owner/${tokenFor(r.id)}`)).text;
  assert.match(re, /one main and a soft drink/); assert.match(re, /id="opVisitReservations"/);
  assert.match(page(r, 'en'), /<p class="venue-at-a-glance">Restaurant &middot;/);
  // The menu social example is neutral for everyone.
  assert.equal(TEXT.en.menuSocialEx, '@yourname, or the link to your page or post');
  assert.ok(!/yourpub/.test(TEXT.fr.menuSocialEx));
});

// ---------- 8: "Our menu changes daily" ----------
test('8: "Flavours change daily: see Instagram" saves live, links Instagram, answers the menu, and never goes to the type-up queue', async () => {
  const sent = [];
  app.setVenueSubmissionTransport(async (f) => { sent.push(f._subject || f.subject || ''); });
  const v = mk('cafe');
  ok(await change(tokenFor(v.id), { place_type: 'Ice cream & gelato' }));
  ok(await change(tokenFor(v.id), { cafe_info: { menu_daily: 'instagram' } }));
  assert.match(page(v, 'en'), /Flavours change daily: see Instagram/);
  assert.match(page(v, 'fr'), /Les saveurs changent chaque jour : voir Instagram/);
  ok(await change(tokenFor(v.id), { instagram_url: 'https://www.instagram.com/sunnyscoopsgelato' }));
  assert.match(page(v, 'en'), /<a href="https:\/\/www\.instagram\.com\/sunnyscoopsgelato\/?"[^>]*data-track="instagram">Flavours change daily: see Instagram<\/a>/, JSON.stringify(app.venueLinks(v.id)));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM venue_menus WHERE venue_id = ?").get(v.id).n, 0, 'nothing in the menu queue');
  assert.ok(!cfgOf(await setupOf(v)).progress.score.left.some((x) => x.k === 'menu'), 'counts as the menu answered');
  assert.ok(!sent.some((x) => /type up/.test(x)));
  const c = mk('cafe');
  ok(await change(tokenFor(c.id), { cafe_info: { menu_daily: 'board' } }));
  assert.match(page(c, 'en'), /Our menu changes daily: see the board in the shop/);
  assert.ok((await change(tokenFor(c.id), { cafe_info: { menu_daily: 'tiktok' } })).status >= 400);
  // A page name for a menu on Facebook / Instagram: "[FIND LINK]", never "asked us to type up their menu".
  const r = await post(`/owner/${tokenFor(c.id)}/menu/help`, { note: 'Our menu is on our Facebook or Instagram page: “Sunny Scoops”.', sheet: 'menu_social', contact_email: '', contact_phone: '' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const subj = sent.find((x) => /Sunny Scoops|CT2 cafe/.test(x) && /FIND LINK/.test(x)) || sent[sent.length - 1];
  assert.match(subj, /^\[FIND LINK\] .* told us their menu on Facebook or Instagram: please find the link$/);
  assert.ok(!sent.some((x) => /asked us to type up/.test(x)));
  assert.equal(db.prepare("SELECT help_kind FROM venue_menus WHERE venue_id = ? AND status = 'help'").get(c.id).help_kind, 'menu_social');
  // The setup offers an @handle typed on the menu step on the Instagram step.
  const s = /<script>(\/\/ Full easy setup[\s\S]*?)<\/script>/.exec(await setupOf(c))[1];
  assert.match(s, /S\.igFromMenu = true/); assert.match(s, /sheet: 'menu_social'/);
  for (const k of ['menuDaily', 'menuDailyIce', 'menuDailyQ', 'menuDailyQIce', 'menuDailyLead', 'menuDailyShows', 'savedMenuDaily', 'igFromMenu']) assert.ok(TEXT.en[k] && TEXT.fr[k], k);
  app.setVenueSubmissionTransport(async () => {});
});

// ---------- 9: cents ----------
test('9: a café price can have cents ($5.50) in 25-cent steps; stored additively; restaurants stay whole dollars', async () => {
  const v = mk('cafe'); ok(await change(tokenFor(v.id), { place_type: 'Ice cream & gelato' }));
  ok(await change(tokenFor(v.id), { avg_spend: 5.5 }));
  const row = JSON.parse(db.prepare('SELECT info FROM venue_avg_spend WHERE venue_id = ?').get(v.id).info);
  assert.equal(row.amount, 6); assert.equal(row.exact, 5.5); assert.equal(row.source, 'owner');
  for (const bad of [5.3, 1.5, 301]) assert.ok((await change(tokenFor(v.id), { avg_spend: bad })).status >= 400, String(bad));
  ok(await change(tokenFor(v.id), { avg_spend: '4.75' }));
  assert.equal(JSON.parse(db.prepare('SELECT info FROM venue_avg_spend WHERE venue_id = ?').get(v.id).info).exact, 4.75);
  // Whole dollars store exactly as before (no "exact").
  ok(await change(tokenFor(v.id), { avg_spend: 7 }));
  assert.deepEqual(Object.keys(JSON.parse(db.prepare('SELECT info FROM venue_avg_spend WHERE venue_id = ?').get(v.id).info)).sort(), ['amount', 'basis', 'checked_at', 'source', 'source_url']);
  ok(await change(tokenFor(v.id), { avg_spend: 5.5 }));
  // Shown properly once prices go public.
  process.env.AVG_SPEND_PUBLIC = '1';
  try {
    assert.match(page(v, 'en'), /About \$5\.50 for a single scoop/);
    assert.match(page(v, 'fr'), /Environ 5,50 \$ pour une boule/);
  } finally { delete process.env.AVG_SPEND_PUBLIC; }
  assert.equal(app.cafePriceText(9, 'Coffee shop', false), 'About $9 for a coffee and a pastry');
  // Restaurants: cents refused, as before.
  const r = mk('restaurant');
  assert.ok((await change(tokenFor(r.id), { avg_spend: 25.5 })).status >= 400);
  ok(await change(tokenFor(r.id), { avg_spend: 25 }));
});

// ---------- 10: the storefront photo waits while closed for the season ----------
test('10: closed for the season, the storefront item waits under "When you reopen" and doesn\'t block 100%; in season it counts again', () => {
  const base0 = { type: 'cafe', address: 'a', latitude: 1, longitude: 1, phone: '1', hasHours: true, hoursCheckedAt: '2026-11-11' };
  const shut = pc.scoreCompleteness({ ...base0, closedForSeason: true }, { today: '2026-11-11' });
  assert.ok(!shut.missing.some((it) => it.key === 'arrival'));
  assert.deepEqual(shut.afterReopen.map((it) => it.key), ['arrival']);
  const open = pc.scoreCompleteness({ ...base0 }, { today: '2026-11-11' });
  assert.ok(open.missing.some((it) => it.key === 'arrival'));
  assert.equal(open.afterReopen.length, 0);
  // Sent already: waiting for our check as before.
  const sent = pc.scoreCompleteness({ ...base0, closedForSeason: true, pendingArrival: true }, { today: '2026-11-11' });
  assert.ok(sent.missing.some((it) => it.key === 'arrival' && it.waiting));
  // The owner page shows it under "When you reopen".
  assert.match(pc.renderCompleteness(shut, { lang: 'en' }) || '', /When you reopen/);
});
