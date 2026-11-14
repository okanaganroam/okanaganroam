'use strict';
// French Build My Trip (2026-11-14): « une tournée des 5 à 7 à Kelowna demain » (the French trip page's own sample
// wording) and « une tournée des happy hours … » plan a happy hour crawl. « tournée » was left over and searched for
// (« Lieux qui mentionnent « tournee » »), while « 5 à 7 à Kelowna demain » already worked. « tournée des bars / des
// brasseries / des vignobles » stay a crawl or tour, never a search word.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'fr-tournee-crawl-token';
process.env.TRIP_PLANNER_V2 = 'on';
const app = require('../server.js');
const { tripPlannerText } = require('../trip-planner-fr.js');
const { t3FrenchText } = require('../trip-french-copy.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
let n = 0;
const mk = (o) => { n++; const { hoursObj, ...rest } = o;
  return app.createVenue({ slug: `fr-crawl-fixture-${n}`, region: 'kelowna', rating: 4.3, latitude: 49.888 + (n % 7) / 2000, longitude: -119.47 + (n % 5) / 2000,
    description: 'A fixture venue used only by the French crawl tests.', hours: JSON.stringify(hoursObj || open('11:00', '22:00')), ...rest }); };
const at = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(Date.parse(`${date}T00:00:00Z`) + ((h + 7) * 60 + m) * 60000); };
const TUE = '2026-10-27', WED = '2026-10-28';
const TUE_1PM = at(TUE, '13:00');
const meta = { reason: 'fr tournee fixture', batch_id: 'test-fr-tournee' };
const hhTimes = (v, times, deals) => {
  assert.equal(app.guardedHappyHourUpdate(v.id, null, { times, source_url: 'https://example.com/hh', checked_at: TUE }, meta).ok, true);
  assert.equal(app.guardedHappyHourDealsUpdate(v.id, null, { deals, source_url: 'https://example.com/hh', checked_at: TUE }, meta).ok, true);
};
const full = (text, now) => app.withTripWeeklyNights(app.withTripSpecials(app.withTripFrenchUrls(app.withTripHappyHourDeals(app.runTripPlan({ text }, now), now)), now), now);

hhTimes(mk({ name: 'Crawl Taps', type: 'pub', happy_hour: true, rating: 4.6, hoursObj: open('11:00', '23:00') }), open('14:00', '17:00'), [{ text: 'House pints', price: '$5' }]);
hhTimes(mk({ name: 'Crawl Lounge', type: 'cocktail', happy_hour: true, rating: 4.5, hoursObj: open('15:00', '23:59') }), open('15:00', '18:00'), [{ text: 'Classic cocktails', price: '$9' }]);
hhTimes(mk({ name: 'Crawl Brew House', type: 'brewery', happy_hour: true, rating: 4.4, hoursObj: open('12:00', '22:00') }), open('16:00', '18:00'), [{ text: 'Pints', price: '$6' }]);
for (let i = 1; i <= 3; i++) mk({ name: `Crawl Supper ${i}`, type: 'restaurant', price: 3, description: 'A dinner bistro.', hoursObj: open('17:00', '22:00') });

test('the French words: « tournée des 5 à 7 / happy hours / apéros » is a happy hour crawl; bars, breweries and wineries keep theirs', () => {
  const cases = {
    'une tournée des 5 à 7 à Kelowna demain': 'a happy hour crawl at kelowna tomorrow',
    'Une tournée des happy hours à Kelowna demain': 'a happy hour crawl at kelowna tomorrow',
    'une tournée des happy hour à Kelowna': 'a happy hour crawl at kelowna',
    'tournée des cinq à sept à Kelowna': 'happy hour crawl at kelowna',
    'une tournée des apéros à Kelowna ce soir': 'a happy hour crawl at kelowna tonight',
    '5 à 7 à Kelowna demain': 'happy hour at kelowna tomorrow',
    'une tournée des bars à Kelowna': 'a bar crawl at kelowna',
    'une tournée des bars à cocktails à Kelowna': 'a bar crawl at kelowna',
    'une tournée des brasseries à Kelowna demain': 'a brewery crawl at kelowna tomorrow',
    'une tournée des vignobles à Kelowna': 'a wine tour at kelowna',
    'une tournée des caves à Oliver': 'a wine tour at oliver',
  };
  for (const [fr, en] of Object.entries(cases)) assert.equal(tripPlannerText(fr), en, fr);
});

test('« une tournée des 5 à 7 / des happy hours à Kelowna demain » plans tomorrow\'s happy hour crawl, in French', () => {
  for (const text of ['une tournée des 5 à 7 à Kelowna demain', 'Une tournée des happy hours à Kelowna demain', 'tournée des 5 à 7 à Kelowna demain']) {
    const p = full(text, TUE_1PM);
    assert.equal(p.kind, 'itinerary', `${text}: ${JSON.stringify([p.kind, p.summary, p.notes])}`);
    assert.ok(p.happyHourCrawl, text);
    assert.ok(p.schedule.every((r) => r.date === WED), text);
    assert.equal(t3FrenchText(p.summary), 'Une tournée des 5 à 7 à Kelowna demain.', text);
    assert.doesNotMatch(JSON.stringify(p), /tournee/i, `${text}: « tournée » is not searched for`);
  }
  // Unchanged: « 5 à 7 à Kelowna demain ».
  const plain = full('5 à 7 à Kelowna demain', TUE_1PM);
  assert.ok(plain.happyHourCrawl);
});

test('« tournée des bars / des brasseries / des vignobles » are never a searched word', () => {
  for (const text of ['une tournée des bars à Kelowna demain', 'une tournée des brasseries à Kelowna demain', 'une tournée des vignobles à Kelowna demain']) {
    const p = full(text, TUE_1PM);
    const summary = t3FrenchText(p.summary || '');
    assert.doesNotMatch(summary, /Lieux qui mentionnent/, `${text}: ${summary}`);
    assert.doesNotMatch(JSON.stringify(p), /tournee/i, text);
  }
  assert.ok(full('une tournée des bars à Kelowna demain', TUE_1PM).happyHourCrawl, 'a bar crawl is the timed happy hour outing');
});
