// Sport test 10 (2026-11-21): every question Lorraine typed into Help (the one suggestion tap left out), labelled on the
// merits. Lorraine is the office & admin manager of The Harvest Golf Club in Kelowna (18 holes, semi-private, a driving
// range, Masa's Grill on site, tee times booked ahead); she started on the office laptop and finished on her phone, and
// Mathieu, the academy's junior coach, asked the two French ones (drafts/fresh-eyes-sport10-2026-11-21/help-log.json).
// [src, page, language of the page, question, ok, harm]. ok: the topics that answer it well; UNSURE in ok: "I'm not sure,
// Ask us" is a fine outcome. harm: answers that point her the wrong way (the season dates for a one-day tournament, the
// seasonal-hours answer on the price screen, happy-hour deals for a club with no happy hour).
// Run by tests/help-heldout.test.js (with the other real logs) and tests/sport-test10-fixes.test.js.
'use strict';
const SRC = {
  sport10: { type: 'golf', kinds: ['golf', 'range'], book: 'ahead', price: 175, season: '03-19:10-31', length: 'half' },
};
const HH = ['hh-deals', 'hh-times', 'indoor-bar', 'sport-social-hour', 'setup-happy-split', 'hh-some-months'];
const Q = [
  ['sport10', 'edit', 'en', "Hello, I'm Lorraine, I look after the office and admin at The Harvest. I'll start this on my work computer today and finish it on my phone at home tonight. Will I lose what I've done or have to start again?", ['resume-device', 'setup-change-later', 'login-create'], ['logout']],
  ['sport10', 'edit', 'en', 'Who else will see what I type in here before it goes on the page? Our GM likes to approve anything public.', ['sport-approval-first', 'setup-who-sees', 'setup-live-when', 'live-speed'], []],
  ['sport10', 'setup', 'en', 'The address is missing our postal code (V1W 4S1). We also have a toll free line for out of town golfers, 1-800-257-8577. Can I list both numbers?', ['phone', 'name-address'], []],
  ['sport10', 'setup', 'en', 'Our tee sheet runs from dawn to dusk, so the times move through the season. In high season (April 30 to October 3) the golf shop is open 6 am to 8 pm, in the shoulder season more like 7:30 to 6. Should I enter the golf shop hours?', ['sport-first-tee', 'seasonal-hours', 'sport-dawn-dusk', 'sport-last-booking', 'hours-third-stretch'], []],
  ['sport10', 'setup', 'en', 'Right now the course is closed but the golf shop is open weekdays 9 to 5 for gift cards. Does that count as being open?', ['sport-part-season', 'sport-season-says', 'UNSURE'], []],
  ['sport10', 'setup', 'en', "We're closed for golf November to mid March, but we also have longer hours in high season. Do I click closed part of the year, or different hours in summer, or both?", ['sport-season', 'seasonal-hours', 'indoor-seasonal', 'season', 'hours-third-stretch'], []],
  ['sport10', 'setup', 'en', "Our restaurant, Masa's Grill, is part of the club. Should I add restaurant here as one of the 3, or does it have its own page somewhere?", ['sport-sister-listing', 'sport-restaurant', 'more-businesses', 'sport-kinds-other', 'UNSURE'], []],
  ['sport10', 'setup', 'en', "Our 18 hole rate is $215 in high season and $175 in the shoulder season, both with cart and range balls. Locals get $160 with proof of residence. Which number do you want here? I don't want people showing up expecting $160 in July.", ['indoor-price', 'sport-card-price', 'sport-golf-details', 'sport-rate-lines'], ['seasonal-hours', 'hours-third-stretch', 'indoor-summer-late']],
  ['sport10', 'setup', 'en', "Tuesday afternoons from 1 to 4:30 the tee sheet is held for our Men's Night league, and some early weekend times are for members only. Can I let visitors know so they don't try to book then?", ['sport-members', 'indoor-busy-times', 'indoor-theme-nights'], []],
  ['sport10', 'setup', 'en', 'That link is our public booking page. Members use a different one. Is it ok that only the public one is here?', ['sport-tee-times', 'booking-link', 'sport-booking-link', 'indoor-booking', 'sport-members'], []],
  ['sport10', 'setup', 'en', 'Most of our good photos are in a shared Dropbox folder our marketing person keeps. Can I just send you the Dropbox link instead of downloading them one by one?', ['photo-rights', 'photo-add', 'UNSURE'], []],
  ['sport10', 'setup', 'en', "I'm stopping here for today. How do I get back in tonight on my phone? The link is in my work email.", ['resume-device', 'setup-change-later', 'login-create', 'newlink'], ['logout']],
  ['sport10', 'setup', 'en', 'Our website has the 2027 rates up now. Your page shows the 2026 ones in a table. Will they get replaced, or do I need to do something else?', ['sport-golf-details', 'indoor-old-line', 'sport-rate-change', 'sport-rates-next-year'], []],
  ['sport10', 'setup', 'en', 'If I add a sentence here, does the French version of our page get the new sentence too, or do I have to translate it?', ['indoor-french', 'french'], []],
  ['sport10', 'setup', 'en', 'Is this the right spot for our dress code? Collared or golf shirts, jeans OK if not ripped, no tank tops or gym shorts.', ['sport-dress-code', 'sport-what-to-bring', 'indoor-good-to-know'], []],
  ['sport10', 'setup', 'en', "The golf club itself doesn't have a happy hour. Masa's Grill runs its own Friday specials. What should I do on this one?", ['sport-hh-none-specials', 'sport-no-bar', 'sport-sister-listing', 'UNSURE'], HH],
  ['sport10', 'setup', 'en', 'Every June the Harvest Ladies Golf Club Charity Tournament closes the course to the public for a day. The date changes every year. How do I put that in?', ['sport-one-off-closure', 'closures', 'setup-short-closure', 'sport-closures-yearly'], ['sport-season', 'indoor-closed-months', 'season', 'indoor-seasonal', 'indoor-yearly-break', 'event-repeat', 'indoor-theme-nights']],
  ['sport10', 'edit', 'en', 'Our head professional would like to post the junior camp dates himself. Can he get his own access without using my login?', ['staff', 'login-create', 'access', 'not-owner'], []],
  ['sport10', 'edit', 'en', 'How do I get the old 2026 green fee table off our page? Those prices are wrong now.', ['sport-golf-details', 'indoor-old-line'], []],
  ['sport10', 'edit', 'en', 'Is there any charge to us if golfers book tee times after finding us on your site?', ['cost', 'indoor-cost', 'sport-terms'], []],
  ['sport10', 'edit', 'en', 'Can I see what our page looks like to a golfer before it goes out?', ['see-page', 'UNSURE'], ['privacy']],
  ['sport10', 'edit', 'en', 'We do a Nine & Dine special in the evenings, 9 holes with a cart and dinner for $115. Where would that go?', ['sport-package', 'sport-rate-lines', 'indoor-price-varies', 'sport-golf-details', 'menu-add', 'UNSURE'], HH],
  ['sport10', 'edit', 'en', "Should I post Men's Night as an event every Tuesday, or is the line in Good to know enough?", ['indoor-theme-nights', 'event-repeat', 'weekly-nights', 'sport-members'], []],
  ['sport10', 'edit', 'en', "What happens to the page in the winter when we're closed, does it still show up?", ['sport-season-says', 'sport-season'], []],
  ['sport10', 'edit', 'fr', "Bonjour, c'est Mathieu de l'académie. Où est-ce qu'on indique que le champ de pratique est ouvert aux non-membres?", ['sport-members', 'indoor-good-to-know', 'indoor-busy-times'], []],
  ['sport10', 'edit', 'fr', "Est-ce que je peux ajouter nos camps de golf juniors de l'été en français?", ['sport-lessons', 'indoor-camps', 'event-add', 'UNSURE'], []],
];
module.exports = { SRC, Q };
