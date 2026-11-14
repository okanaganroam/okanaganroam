// French public side says « 5 à 7 » (2026-11-14): the owner portal already did (PR #865); now Roam Now, the map, the
// venue page, the Food & Drink nav link, cards and badges, the French guides and Build My Trip French say « 5 à 7 »
// instead of « happy hour ». English is unchanged, and so are the URLs (/map?show=happy-hour, /guide/<town>/happy_hour).
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.OKR_TODAY_OVERRIDE = '2026-10-27';
const app = require('../server.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const every = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
let n = 0;
const mk = (o) => app.createVenue({ slug: `fr-5a7-fixture-${++n}`, region: 'kelowna', type: 'pub', latitude: 49.88 + n / 1000, longitude: -119.49, rating: 4.4, reviews: 500 - n,
  happy_hour: true, description: 'A fixture pub used only by the French public wording tests.', description_fr: 'Un pub de test.',
  hours: JSON.stringify(every('11:00', '23:00')), ...o });
const meta = { reason: 'fr 5a7 fixture', batch_id: 'test-fr-5a7' };
const today = app.todayLocal();
// Pacific (PDT, UTC−7) wall-clock time on a date.
const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.parse(`${date}T00:00:00Z`) + ((h + 7) * 60 + m) * 60000); };
const TUE = '2026-10-27';

const pubs = [];
for (let i = 0; i < 9; i++) pubs.push(mk({ name: `FR 5a7 Pub ${i + 1}` }));
for (const v of pubs) {
  assert.equal(app.guardedHappyHourUpdate(v.id, null, { times: every('15:00', '18:00'), source_url: 'https://example.com/hh', checked_at: today }, meta).ok, true);
  assert.equal(app.guardedHappyHourDealsUpdate(v.id, null, { deals: [{ text: 'House pints', price: '$6' }], deals_fr: [{ text: 'Pintes maison', price: '6 $' }],
    source_url: 'https://example.com/hh-deals', checked_at: today }, meta).ok, true);
}
const V = pubs[0];

// What a visitor reads: the page without its scripts, styles, tags and attributes.
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
const HH = /happy[\s -]?hours?/i;
const A7 = /5[\s ]à[\s ]7/;

test('venue page: French says « 5 à 7 » (live line, row, deals card), never « happy hour »; English unchanged', () => {
  const fr = app.renderVenuePage(app.getVenue(V.id), [], [], [], { now: at(TUE, '16:00'), lang: 'fr' });
  const en = app.renderVenuePage(app.getVenue(V.id), [], [], [], { now: at(TUE, '16:00') });
  assert.match(fr, /id="venueHappyHour">[\s\S]*?5 à 7 en cours · se termine dans 2 h<\/p>/);
  assert.match(fr, /Spéciaux du 5 à 7|5 à 7 et spéciaux de la semaine/);
  assert.match(fr, /aria-label="Spéciaux du 5 à 7"|<h3>5 à 7<\/h3>|>Spéciaux du 5 à 7</);
  assert.doesNotMatch(visible(fr), HH, visible(fr).match(new RegExp('.{0,60}' + HH.source + '.{0,60}', 'i')));
  assert.match(en, /id="venueHappyHour">[\s\S]*?Happy hour on now · ends in 2 hr<\/p>/);
  assert.match(en, />Happy hour deals</);
  assert.doesNotMatch(visible(en), A7, 'English never says « 5 à 7 »');
  // The next one: « Prochain 5 à 7 : demain 15 h » with a no-break space before the colon.
  assert.equal(app.happyHourLiveText({ state: 'next', from: { weekday: 'wed', minutes: 900 }, daysAhead: 1 }, true), 'Prochain 5 à 7 : demain 15 h');
  assert.equal(app.happyHourLiveText({ state: 'next', from: { weekday: 'wed', minutes: 900 }, daysAhead: 1 }, false), 'Next happy hour: tomorrow 3 PM');
});

test('Roam Now / map: the French filter chip, Today lines, heading and empty note say « 5 à 7 »; English unchanged', async () => {
  const fr = app.renderPlacesMapPage({ lang: 'fr' });
  const en = app.renderPlacesMapPage({ lang: 'en' });
  for (const s of ["happy: '5 à 7'", "hhLaterNote: 'Aucun 5 à 7 en ce moment.", "hhNow: function(t){ return '5 à 7 en cours'",
    "hhOnNow: function(t){ return '5 à 7 en cours · se termine dans ' + t; }", "hhLater: function(t){ return '5 à 7 aujourd’hui dès ' + t; }",
    "(FR ? '5 à 7 en cours' : 'Happy Hour Now')", "FR ? 'Aucun 5 à 7 en cours ne correspond à cette recherche.'"]) {
    assert.ok(fr.includes(s) || en.includes(s), s);
  }
  for (const s of ["happy: 'Happy hour'", "hhNow: function(t){ return 'Happy hour now'", "hhLater: function(t){ return 'Happy hour today from ' + t; }"]) assert.ok(en.includes(s), s);
  // The French strings table carries no « happy hour » at all.
  const frDict = /hhLaterNote: 'Aucun[\s\S]*?hhLater: function\(t\)\{[^}]*\}/.exec(fr + en)[0];
  assert.doesNotMatch(frDict, HH);
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    const frMap = await (await fetch(`${base}/fr/map?show=happy-hour`)).text();
    assert.match(frMap, /<h1 class="rn-happy-copy">5 à 7 en cours<\/h1><p class="rn-happy-copy">Trouvez les 5 à 7 en cours\.<\/p>/);
    assert.doesNotMatch(visible(frMap), HH, (visible(frMap).match(new RegExp('.{0,60}' + HH.source + '.{0,60}', 'i')) || [''])[0]);
    const enMap = await (await fetch(`${base}/map?show=happy-hour`)).text();
    assert.match(enMap, /<h1 class="rn-happy-copy">Happy Hour Now<\/h1><p class="rn-happy-copy">Find happy hours happening right now\.<\/p>/);
    assert.doesNotMatch(visible(enMap), A7);
  } finally { srv.close(); }
});

test('nav, homepage strip and the town 5 à 7 page: French says « 5 à 7 », the addresses keep happy-hour / happy_hour', async () => {
  const srv = http.createServer(app.server.listeners('request')[0]);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    const fr = await (await fetch(`${base}/fr/food-drink`)).text();
    assert.match(fr, /<a href="\/fr\/guide\/kelowna\/happy_hour" class="nav-happy-hour"[^>]*>5 à 7<\/a>/);
    assert.doesNotMatch(visible(fr), HH, (visible(fr).match(new RegExp('.{0,60}' + HH.source + '.{0,60}', 'i')) || [''])[0]);
    const en = await (await fetch(`${base}/food-drink`)).text();
    assert.match(en, /<a href="\/guide\/kelowna\/happy_hour" class="nav-happy-hour"[^>]*>Happy Hour<\/a>/);
    const guideFr = await (await fetch(`${base}/fr/guide/kelowna/happy_hour`)).text();
    assert.match(guideFr, /<h1[^>]*>5 à 7 à Kelowna<\/h1>/);
    assert.match(guideFr, /<title>5 à 7 à Kelowna \(C\.-B\.\) \| Okanagan Roam<\/title>/);
    assert.doesNotMatch(visible(guideFr), HH, (visible(guideFr).match(new RegExp('.{0,60}' + HH.source + '.{0,60}', 'i')) || [''])[0]);
    const guideEn = await (await fetch(`${base}/guide/kelowna/happy_hour`)).text();
    assert.match(guideEn, /<h1[^>]*>Happy Hour in Kelowna<\/h1>/);
  } finally { srv.close(); }
  assert.equal(app.happyHourNowShort({ state: 'now', count: 9 }, true), '5 à 7 en cours');
  assert.equal(app.happyHourNowShort({ state: 'now', count: 9 }, false), 'happy hours on now');
  assert.equal(app.happyHourNowLabel({ state: 'now', count: 9 }, true), '5 à 7 en cours à 9 endroits');
});

test('Build My Trip French: « une tournée des 5 à 7 », the stop label and its line', () => {
  const { t3FrenchText } = require('../trip-french-copy.js');
  assert.equal(t3FrenchText('A happy hour crawl in Kelowna tomorrow.'), 'Une tournée des 5 à 7 à Kelowna demain.');
  assert.equal(t3FrenchText('Happy hour and dinner in Vernon on Friday.'), '5 à 7 et souper à Vernon vendredi.');
  assert.equal(t3FrenchText('Happy hour 3–6 PM on Tuesday, from its listing'), '5 à 7 le mardi, 15 h–18 h, selon sa fiche');
  assert.equal(t3FrenchText('Happy hour'), '5 à 7');
});
