// Audit fixes (2026-10-27): the venue page, Roam Now and visitor-flow bugs from the Oct 27 audit
// (drafts/site-audit/2026-10-27-venues.md, -map.md, -flows.md, -crawl.md). Happy hour deals never show prices without
// saying when; "11 AM–midnight" (not "11–12 AM"); "Tonight"/"Today" tags follow the clock; French buttons and links
// stay French; season-closed places carry no happy hour on the map; the map's night, name and happy hour searches;
// guide event dates move on to the next date; meta descriptions end at a sentence; the apple-touch-icon paths.
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
process.env.ENRICHMENT_ADMIN_TOKEN = 'r25-audit-admin-token';
const app = require('../server.js');
const db = require('../db.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
let n = 0;
const mk = (o) => app.createVenue({ slug: `r25-fixture-${++n}`, region: 'kelowna', type: 'pub', latitude: 49.875 + n / 1000, longitude: -119.46, rating: 4.2,
  happy_hour: true, description: 'A fixture pub used only by the audit fix tests.', hours: JSON.stringify(open('11:00', '23:59')), ...o });
const meta = { reason: 'r25 audit fixture', batch_id: 'test-r25' };
const today = app.todayLocal();
const SRC = 'https://example.com/r25';
const setNights = (v, nights) => assert.equal(app.guardedWeeklyNightsUpdate(v.id, app.currentWeeklyNightsJson(v.id), { nights, source_url: SRC, checked_at: today }, meta).ok, true);
const setSpecials = (v, specials) => assert.equal(app.guardedSpecialsUpdate(v.id, app.currentSpecialsJson(v.id), { specials, source_url: SRC, checked_at: today }, meta).ok, true);
const setTimes = (v, times) => assert.equal(app.guardedHappyHourUpdate(v.id, null, { times, source_url: SRC, checked_at: today }, meta).ok, true);
const setDeals = (v, deals) => {
  const cur = db.prepare('SELECT happy_hour_deals FROM venues WHERE id = ?').get(v.id).happy_hour_deals;
  assert.equal(app.guardedHappyHourDealsUpdate(v.id, cur, { deals, source_url: SRC, checked_at: today }, meta).ok, true);
};
// Pacific (PDT, UTC−7) wall-clock time on a date.
const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.parse(`${date}T00:00:00Z`) + ((h + 7) * 60 + m) * 60000); };
const TUE = '2026-10-27';
const WED = '2026-10-28';
const page = (v, now, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { now, lang });
const nightsCard = (html) => (/<section class="venue-section venue-nights-card" id="venueNights"[\s\S]*?<\/section>/.exec(html) || [])[0] || '';
const nightTag = (html, title) => {
  const row = (new RegExp(`<span class="venue-wn(?: is-today)?" role="listitem">(?:(?!role="listitem")[\\s\\S])*?${title}(?:(?!role="listitem")[\\s\\S])*`).exec(nightsCard(html)) || [])[0] || '';
  return (/<span class="venue-wn-today">([^<]*)<\/span>/.exec(row) || [])[1] || '';
};
const dealsCard = (html) => (/<section class="venue-section venue-deals-card" id="venueDeals"[\s\S]*?<\/section>/.exec(html) || [])[0] || '';
const goodToKnowHh = (html) => (/<div class="detail-row"><span class="label">Happy hour<\/span><span>([\s\S]*?)<\/span><\/div>\n/.exec(html) || [])[1] || '';

test('happyHourRangeText: the first AM/PM is dropped only inside one half of the day; midnight reads "midnight"', () => {
  assert.equal(app.happyHourRangeText(660, 1440, false), '11 AM–midnight', 'it read "11–12 AM"');
  assert.equal(app.happyHourRangeText(900, 1080, false), '3–6 PM');
  assert.equal(app.happyHourRangeText(660, 720, false), '11 AM–12 PM');
  assert.equal(app.happyHourRangeText(600, 690, false), '10–11:30 AM');
  assert.equal(app.happyHourRangeText(1260, 1500, false), '9 PM–1 AM');
  assert.equal(app.happyHourRangeText(1260, 0, false), '9 PM–midnight', 'a night stored as 21:00–00:00');
  assert.equal(app.happyHourRangeText(30, 90, false), '12:30–1:30 AM');
  assert.equal(app.happyHourRangeText(660, 1440, true), '11 h–minuit');
});

test('venue page: happy hour deals with no stored times say "Times vary — check with the venue", in the card and in Good to Know', () => {
  const v = mk({ name: 'R25 Deals No Times', description_fr: 'Un pub de test.' });
  setDeals(v, [{ text: 'House pints', price: '$6' }]);
  const html = page(v, at(TUE, '12:00'));
  const card = dealsCard(html);
  assert.match(card, /<h2 id="venueDealsTitle">Happy hour deals<\/h2>/);
  assert.match(card, /<span class="venue-hh-times venue-hh-times-vary">Times vary — check with the venue<\/span>/);
  assert.doesNotMatch(card, /venue-hh-deals-label/, 'no "Deals" label under the "Happy hour deals" heading');
  assert.match(card, /role="list" aria-label="Happy hour deals"/);
  const row = goodToKnowHh(html);
  assert.match(row, /Times vary — check with the venue/);
  assert.match(row, /href="#venueDeals">See the deals ↓/);
  const fr = page(v, at(TUE, '12:00'), 'fr');
  assert.match(dealsCard(fr), /Heures variables — vérifiez auprès de l’établissement/);
  // With times and weekly specials the card keeps its two blocks, each labelled.
  const w = mk({ name: 'R25 Deals And Specials' });
  setTimes(w, { tue: [['15:00', '18:00']] });
  setDeals(w, [{ text: 'House pints', price: '$6' }]);
  setSpecials(w, [{ days: ['tue'], title: 'Taco Tuesday', deal: '$3 tacos', price: '$3 each', kind: 'food' }]);
  const both = page(w, at(TUE, '12:00'));
  assert.match(dealsCard(both), /venue-hh-deals-label" id="venueHhDealsLabel">Deals</);
  assert.match(goodToKnowHh(both), /See the deals and specials ↓/);
});

test('venue page: a next happy hour tomorrow says "tomorrow" (« demain »)', () => {
  const v = mk({ name: 'R25 Tomorrow HH' });
  setTimes(v, { wed: [['16:00', '18:00']] });
  assert.match(page(v, at(TUE, '20:00')), /Next happy hour: tomorrow 4 PM/);
  assert.match(page(v, at(TUE, '20:00'), 'fr'), /Prochain happy hour[\s\u00a0\u202f]:[\s\u00a0\u202f]demain 16[\s\u00a0\u202f]h/);
  assert.match(page(v, at('2026-10-26', '20:00')), /Next happy hour: Wednesday 4 PM/, 'two days ahead keeps the day name');
});

test('weekly nights: "Tonight" until the night ends; after midnight last night\'s late one reads "On now"; today\'s wait until 4 AM', () => {
  const v = mk({ name: 'R25 Nights Clock' });
  setNights(v, [
    { days: ['tue'], kind: 'trivia', title: 'Trivia Tuesday', start: '19:00', end: '21:00' },
    { days: ['tue'], kind: 'karaoke', title: 'Late Karaoke', start: '20:30', end: '00:30' },
    { days: ['wed'], kind: 'bingo', title: 'Wednesday Bingo', start: '19:00' },
  ]);
  assert.equal(nightTag(page(v, at(TUE, '18:00')), 'Trivia Tuesday'), 'Tonight');
  assert.equal(nightTag(page(v, at(TUE, '20:30')), 'Trivia Tuesday'), 'Tonight', 'still on');
  assert.equal(nightTag(page(v, at(TUE, '21:30')), 'Trivia Tuesday'), '', 'over at 9 PM');
  assert.equal(nightTag(page(v, at(TUE, '23:30')), 'Late Karaoke'), 'Tonight');
  const after = page(v, at(WED, '00:15'));
  assert.equal(nightTag(after, 'Late Karaoke'), 'On now', 'Tuesday night still running after midnight');
  assert.equal(nightTag(after, 'Wednesday Bingo'), '', 'Wednesday evening is not "Tonight" at 12:15 AM');
  assert.equal(nightTag(page(v, at(WED, '00:45')), 'Late Karaoke'), '', 'over at 12:30 AM');
  assert.equal(nightTag(page(v, at(WED, '09:00')), 'Wednesday Bingo'), 'Tonight');
  assert.equal(nightTag(page(v, at(WED, '21:30')), 'Wednesday Bingo'), 'Tonight', 'no end: start + 3 h');
  assert.equal(nightTag(page(v, at(WED, '22:30')), 'Wednesday Bingo'), '');
  assert.equal(nightTag(page(v, at(WED, '00:15'), 'fr'), 'Late Karaoke'), 'En cours');
  // The helper on its own.
  const clock = (m) => ({ weekday: 'tue', minutes: m });
  assert.equal(app.weeklyRowTag({ onToday: true, onYesterday: false, a: null, b: null }, clock(600)), 'today', 'no times: all day');
  assert.equal(app.weeklyRowTag({ onToday: true, onYesterday: false, a: null, b: null }, clock(120)), '', 'not before 4 AM');
});

test('weekly specials: "Today" only until the special ends (its end, else closing time); the price that repeats the title is hidden', () => {
  const v = mk({ name: 'R25 Specials Clock', hours: JSON.stringify(open('11:00', '22:00')) });
  setSpecials(v, [
    { days: ['tue'], title: 'Lunch Burger Tuesday', deal: 'Burger and fries', price: '$12', kind: 'food', start: '11:00', end: '15:00' },
    { days: ['tue'], title: 'Kids eat free', deal: 'One kids meal free with each adult entrée', price: 'free', kind: 'food' },
  ]);
  const tagOf = (html, title) => {
    const m = new RegExp(`<span class="venue-sp(?: is-today)?" role="listitem">(?:(?!role="listitem")[\\s\\S])*?${title}(?:(?!role="listitem")[\\s\\S])*`).exec(html);
    return m ? (/<span class="venue-sp-today">([^<]*)<\/span>/.exec(m[0]) || [])[1] || '' : null;
  };
  assert.equal(tagOf(page(v, at(TUE, '12:00')), 'Lunch Burger Tuesday'), 'Today');
  assert.equal(tagOf(page(v, at(TUE, '16:00')), 'Lunch Burger Tuesday'), '', 'over at 3 PM');
  assert.equal(tagOf(page(v, at(TUE, '21:00')), 'Kids eat free'), 'Today', 'until the 10 PM close');
  assert.equal(tagOf(page(v, at(TUE, '22:30')), 'Kids eat free'), '', 'closed for the night');
  const html = page(v, at(TUE, '12:00'));
  assert.doesNotMatch(html, /Kids eat free<\/span> <span class="venue-sp-price"/, '"Kids eat free · free" no more');
  assert.match(html, /Lunch Burger Tuesday<\/span> <span class="venue-sp-price">\$12<\/span>/);
  assert.equal(app.specialPriceRepeatsTitle('half price', 'Half-Price Wine Tuesday'), true);
  assert.equal(app.specialPriceRepeatsTitle('$2', '$2 Burger Fridays'), true);
  assert.equal(app.specialPriceRepeatsTitle('$5 off', 'Burger Monday'), false);
});

test('French venue page: the Close by buttons say "Ajouter au voyage" in the HTML; the owner links are French', () => {
  const a = mk({ name: 'R25 French Home', description_fr: 'Un pub de test, en français.' });
  const b = mk({ name: 'R25 French Neighbour', description_fr: 'Un voisin, en français.' });
  const c = mk({ name: 'R25 French Neighbour Two', description_fr: 'Un autre voisin.' });
  const near = [b, c].map((x) => ({ ...app.getVenue(x.id), distance_km: 0.4 }));
  const fr = app.renderVenuePage(app.getVenue(a.id), [], near, [], { now: at(TUE, '12:00'), lang: 'fr' });
  const strip = (/<li class="nearby-card"[\s\S]*?<\/li>/.exec(fr) || [])[0] || '';
  assert.ok(strip, 'a Close by card');
  assert.match(strip, /Ajouter au voyage<\/button>/);
  assert.doesNotMatch(fr, / Add to trip<\/button>/);
  assert.ok(fr.includes("edit.href = '/fr/owner/account/venue/' + box.getAttribute('data-venue-id')"));
  assert.ok(fr.includes('<a href="/fr/owner/login" rel="nofollow">'));
  const en = app.renderVenuePage(app.getVenue(a.id), [], near, [], { now: at(TUE, '12:00') });
  assert.match(en, / Add to trip<\/button>/);
  assert.ok(en.includes("edit.href = '/owner/account/venue/' + box.getAttribute('data-venue-id')"));
});

test('French links: a place page without French text is linked in English (it redirects there); with French, its /fr page', () => {
  const noFr = mk({ name: 'R25 English Only Shop', type: 'shop', description_fr: null });
  const withFr = mk({ name: 'R25 Has French', description_fr: 'Une fiche en français.' });
  const enPath = (v) => app.venuePagePath(app.getVenue(v.id));
  assert.equal(app.frLinkHref(enPath(noFr)), enPath(noFr));
  assert.equal(app.frLinkHref(enPath(withFr)), `/fr${enPath(withFr)}`);
  assert.equal(app.frLinkHref('/kelowna/pubs'), '/fr/kelowna/pubs', 'other pages unchanged');
});

test('Roam Now data: a season-closed place with no listed hours ships no happy hour times, deals, specials or nights', () => {
  const v = mk({ name: 'R25 Closed Golf Lounge', hours: null });
  setTimes(v, open('15:00', '18:00'));
  setDeals(v, [{ text: 'Highballs', price: '$5' }]);
  setSpecials(v, [{ days: ['tue'], title: 'Taco Tuesday', deal: '$3 tacos', price: '$3', kind: 'food' }]);
  setNights(v, [{ days: ['tue'], kind: 'trivia', title: 'Trivia', start: '19:00' }]);
  db.prepare('INSERT INTO venue_seasons (venue_id, status, until_date, reopens_date, source_url, checked_at) VALUES (?, ?, ?, ?, ?, ?)').run(v.id, 'closed', null, '2027-04-01', SRC, today);
  const row = JSON.parse(app.mapLiveData(at(TUE, '12:00')).json).p.find((p) => p[2] === 'R25 Closed Golf Lounge');
  assert.ok(row);
  assert.equal(row[13], 1, 'closed for the season');
  assert.equal(row[11], 0, 'no happy hour times');
  assert.equal(row.length, 16, 'no deals, specials or nights');
  const open1 = mk({ name: 'R25 Open Lounge' });
  setTimes(open1, open('15:00', '18:00'));
  setDeals(open1, [{ text: 'Highballs', price: '$5' }]);
  const r2 = JSON.parse(app.mapLiveData(at(TUE, '12:00')).json).p.find((p) => p[2] === 'R25 Open Lounge');
  assert.notEqual(r2[11], 0);
  assert.equal(typeof r2[16], 'string');
});

test('Roam Now script: night words, whole-word deal words, names first, happy hour later today, "open mic" shown as typed, phone clamp', () => {
  const html = app.renderPlacesMapPage();
  for (const s of html.split(/<script(?![^>]*\bsrc=)(?![^>]*application\/(?:ld\+)?json)[^>]*>/).slice(1).map((x) => x.split('</script>')[0])) new vm.Script(s);
  // "trivia" and "karaoke" are no longer the Games & pool tag's search words (they search tonight's nights).
  assert.ok(html.includes('games|arcade|pool|billiards|darts|bowling|shuffleboard|jeux|billard'));
  assert.ok(!html.includes('shuffleboard|trivia|karaoke|jeux'));
  // Deal words: whole words (or a plural), a word start only from 4 letters.
  const hitSrc = html.match(/function dealWordHit\(dk, w\)\{[^\n]*\}/)[0];
  const ctx = {};
  vm.runInNewContext(`${hitSrc}; this.hit = dealWordHit;`, ctx);
  assert.equal(ctx.hit(' house wine hotel eldorado ', 'hot'), false, '"hot" is not "hotel"');
  assert.equal(ctx.hit(' mini dogs ', 'dog'), true, 'a plural');
  assert.equal(ctx.hit(' 3 course set menu ', 'cours'), true, 'a 5-letter start');
  // The list: o.fitFirst puts the fit (a named listing, tonight's night) ahead of open now.
  const listSrc = html.match(/function mapPlaceList\(onMap, o\)\{[\s\S]*?\n  \}/)[0];
  const c2 = {};
  vm.runInNewContext(`${listSrc}; this.list = mapPlaceList;`, c2);
  const ps = [{ name: 'Open Arcade', st: { state: 'open' }, f: 1 }, { name: 'Trivia Pub', st: null, f: 0 }];
  const base = { town: 'kelowna', fit: (p) => p.f };
  assert.deepEqual(c2.list(ps, base).map((p) => p.name), ['Open Arcade', 'Trivia Pub'], 'open first by default');
  assert.deepEqual(c2.list(ps, { ...base, fitFirst: true }).map((p) => p.name), ['Trivia Pub', 'Open Arcade']);
  // Happy hour later today when none is on now; tonight's nights skip the open-at check; a named listing always matches.
  assert.ok(html.includes("k === 'happy' && hhKnown ? !(p.hhs && (p.hhs.now || !hhAnyNow))"));
  assert.ok(html.includes('if ((atMin != null || atDay) && !nightHit(p) && !openAt(p, atMin, atDay)) return false;'));
  assert.ok(html.includes('if (nameHit(p)) return true;'));
  assert.ok(html.includes("hhLaterNote: 'No happy hour on right now. These places have one later today.'"));
  assert.ok(html.includes('function hhOf(p){\n    if (!p.hh || p.sc) return null;'), 'never on a place closed for the season');
  // The shown words: "open mic", never "openmic".
  const termSrc = html.match(/function termShown\(t\)\{[^\n]*\}/)[0];
  const c3 = { T: { openMicWords: 'open mic' } };
  vm.runInNewContext(`${termSrc}; this.shown = termShown;`, c3);
  assert.equal(c3.shown('openmic'), 'open mic');
  assert.ok(html.includes("[/open[ -]?mics?|sc[eè]nes? ouverte?s?/g, ' openmic ']"), '« scène ouverte » after the typo fix too');
  // Searches fit the map to their results.
  assert.ok(html.includes('var hadWords = !!term; searchFit = true; changed();'));
  // Phone cards: the deal lines keep to two lines; nights cap at two, then "+N more".
  assert.ok(html.includes('-webkit-line-clamp: 2'));
  const wnSrc = html.match(/function wnHtml\(p\)\{[^\n]*\}/)[0];
  const c4 = { T: { wn: { trivia: 'Trivia', bingo: 'Bingo', karaoke: 'Karaoke' }, wnEow: 'every other week', wnMore: (k) => `+${k} more` }, FR: false, esc: String, timeText: () => '' };
  vm.runInNewContext(`${wnSrc}; this.out = wnHtml({ wn: [['trivia', 0], ['bingo', 0], ['karaoke', 0]] });`, c4);
  assert.equal(c4.out, 'Trivia; Bingo +1 more');
});

test('French Hidden Gems notes: the five notes added after Oct 17 read in French', () => {
  for (const note of ['A tiny biodynamic OK Falls winery with resident pigs, chickens and ducks.', 'A specialty Vernon tea shop known for imaginative house blends.',
    'A District Wine Village winery where owner-winemaker Efi pours every glass.',
    "West Kelowna's only full-length course, quietly winding along Shannon Lake with a tempting risk/reward 8th hole.",
    'A fully gluten-free, vegan café on Main Street whose baking even non-GF folks rave about.']) {
    const fr = app.frText(note);
    assert.ok(fr && fr !== note, note);
    assert.doesNotMatch(fr, /week-end/);
  }
});

test('guides: an event item whose printed date has passed shows its next date, in English and in French', () => {
  const where = 'Kelowna, Oct 23';
  const ev = db.prepare("INSERT INTO events (name, slug, region, status, description, start_datetime) VALUES ('R25 Tombstone Tours', 'r25-tombstone-tours', 'kelowna', 'scheduled', 'A walking tour.', '2026-10-23T18:00')").run();
  const id = Number(ev.lastInsertRowid);
  const occ = db.prepare("INSERT INTO event_occurrences (event_id, start_date, end_date, start_time, status) VALUES (?, ?, ?, '18:00', 'scheduled')");
  occ.run(id, '2026-10-23', '2026-10-23');
  occ.run(id, '2026-10-30', '2026-10-30');
  occ.run(id, '2026-11-06', '2026-11-06');
  assert.equal(app.guideEventWhere(where, id, at(TUE, '12:00')), 'Kelowna, Oct 30');
  assert.equal(app.guideEventWhere(where, id, at('2026-10-22', '12:00')), where, 'not yet past: as written');
  assert.equal(app.guideEventWhere('Kelowna, Oct 30', id, at(TUE, '12:00')), 'Kelowna, Oct 30');
  assert.equal(app.guideEventWhere('Kelowna', id, at(TUE, '12:00')), 'Kelowna', 'no date: as written');
  assert.equal(app.guideEventWhere(where, id, at('2026-10-31', '12:00')), 'Kelowna, Nov 6');
  // The French line written for the old date is used, with the French date swapped.
  const oldFr = app.frText('(Kelowna, Oct 23): 7 to 10 pm. Admission is $6 to $10.');
  assert.match(oldFr, /^\(Kelowna, 23 oct\.\)/);
  assert.equal(app.frText('(Kelowna, Nov 6): 7 to 10 pm. Admission is $6 to $10.'), oldFr.replace('23 oct.', '6 nov.'));
});

test('meta descriptions end at a full sentence when one fits', () => {
  const long = '24 gluten-free spots in Kelowna, BC. Dedicated gluten-free kitchens and places with clearly marked options. If you have celiac disease, ask about kitchen practices before you order.';
  assert.equal(app.clampMetaText(long), '24 gluten-free spots in Kelowna, BC. Dedicated gluten-free kitchens and places with clearly marked options.');
  const oneSentence = 'A'.repeat(20) + ' ' + 'word '.repeat(40);
  const cut = app.clampMetaText(oneSentence);
  assert.ok(cut.length <= 160 && cut.endsWith('…'), 'no sentence fits: a word cut');
  assert.equal(app.clampMetaText('Short.'), 'Short.');
});

test('HTTP: /apple-touch-icon.png and -precomposed serve the 180px icon; llms.txt; the happy hour guide search label keeps the town\'s capital', async () => {
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    for (const p of ['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png']) {
      const r = await fetch(`${base}${p}`);
      assert.equal(r.status, 200, p);
      assert.equal(r.headers.get('content-type'), 'image/png');
      const body = Buffer.from(await r.arrayBuffer());
      assert.deepEqual(body, fs.readFileSync(path.join(__dirname, '..', 'public', 'images', 'icons', 'okanagan-roam-apple-touch-180.png')));
    }
    const llms = await (await fetch(`${base}/llms.txt`)).text();
    assert.doesNotMatch(llms, /this-weekend/);
    if (!app.FRENCH_INDEXABLE) assert.doesNotMatch(llms, /## Français/);
    assert.match(llms, /for example https:\/\/okanaganroam\.com\/kelowna\/wineries\/tantalus-vineyards\./);
    for (let i = 0; i < 3; i++) { const v = mk({ name: `R25 HH Guide ${i}` }); setTimes(v, open('15:00', '18:00')); }
    const g = await (await fetch(`${base}/guide/kelowna/happy_hour`)).text();
    assert.doesNotMatch(g, /in kelowna"/, 'the town keeps its capital');
  } finally {
    srv.closeAllConnections();
    await new Promise((resolve) => srv.close(resolve));
  }
});
