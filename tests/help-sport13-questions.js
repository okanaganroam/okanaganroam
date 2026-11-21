// Sport test 13 (2026-11-21): every question Gord typed into Help (the one suggestion tap left out), labelled on the
// merits. Gord and Linda own and run Twin Lakes Golf Course & RV Park in Kaleden (18 holes, a driving range, the Bistro,
// an RV park with its own season, season Apr 1 – Oct 15, tee times through a Chronogolf pop-up on their own site); one
// shared phone, full sentences, some typos (drafts/fresh-eyes-sport13-2026-11-21/help-log.json).
// [src, page, language of the page, question, ok, harm]. ok: the topics that answer it well; UNSURE in ok: "I'm not sure,
// Ask us" is a fine outcome. harm: answers that point them the wrong way (closing the course for the RV park's or the
// range's dates, adding December to the course's hours for the pro shop). Run by tests/sport-test13-fixes.test.js and
// tests/help-heldout.test.js.
'use strict';
const SRC = {
  sport13: { type: 'golf', kinds: ['golf'], book: 'busy', price: 47, season: '04-01:10-15', length: 'half' },
};
// Answers that change the place's own hours, season or closures: never for a question about one part of the place.
const CLOSING = ['closures', 'setup-short-closure', 'sport-one-off-closure', 'indoor-closed-months', 'sport-season', 'season', 'indoor-seasonal', 'indoor-yearly-break', 'sport-closures-yearly', 'setup-closure-fix', 'seasonal-hours', 'year-round', 'sport-opening-day', 'hours'];
const Q = [
  ['sport13', 'setup', 'en', 'Before we start. Is this really free or do you bill us later? We got burned by one of those golf directory outfits', ['indoor-cost', 'cost', 'scam', 'sport-terms'], []],
  ['sport13', 'setup', 'en', 'The phone number is right but it rings the pro shop, the bistro and RV park are extensions 102 and 103. Can we put those?', ['phone'], []],
  ['sport13', 'setup', 'en', 'Which hours do you want, the pro shop or the bistro? Pro shop is 7am to dusk but the bistro closes at 4 in the fall', ['sport-part-season', 'sport-restaurant', 'sport-first-tee', 'hours', 'sport-last-booking'], []],
  ['sport13', 'setup', 'en', 'We usually open the course first week of April but the driving range doesnt open till about April 15 when the ground dries out. Do I put April 15?', ['sport-part-season', 'UNSURE'], CLOSING.filter((x) => !['sport-opening-day', 'sport-season', 'season', 'indoor-seasonal', 'hours'].includes(x))],
  ['sport13', 'setup', 'en', 'Also the RV park opens April 28 to mid September, does that go here too?', ['sport-part-season', 'UNSURE'], CLOSING],
  ['sport13', 'setup', 'en', 'Our lowest is $40 for 9 holes after 4pm but I don\'t want people thinking 18 holes is $40. 18 is $79 weekdays and $89 weekends. Which number do you want', ['indoor-price', 'sport-card-price', 'sport-golf-details'], []],
  ['sport13', 'setup', 'en', 'Our tee times are booked through the Book A Tee Time button on our own website, it pops up a chronogolf window. I don\'t have a separate link for it. What do I put?', ['sport-tee-times', 'booking-link', 'sport-booking-link', 'indoor-booking'], []],
  ['sport13', 'setup', 'en', 'Dogs are welcome in our RV park but not out on the golf course. Which dog button do I press?', ['sport-dogs'], []],
  ['sport13', 'menu', 'en', 'All these prices are plus tax. Do I have to write plus tax on every line or is there one spot for it', ['sport-tax'], []],
  ['sport13', 'setup', 'en', 'We don\'t speak French. Does our story get put in French for the French page or do we have to do that?', ['indoor-french'], []],
  ['sport13', 'setup', 'en', 'The bistro closes at 4 in spring and fall but people can golf till 6. Is this where I say that, or does the bistro need its own hours somewhere?', ['sport-part-season', 'sport-restaurant', 'sport-last-booking'], ['closures', 'setup-short-closure', 'sport-one-off-closure', 'indoor-closed-months']],
  ['sport13', 'setup', 'en', 'Linda opens the pro shop Tuesdays and Thursdays 10 to 2 in December for Christmas gift certificates. Should I add December to our hours?', ['sport-part-season', 'sport-offseason-other'], ['seasonal-hours', 'year-round', 'season', 'indoor-seasonal']],
  ['sport13', 'setup', 'en', 'We dont have a real happy hour. Next year we\'re starting Thirsty Thursdays, 18 holes with a cart, a draft beer and a hotdog for $67.25 before 2pm. Does that go in happy hour or somewhere else?', ['sport-hh-none-specials', 'sport-package'], []],
  ['sport13', 'setup', 'en', 'The last weekend of the season we run the Turkey Draw for all paid golfers. We\'re still open to the public that weekend. Do I put it in closures?', ['sport-tournaments', 'event-add'], CLOSING],
  ['sport13', 'edit', 'en', 'My wife Linda and I share this one phone. Does she need her own login or can we both use this?', ['staff', 'login-create', 'UNSURE'], []],
  ['sport13', 'edit', 'en', 'where do I put when the RV park is open? its a different season from the golf course', ['sport-part-season', 'indoor-good-to-know'], CLOSING],
  ['sport13', 'edit', 'en', 'is the RV park its own listing on your site or part of ours?', ['sport-sister-listing', 'sport-one-listing', 'UNSURE'], []],
  ['sport13', 'edit', 'en', 'Your value thing on our page says driving range not documented but we have a driving range. Can you fix that?', ['sport-golf-details', 'sport-golf-facts'], []],
  ['sport13', 'edit', 'en', 'The green fee table up top says 2026 rates from your research. Will it change to the prices Linda typed in?', ['sport-golf-details'], []],
  ['sport13', 'edit', 'en', 'We\'re closed right now until April. Does the page tell people that or do I have to do something?', ['sport-season-says', 'shows-closed'], []],
  ['sport13', 'edit', 'en', 'Can somebody else change our page? Who checks what goes on it?', ['access', 'dispute', 'sport-approval-first', 'changes-review', 'staff'], []],
  ['sport13', 'edit', 'en', 'When people search golf Penticton will we come up? We\'re only 20 minutes south in Kaleden', ['sport-find-me', 'UNSURE'], []],
];
module.exports = { SRC, Q, CLOSING };
