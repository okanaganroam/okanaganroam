// Sport test 16 (2026-11-21): every question Nadia typed into Help (30; her 3 taps on a suggestion are left out), labelled
// on the merits, with the setup screen she asked it on (the part of the address after #; '' for her edit page). Nadia is
// a part-time assistant pro at Gallagher's Canyon Golf & Country Club in Kelowna (the 18-hole Canyon Course; the 9-hole
// Pinnacle Course has its own listing), run by GolfBC, a golf management company with courses around BC; season Apr 1 –
// Oct 31 with shorter April and October hours; the Canyon Bar & Grill Wed–Fri 5–8 PM in winter; a GolfBC tee sheet and a
// Noteefy waitlist; upbeat, fast, lower case (drafts/fresh-eyes-sport16-2026-11-21/help-log.json).
// [src, page, language of the page, question, ok, harm, screen]. ok: the topics that answer it well; UNSURE in ok: "I'm
// not sure" with choices and Ask us is a fine outcome. harm: answers that point her the wrong way (closing the course for
// a tournament size or the grill's months). Run by tests/sport-test16-fixes.test.js and tests/help-heldout.test.js.
'use strict';
const { CLOSING } = require('./help-sport13-questions.js');
const SRC = {
  // sister: the Pinnacle Course's own listing at the same address (her club has two listings).
  sport16: { type: 'golf', kinds: ['golf', 'range'], book: 'busy', price: 200, season: '04-01:10-31', length: 'half', sister: 'Pinnacle Course' },
};
const Q = [
  ['sport16', 'setup', 'en', 'this page is only the canyon course but pinnacle has its own page on your site too. do i have to do all of this twice??', ['sport-two-courses', 'sport-sister-listing'], [], 'basics'],
  ['sport16', 'setup', 'en', 'the phone is right but its the main line, the restaurant has opentable for reservations. does that go somewhere', ['sport-restaurant', 'phone', 'links', 'UNSURE'], [], 'basics'],
  ['sport16', 'setup', 'en', 'course is closed nov to march but the grill stays open wed-fri 5 to 8 all winter. so which button am i?', ['sport-part-season', 'UNSURE'], [], 'hours:year'],
  ['sport16', 'setup', 'en', 'and the shop is open weekdays 10-4 in winter for gift cards n stuff', ['sport-part-season', 'UNSURE'], CLOSING, 'hours:year'],
  // Shorter April and October hours: "Save, and add different hours for part of your season", never a gone button.
  ['sport16', 'setup', 'en', 'april and october we shut earlier cuz it gets dark, more like 9 to 6. where does that go', ['sport-shoulder-hours', 'seasonal-hours', 'UNSURE'], [], 'hours'],
  ['sport16', 'setup', 'en', '18 holes on the canyon is 4 to 5 hrs but pinnacle is a 9 hole thats like 2 hrs. what do i pick for how long', ['indoor-visit-length', 'sport-two-courses', 'UNSURE'], [], 'indoor'],
  ['sport16', 'setup', 'en', 'we also have a huge driving range and the academy does lessons, should those be ticked too', ['sport-second-kind', 'indoor-kinds-many', 'sport-lessons', 'UNSURE'], [], 'indoor'],
  // "This page is the Canyon Course: $200. Pinnacle's $55 goes on its own page."
  ['sport16', 'setup', 'en', 'canyon 18 is $200 in summer but pinnacle 9 holes is $55. which one goes here? 200 looks scary next to everyone', ['sport-two-courses'], ['indoor-free'], 'price'],
  ['sport16', 'setup', 'en', 'our 200 includes the power cart and range balls tho, other places charge cart extra. can i say that', ['sport-included'], [], 'price'],
  ['sport16', 'setup', 'en', 'we have the golfbc tee sheet and also a waitlist app (noteefy) for when its full. which link do i put', ['sport-app-booking', 'sport-tee-times', 'sport-booking-link', 'booking-link'], [], 'booking'],
  // A management company's course is not locally owned (a cautious answer, never "Yes").
  ['sport16', 'setup', 'en', "we're owned by golfbc, they have a few courses around bc. does that count as locally owned", ['indoor-local-owned'], [], 'offer'],
  ['sport16', 'setup', 'en', 'we have 2 rate lists, canyon (18) and pinnacle (9). do i put both here or just canyon? pinnacle has its own page', ['sport-two-courses', 'sport-sister-listing'], [], 'menu'],
  ['sport16', 'setup', 'en', "the canyon rates are 'from' prices, twilight moves around depending on demand. how do i write that", ['sport-rate-lines', 'sport-twilight-times', 'indoor-price-varies'], [], 'menu'],
  // On the story screen: change the words right there.
  ['sport16', 'setup', 'en', "this is pretty good actually! but 'semi-private' makes ppl think they cant play. public can book, members just get first dibs. can i fix that bit", ['description', 'story-words'], [], 'story'],
  ['sport16', 'setup', 'en', "oh good its still here lol. is good to know the spot for 'no jeans, collared shirts'? or is there a dress code thing", ['sport-dress-code'], [], 'bring'],
  ['sport16', 'setup', 'en', 'the range closes at 3 on wednesdays for mowing, I put that in the hours part already. do I need it here too?', ['sport-part-season', 'sport-said-twice'], CLOSING, 'bring'],
  ['sport16', 'setup', 'en', "we do a 'biggest little holiday party' fri dec 11, small teams book a table. course is closed then obviously. does that go here or is it an event?", ['sport-offseason-events', 'event-add', 'indoor-groups', 'UNSURE'], [], 'groups'],
  // On the Groups screen: "Yes, tap 20+ and write 24 to 150 golfers in your line". Never a closures answer.
  ['sport16', 'setup', 'en', 'tournaments are 24 to 150 golfers. smallest size here is 20+, is that close enough', ['sport-group-size', 'indoor-groups'], CLOSING, 'groups'],
  // Her winter-only grill deal at a course closed for the winter: it never shows while closed (said plainly).
  ['sport16', 'setup', 'en', 'not a real happy hour but in winter the grill does half price apps wed 5 to 6. would that count? its only when the course is closed', ['hh-some-months', 'hh-closed-season'], CLOSING, 'happy'],
  ['sport16', 'setup', 'en', 'head office (golfbc) runs one instagram @golfbc for all their courses. should i put that or leave it', ['sport-shared-social', 'UNSURE'], [], 'social'],
  ['sport16', 'setup', 'en', 'we aerate the canyon june 28 and 29 next year (prob, depends on weather). course is closed to golf those 2 days but range and grill stay open. how do i put that', ['sport-aeration', 'sport-one-off-closure', 'UNSURE'], [], 'closures'],
  ['sport16', 'edit', 'en', "the page still says 'value index' with $200. our members dont pay that. can i take it off?", ['sport-golf-facts', 'sport-golf-details'], [], ''],
  ['sport16', 'edit', 'en', 'what if we open early, like march 20 if its warm? do i have to change the dates every time', ['sport-opening-day', 'sport-season'], [], ''],
  // "Same link; he can make his own login."
  ['sport16', 'edit', 'en', 'my boss brent wants to look at it too, does he need a different link', ['staff', 'login-create'], [], ''],
  // "Yes, it shows as you typed it all year: write it so it reads right in every month." Never "No".
  ['sport16', 'edit', 'en', "when the course opens in april will the grill line still say 'in winter'? kinda confusing", ['sport-part-season'], CLOSING, ''],
  ['sport16', 'edit', 'en', 'how do french people see my page, do i need to write it in french', ['indoor-french', 'french'], [], ''],
  ['sport16', 'edit', 'en', 'can i do the pinnacle page from this same link or does someone send me another one', ['sport-two-courses', 'UNSURE'], [], ''],
  ['sport16', 'edit', 'en', 'wait my card says from $65 now?? i put 200 as our price. 65 is just the 9 holes after 5', ['sport-card-price'], ['indoor-free'], ''],
  ['sport16', 'edit', 'en', 'how do i put the dec 11 holiday party on the whats on page', ['event-add'], [], ''],
  // "It only shows while you're open."
  ['sport16', 'edit', 'en', "i put a winter happy hour wed 5-6 but when i look at my page now (its wednesday) its not there", ['hh-closed-season', 'hh-some-months'], [], ''],
];
module.exports = { SRC, Q };
