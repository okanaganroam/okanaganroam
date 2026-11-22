// Sport test 14 (2026-11-21): every question Marisol typed into Help (the three suggestion taps left out), labelled on the
// merits. Marisol runs the pro shop at Fairview Mountain Golf Club in Oliver (18 holes, a driving range, a club fitting bay
// by appointment all winter, the club's restaurant with its own listing, season Mar 15 – Oct 31, tee times through a
// Chronogolf pop-up on their own site); the shop's Android tablet, lower case, no punctuation
// (drafts/fresh-eyes-sport14-2026-11-21/help-log.json).
// [src, page, language of the page, question, ok, harm]. ok: the topics that answer it well; UNSURE in ok: "I'm not sure,
// Ask us" is a fine outcome. harm: answers that point her the wrong way (the course open all year for the fitting bay,
// closing the course for the restaurant's months). Run by tests/sport-test14-fixes.test.js and tests/help-heldout.test.js.
'use strict';
const { CLOSING } = require('./help-sport13-questions.js');
const SRC = {
  sport14: { type: 'golf', kinds: ['golf', 'range'], book: 'busy', price: 131, season: '03-15:10-31', length: 'half' },
};
const PART_OK = ['sport-part-season', 'UNSURE'];
const Q = [
  ['sport14', 'setup', 'en', 'im the pro shop manager not the owner, our COO forwarded me this email. am I allowed to fill this in or does it have to be him?', ['not-owner', 'staff', 'sport-public'], []],
  ['sport14', 'setup', 'en', 'we also have a toll free number 1-866-534-7264, can both numbers go on?', ['phone'], []],
  ['sport14', 'setup', 'en', '7 to 8 is right for summer but in march april and october its more like 8 to 6 because it gets dark. do i put both somehow?', ['seasonal-hours', 'hours-third-stretch', 'sport-season', 'season', 'indoor-seasonal', 'sport-dawn-dusk'], []],
  ['sport14', 'setup', 'en', 'our restaurant is open in november for the winemaker dinners but golf is closed. does that change our season?', ['sport-part-season', 'sport-restaurant', 'sport-sister-listing', 'sport-offseason-events', 'UNSURE'], CLOSING],
  // Harmful in the test: "set Season to Open all year". A part of the place open off-season by appointment is Good to know.
  ['sport14', 'setup', 'en', 'the fitting bay is open all winter by appointment. should I say open all year then?', PART_OK, CLOSING.concat(['edit-season', 'setup-season'])],
  ['sport14', 'setup', 'en', 'we have a club fitting bay with trackman and gcquad that opens onto the range. its by appointment, not for playing rounds. should I tick indoor golf?', ['sport-bay-link', 'UNSURE'], CLOSING],
  ['sport14', 'setup', 'en', 'can people who arent playing just come hit a bucket at our range? should i add driving range here', ['sport-second-kind', 'indoor-kinds-many'], ['sport-no-range']],
  ['sport14', 'setup', 'en', 'which one do you want? 18 holes is $131 for 2027, after 4pm its $60, juniors $65. our 9 hole rate isnt on the 2027 sheet yet', ['indoor-price', 'sport-card-price', 'sport-golf-details', 'sport-rates-next-year'], []],
  ['sport14', 'setup', 'en', 'our tee times are chronogolf but its a popup on our own website, not a separate page. is our website address ok for this?', ['sport-tee-times', 'booking-link', 'sport-booking-link', 'indoor-booking'], ['name-address']],
  ['sport14', 'setup', 'en', 'no dogs on the course but people do bring them on the restaurant patio. do I tap no dogs?', ['sport-dogs'], []],
  ['sport14', 'setup', 'en', 'kids can golf with an adult, we have junior rates and junior camps. all ages right?', ['indoor-age', 'sport-line-ages', 'sport-kid-badge', 'sport-rate-lines'], []],
  ['sport14', 'setup', 'en', 'our 2027 rates are on our website rates page already. if i pick website do you copy them, and how long does that take? or is typing better?', ['menu-import', 'UNSURE'], []],
  ['sport14', 'setup', 'en', 'the restaurant already has its own page on your site. should I talk about it in our story or leave it to them?', ['sport-sister-listing', 'UNSURE'], []],
  ['sport14', 'setup', 'en', 'the pro shop is open tue to sat 10 to 4 all winter for gift cards and fittings, but the course is closed. where does that go?', ['sport-part-season', 'sport-offseason-other'], CLOSING],
  ['sport14', 'setup', 'en', 'the range usually opens a week or two before the course in march. do I change our season to the range date?', PART_OK, CLOSING],
  ['sport14', 'setup', 'en', 'are our green fees supposed to include gst or not? ours are plus gst', ['sport-tax'], []],
  ['sport14', 'setup', 'en', 'ladies night tuesday and mens night thursday are mostly for members but guests can join. do those go here or as events? and sunday league is mornings not nights', ['sport-members', 'indoor-theme-nights', 'weekly-nights', 'event-repeat', 'sport-lessons', 'indoor-busy-times', 'UNSURE'], []],
  ['sport14', 'setup', 'en', 'the restaurant does fish and chips fridays and prime rib sundays, and the patio has local wine. is that happy hour? the restaurant has its own page on your site', ['sport-hh-none-specials', 'sport-restaurant', 'sport-sister-listing', 'dont-have'], []],
  // The course itself closes those 2 days (the range and restaurant stay open): a closure, never "don't mark it closed".
  ['sport14', 'setup', 'en', 'we close the course 2 days in october for aeration but the range and restaurant stay open. do i put it as a closure?', ['sport-aeration', 'sport-one-off-closure', 'setup-short-closure', 'closures', 'UNSURE'], ['sport-season', 'season', 'indoor-seasonal', 'indoor-closed-months', 'year-round']],
  ['sport14', 'edit', 'en', 'the half cart is $20 per person on top of the green fee. does that go on its own line in the price list or with each rate?', ['sport-rentals', 'sport-rate-lines', 'indoor-extras', 'menu-add', 'sport-included', 'indoor-price'], []],
  ['sport14', 'edit', 'en', 'your page still says $121 from september but our 2027 rate is $131. will that table change when you add our rates page?', ['sport-golf-details', 'sport-golf-facts'], []],
  ['sport14', 'edit', 'en', 'the value index says nothing included in the green fee but range balls are included with every round. can that be fixed?', ['sport-golf-facts', 'UNSURE'], []],
  ['sport14', 'edit', 'en', 'where do our membership prices go? regular is $3550 a year', ['sport-rate-lines', 'sport-member-rates', 'indoor-gift'], []],
  ['sport14', 'edit', 'en', 'kevin in the pro shop wants to help with this too. does he get his own login?', ['staff', 'login-create', 'access'], []],
  ['sport14', 'edit', 'en', 'if someone searches golf near osoyoos will we show up? we\'re only 15 min away', ['sport-find-me', 'UNSURE'], []],
  ['sport14', 'edit', 'en', 'i saved our tee time link but i dont see a book a tee time button on our page anymore, just website. did i do something wrong?', ['sport-book-button', 'UNSURE'], []],
  ['sport14', 'edit', 'en', 'the restaurant at our club has its own listing here. can i update that one too from this login?', ['more-businesses', 'UNSURE'], []],
];
module.exports = { SRC, Q };
