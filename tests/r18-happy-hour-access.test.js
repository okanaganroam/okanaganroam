// Happy hour access (2026-10-26): a homepage line ("Happy hour on now at 23 places →", "Happy hour starts at 2 PM at 40
// places today →", "Happy hour tomorrow from 2 PM at 40 places →") linking to Roam Now with its Happy hour now filter on
// (/map?show=happy-hour, from GET /api/happy-hour-now after load); the town Happy Hour pages (/guide/<town>/happy_hour)
// with each place's times today, its first two deals and an "On now · ends in 40 min" tag, on-now places first; and a
// Happy Hour link in the Food & Drink menu. English and French. Same rules as the venue page and the map: no advisory,
// not closed for the season, not while the place's own hours say closed; always the Okanagan clock.
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
// The homepage's clock: noon Pacific Standard (1 PM PDT) on Tuesday Oct 27 (homepageNow(), never in production).
process.env.OKR_TODAY_OVERRIDE = '2026-10-27';
const app = require('../server.js');
const db = require('../db.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const every = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
let n = 0;
const mk = (o) => app.createVenue({ slug: `hh-access-fixture-${++n}`, region: 'kelowna', type: 'pub', latitude: 49.88 + n / 1000, longitude: -119.49, rating: 4.4, reviews: 500 - n,
  happy_hour: true, description: 'A fixture pub used only by the happy hour access tests.', hours: JSON.stringify(every('11:00', '23:00')), ...o });
const meta = { reason: 'hh access fixture', batch_id: 'test-hh-access' };
const today = app.todayLocal();
const setTimes = (v, times) => {
  const r = app.guardedHappyHourUpdate(v.id, null, { times, source_url: 'https://example.com/hh', checked_at: today }, meta);
  assert.equal(r.ok, true, JSON.stringify(r));
};
const setDeals = (v, deals, extra = {}) => {
  const r = app.guardedHappyHourDealsUpdate(v.id, null, { deals, source_url: 'https://example.com/hh-deals', checked_at: today, ...extra }, meta);
  assert.equal(r.ok, true, JSON.stringify(r));
};
// Pacific (PDT, UTC−7) wall-clock time on a date.
const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.parse(`${date}T00:00:00Z`) + ((h + 7) * 60 + m) * 60000); };
const TUE = '2026-10-27';
const nb = (s) => s.replace(/_/g, ' ');

// A and B: on at 17:20 (A until 6 PM, B until 7 PM); E: later today (7 PM); G: its own hours say closed at 17:20 (opens
// 6 PM), so its 5–7 PM happy hour is not "on"; C: an advisory; D: closed for the season; F: the badge, no times;
// H: Mondays only.
const A = mk({ name: 'HH Access Alehouse' });
const B = mk({ name: 'HH Access Brewpub' });
const C = mk({ name: 'HH Access Closed Notice' });
const D = mk({ name: 'HH Access Summer Patio' });
const E = mk({ name: 'HH Access Evening Bar' });
const F = mk({ name: 'HH Access Badge Only' });
const G = mk({ name: 'HH Access Late Opener', hours: JSON.stringify(every('18:00', '23:00')) });
const H = mk({ name: 'HH Access Monday Taps' });
const F1 = mk({ name: 'HH Access Filler One' });
const F2 = mk({ name: 'HH Access Filler Two' });
setTimes(A, every('15:00', '18:00'));
setTimes(B, every('17:00', '19:00'));
setTimes(C, every('15:00', '18:00'));
setTimes(D, every('15:00', '18:00'));
setTimes(E, every('19:00', '21:00'));
setTimes(G, every('17:00', '19:00'));
setTimes(H, { mon: [['15:00', '18:00']] });
assert.equal(app.guardedCollectionMembershipUpdate('advisory', C.id, 'add', 'Taproom closed for renovations this week. https://example.com/hh-notice', meta).ok, true);
db.prepare('INSERT INTO venue_seasons (venue_id, status, until_date, reopens_date, source_url, checked_at) VALUES (?, ?, ?, ?, ?, ?)').run(D.id, 'closed', null, '2027-05-01', 'https://example.com/season', '2026-10-01');
setDeals(A, [{ text: 'House pints (20 oz)', price: '$6' }, { text: 'Cocktails', price: '$10' }, { text: 'Appies', price: 'half price' }], { deals_fr: [{ text: 'Pintes maison (20 oz)', price: '6 $' }, { text: 'Cocktails', price: '10 $' }] });
setDeals(B, [{ text: 'Wings', price: '$0.75 each' }]);
// Places in the database before these fixtures (none expected on a fresh one) would change the valley-wide counts.
const others = app.happyHourStatesFor(db.prepare('SELECT id, hours, happy_hour_times, redirect_to FROM venues WHERE happy_hour_times IS NOT NULL AND slug NOT LIKE ?').all('hh-access-fixture-%'), at(TUE, '12:00')).byId.size;

test('state per place: on now, later today, closed now, advisory and season closures left out', () => {
  const rows = db.prepare('SELECT id, hours, happy_hour_times, redirect_to FROM venues WHERE id IN (?, ?, ?, ?, ?, ?, ?, ?)').all(A.id, B.id, C.id, D.id, E.id, F.id, G.id, H.id);
  const { clock, byId } = app.happyHourStatesFor(rows, at(TUE, '17:20'));
  assert.deepEqual({ weekday: clock.weekday, minutes: clock.minutes }, { weekday: 'tue', minutes: 17 * 60 + 20 }, 'the Okanagan clock, not UTC (00:20 Wednesday there)');
  assert.equal(byId.get(A.id).h.state, 'now');
  assert.equal(byId.get(B.id).h.state, 'now');
  assert.equal(byId.get(E.id).h.state, 'later');
  assert.equal(byId.get(G.id).h, null, 'its own hours say closed: not on');
  assert.equal(byId.get(C.id).blocked, true, 'advisory');
  assert.equal(byId.get(D.id).blocked, true, 'closed for the season');
  assert.equal(byId.has(F.id), false, 'no stored times');
});

test('valley-wide summary: on now, later today, tomorrow, none; Okanagan time; EN + FR labels', { skip: others ? 'other places with happy hour times in this database' : false }, () => {
  // 1 PM: nothing on yet; later today A (3 PM), B and G (5 PM; G's own hours start at 6 PM, it is still listed as
  // later today, like the venue page), E (7 PM). Not H (Mondays only).
  const noon = app.happyHourNowSummary(at(TUE, '13:00'));
  assert.equal(noon.state, 'later');
  assert.equal(noon.count, 4, JSON.stringify(noon));
  assert.equal(noon.startsAt, 15 * 60);
  assert.equal(noon.label.en, nb('Happy hour starts at 3_PM at 4 places today'));
  assert.equal(noon.label.fr, nb('Happy hour dès 15_h à 4 endroits aujourd’hui'));
  // 5:20 PM: A and B on (G is closed; E later).
  const on = app.happyHourNowSummary(at(TUE, '17:20'));
  assert.deepEqual({ state: on.state, count: on.count }, { state: 'now', count: 2 });
  assert.equal(on.label.en, 'Happy hour on now at 2 places');
  assert.equal(on.label.fr, 'Happy hour en cours à 2 endroits');
  // The same instant read as UTC would be Wednesday 00:20: nothing on. The answer follows the Okanagan clock.
  assert.equal(new Date(at(TUE, '17:20')).getUTCHours(), 0);
  // 11:30 PM: nothing left today; tomorrow (Wednesday) A, G, B, E (not H, Mondays only), first at 3 PM.
  const late = app.happyHourNowSummary(at(TUE, '23:30'));
  assert.deepEqual({ state: late.state, count: late.count, startsAt: late.startsAt }, { state: 'tomorrow', count: 4, startsAt: 15 * 60 });
  assert.equal(late.label.en, nb('Happy hour tomorrow from 3_PM at 4 places'));
  assert.equal(late.label.fr, nb('Happy hour demain dès 15_h à 4 endroits'));
  // One place: singular.
  assert.equal(app.happyHourNowLabel({ state: 'now', count: 1 }, false), 'Happy hour on now at 1 place');
  assert.equal(app.happyHourNowLabel({ state: 'now', count: 1 }, true), 'Happy hour en cours à 1 endroit');
  assert.equal(app.happyHourNowLabel({ state: 'none', count: 0 }, false), '');
});

test('homepage: the first item of the counts strip, in both languages, linking to Roam Now with Happy hour now on', async () => {
  const on = app.renderHomeHappyHourHTML({ now: at(TUE, '17:20') });
  assert.match(on, /^<li class="home-hh" id="homeHappyHour" data-hh="now"><a href="\/map\?show=happy-hour"><span class="home-hh-dot" aria-hidden="true"><\/span><strong data-hh-n>2<\/strong> /);
  assert.match(on, /<span class="home-en" data-hh-en>happy hours on now<\/span><span class="home-fr" lang="fr" data-hh-fr>happy hours en cours<\/span><\/a><\/li>$/);
  assert.match(app.renderHomeHappyHourHTML({ now: at(TUE, '13:00') }), /data-hh="later"/);
  assert.equal(app.happyHourNowShort({ state: 'now', count: 1 }, false), 'happy hour on now');
  assert.equal(app.happyHourNowShort({ state: 'later', count: 4, startsAt: 900 }, false), nb('happy hours from 3_PM today'));
  assert.equal(app.happyHourNowShort({ state: 'later', count: 4, startsAt: 900 }, true), nb('happy hours dès 15_h aujourd’hui'));
  assert.equal(app.happyHourNowShort({ state: 'tomorrow', count: 4, startsAt: 900 }, false), nb('happy hours tomorrow from 3_PM'));
  assert.equal(app.happyHourNowShort({ state: 'none', count: 0 }, false), '');
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const en = await (await fetch(`${base}/`)).text();
    if (/id="homeHappyHour"/.test(en)) {
      assert.match(en, /<ul class="home-stats"[^>]*><li class="home-hh" id="homeHappyHour"/, 'first item of the strip');
      assert.doesNotMatch(en, /<p class="home-hh"/, 'no separate pill');
      assert.match(en, /<style id="home-hh">/);
      assert.match(en, /fetch\('\/api\/happy-hour-now'/, 'refreshed after load');
      if (!others) assert.match(en, new RegExp(nb('data-hh-en>happy hours from 3_PM today</span>')));
      const fr = await (await fetch(`${base}/fr`)).text();
      assert.match(fr, /<li class="home-hh" id="homeHappyHour"[^>]*><a href="\/fr\/map\?show=happy-hour">/, 'the French homepage opens the French map');
    }
    const r = await fetch(`${base}/api/happy-hour-now`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'public, max-age=60');
    assert.equal(r.headers.get('x-robots-tag'), 'noindex');
    const j = await r.json();
    assert.ok(['now', 'later', 'tomorrow', 'none'].includes(j.state));
    assert.equal(typeof j.count, 'number');
    assert.ok(j.short && typeof j.short.en === 'string' && typeof j.short.fr === 'string');
    assert.deepEqual(Object.keys(j).sort(), ['count', 'label', 'short', 'startsAt', 'state']);
    const map = await (await fetch(`${base}/map?show=happy-hour`)).text();
    assert.match(map, /<link rel="canonical" href="https:\/\/okanaganroam\.com\/map">/);
    assert.ok(map.includes("if (qs.get('show') === 'happy-hour') feats.happy = true;"), 'the map script switches Happy hour now on');
    const frMap = await (await fetch(`${base}/fr/map?show=happy-hour`)).text();
    assert.match(frMap, /<link rel="canonical" href="https:\/\/okanaganroam\.com\/fr\/map">/);
  } finally { srv.close(); }
});

test('homepage item is left out when nothing is left today or tomorrow', () => {
  assert.match(app.renderHomeHappyHourHTML({ now: at(TUE, '17:20') }), /^<li class="home-hh"[^>]*data-hh="now">/);
  assert.equal(app.renderHomeHappyHourHTML({ now: new Date(NaN) }), '', 'an unreadable clock leaves it out rather than guessing');
});

test('the map reads ?show=happy-hour and turns on its Happy hour now filter', () => {
  const page = app.renderPlacesMapPage();
  const i = page.indexOf("if (qs.get('show') === 'happy-hour') feats.happy = true;");
  assert.ok(i > 0);
  assert.ok(i < page.indexOf('syncChips();', i), 'before the chips are drawn');
  // Audit fix (2026-10-27): Happy hour now, or, while none is on anywhere, the ones later today.
  assert.ok(page.includes("k === 'happy' && hhKnown ? !(p.hhs && (p.hhs.now || !hhAnyNow))"), 'the filter it turns on is Happy hour now');
  assert.equal(app.HAPPY_HOUR_MAP_HREF, '/map?show=happy-hour');
});

const guideList = () => [F, E, G, B, A, C, D, H, F1, F2].map((v) => app.getVenue(v.id));
const cardOrder = (html) => [...html.matchAll(/<li class="venue-card" data-fd-i="\d+" data-venue-id="(\d+)"/g)].map((m) => Number(m[1]));
const cardOf = (html, v) => { const i = html.indexOf(`data-venue-id="${v.id}"`); return html.slice(i, html.indexOf('</li>', i)); };

test('town Happy Hour page: on now first, then later today, then the rest; tags, times today, deals (EN)', () => {
  const html = app.renderGuidePage('kelowna', 'happy_hour', guideList(), null, at(TUE, '17:20'));
  const order = cardOrder(html).filter((id) => [A, B, C, D, E, F, G, H].some((v) => v.id === id));
  // guideOpenFirst puts open places first (D, closed for the season, last); then on now (B, A in that order), later (E).
  assert.deepEqual(order.slice(0, 3), [B.id, A.id, E.id], JSON.stringify(order));
  const a = cardOf(html, A);
  assert.match(a, /<div class="guide-hh" data-hh="now"><p class="guide-hh-when"><span class="guide-hh-tag">On now · ends in 40 min<\/span> <span class="guide-hh-label">Happy hour:<\/span> Today 3–6 PM<\/p>/);
  assert.match(a, /<p class="guide-hh-deals"><span class="guide-hh-label">Deals:<\/span> <span>\$6 House pints \(20 oz\), \$10 Cocktails<\/span><\/p>/, 'the first two, price first');
  assert.doesNotMatch(a, /Appies/);
  assert.match(a, /<div class="card-slot card-slot-fee"><div class="guide-hh"/, 'inside a card slot, so two-up rows still line up');
  assert.match(cardOf(html, B), /On now · ends in 1 hr 40 min[\s\S]*Today 5–7 PM[\s\S]*\$0\.75 each Wings/);
  assert.match(cardOf(html, E), /data-hh="later"><p class="guide-hh-when"><span class="guide-hh-label">Happy hour:<\/span> Today 7–9 PM<\/p>/);
  assert.doesNotMatch(cardOf(html, E), /guide-hh-tag/);
  assert.match(cardOf(html, G), /data-hh="none"[\s\S]*Today 5–7 PM/, 'closed now: listed with its times, no tag');
  assert.match(cardOf(html, H), new RegExp(nb('No happy hour today · Mon_3–⁠6_PM')));
  for (const v of [C, D, F]) assert.doesNotMatch(cardOf(html, v), /guide-hh/, `${v.name}: no times (advisory, season, none)`);
  assert.match(html, /<style id="guide-hh">/);
  // Structured data: the ItemList stays valid and carries no offers or prices.
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.ok(ld.length >= 1);
  const list = ld.find((x) => x['@type'] === 'ItemList');
  if (list) assert.equal(list.itemListElement[0].position, 1);
  assert.doesNotMatch(JSON.stringify(ld), /"offers"|"price"|PriceSpecification/);
  // Other badge pages are unchanged.
  const patio = app.renderGuidePage('kelowna', 'patio', guideList(), null, at(TUE, '17:20'));
  assert.doesNotMatch(patio, /guide-hh/);
});

test('town Happy Hour page in French: tags, times, deals (French lines, else English marked lang="en")', async () => {
  const html = app.renderGuidePage('kelowna', 'happy_hour', guideList(), null, at(TUE, '17:20'), { lang: 'fr' });
  const a = cardOf(html, A);
  assert.match(a, new RegExp(nb('<span class="guide-hh-tag">En cours · se termine dans 40 min</span> <span class="guide-hh-label">Happy hour_:</span> Aujourd’hui 15 h–18 h')));
  assert.match(a, new RegExp(nb('Spéciaux_:</span> <span>6 \\$ Pintes maison \\(20 oz\\), 10 \\$ Cocktails</span>')));
  assert.match(cardOf(html, B), /se termine dans 1 h 40[\s\S]*<span lang="en">\$0\.75 each Wings<\/span>/);
  assert.match(cardOf(html, H), /Pas de happy hour aujourd’hui · Lun/);
  // Served at /fr/guide/kelowna/happy_hour (the real clock there): French lines, no English labels.
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    const r = await fetch(`${base}/fr/guide/kelowna/happy_hour`);
    assert.equal(r.status, 200);
    const fr = await r.text();
    assert.match(fr, /class="guide-hh"/);
    assert.match(fr, /Spéciaux :/);
    assert.doesNotMatch(fr, /guide-hh-label">(?:Happy hour|Deals):</);
    const en = await (await fetch(`${base}/guide/kelowna/happy_hour`)).text();
    assert.match(en, /guide-hh-label">Deals:</);
  } finally { srv.close(); }
});

test('nav: Happy Hour in Food & Drink (computer dropdown and phone menu), EN + FR, the town page when there is one', async () => {
  const header = app.renderGolfHeaderHtml();
  const panel = (/<div class="nav-dropdown-panel">\s*<a href="\/food-drink"[\s\S]*?<\/div>/.exec(header) || [''])[0];
  assert.match(panel, /<a href="\/cocktail-lounges"[^>]*>Cocktail Lounges<\/a>\s*<a href="\/guide\/kelowna\/happy_hour" class="nav-happy-hour" data-towns="kelowna">Happy Hour<\/a>\s*<\/div>$/);
  assert.equal((header.match(/class="nav-happy-hour"/g) || []).length, 1, 'once: the phone menu is the same list');
  assert.deepEqual(app.navHappyHourTowns(), ['kelowna']);
  // Idempotent.
  assert.equal(app.withNavRefresh(header), header);
  // The line of script: a town page with its own Happy Hour page points the link there (French pages stay French).
  const script = (/<script>(\(function\(\)\{var a=document\.querySelectorAll\('a\.nav-happy-hour'\)[\s\S]*?)<\/script>/.exec(header) || [])[1];
  assert.ok(script, 'the nav script ships');
  const run = (pathname, towns) => {
    const link = { attrs: { 'data-towns': towns, href: '/guide/kelowna/happy_hour' }, getAttribute(k) { return this.attrs[k]; }, setAttribute(k, v) { this.attrs[k] = v; } };
    vm.runInNewContext(script, { document: { querySelectorAll: () => [link] }, location: { pathname } });
    return link.attrs.href;
  };
  assert.equal(run('/penticton/pubs/some-pub', 'kelowna,penticton'), '/guide/penticton/happy_hour');
  assert.equal(run('/fr/guide/penticton/patio', 'kelowna,penticton'), '/fr/guide/penticton/happy_hour');
  assert.equal(run('/oliver/wineries', 'kelowna,penticton'), '/guide/kelowna/happy_hour', 'no page for that town: Kelowna');
  assert.equal(run('/guides/happy-hour-kelowna', 'kelowna,penticton'), '/guide/kelowna/happy_hour');
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    for (const p of ['/', '/food-drink']) {
      const en = await (await fetch(`${base}${p}`)).text();
      assert.match(en, /<a href="\/guide\/kelowna\/happy_hour" class="nav-happy-hour"[^>]*>Happy Hour<\/a>/, p);
    }
    const fr = await (await fetch(`${base}/fr/food-drink`)).text();
    assert.match(fr, /<a href="\/fr\/guide\/kelowna\/happy_hour" class="nav-happy-hour"[^>]*>Happy hour<\/a>/, 'French: /fr address, French label');
  } finally { srv.close(); }
});
