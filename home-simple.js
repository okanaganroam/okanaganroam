'use strict';
const styles=require('./home-simple-styles');
const bi=(en,fr)=>`<span class="home-en">${en}</span><span class="home-fr" lang="fr">${fr}</span>`;
function anchors(html,token){return (html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g)||[]).filter(a=>(new RegExp('class="[^"]*\\b'+token+'\\b')).test(a));}
function photo(a,kind){
 const href=(a.match(/href="([^"]+)"/)||[])[1];const img=(a.match(/<picture\b[\s\S]*?<\/picture>/)||a.match(/<img\b[^>]*>/)||[])[0];
 const title=(a.match(new RegExp('<span class="'+kind+'"([^>]*)>([\\s\\S]*?)<\\/span>'))||[]);
 if(!href||!img||!title[2])return '';
 const copy=(a.match(/<p([^>]*)>([\s\S]*?)<\/p>/)||[]);
 return `<a class="photo" href="${href}">${img}<b${title[1]}>${title[2]}</b>${copy[2]?`<p${copy[1]}>${copy[2]}</p>`:''}</a>`;
}
function venueCard(a){return a.replace(/class="home-pick-card home-editors-card"/,'class="card"').replace('class="home-event-body"','class="card-body home-event-body"');}
function eventCard(a){return a.replace('class="home-event-card"','class="card"').replace('class="home-event-body"','class="card-body home-event-body"');}
function renderFooter(legacy){
 const link=(href,en,fr,attrs='')=>`<a href="${href}"${attrs}>${bi(en,fr)}</a>`;
 const group=(en,fr,links)=>`<details class="home-footer-fold" open><summary>${bi(en,fr)}</summary>${links}</details>`;
 // Keep the existing contact/app dialog markup and scripts, not the legacy visual footer.
 const dialogAt=legacy.indexOf('<dialog');
 const dialogs=dialogAt<0?'':legacy.slice(dialogAt).replace(/<\/footer>\s*$/,'');
 const explore=link('/categories','All categories','Toutes les catégories')+link('/sports','Sports &amp; Recreation','Sports et loisirs')+link('/tours','Tours &amp; Experiences','Visites et expériences')+link('/ski-snow','Ski &amp; Snow','Ski et neige')+link('/hidden-gems','Hidden Gems','Trésors cachés')+link('/local-favorites','Local Favourites','Coups de cœur locaux')+link('/secret-spots','Secret Spots','Coins secrets');
 const destinations=link('/destinations','All 20 destinations','Les 20 destinations')+link('/big-white','Big White','Big White')+link('/silverstar','SilverStar','SilverStar')+link('/osoyoos','Osoyoos','Osoyoos');
 const about=link('/about','About Okanagan Roam','À propos d’Okanagan Roam')+link('/contact','Contact us','Nous joindre',' data-contact-open aria-haspopup="dialog" aria-controls="contactDialog"')+link('/list-your-venue','List your business','Inscrire votre entreprise')+link('/list-an-event','List an event','Ajouter un événement')+link('/owner/login','Business login','Connexion entreprise')+link('https://whistlerroam.com/','Whistler Roam','Whistler Roam')+`<div class="footer-social-links"><a href="https://www.instagram.com/okanaganroam/" target="_blank" rel="noopener">Instagram</a><span aria-hidden="true"> · </span><a href="https://www.facebook.com/profile.php?id=61595021770981" target="_blank" rel="noopener">Facebook</a><span aria-hidden="true"> · </span><a href="https://www.tiktok.com/@okanaganroam" target="_blank" rel="noopener">TikTok</a></div>`+link('/fr','Français','English',' data-home-language');
 return `<footer class="footer"><div class="footer-brand"><a class="logo" href="/" aria-label="Okanagan Roam home">OKANAGAN <span>ROAM</span></a><p>${bi('Built for the whole crew, dog included.<br>Your guide from Enderby to Osoyoos.','Pour toute la famille, chien compris.<br>Votre guide d’Enderby à Osoyoos.')}</p></div>${group('Explore','Explorer',explore)}${group('Destinations','Destinations',destinations)}${group('About &amp; help','À propos et aide',about)}<small>© ${new Date().getFullYear()} Okanagan Roam · ${link('/privacy','Privacy','Confidentialité')} · ${link('/terms','Terms','Conditions')} · <button class="footer-app-link" data-app-teaser-open aria-haspopup="dialog" aria-controls="appTeaserDialog">${bi('App coming soon','Application à venir')}</button></small></footer>${dialogs}`;
}
function renderContent({hero,mood,editors,events,gems,destinations,stats,footer,trip=''}){
 const image=(hero.match(/<picture\b[\s\S]*?<\/picture>/)||hero.match(/<img\b[^>]*>/)||[])[0]||'';
 const title=(hero.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/)||[])[0]||'<h1>Explore the Okanagan</h1>';
 const picks=anchors(editors,'home-editors-card').map(venueCard);
 const eventCards=anchors(events,'home-event-card').map(eventCard);
 const moodCards=anchors(mood,'mood-card').map(a=>photo(a,'mood-card-title')).join('');
 const regionCards=anchors(destinations,'region-card').map(a=>photo(a,'region-card-label')).join('');
 const gemCards=anchors(gems,'hidden-gem-card').map(a=>{
   // Retain the original translated heading and description while using the approved photo geometry.
   const href=(a.match(/href="([^"]+)"/)||[])[1],img=(a.match(/<picture\b[\s\S]*?<\/picture>/)||a.match(/<img\b[^>]*>/)||[])[0];
   const heading=(a.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/)||[])[1]||'';
   const copy=(a.match(/<p\b[^>]*>[\s\S]*?<\/p>/)||[])[0]||'';
   return href&&img?`<a class="photo" href="${href}">${img}<b>${heading.replace(/<svg\b[\s\S]*?<\/svg>/g,'')}</b>${copy}</a>`:'';
 }).join('');
 const section=(id,heading,link,body)=>`<section class="section" id="${id}"><div class="heading">${heading}${link}</div>${body}</section>`;
 const all=(href,en,fr)=>`<a class="view" href="${href}">${bi(en,fr)}</a>`;
 const picksHtml=picks.length?section('editorsPicks',`<div><div class="mini-label">${bi('Local knowledge. Good discoveries.','Des adresses locales. De belles découvertes.')}</div><h2>${bi('Editor’s Picks','Choix de la rédaction')}</h2><p class="sub">${bi('Hand-picked by Okanagan Roam. Never paid for.','Choisis par Okanagan Roam. Jamais payés.')}</p></div>`,'',`<div class="editors">${picks.slice(0,4).join('')}</div>${picks.length>4?`<details class="more-picks"><summary>${bi('More Editor’s Picks →','Plus de choix de la rédaction →')}</summary><div class="editors">${picks.slice(4).join('')}</div></details>`:''}`):'';
 const tripPhoto=(trip.match(/class="trip-cta-img" src="([^"]+)"/)||[])[1];
 const tripStyle=tripPhoto?` style="background-image:linear-gradient(90deg,#102732ef,#10273270),url('${tripPhoto}')"`:'';
 const footerHtml=renderFooter(footer||'');
 return `<div id="homeSimple"><main id="main"><section class="hero" id="heroScenic"><div class="hero-media" aria-hidden="true">${image}</div><div class="eyebrow">${bi('Local discoveries • Enderby to Osoyoos','Découvertes locales • D’Enderby à Osoyoos')}</div>${title}<p>${bi('Great food. Beautiful places. Something new to discover.<br>Your local guide to the whole valley.','Bonne bouffe. Beaux paysages. De nouvelles découvertes.<br>Votre guide local pour toute la vallée.')}</p><form class="quick-search" id="heroSearchForm" role="search" action="/browse" method="get"><input type="search" id="heroSearchInput" name="q" enterkeyhint="search" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="What are you looking for?" data-i18n-aria="search.mainLine" placeholder="Wineries, restaurants, hikes, beaches, hidden gems…" data-i18n-placeholder="search.subLine"><button class="pill" type="submit" id="heroSearchBtn"><span data-i18n="search.button">Search</span> →</button></form><div class="hero-actions"><a class="hero-action" href="/map#near-me"><span class="symbol" aria-hidden="true">◎</span><div><b><i class="live-dot" aria-hidden="true"></i>Roam Now</b><small>${bi('Find what’s open near you','Trouvez les endroits ouverts à proximité')}</small></div><span class="go" aria-hidden="true">→</span></a><a class="hero-action gold" href="/map?show=happy-hour"><span class="symbol" aria-hidden="true">◷</span><div><b>${bi('Happy Hour Now','Happy hour en cours')}</b><small>${bi('Find a happy hour happening now','Trouvez un happy hour en ce moment')}</small></div><span class="go" aria-hidden="true">→</span></a></div><p class="hero-note">${bi('Explore now, plan a weekend, or find your next local favourite.','Explorez maintenant, planifiez une escapade ou trouvez votre prochain coup de cœur.')}</p></section><div class="proof">${stats}</div><div class="wrap">${section('moodCards',`<h2 data-i18n="mood.heading">What are you in the mood for?</h2>`,all('/categories','All categories →','Toutes les catégories →'),`<div class="categories">${moodCards}</div>`)}${picksHtml}${eventCards.length?section('thisWeekend',`<h2>${bi('This Weekend','Cette fin de semaine')}</h2>`,all('/whats-on','All events →','Tous les événements →'),`<div class="events">${eventCards.join('')}</div>`):''}${section('hiddenGems',`<div><h2 data-i18n="gems.heading">Hidden Gems</h2><p class="sub" data-i18n="gems.subtitle">Less crowds. More Okanagan.</p></div>`,all('/hidden-gems','Explore more →','En découvrir plus →'),`<div class="gem-grid">${gemCards}</div>`)}${section('exploreRegions',`<h2>${bi('Where will you roam?','Où irez-vous explorer?')}</h2>`,all('/destinations','All 20 destinations →','Les 20 destinations →'),`<div class="destination-grid">${regionCards}</div>`)}<section class="trip-banner"${tripStyle}><div><div class="eyebrow">${bi('A day out. A weekend away. Your kind of trip.','Une journée. Une escapade. Un séjour à votre image.')}</div><h2>${bi('Build your Okanagan adventure.','Planifiez votre aventure dans l’Okanagan.')}</h2><p>${bi('Tell us what you enjoy. Build My Trip helps bring your food stops, activities and discoveries together.','Dites-nous ce que vous aimez. Build My Trip réunit vos pauses gourmandes, vos activités et vos découvertes.')}</p></div><a class="pill" href="/trip"><span data-i18n="trip.buildMyTrip">Build My Trip</span> →</a></section></div></main>${footerHtml}</div>`;
}
const footerScript=`<script>(function(){var m=matchMedia('(max-width:700px)');function fold(){document.querySelectorAll('#homeSimple .home-footer-fold').forEach(function(d){d.open=!m.matches})}fold();m.addEventListener('change',fold)})();</script>`;
// The legacy button relies on indexable alternate links, which may be disabled.
const languageScript=`<script id="home-simple-language">document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('#langToggle,[data-home-language]');if(!t)return;e.preventDefault();e.stopImmediatePropagation();var fr=document.documentElement.getAttribute('data-page-lang')!=='fr';try{localStorage.setItem('okanaganLang',fr?'fr':'en')}catch(_){}if(window.trackEvent)window.trackEvent('language_change',{language:fr?'fr':'en'});location.assign(fr?'/fr':'/')},true);</script>`;
function apply(html,parts){
 const match=html.match(/<main id="main">([\s\S]*?)<\/main>/);if(!match)return html;
 const hero=(match[1].match(/<section\b[^>]*id="heroScenic"[\s\S]*?<\/section>/)||[])[0]||'';
 const footer=(html.match(/<footer class="home-footer">[\s\S]*?<\/footer>/)||[])[0]||'';
 return html.replace(footer,'').replace(match[0],renderContent({...parts,hero,footer})+footerScript+languageScript).replace('</head>',styles+'</head>');
}
module.exports={renderContent,styles,apply};
