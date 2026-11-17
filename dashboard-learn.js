'use strict';
// The dashboard's learning side (2026-11-06): short lessons with a one-question quiz, and milestones earned from real
// numbers. Nothing is invented: a milestone unlocks only when the site's own counts reach it. Quiz progress stays in the
// viewer's browser and is only a convenience.
const { esc } = require('./dashboard-layout');

// id, title, the idea in plain words, why it matters, a question, three answers, the right one, and the reason.
const LESSONS = [
  { id: 'visit-view', title: 'Visits and page views', text: 'A visit is one person coming to the site. A page view is one page being opened. One visit can have lots of page views.', why: 'Many views per visit means people are exploring, which is a good sign.', q: 'Someone comes once and opens 5 listings. What gets counted?', a: ['1 visit and 5 page views', '5 visits and 1 page view', '5 visits and 5 page views'], r: 0, because: 'One person, one trip to the site, five pages opened.' },
  { id: 'clicks', title: 'Clicks to businesses', text: 'This counts people tapping call, website, book, directions or menu on a listing.', why: 'It’s the number that proves your value. Businesses care about customers, not page views.', q: 'Which number would impress a restaurant owner most?', a: ['Page views of your homepage', '40 people tapped Call or Directions on their listing', 'How many listings you have'], r: 1, because: 'Those 40 people were trying to reach that restaurant.' },
  { id: 'impressions', title: 'Shown in Google', text: 'An impression means your site appeared in someone’s Google results. They may not have clicked.', why: 'Impressions go up first. Clicks usually follow, so this is your early sign that SEO is working.', q: 'You were shown 1,000 times and got 20 clicks. What happened?', a: ['1,000 people visited', '20 people visited, and 1,000 saw you listed', 'Google made a mistake'], r: 1, because: 'Being seen and being clicked are two different things.' },
  { id: 'nonbrand', title: 'Searches without your name', text: 'If someone searches “Okanagan Roam”, they already know you. If they search “best patios Kelowna” and find you, they’re brand new.', why: 'These new people are how the site grows, so this is one of your main goals.', q: 'Which search brings someone completely new?', a: ['okanagan roam', 'okanaganroam.com', 'dog friendly wineries near penticton'], r: 2, because: 'They didn’t know you existed, and now they do.' },
  { id: 'position', title: 'Google position', text: 'Position is where you sit in Google’s results. 1 is the very top. Lower numbers are better.', why: 'Most clicks go to the first few results, so moving from 12 to 6 can change a lot.', q: 'Which position is best?', a: ['25', '8', '3'], r: 2, because: 'Closer to 1 means closer to the top of the page.' },
  { id: 'ctr', title: 'Click rate', text: 'Click rate is clicks divided by times shown. 20 clicks from 1,000 impressions is 2%.', why: 'A low click rate on a popular search often means the page title isn’t tempting enough.', q: 'Shown 200 times, clicked 10 times. What’s the click rate?', a: ['5%', '20%', '50%'], r: 0, because: '10 divided by 200 is 0.05, which is 5%.' },
  { id: 'source', title: 'Where visits come from', text: 'A source is where someone was just before arriving: Google, ChatGPT, Instagram, an email or another website.', why: 'It tells you which of your efforts are actually bringing people.', q: 'Your Instagram posts bring 5 visits and Google brings 500. What does that tell you?', a: ['Instagram is broken', 'Google is your main way in, so protect it', 'Delete Instagram'], r: 1, because: 'Sources show where your visitors really come from. Social can still help in other ways.' },
  { id: 'funnel', title: 'Funnels', text: 'A funnel is a set of steps, like start a plan, then finish a plan. It shows where people give up.', why: 'Fixing the one step with the biggest drop helps more than improving everything a little.', q: '100 start a trip and 20 finish. What should you do?', a: ['Look at what happens between those steps', 'Ignore it', 'Add more pages'], r: 0, because: 'Something in those steps is stopping 80 people.' },
  { id: 'small', title: 'Small numbers jump around', text: 'Going from 2 to 4 is “up 100%”, but it’s only two more people.', why: 'Don’t celebrate or panic over small numbers. Look at trends over several weeks.', q: 'Clicks went from 3 to 6 this week. How should you react?', a: ['Huge success!', 'Disaster, something changed', 'Nice, but too small to mean much yet'], r: 2, because: 'Three extra clicks could easily be chance.' },
  { id: 'bots', title: 'People and robots', text: 'Crawlers are computer programs that read your site, like Googlebot. They aren’t people.', why: 'You want Google’s crawler reading your pages, but it shouldn’t count as a visitor. We filter them out.', q: 'Is it bad that Googlebot reads your pages?', a: ['Yes, block it', 'No, that’s how you get into Google', 'Only on weekends'], r: 1, because: 'If Google can’t read a page, it can’t show it to anyone.' },
  { id: 'missing', title: 'Missing pages', text: 'A 404 means someone tried to open an address that doesn’t exist.', why: 'Each one is a person hitting a dead end, so fix the ones with real visitors first.', q: 'Which 404 should you fix first?', a: ['A scanner trying wp-login.php', 'A visitor following a link from your own guide', 'One crawler hit from last year'], r: 1, because: 'That’s a real person, and it’s your link to fix.' },
  { id: 'campaign', title: 'Campaign tags', text: 'A tag is a label added to a link, so the site knows which email or post brought the visit.', why: 'Email apps hide where clicks come from. Without tags, that work looks like it did nothing.', q: 'What happens when an email link has no tag?', a: ['The email fails', 'The visit can’t be credited to that email', 'Google gets upset'], r: 1, because: 'The visit still happens, but you can’t tell it came from your email.' },
  { id: 'bounce', title: 'Email bounces', text: 'A bounce means an email came back. A hard bounce is a dead address. A soft bounce is temporary, like a full mailbox.', why: 'Lots of bounces tell mail providers you may be careless, which can push you toward spam.', q: 'What should you do with a hard bounce?', a: ['Keep trying it', 'Remove the address', 'Send it twice'], r: 1, because: 'A dead address will never work, and retrying hurts your reputation.' },
  { id: 'opens', title: 'Why email opens are fuzzy', text: 'Opens are guessed from a hidden image. Apple Mail can load it with nobody reading, and other apps block it.', why: 'Trust clicks and replies. They prove a real person acted.', q: 'Which shows a real person cared most?', a: ['An open', 'A reply', 'Delivered'], r: 1, because: 'Nobody replies by accident.' },
];

function lessonCard(l, i, shown, mine) {
  return `<article class="lesson" data-lesson="${esc(l.id)}"${shown ? '' : ' hidden'}>
    <p class="lesson-n">Lesson ${i + 1} of ${LESSONS.length}</p><h3>${esc(l.title)}</h3><p>${esc(l.text)}</p><p class="lesson-why"><b>Why it matters:</b> ${esc(l.why)}</p>${mine ? `<p class="lesson-mine">${esc(mine)}</p>` : ''}
    <div class="quiz"><p class="quiz-q">${esc(l.q)}</p>${l.a.map((a, n) => `<button type="button" class="quiz-a" data-right="${n === l.r ? 1 : 0}">${esc(a)}</button>`).join('')}<p class="quiz-r" data-yes="${esc(`Correct! ${l.because}`)}" data-no="${esc(`Not quite. ${l.because}`)}" hidden></p></div>
  </article>`;
}

// Today's lesson on Home, with a button to move on. `now` picks the day's lesson.
function todayLesson(now, numbers = {}) {
  const start = Math.floor(now.getTime() / 86400000) % LESSONS.length;
  const mine = { clicks: numbers.clicks != null ? `Your number right now: ${numbers.clicks} clicks in the last 7 days.` : '', 'visit-view': numbers.views != null ? `Your number right now: ${numbers.views} business pages viewed in the last 7 days.` : '' };
  return `<section class="learn card" id="learn"><div class="learn-head"><h2>Today’s lesson</h2><div class="learn-p"><span id="learnCount">0</span> of ${LESSONS.length} learned<div class="track"><div class="fill" id="learnBar" style="width:0"></div></div></div></div>
    ${LESSONS.map((l, i) => lessonCard(l, i, i === start, mine[l.id])).join('')}
    <button type="button" class="next-lesson" id="nextLesson">Next lesson →</button></section>`;
}

const allLessons = () => `<section class="learn card" id="learn"><div class="learn-head"><h2>All the lessons</h2><div class="learn-p"><span id="learnCount">0</span> of ${LESSONS.length} learned<div class="track"><div class="fill" id="learnBar" style="width:0"></div></div></div></div><div class="lesson-grid">${LESSONS.map((l, i) => lessonCard(l, i, true, '')).join('')}</div></section>`;

// Milestones, all from real counts over the last 7 days, added up across both sites.
const MILESTONES = [
  { t: 'First click', d: 'A visitor clicked through to a business', k: 'clicks', need: 1 },
  { t: 'Getting noticed', d: '100 business pages viewed in a week', k: 'views', need: 100 },
  { t: 'Local hero', d: '100 clicks to businesses in a week', k: 'clicks', need: 100 },
  { t: 'Crowd pleaser', d: '1,000 business pages viewed in a week', k: 'views', need: 1000 },
  { t: 'AI noticed you', d: 'A visit from an AI assistant', k: 'ai', need: 1 },
  { t: 'AI favourite', d: '50 AI assistant visits in a week', k: 'ai', need: 50 },
  { t: 'Trip maker', d: 'First trip planned this week', k: 'trips', need: 1 },
  { t: 'Travel agent', d: '50 trips planned in a week', k: 'trips', need: 50 },
];
function milestonesHtml(numbers) {
  const rows = MILESTONES.map((x) => ({ ...x, have: Number(numbers[x.k]) || 0 })).map((x) => ({ ...x, won: x.have >= x.need }));
  const n = rows.filter((x) => x.won).length;
  return `<h2 class="sec">Milestones <small>${n} of ${rows.length} reached this week, from your real numbers</small></h2><div class="wins">${rows.map((x) => `<div class="win${x.won ? ' on' : ''}"><span class="win-i" aria-hidden="true">${x.won ? '★' : '☆'}</span><b>${esc(x.t)}</b><span>${esc(x.d)}</span>${x.won ? '<em>Reached</em>' : `<div class="track"><div class="fill" style="width:${Math.min(100, Math.round((x.have / x.need) * 100))}%"></div></div><em>${x.have.toLocaleString('en-CA')} of ${x.need.toLocaleString('en-CA')}</em>`}</div>`).join('')}</div>`;
}

module.exports = { LESSONS, MILESTONES, todayLesson, allLessons, milestonesHtml };
