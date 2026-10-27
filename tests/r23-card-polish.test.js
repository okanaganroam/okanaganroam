// Card polish (2026-10-27): no repeated text on the venue page's deals card and weekly nights card, for every venue.
// A special's deal line is hidden when it only repeats the title, price and time ("Wicked Wing Wednesday" · "89¢ each" ·
// "Wings 89 cents each from 4 pm" · "from 4 PM"), and a kept one loses the repeated time phrase and leading price; a
// generic title ("Monday Deal") gives way to the deal. The happy hour block shows one "Checked" date (the later one) or
// the "Confirmed by" line once. A night drops its kind label when the title says it ("Karaoke Madness") and a detail
// that only restates the row. Price ranges take an en dash and never wrap. Same rules on Roam Now and Build My Trip.
// Runs on a throwaway database (like server.test.js); run `git checkout -q okanagan.db` afterwards.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const DB_FILE = path.join(__dirname, '..', 'okanagan.db');
if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
process.env.ENRICHMENT_ADMIN_TOKEN = 'r23-card-polish-admin-token';
const app = require('../server.js');
const db = require('../db.js');

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const open = (from, to) => Object.fromEntries(WEEK.map((k) => [k, [[from, to]]]));
let n = 0;
const mk = (o) => app.createVenue({ slug: `polish-fixture-${++n}`, region: 'kelowna', type: 'pub', latitude: 49.887 + n / 1000, longitude: -119.495, rating: 4.2,
  happy_hour: true, description: 'A fixture pub used only by the card polish tests.', hours: JSON.stringify(open('11:30', '23:59')), ...o });
const meta = { reason: 'card polish fixture', batch_id: 'test-card-polish' };
const today = app.todayLocal();
const daysAgo = (d) => app.addLocalDays(today, -d);
const page = (v, lang) => app.renderVenuePage(app.getVenue(v.id), [], [], [], { lang });
const dealsBody = (html, block) => (new RegExp(`<div class="venue-deals-block" data-block="${block}">(?:<h3>[^<]*</h3>)?<div class="venue-deals-body">([\\s\\S]*?)</div></div>`).exec(html) || [])[1] || '';
const nightsCard = (html) => (/<section class="venue-section venue-nights-card" id="venueNights"[\s\S]*?<\/section>/.exec(html) || [])[0] || '';
const text = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, '[icon]').replace(/<[^>]+>/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/[\u00a0\u202f\u2060]/g, ' ').replace(/\s+/g, ' ').trim();
const shown = (s) => app.specialShownText(s, s.title, s.deal);

test('specials: a deal that only repeats the title, price and time is hidden (O\'Flannigan\'s "Wicked Wing Wednesday")', () => {
  assert.deepEqual(shown({ title: 'Wicked Wing Wednesday', price: '89¢ each', deal: 'Wings 89 cents each from 4 pm', start: '16:00', end: 'close' }), { title: 'Wicked Wing Wednesday', deal: '', dealFull: '' });
  assert.equal(shown({ title: 'Taco Tuesday', price: '$3 each', deal: '$3 tacos' }).deal, '');
  assert.equal(shown({ title: 'Wing Night', price: '$10', deal: 'Wings after 3pm', start: '15:00' }).deal, '');
  assert.equal(shown({ title: 'Wing Night', price: '$10', deal: 'Wings 4-close', start: '16:00', end: 'close' }).deal, '');
  assert.equal(shown({ title: '$2 Oyster Wednesdays', price: '$2 each', deal: '$2 oysters all night' }).deal, '');
  assert.equal(shown({ title: 'Half-price wine Tuesday', price: 'half price', deal: 'Half-price wine all day' }).deal, '');
  assert.equal(shown({ title: 'Deal day', price: '$9.99', deal: 'Deal 9.99 every day' }).deal, '');
  assert.equal(shown({ title: 'Weekend Pizza Benny', price: '$18', deal: 'Pizza benny, 11am to 2pm', start: '11:00', end: '14:00' }).deal, '');
  // The old rule still holds.
  assert.equal(shown({ title: 'Taco Tuesday', deal: 'Tacos' }).deal, '');
  assert.equal(app.specialDealShown({ title: 'Margarita Monday', price: '$11' }, 'Margarita Monday', 'Margaritas'), '');
});

test('specials: a deal with real information stays, without the repeated time phrase or leading price', () => {
  assert.equal(shown({ title: 'Wicked Wing Wednesday', price: '89¢ each', deal: 'Wings 89 cents each, dine-in only', start: '16:00', end: 'close' }).deal, 'Wings 89 cents each, dine-in only');
  assert.equal(shown({ title: 'Wing Wednesday', price: '$12', deal: 'Wings with fries from 4 pm', start: '16:00', end: 'close' }).deal, 'Wings with fries');
  assert.equal(shown({ title: 'Sunday Family Dinner', price: '$50 per person', deal: 'Family-style shared platters, prime rib in rotation, from 5 pm', start: '17:00' }).deal,
    'Family-style shared platters, prime rib in rotation');
  assert.equal(shown({ title: 'Brunch drinks', price: '$6 / $7', deal: 'Mimosas $6 and Caesars $7 until 3 pm', end: '15:00' }).deal, 'Mimosas $6 and Caesars $7');
  assert.equal(shown({ title: 'Taco Tuesday', price: '$4 each', deal: 'Weekly taco from 3pm: 1 for $4 or 3 for $10', start: '15:00' }).deal, 'Weekly taco: 1 for $4 or 3 for $10');
  // A time that is not the one shown is information.
  assert.equal(shown({ title: 'Wing Night', price: '$10', deal: 'Wings from 4 pm', start: null, end: null }).deal, 'Wings from 4 pm');
  assert.equal(shown({ title: 'Wing Night', price: '$10', deal: 'Wings after 9pm', start: '16:00', end: 'close' }).deal, 'Wings after 9pm');
  assert.equal(shown({ title: 'Pool league', price: '$5', deal: 'Check-in at 6pm, teams of four', start: '18:00' }).deal, 'Check-in at 6pm, teams of four');
  assert.equal(shown({ title: 'Ten dollar Tuesday', price: '$10', deal: '4 tacos and a pint' }).deal, '4 tacos and a pint');
  // Leading price: only a simple one, never a price list or "$5 for two".
  assert.equal(shown({ title: 'Wine Wednesday', price: '$20 off', deal: '$20 off any bottle of wine with a food purchase' }).deal, 'Any bottle of wine with a food purchase');
  assert.equal(shown({ title: 'Wing Wednesday', price: 'half price', deal: 'Half-price wings with a drink purchase, dine-in' }).deal, 'Wings with a drink purchase, dine-in');
  assert.equal(shown({ title: 'Kids eat free', price: 'free', deal: 'Free kids meal with each adult entree' }).deal, 'Kids meal with each adult entree');
  assert.equal(shown({ title: 'Friday Shots & Lager', price: '$5', deal: '$5 Fireball, $6 Jagerbombs, $16 jugs' }).deal, '$5 Fireball, $6 Jagerbombs, $16 jugs');
  assert.equal(shown({ title: 'Taco Tuesday', price: '$5', deal: '$5 for two tacos' }).deal, '$5 for two tacos');
  assert.equal(shown({ title: 'Burger Tuesday', price: '$5', deal: '$5 off smash burgers' }).deal, '$5 off smash burgers');
  // French: « dès 16 h » matches a 16:00 start.
  assert.equal(app.specialDealShown({ title_fr: 'Mercredi ailes', price: '60 ¢', start: '16:00', end: 'close' }, 'Mercredi ailes', 'Ailes à 60 ¢ avec frites dès 16 h'), 'Ailes à 60 ¢ avec frites');
});

test('specials: a generic title ("Monday Deal", "Tuesday Special") gives way to the deal, unless the deal is a price list', () => {
  assert.equal(app.specialTitleIsGeneric('Monday Deal'), true);
  assert.equal(app.specialTitleIsGeneric('Weekend Deals'), true);
  assert.equal(app.specialTitleIsGeneric('Thursday Features'), true);
  assert.equal(app.specialTitleIsGeneric('Monday pizza deal'), false);
  assert.equal(app.specialTitleIsGeneric('Taco Tuesday'), false);
  assert.deepEqual(shown({ title: 'Monday Deal', price: '$9.99', deal: 'Mashawi Knock-Out Wrap, in-store or online' }), { title: 'Mashawi Knock-Out Wrap, in-store or online', deal: '', dealFull: '' });
  assert.deepEqual(shown({ title: 'Saturday Special', price: '$23', deal: 'chilaquiles plus a beer' }), { title: 'Chilaquiles plus a beer', deal: '', dealFull: '' });
  assert.equal(shown({ title: 'Monday Features', price: '$8 / $30', deal: 'CRAFT Mule $8; any two pizzas $30' }).deal, 'CRAFT Mule $8; any two pizzas $30');
});

test('price ranges: an en dash between two prices; each price kept on one line in the deals column', () => {
  assert.equal(app.priceRangeText('$4.95 - $12.95'), '$4.95 – $12.95');
  assert.equal(app.priceRangeText('$4.95-$12.95'), '$4.95 – $12.95');
  assert.equal(app.priceRangeText('$1-$3 off'), '$1 – $3 off');
  assert.equal(app.priceRangeText('$14.00–$16.00'), '$14.00 – $16.00');
  assert.equal(app.priceRangeText('$6 / $9'), '$6 / $9');
  assert.equal(app.priceRangeText('half price'), 'half price');
  assert.equal(app.happyHourPriceHtml('$4.95 - $12.95'), '$4.95 – $12.95');
  assert.equal(app.happyHourPriceHtml('$6'), '$6');
  assert.equal(app.happyHourPriceHtml('$6 / $9'), '$6<span class="venue-price-sep"> / </span>$9');
  assert.equal(app.happyHourPriceHtml('$12 or $29'), '$12<span class="venue-price-sep"> or </span>$29');
  assert.equal(app.happyHourPriceHtml(''), '');
});

test('weekly nights: the kind label goes when the title says it; a detail that only restates the row goes too (EN + FR)', () => {
  const k = (title, kind) => app.nightShownText({ title, kind }, title, null, false).kind;
  assert.equal(k('Karaoke Madness', 'karaoke'), '');
  assert.equal(k('Open Mic Night', 'open_mic'), '');
  assert.equal(k('Sunday Jam Night', 'open_mic'), '');
  assert.equal(k('Live Bands Fri & Sat', 'live_music'), '');
  assert.equal(k('Tapas & Tunes Live Blues', 'live_music'), '');
  assert.equal(k('POP QUIZ Trivia', 'trivia'), '');
  assert.equal(k('Music Trivingo', 'bingo'), '');
  assert.equal(k('SINGO! Music Bingo', 'bingo'), '');
  assert.equal(k('NFL Football Sundays', 'sports'), '');
  assert.equal(k('Game Day viewing', 'sports'), '');
  assert.equal(k('Crib Tournament', 'games'), '');
  assert.equal(k('Never Miss A Monday Run Club', 'run_club'), '');
  assert.equal(k('Erica Jane After Dark', 'dj'), 'DJ night');
  assert.equal(k('Taps & Tunes', 'live_music'), 'Live music');
  assert.equal(k('Tuesday Night', 'trivia'), 'Trivia');
  assert.equal(app.nightShownText({ title: 'Karaoke Madness', kind: 'karaoke' }, 'Karaoke Madness', null, true).kind, '', 'French label too');
  assert.equal(app.nightShownText({ title: 'Mardi soir', kind: 'trivia' }, 'Mardi soir', null, true).kind, 'Quiz');

  const d = (s) => app.nightShownText({ host: null, cost: null, ...s }, s.title, s.detail, false).detail;
  assert.equal(d({ title: 'Karaoke Madness', kind: 'karaoke', detail: 'Karaoke two nights a week' }), '');
  assert.equal(d({ title: 'Open Mic Night', kind: 'open_mic', detail: 'Weekly open mic for local performers' }), '');
  assert.equal(d({ title: 'Live Music Fridays', kind: 'live_music', detail: 'Live music every Friday' }), '');
  assert.equal(d({ title: 'Trivia Wednesdays', kind: 'trivia', detail: 'Weekly trivia night' }), '');
  assert.equal(d({ title: 'Night Shift DJ Saturdays', kind: 'dj', detail: 'Night Shift DJ on Saturdays' }), '');
  assert.equal(d({ title: 'Friday Night Music Trivia', kind: 'trivia', detail: 'Music trivia hosted by James', host: 'James' }), '');
  assert.equal(d({ title: 'Trivia Tuesday', kind: 'trivia', detail: 'Teams up to 6, prizes for the top 3', start: '19:00', end: '21:00' }), 'Teams up to 6, prizes for the top 3');
  assert.equal(d({ title: 'Live Bands Fri & Sat', kind: 'live_music', detail: 'Rotating local bands; sets start around 9 to 9:30pm', start: '21:30' }), 'Rotating local bands; sets start around 9 to 9:30pm');
  assert.equal(d({ title: 'Open Mic Night', kind: 'open_mic', detail: 'Free entry' }), 'Free entry');
  assert.equal(d({ title: 'Wednesday Pool League', kind: 'games', detail: 'Six-person double-knockout pool; check-in at 6pm', start: '18:00' }), 'Six-person double-knockout pool; check-in at 6pm');
  assert.equal(d({ title: 'Trivia', kind: 'trivia', detail: 'Free trivia from 7 pm, teams up to 6', start: '19:00' }), 'Free trivia, teams up to 6', 'the shown time comes out of a kept detail');
});

// O'Flannigan's-like: happy hour times checked Oct 14-ish, deals checked today, a wing special and three nights.
const pub = mk({ name: 'Polish Flannigan Pub' });
{
  const r = app.guardedHappyHourUpdate(pub.id, null, { times: { mon: [['14:00', '18:00']], tue: [['14:00', '18:00']], wed: [['14:00', '18:00']], thu: [['14:00', '18:00']], fri: [['14:00', '18:00']] },
    source_url: 'https://example.com/hh', checked_at: daysAgo(12) }, meta);
  assert.equal(r.ok, true, JSON.stringify(r));
  const d = app.guardedHappyHourDealsUpdate(pub.id, null, { deals: [{ text: 'Draft Bud & Bud Light', price: '$6.25' }, { text: 'Selected appetizers', price: '$4.95 - $12.95' }],
    source_url: 'https://example.com/hh', checked_at: today }, meta);
  assert.equal(d.ok, true, JSON.stringify(d));
  const s = app.guardedSpecialsUpdate(pub.id, null, { specials: [{ days: ['wed'], title: 'Wicked Wing Wednesday', deal: 'Wings 89 cents each from 4 pm', price: '89¢ each', kind: 'food', start: '16:00', end: 'close' }],
    source_url: 'https://example.com/specials', checked_at: today }, meta);
  assert.equal(s.ok, true, JSON.stringify(s));
  const w = app.guardedWeeklyNightsUpdate(pub.id, null, { nights: [
    { days: ['mon', 'wed'], kind: 'karaoke', title: 'Karaoke Madness', start: '20:30', detail: 'Karaoke two nights a week' },
    { days: ['thu'], kind: 'open_mic', title: 'Open Mic Night', start: '21:00', detail: 'Weekly open mic for local performers' },
    { days: ['fri', 'sat'], kind: 'live_music', title: 'Live Bands Fri & Sat', start: '21:30', detail: 'Rotating local bands; sets start around 9 to 9:30pm' },
    { days: ['tue'], kind: 'trivia', title: 'Pub Quiz', start: '19:00', detail: 'Weekly trivia for teams up to 6', host: 'Dave' },
  ], source_url: 'https://example.com/events', checked_at: today }, meta);
  assert.equal(w.ok, true, JSON.stringify(w));
}

test('venue page: one "Checked" line (the later date) at the bottom of the happy hour block (EN + FR)', () => {
  const en = page(pub), fr = page(pub, 'fr');
  const hh = dealsBody(en, 'hh');
  assert.equal((hh.match(/venue-hours-checked/g) || []).length, 1, hh);
  assert.ok(hh.endsWith(`<span class="venue-hours-checked venue-hh-deals-checked">${app.happyHourCheckedText(today, false)}</span>`), hh);
  assert.ok(hh.indexOf('venue-hh-times') < hh.indexOf('venue-hh-deals'), 'times, then deals, then the checked line');
  const hhFr = dealsBody(fr, 'hh');
  assert.equal((hhFr.match(/venue-hours-checked/g) || []).length, 1, hhFr);
  assert.ok(hhFr.includes(app.happyHourCheckedText(today, true)));
  // The deals card's own checked lines: one per block.
  assert.equal((dealsBody(en, 'sp').match(/venue-hours-checked/g) || []).length, 1);
});

test('venue page: the wing special shows its title, price and time once; the range price takes an en dash on one line', () => {
  const en = page(pub);
  const sp = text(dealsBody(en, 'sp'));
  assert.match(sp, /Wed Wicked Wing Wednesday 89¢ each (Today )?from 4 PM/);
  assert.doesNotMatch(sp, /cents|4 pm/);
  const hh = dealsBody(en, 'hh');
  assert.ok(hh.includes('<span class="venue-hh-deal-price">$4.95 – $12.95</span>'), hh);
  assert.doesNotMatch(hh, /\$4\.95 - /);
  assert.match(en, /body\.golf-page \.venue-hh-deal-price \{ min-width: 3\.9em; font-weight: 800; color: var\(--teal-deep, #1E4F4C\); white-space: nowrap; \}/);
  assert.match(en, /body\.golf-page \.venue-price-sep \{ white-space: normal; \}/);
  assert.match(en, /body\.golf-page \.venue-hh-deal-list \{ display: grid; grid-template-columns: fit-content\(8\.5em\) minmax\(0, 1fr\);/);
  assert.match(en, /body\.golf-page \.venue-hh-deal \{ grid-column: 1 \/ -1; display: grid; grid-template-columns: subgrid;/);
});

test('venue page: weekly nights drop the repeated kind label and detail; the kind icon stays (EN + FR)', () => {
  const en = nightsCard(page(pub)), fr = nightsCard(page(pub, 'fr'));
  const rows = en.split('role="listitem"').slice(1);
  const byTitle = (t) => rows.find((r) => r.includes(`>${t}<`)) || '';
  const karaoke = byTitle('Karaoke Madness');
  assert.ok(karaoke.includes('<span class="venue-wn-kind"><svg'), 'icon kept');
  assert.doesNotMatch(text(karaoke), /Karaoke ·|two nights/);
  assert.doesNotMatch(text(byTitle('Open Mic Night')), /Open mic ·|local performers/);
  const bands = byTitle('Live Bands Fri &amp; Sat');
  assert.match(text(bands), /\[icon\] Rotating local bands; sets start around 9 to 9:30pm/);
  assert.doesNotMatch(text(bands), /Live music/);
  // "Pub Quiz" says the kind (quiz); the detail keeps "teams up to 6" (it adds something).
  const quiz = byTitle('Pub Quiz');
  assert.match(text(quiz), /\[icon\] Weekly trivia for teams up to 6 · Hosted by Dave/);
  assert.doesNotMatch(text(quiz), /Trivia ·/);
  // French: no « Karaoké » label after "Karaoke Madness".
  const frK = fr.split('role="listitem"').slice(1).find((r) => r.includes('>Karaoke Madness<')) || '';
  assert.doesNotMatch(text(frK), /Karaoké/);
  assert.ok(frK.includes('<span class="venue-wn-kind"><svg'));
});

test('venue page: a kind label that adds something stays ("Taps & Tunes" · Live music)', () => {
  const v = mk({ name: 'Polish Tunes Pub' });
  const w = app.guardedWeeklyNightsUpdate(v.id, null, { nights: [{ days: ['thu'], kind: 'live_music', title: 'Taps & Tunes', start: '19:00', detail: 'Local up-and-coming artists', cost: 'Free' }],
    source_url: 'https://example.com/events', checked_at: today }, meta);
  assert.equal(w.ok, true, JSON.stringify(w));
  assert.match(text(nightsCard(page(v))), /Taps & Tunes 7 PM \[icon\] Live music · Local up-and-coming artists · Free/);
});

test('venue page: owner-entered deals show "Confirmed by <venue>" once at the bottom of the happy hour block', () => {
  const v = mk({ name: 'Polish Owner Pub' });
  const r = app.guardedHappyHourUpdate(v.id, null, { times: { fri: [['15:00', '18:00']] }, source_url: 'https://example.com/hh', checked_at: daysAgo(20) }, meta);
  assert.equal(r.ok, true, JSON.stringify(r));
  const d = app.guardedHappyHourDealsUpdate(v.id, null, { deals: [{ text: 'House pints', price: '$6' }], source_url: 'venue_owner', checked_at: daysAgo(2) }, meta);
  assert.equal(d.ok, true, JSON.stringify(d));
  const hh = dealsBody(page(v), 'hh');
  assert.equal((hh.match(/venue-hours-checked/g) || []).length, 1, hh);
  assert.equal((hh.match(/Confirmed by Polish Owner Pub/g) || []).length, 1);
  assert.doesNotMatch(hh, /Checked /);
  assert.ok(/<span class="venue-hours-checked venue-hh-deals-checked"><span class="venue-confirmed">[\s\S]*<\/span><\/span><\/span>$/.test(hh), hh);
});

test('Roam Now / Build My Trip lines: the same rule; a hidden deal lets the price stand in', () => {
  const W = { title: 'Wicked Wing Wednesday', deal: 'Wings 89 cents each from 4 pm', price: '89¢ each', start: '16:00', end: 'close' };
  assert.deepEqual(app.specialLine(W, false), { text: 'Wicked Wing Wednesday · 89¢ each', english: false });
  assert.deepEqual(app.specialLine({ title: 'Wing Wednesday', price: '$12', deal: 'Wings with fries from 4 pm', start: '16:00' }, false), { text: 'Wing Wednesday · Wings with fries', english: false });
  assert.deepEqual(app.specialLine({ title: 'Monday Deal', price: '$9.99', deal: 'Mashawi wrap' }, false), { text: 'Mashawi wrap · $9.99', english: false });
  assert.equal(app.specialsCompact([W, { title: 'Taco Tuesday', deal: 'Tacos' }], false).text, 'Wicked Wing Wednesday · 89¢ each; Taco Tuesday');
  // A line with no price column keeps the deal's own price ("$20 off" is the news).
  assert.deepEqual(app.specialLine({ title: 'Wine Wednesday', price: '$20 off', deal: '$20 off any bottle of wine' }, false), { text: 'Wine Wednesday · $20 off any bottle of wine', english: false });
  assert.equal(app.happyHourDealsCompact([{ text: 'Selected appetizers', price: '$4.95 - $12.95' }]), '$4.95 – $12.95 Selected appetizers');
});
