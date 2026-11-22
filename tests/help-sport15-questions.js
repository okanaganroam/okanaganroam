// Sport test 15 (2026-11-21): every question Kurt typed into Help, labelled on the merits, with the setup screen he asked
// it on (the part of the address after #; '' for his edit page). Kurt is the operations manager at Kelowna Springs Golf
// Club in Kelowna (9 holes, a putting green and practice net, no range, the Legends Classic Grill April to October, a
// banquet room all year, season Mar 1 – Nov 30, tee times on a Prophet web tee sheet and an app); his own Android phone,
// full terse sentences (drafts/fresh-eyes-sport15-2026-11-21/help-log.json).
// [src, page, language of the page, question, ok, harm, screen]. ok: the topics that answer it well; UNSURE in ok: "I'm
// not sure" with choices and Ask us is a fine outcome. harm: answers that point him the wrong way (closing the course for
// the grill's months or a grill holiday, "the part line is for that" on the Happy hour screen). Run by
// tests/sport-test15-fixes.test.js and tests/help-heldout.test.js.
'use strict';
const { CLOSING } = require('./help-sport13-questions.js');
const SRC = {
  sport15: { type: 'golf', kinds: ['golf'], book: 'busy', price: 47, season: '03-01:11-30', length: '1-2h' },
};
const Q = [
  ['sport15', 'setup', 'en', "I'm the operations manager, not the owner. Fine for me to do this?", ['not-owner', 'staff', 'sport-public'], [], 'basics'],
  ['sport15', 'setup', 'en', 'Restaurant reservations are ext 4 on the same number. Can I add that?', ['phone'], [], 'basics'],
  ['sport15', 'setup', 'en', 'The grill upstairs closes for winter but the course keeps going into late November most years. Does the grill change my season?', ['sport-part-season', 'sport-restaurant', 'UNSURE'], CLOSING, 'hours:year'],
  ['sport15', 'setup', 'en', 'We stay open as long as the weather lets us. Some November mornings we close for frost. All year, or closed part of the year?', ['sport-weather', 'sport-season', 'season', 'indoor-seasonal'], ['year-round'], 'hours:year'],
  // "No. That box never changes your course's season": never "Yes, once your season is in".
  ['sport15', 'setup', 'en', 'That box with the grill line. If I write Legends Grill April to October in there, will the course show closed in winter?', ['sport-part-season'], CLOSING, 'hours:year'],
  ['sport15', 'setup', 'en', '9 holes takes about 2 hours, but plenty of people go round twice. Which one do I pick?', ['indoor-visit-length', 'UNSURE'], [], 'indoor'],
  ['sport15', 'setup', 'en', "We've got a practice net and putting green, no real range. Is there a kind for that or leave it?", ['sport-no-range', 'sport-second-kind', 'indoor-kinds-many'], [], 'indoor'],
  ['sport15', 'setup', 'en', 'It says regular rate and lowest in the same sentence. 9 holes walking is $47 summer mornings, cheapest is $37 after 2 in the fall. Which number?', ['indoor-price', 'sport-card-price'], [], 'price'],
  ['sport15', 'setup', 'en', 'Our 9 & Breakfast is $45 tax in. Is that a price or a special?', ['sport-package'], ['indoor-price'], 'price'],
  ['sport15', 'setup', 'en', "The tee times link that's already in there is our Prophet booking page. Leave it, or should it be our website?", ['sport-tee-times', 'sport-booking-link', 'booking-link', 'indoor-booking'], [], 'booking'],
  ['sport15', 'setup', 'en', 'We also have an app for tee times. Can the Book button go to the app instead?', ['sport-app-booking'], [], 'booking'],
  ['sport15', 'setup', 'en', 'Our green fees change 5 times a season, early, spring, summer, fall and late, plus walking vs riding. Do I type every one of those or just the summer ones?', ['sport-rate-change', 'UNSURE'], CLOSING, 'menu'],
  ['sport15', 'setup', 'en', "If I pick My prices are on my website, does your table of last year's rates on our page go away?", ['sport-golf-details'], [], 'menu'],
  ['sport15', 'menu', 'en', 'Two of these are tax in, the rest are plus GST. Is writing Tax in on those two enough?', ['sport-tax'], [], 'type'],
  ['sport15', 'menu', 'en', 'The junior one is $15 but only if an adult plays for $25. Will $15 show up as our price on the card?', ['sport-card-price'], ['indoor-free'], 'type'],
  ['sport15', 'setup', 'en', "If I rewrite the story in English, what happens to the French one that's on there now?", ['indoor-french', 'fr-desc-old', 'description'], [], 'story'],
  ['sport15', 'setup', 'en', "Christmas parties in the banquet room run all winter while the course is closed. Where does that go so people don't think we're shut?", ['indoor-groups', 'sport-offseason-events', 'sport-part-season'], CLOSING, 'groups'],
  // On the Happy hour screen: "Yes. Type the days and times, then tap Only some months", never "No" and the parts box.
  ['sport15', 'setup', 'en', 'Happy Appy Hour is in the grill, Tue to Sun 2 to 5, but only while the grill is open April to October. Can I say that here?', ['hh-some-months'], CLOSING.concat(['sport-part-season']), 'happy'],
  ['sport15', 'setup', 'en', "Our marketing person runs Instagram, I don't know the handle. We push people to our app more than social. Anywhere for the app link?", ['UNSURE', 'sport-app-booking', 'sport-shared-social', 'dont-have'], [], 'social'],
  ['sport15', 'setup', 'en', 'Frost days we close the course on the morning of. Do I have to come in here and add each one?', ['sport-weather'], ['closures'], 'closures'],
  ['sport15', 'setup', 'en', 'The grill closes Thanksgiving Monday but the course is open. Do I tick Thanksgiving?', ['sport-part-season', 'UNSURE'], CLOSING, 'closures'],
  ['sport15', 'edit', 'en', 'Grill opens again in April. Do I have to come back and change that line, or does it switch over on its own?', ['sport-part-season', 'UNSURE'], CLOSING, ''],
  ['sport15', 'edit', 'en', 'Your page shows a value index that says no practice facilities. We have a putting green and chipping area. Who fixes that?', ['sport-golf-facts'], ['sport-no-range'], ''],
  ['sport15', 'edit', 'en', "Next year's rates aren't out till February. Will last year's prices I typed just stay up?", ['sport-rates-next-year'], [], ''],
  ['sport15', 'edit', 'en', 'Our GM wants his own login too. How?', ['staff', 'login-create'], [], ''],
  ['sport15', 'edit', 'en', 'Can I see what it looks like in French before it goes live?', ['see-page'], [], ''],
  // The golf shop's winter hours go in the parts box now: one answer, never "No" and Good to know together.
  ['sport15', 'edit', 'en', 'In that new part-of-the-place box, can I put the golf shop winter hours too, like Golf shop: Dec to Feb weekdays 10 to 2? Will that make the course show open?', ['sport-part-season'], CLOSING.concat(['sport-offseason-other']), ''],
  ['sport15', 'edit', 'en', 'The tee times button goes to Prophet. Our app link changes every year. Is the Prophet link the safer one to keep?', ['sport-app-booking', 'sport-booking-link', 'booking-link', 'sport-tee-times'], [], ''],
  ['sport15', 'edit', 'en', 'If I upload a photo of our rate card next spring, does it replace the prices I typed or add to them?', ['menu-import', 'menu-change', 'UNSURE'], [], ''],
];
module.exports = { SRC, Q };
