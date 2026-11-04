'use strict';
// Reuse the approved compact destination geometry, with a strictly Kelowna-scoped theme.
const styles = require('./big-white-page').styles
  .replaceAll('body.big-white-page', 'body.kelowna-page')
  .replace('id="big-white-layout"', 'id="kelowna-layout"')
  .replace("/images/regions/photos/big-white-2610.jpg", '/images/guides/kelowna-dusk-aerial-1200.jpg');
const tiles = [
 ['/food-drink?regions=kelowna','/images/venues/bna-brewing-kelowna-g1-2610-w480.jpg','Eat & Drink','From coffee to dinner'],
 ['/beaches?regions=kelowna','/images/beaches/venues/kelowna-boyce-gyro-beach-park-w480.jpg','Beaches & Lake','Find your lakeside escape'],
 ['/outdoors?regions=kelowna','/images/hiking/venues/knox-mountain-park-20261016-viewpoint-update-w480.jpg','Outdoor Adventures','Trails, views and fresh air'],
 ['/kelowna/events','/images/guides/thumbs/kelowna-night-w480.jpg','What’s On','Make a day or night of it'],
 ['/guide/kelowna/kid_friendly','/images/beaches/venues/kelowna-bertram-creek-regional-park-w480.jpg','With Kids','Little adventurers welcome'],
 ['/dog-friendly?regions=kelowna','/images/beaches/venues/kelowna-downtown-sails-dog-beach-w480.jpg','Dog-Friendly','Bring the whole crew'],
];
const featured = [
 ['knox-mountain-park','/kelowna/outdoors/knox-mountain-park','/images/hiking/venues/knox-mountain-park-20261016-viewpoint-update-w480.jpg','Fresh air & lake views','Knox Mountain Park','Head uphill for a fresh perspective on Kelowna.'],
 ['bna-brewing-kelowna','/kelowna/breweries/bna-brewing-kelowna','/images/venues/bna-brewing-kelowna-g1-2610-w480.jpg','Food, beer & good company','BNA Brewing','Gather your crew for a downtown favourite.'],
 ['kasugai-garden','/kelowna/outdoors/kasugai-garden','/images/hiking/venues/kasugai-garden-20261016-nature-w480.jpg','A quiet little escape','Kasugai Garden','Slow down in this peaceful downtown garden.'],
 ['sprout-bread','/kelowna/cafes/sprout-bread','/images/venues/sprout-bread-2610-w480.jpg','Coffee & something baked','Sprout Bread','Make room for a coffee and a bakery stop.'],
];
function renderBody({count,activeSlugs}) {
 const active=new Set(activeSlugs);
 const picks=featured.filter(p=>active.has(p[0])).map(([,href,img,tag,name,copy])=>`<a class="bw-pick" href="${href}"><img loading="lazy" decoding="async" src="${img}" alt="${name}"><div class="bw-pick-body"><span class="bw-tag">${tag}</span><h3>${name}</h3><p>${copy}</p></div></a>`).join('');
 return `<main id="main" class="bw-landing">
<section class="bw-hero"><div class="bw-hero-inner"><div class="bw-eyebrow">Your Okanagan city guide</div><h1>Kelowna, your way.</h1><p>Great food, lake days and local discoveries.<br>Find your next favourite stop.</p>
<form class="bw-search" action="/browse" method="get"><input type="hidden" name="regions" value="kelowna"><input name="q" aria-label="Search Kelowna" placeholder="Search Kelowna… cafés, beaches, trails"><button class="bw-pill">Search ↗</button></form>
<div class="bw-hero-bottom"><a href="/trip">Build my Kelowna trip ↗</a><span>${Number(count)} ${count===1?'place':'places'} to explore</span></div></div></section>
<div class="bw-wrap"><section class="bw-section" id="explore"><div class="bw-heading"><h2>What’s your Kelowna mood?</h2></div><div class="bw-categories">
${tiles.map(([href,img,title,copy])=>`<a class="bw-tile" href="${href}"><img loading="lazy" decoding="async" src="${img}" alt=""><b>${title}</b><span>${copy}</span></a>`).join('\n')}
</div></section>
<div class="bw-essentials"><div class="bw-status"><small>Explore your way</small><b>A little inspiration. A great day out.</b></div><div class="bw-tools"><a href="/map">Roam Now ↗</a><a href="/kelowna/events">What’s On ↗</a><a href="/browse?regions=kelowna">All places ↗</a></div></div>
<section class="bw-section" id="picks"><div class="bw-heading"><h2>A few places to start</h2><a class="bw-small-link" href="/browse?regions=kelowna">Explore all ${Number(count)} ↗</a></div><div class="bw-picks">${picks}</div></section>
<section class="bw-plan" id="plan"><div class="bw-plan-layout"><div class="bw-plan-intro"><h2>A little planning. More exploring.</h2><p>The essentials, ready when you need them.</p><a href="/trip">Build my Kelowna trip ↗</a></div><div class="bw-accordion">
<details><summary>Getting around & parking</summary><p>Plan your stops, check parking signs and leave time to explore on foot. Use Roam Now to discover places nearby. <a href="/map">Explore the map ↗</a></p></details>
<details><summary>Beaches, trails & lake days</summary><p>Find a lakeside spot or a fresh-air adventure. Check local conditions, seasonal access and posted rules before you go. <a href="/outdoors?regions=kelowna">Find outdoor adventures ↗</a></p></details>
<details><summary>Visiting with kids or dogs</summary><p>Find places that suit your whole crew. Check each listing for family-friendly and dog-friendly details, and confirm current policies with the venue. <a href="/guide/kelowna/kid_friendly">Family-friendly places ↗</a> · <a href="/dog-friendly?regions=kelowna">Dog-friendly places ↗</a></p></details>
</div></div></section></div></main>
<footer class="bw-footer"><a class="bw-brand" href="/">OKANAGAN <span>ROAM</span></a><div><a href="/destinations">All destinations</a><a href="/about">About</a><a href="/contact">Contact</a></div><p>Built for the whole crew, dog included.</p></footer>`;
}
module.exports={styles,renderBody};
