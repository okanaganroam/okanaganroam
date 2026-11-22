// Sport test 17 (2026-11-21): every question Marlene typed into Help (30; her one tap on a suggestion is left out), labelled
// on the merits, with the setup screen she asked it on (the part of the address after #; '' for her owner home). Marlene is
// an office volunteer at the Osoyoos Golf Club (Desert Gold; Park Meadows, the club's other 18-hole course, has its own
// listing), season Mar 6 – Oct 31, $155 typed on Price, the Greenside Bar & Grill open into December, on an older Samsung
// at 125% text (drafts/fresh-eyes-sport17-2026-11-21/help-log.json).
// [src, page, language of the page, question, ok, harm, screen]. ok: the topics that answer it well; UNSURE in ok: "I'm
// not sure" with choices and Ask us is a fine outcome. Run by tests/sport-test17-fixes.test.js and the Help measure.
'use strict';
const { CLOSING } = require('./help-sport13-questions.js');
const SRC = {
  // sister: Park Meadows, the club's other course, has its own listing at the same address.
  sport17: { type: 'golf', kinds: ['golf'], book: 'busy', price: 155, season: '03-06:10-31', length: 'half', sister: 'Park Meadows' },
};
const Q = [
  ['sport17', 'setup', 'en', "We have two courses, Desert Gold and Park Meadows. I only see Desert Gold here. Is Park Meadows going to be left off?", ['sport-two-courses',  'sport-sister-listing'], [], 'basics'],
  ['sport17', 'setup', 'en', "The phone number is the main office. The restaurant has its own extension, 217, for reservations. Should I put that in somewhere?", ['phone',  'sport-restaurant',  'UNSURE'], [], 'basics'],
  ['sport17', 'setup', 'en', "The course opens March 6 and closes at the end of October. But the Greenside restaurant stays open for lunch Tuesday to Saturday until December 19. Which one do I press?", ['sport-part-season',  'sport-season',  'UNSURE'], [], 'hours:year'],
  // #4 A part that closes early on a weekday: the parts line on the hours (never a season or closure answer).
  ['sport17', 'setup', 'en', "Also the driving range closes at 4 o'clock every Tuesday for maintenance. Does that matter?", ['sport-part-season'], CLOSING, 'hours:year'],
  ['sport17', 'setup', 'en', "We open March 6 but it depends on the weather. Some years it is a week later. What date do I put?", ['sport-opening-day',  'sport-season'], [], 'hours'],
  ['sport17', 'setup', 'en', "It only says golf course. We also have the Golf Academy with lessons, and a driving range. Should I add those?", ['sport-second-kind',  'indoor-kinds-many',  'sport-lessons',  'indoor-also-offer',  'UNSURE'], [], 'indoor'],
  ['sport17', 'setup', 'en', "How long do people stay? Eighteen holes is four and a half hours, and most people have lunch after. Is half a day right?", ['indoor-visit-length'], [], 'indoor'],
  // #8 Which year's rate: the rates-change-on-a-date answer (put today's, change it on the day).
  ['sport17', 'setup', 'en', "We use dynamic pricing so the price changes day to day. The 2027 morning rate is $155. Last year it was $148. Which one should I use?", ['sport-rate-change',  'sport-rates-next-year'], [], 'price'],
  ['sport17', 'setup', 'en', "Park Meadows is $143 and Desert Gold is $155. I put the Desert Gold one here, correct?", ['sport-two-courses'], ['indoor-free'], 'price'],
  ['sport17', 'setup', 'en', "That golfback link is not one I know. Our website books tee times through Chronogolf. Do I just put the Chronogolf one over top?", ['sport-tee-times',  'booking-link',  'links',  'sport-app-booking',  'UNSURE'], [], 'booking'],
  ['sport17', 'setup', 'en', "The club is owned by its members. It is a non-profit society and has been here since 1973. Does that count as locally owned?", ['indoor-local-owned'], [], 'offer'],
  ['sport17', 'setup', 'en', "Dogs are not allowed on the course but people do bring them on the restaurant patio. Which one do I pick?", ['sport-dogs'], [], 'offer'],
  // #13 "No, your main ones are enough; the card uses your Price."
  ['sport17', 'setup', 'en', "There are a lot of rates. Morning, matinee, twilight, super twilight, juniors and the Daily Double. Do I have to put every one in?", ['sport-every-rate'], [], 'menu'],
  ['sport17', 'setup', 'en', "If I put in the super twilight at $93, will the card say from $93? I do not want people to think our green fee is $93.", ['sport-card-price'], ['indoor-free'], 'menu'],
  // #15 On the Story screen: change the words right here.
  ['sport17', 'setup', 'en', "The story says the brush will punish loose shots and it is the course to choose when you want to be tested. That sounds a little scary for our seniors and visitors. Can I make it sound friendlier?", ['story-words'], [], 'story'],
  // #16 She has a range (research, golf data): never "we don't have a driving range".
  ['sport17', 'setup', 'en', "Is there room to say the putting green is for putting only, no chipping? And that a cart and range balls come with every green fee?", ['sport-included',  'indoor-good-to-know',  'sport-what-to-bring'], [], 'bring'],
  ['sport17', 'setup', 'en', "We ask for proper golf attire, no cut-offs or denim. Should I tap the collared shirts button or write it myself?", ['sport-dress-code'], [], 'bring'],
  ['sport17', 'setup', 'en', "Our tournaments go up to 132 players and the holiday banquets are for 20 people and up. Which size should I tap?", ['sport-group-size',  'indoor-groups'], CLOSING, 'groups'],
  ['sport17', 'setup', 'en', "We also have the Christmas Community Fundraiser in December with a silent auction. Does that go in here?", ['sport-offseason-events',  'event-add',  'sport-tournaments',  'indoor-groups',  'UNSURE'], [], 'groups'],
  // #20 A deal only in her closed months: "Not while you're closed" first.
  ['sport17', 'setup', 'en', "After the course closes, the Greenside does a happy hour in November and December, Thursday to Saturday 3 to 5, two dollars off draft beer and house wine. Can I put that here?", ['hh-closed-season'], [], 'happy'],
  // #21 Someone else runs Instagram: the screen's own "Not sure / someone else runs it" button.
  ['sport17', 'setup', 'en', "I know our Facebook page. I am not sure about Instagram, one of the young fellows in the pro shop looks after that. What should I do?", ['sport-social-unsure'], [], 'social'],
  ['sport17', 'setup', 'en', "The Ladies Desert Open is on Tuesday June 22 next year. Desert Gold is closed to the public that whole day for the tournament. How do I put that in?", ['sport-one-off-closure',  'closures'], [], 'closures'],
  ['sport17', 'edit', 'en', "There is a box called Value index that says $148. That was last year. Will it change when you put in our new prices?", ['sport-golf-facts',  'sport-golf-details'], [], ''],
  ['sport17', 'edit', 'en', "Our general manager would like to see this before it goes out. Can I send him this link or does he need his own?", ['staff',  'sport-approval-first',  'login-create'], [], ''],
  // #25 "Yes: Change an answer, any time."
  ['sport17', 'edit', 'en', "I am 68 and not very good with these things. If I make a mistake can I go back and fix it later?", ['setup-change-later'], [], ''],
  ['sport17', 'edit', 'en', "The course reopens March 6 but some years it is a week later because of frost. Do I have to come back in here and change it?", ['sport-opening-day',  'sport-weather',  'UNSURE'], [], ''],
  // #27 The other course: its own listing and link, never session times.
  ['sport17', 'edit', 'en', "Do I have to do the whole thing again for Park Meadows? Who sends me that link?", ['sport-two-courses',  'sport-sister-listing'], [], ''],
  // #28 Whether it shows now: only while she's open.
  ['sport17', 'edit', 'en', "Can people see my happy hour now? I put it in for November and December.", ['hh-closed-season'], [], ''],
  // #29 Her card keeps her typed $155 (THE SPORT CARD RULE).
  ['sport17', 'edit', 'en', "My card says Green fees from $109. Our green fee is $155. Where did the $109 come from?", ['sport-card-price'], ['indoor-free'], ''],
  ['sport17', 'edit', 'en', "The setup list says Happy hour is on my page with a check mark, but I looked at the page and it is not there. Did I do something wrong?", ['hh-closed-season'], [], ''],
];
module.exports = { SRC, Q };
