// Sport test 12 (2026-11-21): every question Rob typed into Help (the one suggestion tap left out), labelled on the merits.
// Rob is the general manager of Tower Ranch Golf & Country Club in Kelowna (18 holes, no driving range, tee times by phone
// only, season Apr 1 – Oct 31, Carrington's restaurant with a happy hour that ends Oct 17, Men's Night every Thursday); a
// fast English typer, short lower-case questions with no punctuation (drafts/fresh-eyes-sport12-2026-11-21/help-log.json).
// [src, page, language of the page, question, ok, harm]. ok: the topics that answer it well; UNSURE in ok: "I'm not sure,
// Ask us" is a fine outcome. harm: answers that point him the wrong way (closing the course for a restaurant's dates,
// replacing his Known for line). Run by tests/sport-test12-fixes.test.js and tests/help-heldout.test.js.
'use strict';
const SRC = {
  sport12: { type: 'golf', kinds: ['golf'], book: 'ahead', price: 89, season: '04-01:10-31', length: 'half' },
};
// Answers that change the place's own hours, season or closures: never for a question about something else.
const CLOSING = ['closures', 'setup-short-closure', 'sport-one-off-closure', 'indoor-closed-months', 'sport-season', 'season', 'indoor-seasonal', 'indoor-yearly-break', 'sport-closures-yearly', 'setup-closure-fix'];
const Q = [
  ['sport12', 'setup', 'en', 'shop opens 6am in summer, first tee 6:30, last tee around 6:30pm. what do i put', ['sport-first-tee', 'hours', 'seasonal-hours', 'sport-last-booking'], []],
  ['sport12', 'setup', 'en', 'opening day depends on the snow, usually first week of april. closing end of oct. what if i dont know the exact day yet', ['sport-opening-day', 'sport-season', 'indoor-seasonal', 'season'], []],
  ['sport12', 'setup', 'en', '2027 rates: 229 peak, 179 april/oct, 9 holes after 4 is 89. cart included. which one goes here', ['indoor-price', 'sport-card-price'], []],
  ['sport12', 'setup', 'en', 'tee times by phone only, no online booking. will people know to call', ['sport-tee-times', 'indoor-booking', 'booking-link', 'sport-booking-link'], []],
  ['sport12', 'setup', 'en', 'mens night every thursday, tee times from noon then shotgun at 3. course is basically full thursday afternoons. where does that go', ['sport-members', 'indoor-busy-times', 'indoor-theme-nights', 'weekly-nights', 'event-repeat'], CLOSING],
  ['sport12', 'setup', 'en', 'it says I need who can come to get 100% but it already says saved. what\'s missing?', ['setup-missing', 'indoor-age'], []],
  ['sport12', 'edit', 'en', 'pro shop is open in december for christmas gift cards, mon to fri 10 to 4. can i add that even though the course is closed', ['sport-part-season', 'sport-offseason-other', 'indoor-good-to-know'], ['seasonal-hours', 'year-round']],
  ['sport12', 'edit', 'en', 'my head pro derek wants to update the academy info himself. can he get his own login', ['staff', 'login-create', 'access'], []],
  ['sport12', 'edit', 'en', 'does any of this cost us anything', ['indoor-cost', 'cost'], []],
  ['sport12', 'edit', 'en', 'our 9 & dine package, will that show up if people search golf and dinner', ['sport-package', 'sport-find-me', 'UNSURE'], []],
  ['sport12', 'edit', 'en', 'carringtons closes oct 17, a couple weeks before the course. does the happy hour need different dates', ['hh-some-months', 'hh-times'], CLOSING],
  ['sport12', 'edit', 'en', 'where do junior camps go, we run them in july', ['sport-lessons', 'indoor-camps', 'sport-line-ages'], []],
  ['sport12', 'edit', 'en', 'how long till the photos show up', ['photos-when', 'photo-pending', 'live-speed'], []],
  ['sport12', 'edit', 'en', 'page says kid friendly now. we have junior rates 18 and under but its a championship course, not a family fun spot. should that be on', ['indoor-age', 'sport-kid-badge'], []],
  ['sport12', 'edit', 'en', 'rates go up in the spring when the board signs off. can i change the 89 later myself', ['sport-rate-change', 'sport-rates-next-year', 'setup-change-later'], []],
  ['sport12', 'edit', 'en', 'thursdays after noon theres no public tee times because of mens night. how do i tell people', ['sport-members', 'indoor-busy-times'], CLOSING],
];
module.exports = { SRC, Q, CLOSING };
