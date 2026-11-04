'use strict';
// SilverStar, Apex and Baldy follow the owner-approved compact Big White layout (big-white-page.js):
// same CSS and markup, scoped to body.ski-resort-page, with each hill's own photos, places and links.
const bigWhite = require('./big-white-page');

const V = (slug) => `/images/venues/${slug}-2610-w480.jpg`;
const W = (slug) => `/images/hiking/venues/${slug}-20261016-winter-w480.jpg`;

const RESORTS = {
  silverstar: {
    name: 'SilverStar',
    hero: '/images/regions/photos/silverstar-2610.jpg',
    placeholder: 'Search SilverStar… cafés, tubing, après',
    tiles: [
      ['/food-drink?regions=silverstar', V('black-pine'), 'Eat & Drink', 'From coffee to après'],
      ['/browse?q=ski&regions=silverstar', W('silverstar-mountain-resort'), 'Ski & Snow', 'Find your winter fun'],
      ['/silverstar/outdoors', W('tube-town-silverstar-tube-park'), 'Off-Slope Fun', 'More ways to play'],
      ['/silverstar/events', V('paradise-camp-snowcat-dinner-tours-silverstar'), 'What’s On', 'Make a night of it'],
      ['/guide/silverstar/kid_friendly', W('brewers-pond-skating-silverstar'), 'With Kids', 'Little adventurers welcome'],
      ['/dog-friendly?regions=silverstar', '/images/regions/photos/silverstar-2610.jpg', 'Dog-Friendly', 'Bring the whole crew'],
    ],
    picks: [
      ['the-red-antler', '/silverstar/restaurants/the-red-antler', V('the-red-antler'), 'Mountain dining', 'The Red Antler', 'Make time for a meal in the village.'],
      ['tube-town-silverstar-tube-park', '/silverstar/outdoors/tube-town-silverstar-tube-park', W('tube-town-silverstar-tube-park'), 'Off-slope adventure', 'Tube Town', 'Trade the skis for a little downhill fun.'],
      ['long-john-s-pub', '/silverstar/pubs/long-john-s-pub', V('long-john-s-pub'), 'Après & good company', 'Long John’s Pub', 'Settle in for a well-earned après.'],
      ['brewers-pond-skating-silverstar', '/silverstar/outdoors/brewers-pond-skating-silverstar', W('brewers-pond-skating-silverstar'), 'Family time', 'Brewer’s Pond Skating', 'A fresh-air spin with your favourite people.'],
    ],
    guide: '/guides/ski-season-big-white-silverstar#silverstar',
    guideLabel: 'Read the full SilverStar guide ↗',
    plan: [
      ['Getting here & parking', 'SilverStar is 22 km from Vernon, about 20 minutes by road. A free in-resort shuttle loops the village through the winter.', 'https://www.skisilverstar.com/the-mountain/visitor-guide/getting-here/', 'Getting here ↗'],
      ['Where to stay', 'Explore ski-in, ski-out lodges, condos, studios and vacation homes in the village, including pet-friendly rooms.', 'https://www.skisilverstar.com/lodging-amenities/places-to-stay/', 'Browse places to stay ↗'],
      ['Visiting with kids', 'Find winter kids’ programs for ages 3 to 16, Tube Town and Brewer’s Pond skating. Check ages, times and availability with the resort.', 'https://www.skisilverstar.com/lessons-rentals/childrens-programs/', 'Kids’ programs ↗'],
    ],
  },
  apex: {
    name: 'Apex',
    hero: '/images/regions/photos/apex-2610.jpg',
    placeholder: 'Search Apex… cafés, tubing, après',
    tiles: [
      ['/food-drink?regions=apex', V('longshots-steak-house'), 'Eat & Drink', 'From coffee to après'],
      ['/browse?q=ski&regions=apex', W('apex-mountain-resort'), 'Ski & Snow', 'Find your winter fun'],
      ['/apex/outdoors', W('tim-hortons-tube-park-apex'), 'Off-Slope Fun', 'More ways to play'],
      ['/apex/events', W('nickel-plate-nordic-centre'), 'What’s On', 'Make a night of it'],
      ['/apex/outdoors/tim-hortons-tube-park-apex', W('adventure-skating-loop-apex'), 'With Kids', 'Little adventurers welcome'],
      ['/dog-friendly?regions=apex', '/images/regions/photos/apex-2610.jpg', 'Dog-Friendly', 'Bring the whole crew'],
    ],
    picks: [
      ['longshots-steak-house', '/apex/restaurants/longshots-steak-house', V('longshots-steak-house'), 'Mountain dining', 'Longshots Steak House', 'Make time for a meal on the mountain.'],
      ['tim-hortons-tube-park-apex', '/apex/outdoors/tim-hortons-tube-park-apex', W('tim-hortons-tube-park-apex'), 'Off-slope adventure', 'Tim Hortons Tube Park', 'Trade the skis for a little downhill fun.'],
      ['the-gunbarrel-saloon', '/apex/pubs/the-gunbarrel-saloon', V('the-gunbarrel-saloon'), 'Après & good company', 'The Gunbarrel Saloon', 'Settle in for a well-earned après.'],
      ['nickel-plate-nordic-centre', '/apex/outdoors/nickel-plate-nordic-centre', W('nickel-plate-nordic-centre'), 'Fresh-air adventure', 'Nickel Plate Nordic Centre', 'Glide through the quiet of the trails.'],
    ],
    guide: '/guides/apex-baldy-ski-guide#apex-skiing-tubing-and-skating',
    guideLabel: 'Read the full Apex guide ↗',
    plan: [
      ['Getting here & parking', 'Apex is 33 km from Penticton, about 30 to 40 minutes by road. A weekend and holiday shuttle runs from Penticton, with reservations required.', 'https://apexresort.com/getting-here/', 'Getting here ↗'],
      ['Where to stay', 'Book on the mountain with Stay At Apex or Apex Mountain Lodge, from mountain apartments to multi-bedroom log cabins.', 'https://apexresort.com/accommodation/', 'Browse places to stay ↗'],
      ['Visiting with kids', 'Find kids’ lessons for ages 4 to 12, the tube park and the skating loop. Check ages, times and availability with the resort.', 'https://apexresort.com/snow-school/', 'Snow school ↗'],
    ],
  },
  baldy: {
    name: 'Baldy',
    hero: '/images/regions/photos/baldy-2610.jpg',
    placeholder: 'Search Baldy… café, snowshoeing, trails',
    tiles: [
      ['/food-drink?regions=baldy', V('corduroy-cafe'), 'Eat & Drink', 'From coffee to après'],
      ['/browse?q=ski&regions=baldy', W('baldy-mountain-resort'), 'Ski & Snow', 'Find your winter fun'],
      ['/baldy/outdoors', W('baldy-snowshoe-trails'), 'Off-Slope Fun', 'More ways to play'],
      ['/baldy/events', V('baldy-cat-skiing'), 'What’s On', 'Make a night of it'],
      ['/baldy/outdoors/baldy-mountain-resort', W('baldy-mountain-resort'), 'With Kids', 'Little adventurers welcome'],
      ['/dog-friendly?regions=baldy', '/images/regions/photos/baldy-2610.jpg', 'Dog-Friendly', 'Bring the whole crew'],
    ],
    picks: [
      ['baldy-mountain-resort', '/baldy/outdoors/baldy-mountain-resort', W('baldy-mountain-resort'), 'Ski & snow', 'Baldy Mountain Resort', 'Start with the hill itself.'],
      ['corduroy-cafe', '/baldy/restaurants/corduroy-cafe', V('corduroy-cafe'), 'Mountain dining', 'Corduroy Cafe', 'Make time for a bite on the mountain.'],
      ['baldy-snowshoe-trails', '/baldy/outdoors/baldy-snowshoe-trails', W('baldy-snowshoe-trails'), 'Fresh-air adventure', 'Baldy Snowshoe Trails', 'Glide through the quiet of the trails.'],
      ['mckinney-nordic-ski-club-trails', '/baldy/outdoors/mckinney-nordic-ski-club-trails', W('mckinney-nordic-ski-club-trails'), 'Nordic trails', 'McKinney Nordic Ski Club', 'Cross-country and snowshoe trails to explore.'],
    ],
    guide: '/guides/apex-baldy-ski-guide#baldy-the-south-okanagan-s-ski',
    guideLabel: 'Read the full Baldy guide ↗',
    plan: [
      ['Getting here & parking', 'The access road is partly paved and partly dirt, and winter tires are highly recommended. Oliver is about 45 minutes away; there is no fuel or EV charging at the resort.', 'https://baldyresort.com/mountain/#directions', 'Directions ↗'],
      ['Where to stay', 'There is no lodging on the mountain, but Ski and Stay packages are offered with partners in Oliver and Osoyoos.', 'https://baldyresort.com/stay-at-baldy/', 'Browse places to stay ↗'],
      ['Visiting with kids', 'Find kids’ lessons and camps for ages 3 to 18, plus a tubing lane. Check ages, times and availability with the resort.', 'https://baldyresort.com/rentals-and-snow-school/', 'Snow school ↗'],
    ],
  },
};

const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ext = (href, label) => `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;

function has(region) { return Object.prototype.hasOwnProperty.call(RESORTS, region); }

// The Big White stylesheet, re-scoped; only the hero photo differs.
function styles(region) {
  return bigWhite.styles
    .replaceAll('body.big-white-page', 'body.ski-resort-page')
    .replace('id="big-white-layout"', 'id="ski-resort-layout"')
    .replace('/images/regions/photos/big-white-2610.jpg', RESORTS[region].hero);
}

// season: the resort's SKI_RESORT_SEASON entry; status: the date-aware status line or null.
function renderBody(region, { count, status, activeSlugs, season }) {
  const r = RESORTS[region];
  const links = (season && season.links) || {};
  const official = (season && season.official) || '';
  const active = new Set(activeSlugs);
  const picks = r.picks.filter((p) => active.has(p[0]))
    .map(([, href, img, tag, name, copy]) => `<a class="bw-pick" href="${href}"><img loading="lazy" decoding="async" src="${img}" alt="${attr(name)}"><div class="bw-pick-body"><span class="bw-tag">${tag}</span><h3>${name}</h3><p>${copy}</p></div></a>`).join('');
  const tiles = r.tiles.map(([href, img, title, copy]) => `<a class="bw-tile" href="${href}"><img loading="lazy" decoding="async" src="${img}" alt=""><b>${title}</b><span>${copy}</span></a>`).join('\n');
  const tools = [
    links.snow && ext(links.snow, '❄ Snow report ↗'),
    links.webcams && ext(links.webcams, '▣ Webcams ↗'),
    links.tickets && ext(links.tickets, '◇ Tickets ↗'),
    official && `<a class="bw-more" href="${official}" target="_blank" rel="noopener">More mountain info ↗</a>`,
  ].filter(Boolean).join('');
  const statusHtml = status
    ? `<b><i class="bw-dot" aria-hidden="true"></i>${escapeHtml(status)}</b>`
    : (official ? ext(official, 'Check resort status ↗') : '');
  const n = Number(count);
  const plan = r.plan.map(([title, copy, href, label]) => `<details><summary>${title}</summary><p>${copy} ${ext(href, label)}</p></details>`).join('');
  return `<main id="main" class="bw-landing"><section class="bw-hero"><div class="bw-hero-inner"><div class="bw-eyebrow">Your Okanagan mountain guide</div><h1>${r.name}, your way.</h1><p>Great food, après and mountain adventures.<br>Find your next favourite stop.</p><form class="bw-search" action="/browse" method="get"><input type="hidden" name="regions" value="${region}"><input name="q" aria-label="Search ${r.name}" placeholder="${attr(r.placeholder)}"><button class="bw-pill">Search ↗</button></form><div class="bw-hero-bottom"><a href="/trip">Build my ${r.name} trip ↗</a><span>${n} ${n === 1 ? 'place' : 'places'} to explore</span></div></div></section>
<div class="bw-wrap"><section class="bw-section" id="explore"><div class="bw-heading"><h2>What’s your mountain mood?</h2></div><div class="bw-categories">
${tiles}</div></section>
<aside class="bw-essentials"><div class="bw-status"><small>Mountain essentials</small>${statusHtml}</div><div class="bw-tools">${tools}</div></aside>
<section class="bw-section" id="picks"><div class="bw-heading"><h2>A few places to start</h2><a class="bw-small-link" href="/browse?regions=${region}">Explore all ${n} ↗</a></div><div class="bw-picks">${picks}</div></section>
<section class="bw-plan" id="plan"><div class="bw-plan-layout"><div class="bw-plan-intro"><h2>A little planning. More mountain.</h2><p>The essentials, ready when you need them.</p><a href="${r.guide}">${r.guideLabel}</a></div><div class="bw-accordion">${plan}</div></div></section></div></main>
<footer class="bw-footer"><a class="bw-brand" href="/">OKANAGAN <span>ROAM</span></a><div><a href="/destinations">All destinations</a><a href="/about">About</a><a href="/contact">Contact</a></div><p>Built for the whole crew, dog included.</p></footer>`;
}

module.exports = { RESORTS, has, styles, renderBody };
