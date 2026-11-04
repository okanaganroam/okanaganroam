'use strict';
// Every non-ski, non-Kelowna town page follows the approved compact destination layout (see big-white-page.js,
// kelowna-page.js). Each town's photos, places and copy live in data/towns/<town>.json.
const fs = require('fs');
const path = require('path');
const bigWhite = require('./big-white-page');

const DIR = path.join(__dirname, 'data', 'towns');
const TOWNS = {};
for (const f of fs.existsSync(DIR) ? fs.readdirSync(DIR) : []) {
  if (!f.endsWith('.json')) continue;
  const cfg = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  TOWNS[cfg.town] = cfg;
}

const EYEBROW = {
  city: 'Your Okanagan city guide',
  wine: 'Your Okanagan wine country guide',
  lake: 'Your Okanagan lakeside guide',
  country: 'Your Okanagan country guide',
};
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const has = (town) => Object.prototype.hasOwnProperty.call(TOWNS, town);

function styles(town) {
  return bigWhite.styles
    .replaceAll('body.big-white-page', 'body.town-page')
    .replace('id="big-white-layout"', 'id="town-layout"')
    .replace('/images/regions/photos/big-white-2610.jpg', TOWNS[town].hero);
}

function renderBody(town, { count, activeSlugs }) {
  const c = TOWNS[town];
  const active = new Set(activeSlugs);
  const n = Number(count);
  const picks = c.picks.filter((p) => active.has(p.slug))
    .map((p) => `<a class="bw-pick" href="${p.href}"><img loading="lazy" decoding="async" src="${p.img}" alt="${attr(p.name)}"><div class="bw-pick-body"><span class="bw-tag">${p.tag}</span><h3>${p.name}</h3><p>${p.copy}</p></div></a>`).join('');
  const tiles = c.tiles.map((t) => `<a class="bw-tile" href="${t.href}"><img loading="lazy" decoding="async" src="${t.img}" alt=""><b>${t.title}</b><span>${t.sub}</span></a>`).join('\n');
  const plan = c.plan.map((p) => `<details><summary>${p.title}</summary><p>${p.copy} <a href="${p.href}">${p.label}</a></p></details>`).join('');
  return `<main id="main" class="bw-landing">
<section class="bw-hero"><div class="bw-hero-inner"><div class="bw-eyebrow">${EYEBROW[c.category] || EYEBROW.city}</div><h1>${c.name}, your way.</h1><p>${c.sub}<br>Find your next favourite stop.</p>
<form class="bw-search" action="/browse" method="get"><input type="hidden" name="regions" value="${town}"><input name="q" aria-label="Search ${c.name}" placeholder="${attr(c.placeholder)}"><button class="bw-pill">Search ↗</button></form>
<div class="bw-hero-bottom"><a href="/trip">Build my ${c.name} trip ↗</a><span>${n} ${n === 1 ? 'place' : 'places'} to explore</span></div></div></section>
<div class="bw-wrap"><section class="bw-section" id="explore"><div class="bw-heading"><h2>What’s your ${c.name} mood?</h2></div><div class="bw-categories">
${tiles}
</div></section>
<div class="bw-essentials"><div class="bw-status"><small>Explore your way</small><b>A little inspiration. A great day out.</b></div><div class="bw-tools"><a href="/map">Roam Now ↗</a><a href="/${town}/events">What’s On ↗</a><a href="/browse?regions=${town}">All places ↗</a></div></div>
<section class="bw-section" id="picks"><div class="bw-heading"><h2>A few places to start</h2><a class="bw-small-link" href="/browse?regions=${town}">Explore all ${n} ↗</a></div><div class="bw-picks">${picks}</div></section>
<section class="bw-plan" id="plan"><div class="bw-plan-layout"><div class="bw-plan-intro"><h2>A little planning. More exploring.</h2><p>The essentials, ready when you need them.</p><a href="/trip">Build my ${c.name} trip ↗</a></div><div class="bw-accordion">${plan}</div></div></section></div></main>
<footer class="bw-footer"><a class="bw-brand" href="/">OKANAGAN <span>ROAM</span></a><div><a href="/destinations">All destinations</a><a href="/about">About</a><a href="/contact">Contact</a></div><p>Built for the whole crew, dog included.</p></footer>`;
}

module.exports = { TOWNS, has, styles, renderBody };
