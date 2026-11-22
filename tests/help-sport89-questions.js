// Sport tests 8 and 9 (2026-11-21): every question the two owners typed into Help (suggestion taps left out), labelled on
// the merits. Marg, the volunteer secretary of a 9-hole walk-on course in Lumby (dictation, no capitals), and Gord, the GM
// of an 18-hole semi-private course in Summerland (drafts/fresh-eyes-sport8-2026-11-21 and -sport9-2026-11-21).
// [src, page, language of the page, question, ok, harm]. ok: the topics that answer it well; UNSURE in ok: "I'm not sure,
// Ask us" is a fine outcome (no answer covers it fully). harm: answers that point the owner the wrong way (a closure
// turned into a weekly event, "Tap Tee times recommended" for a course with no tee times, "Tap Happy hour" for a
// clubhouse with no licence). Run by tests/help-heldout.test.js (with the other real logs) and tests/sport-test8-fixes.
'use strict';
const SRC = {
  sport8: { type: 'golf', kinds: ['golf', 'discgolf'], book: 'no', price: 20, season: '04-15:10-15', length: '2-3h' },
  sport9: { type: 'golf', kinds: ['golf', 'range'], book: 'busy', price: 76.19, season: '03-20:10-31', length: 'half' },
};
const Q = [
  ['sport8', 'edit', 'en', 'hello I am the secretary for the golf club society we are all volunteers is this going to cost us anything', ['cost', 'indoor-cost', 'sport-terms', 'sport-public', 'scam'], []],
  ['sport8', 'edit', 'en', 'we dont have a website of our own just a facebook page. the village has a page about us. is that ok', ['no-website-social', 'dont-have', 'sport-shared-social'], []],
  ['sport8', 'setup', 'en', 'that website is the villages page not ours. should i put our facebook page there instead', ['no-website-social', 'sport-shared-social', 'UNSURE'], []],
  ['sport8', 'setup', 'en', 'the course is open from daylight till dark really. if nobody is in the clubhouse theres an honour box by the door. what hours do i put', ['sport-dawn-dusk', 'sport-first-tee'], []],
  ['sport8', 'setup', 'en', 'tuesdays the mens league has the course from 4 oclock on', ['indoor-busy-times', 'indoor-theme-nights', 'sport-members', 'UNSURE'], []],
  ['sport8', 'setup', 'en', 'the low holes by the creek flood most springs so we never know when we open. some years april some years may', ['sport-opening-day', 'sport-season', 'indoor-seasonal', 'sport-weather'], []],
  ['sport8', 'setup', 'en', 'its 20 dollars for 9 holes and 30 if you go round twice for 18', ['sport-golf-details', 'indoor-price', 'sport-card-price', 'sport-rate-lines'], []],
  ['sport8', 'setup', 'en', 'we only take cash. the honour box is just an envelope you drop in', ['sport-payment'], []],
  ['sport8', 'setup', 'en', 'we dont do tee times at all. you just show up and go first come first served', ['sport-walk-ons', 'indoor-booking', 'sport-same-day', 'UNSURE'], ['indoor-good-to-know', 'sport-tee-times', 'booking-link', 'sport-booking-link']],
  ['sport8', 'setup', 'en', 'dogs are allowed on a leash as long as you clean up after them', ['sport-dogs'], []],
  ['sport8', 'setup', 'en', 'kids under 12 golf free if they are with a paying adult. where does that go', ['sport-kids-free', 'sport-rate-lines'], ['indoor-free']],
  ['sport8', 'setup', 'en', 'my husband took these on his phone last summer is that alright', ['photo-rights', 'photo-add', 'UNSURE'], ['seasonal-hours', 'indoor-summer-late', 'indoor-summer-daily']],
  ['sport8', 'menu', 'en', 'do the season passes go in here too. adults are 450 for the year', ['sport-rate-lines', 'menu-add', 'indoor-gift', 'sport-member-rates'], []],
  ['sport8', 'menu', 'en', 'what do I put for the 18 its just the 9 played twice', ['sport-rate-lines', 'menu-add', 'UNSURE'], []],
  ['sport8', 'setup', 'en', 'we only have pull carts no power carts. the hills are too steep and the greens are sand', ['sport-rentals', 'indoor-good-to-know', 'sport-no-rentals', 'UNSURE'], []],
  ['sport8', 'setup', 'en', 'the clubhouse only has pop and chips and chocolate bars. no beer or food', ['sport-no-bar', 'sport-food-menu', 'UNSURE'], ['indoor-bar', 'hh-deals', 'hh-times', 'sport-social-hour', 'setup-happy-split', 'hh-some-months']],
  ['sport8', 'setup', 'en', 'cash only, there is no machine for cards', ['sport-payment'], []],
  ['sport8', 'setup', 'en', 'we host a few fundraiser tournaments every summer and the volunteers run them. groups just phone us', ['sport-tournaments', 'indoor-groups', 'UNSURE'], []],
  ['sport8', 'setup', 'en', 'some springs the creek comes up and floods holes 3 and 4 and we have to shut for a week or so. we never know ahead of time', ['sport-one-off-closure', 'closures', 'setup-short-closure', 'sport-weather', 'UNSURE'], ['indoor-closed-months']],
  ['sport8', 'edit', 'en', 'do I need to write everything in french too. none of us speak french', ['indoor-french', 'french'], ['sport-staff-language']],
  ['sport8', 'edit', 'en', 'the season pass price goes up next year how do i change it then', ['sport-rate-change', 'sport-rates-next-year', 'setup-change-later'], []],
  ['sport8', 'edit', 'en', 'my husband len wants to do it on his phone too', ['staff', 'not-owner', 'login-create'], []],
  ['sport8', 'edit', 'en', 'how do people know to pay at the honour box if they come when its closed', ['sport-payment', 'indoor-good-to-know', 'UNSURE'], []],
  ['sport8', 'setup', 'fr', 'bonjour je suis bénévole au club. on a pas de voiturettes électriques juste des chariots a tirer, ou est-ce que je mets ça', ['sport-rentals', 'indoor-good-to-know', 'sport-no-rentals', 'UNSURE'], []],
  ['sport8', 'setup', 'fr', 'les enfants de moins de 12 ans jouent gratuitement avec un adulte', ['sport-kids-free', 'sport-rate-lines'], ['indoor-free']],
  ['sport8', 'setup', 'fr', 'est-ce que les gens peuvent payer par carte? non, comptant seulement', ['sport-payment'], []],

  ['sport9', 'edit', 'en', 'Hi, this is Gord the GM. Is this actually free or is there a catch? We get a lot of advertising calls.', ['cost', 'indoor-cost', 'scam', 'sport-terms'], []],
  ['sport9', 'edit', 'en', 'Can our head pro also log in and do the lessons part himself?', ['staff', 'login-create', 'UNSURE'], []],
  ['sport9', 'setup', 'en', 'That is our main number but golfers need to press 1 for the pro shop to book. Can I put the extension in?', ['phone', 'UNSURE'], []],
  ['sport9', 'setup', 'en', 'The course is closed for winter but the pro shop is still open Tues to Fri 9-5 and Sat 10-2 for gift cards and fittings. In season first tee is 7am. Which hours do I put in?', ['sport-season', 'sport-part-season', 'indoor-seasonal', 'sport-first-tee', 'UNSURE'], []],
  ['sport9', 'setup', 'en', 'In season the hours change every month, earlier in June July August and shorter in the fall', ['seasonal-hours', 'hours-third-stretch', 'indoor-summer-late', 'UNSURE'], ['closures', 'sport-holiday-short', 'setup-short-closure', 'sport-one-off-closure', 'hours-open-holidays']],
  ['sport9', 'setup', 'en', 'We usually open mid to late March depending on the snow and close end of October, sometimes earlier if we get frost. Do I need exact dates?', ['sport-opening-day', 'sport-season', 'indoor-seasonal'], []],
  ['sport9', 'setup', 'en', 'We also run a golf academy with 6 PGA teaching pros, lessons and junior programs. There is no lessons button here, which do I pick?', ['sport-lessons', 'sport-kinds-other', 'UNSURE'], []],
  ['sport9', 'setup', 'en', 'Our 2027 rates are plus GST and have cents. 18 holes is $113.33, 9 holes $76.19 and 9 hole twilight is $57.14. Which one goes here and do I add the GST?', ['sport-tax', 'indoor-price', 'sport-card-price', 'sport-golf-details', 'sport-rate-lines'], []],
  ['sport9', 'setup', 'en', 'Wednesdays from noon to 4:30 the course is booked for mens night so the public cant get a tee time then. Where do I tell people that?', ['indoor-theme-nights', 'indoor-busy-times', 'sport-members', 'UNSURE'], []],
  ['sport9', 'setup', 'en', 'These were taken by a photographer we hired for our brochure a few years back. Are we allowed to use them here?', ['photo-rights'], []],
  ['sport9', 'setup', 'en', 'We are a par 72, 6,700 yards from the blues. The At a glance box on our page just says 18 holes. How do I add the par and yardage there?', ['sport-golf-details'], []],
  ['sport9', 'setup', 'en', 'Also that green fee table on our page is last years 2026 prices. How do I fix it?', ['sport-golf-details', 'indoor-old-line', 'sport-rates-next-year', 'UNSURE'], []],
  ['sport9', 'setup', 'en', 'No real happy hour. The Canyonview grill has its own page on your site and does food and drink specials Wednesday nights after mens night. Should I put that here?', ['sport-hh-none-specials', 'dont-have', 'sport-no-bar', 'sport-sister-listing', 'sport-restaurant', 'UNSURE'], ['indoor-theme-nights', 'event-repeat', 'weekly-nights', 'hh-deals', 'hh-times']],
  ['sport9', 'setup', 'en', 'We close to the public every Labour Day long weekend for the Summerland Mens Amateur. Do I tick every year? The dates move each year.', ['sport-one-off-closure', 'sport-closures-yearly', 'closures', 'setup-short-closure', 'UNSURE'], ['indoor-theme-nights', 'event-repeat', 'weekly-nights', 'indoor-yearly-break']],
  ['sport9', 'setup', 'en', 'Kids under 12 golf free with a paying adult after 3pm. Where does that go?', ['sport-kids-free', 'sport-rate-lines'], ['indoor-free']],
  ['sport9', 'setup', 'en', 'Twilight starts at 3:30 in the summer but 1pm in October. How do I show that?', ['sport-twilight-times'], []],
  ['sport9', 'setup', 'en', 'We are semi private. Members get the weekend morning tee times until 10. Is that something I should mention?', ['sport-members', 'indoor-busy-times'], ['indoor-theme-nights', 'event-repeat']],
  ['sport9', 'setup', 'en', 'The Canyonview Bar and Grill is a separate page on your site. Who looks after that page, me?', ['sport-sister-listing', 'more-businesses', 'sport-restaurant', 'UNSURE'], []],
  ['sport9', 'setup', 'en', 'Do I have to write a French version of all this? None of us speak French.', ['indoor-french', 'french'], ['sport-staff-language']],
  ['sport9', 'setup', 'en', 'If we open early in March because of a warm spring how do I change the date?', ['sport-opening-day', 'sport-season', 'setup-change-later', 'season', 'indoor-seasonal'], []],
  ['sport9', 'setup', 'en', 'Can I put our Christmas gift card sale on here?', ['indoor-gift', 'event-add', 'UNSURE'], []],
  ['sport9', 'setup', 'en', 'Will I have to redo all this every year?', ['sport-closures-yearly', 'setup-change-later', 'UNSURE'], []],
  ['sport9', 'setup', 'en', 'How do I see what the public sees on our page?', ['see-page', 'UNSURE'], ['privacy']],
  ['sport9', 'setup', 'fr', 'Bonjour, je suis pro adjoint. Où est-ce que je mets la normale 72 et la longueur du parcours?', ['sport-golf-details', 'UNSURE'], ['no-website-social']],
  ['sport9', 'setup', 'fr', 'Le mercredi après-midi le terrain est réservé pour la soirée des hommes, comment je le dis aux visiteurs?', ['indoor-theme-nights', 'indoor-busy-times', 'sport-members', 'UNSURE'], []],
  ['sport9', 'setup', 'fr', 'Les tarifs juniors sont 35 $ pour 18 trous, ça va où?', ['sport-rate-lines'], []],
];
module.exports = { SRC, Q };
