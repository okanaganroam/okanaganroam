'use strict';
// Roam design system (2026-11-11): the homepage's editorial look (home-polish.js) as one shared stylesheet for the
// rest of the site. Three parts:
//   1. TOKENS   - CSS variables and small utility classes (.rp-*) any page can use.
//   2. GUIDE    - the destination / guide template: every list page (body.fd-page: /wineries, /kelowna/restaurants,
//                 /guide/kelowna/patio, /outdoors, /beaches ...) and the town pages (body.town-page, body.kelowna-page).
//   3. VENUE    - the venue profile template, Food & Drink venue pages first (body.fd-venue-page): large photo, line
//                 icons for the facts and highlights, and a map card in the sidebar.
// It is styling only. No markup, heading, sentence or link changes, so English and French pages share it as they
// share every other stylesheet. server.js adds the block to the pages it covers (withRoamPolish) and serves it as
// /styles/shared/roam-polish.css like the other shared blocks. docs/design-system.md shows how to use the classes.
const SERIF = "'Fraunces','Fraunces Fallback',Georgia,serif";
const SANS = "'Nunito','Nunito Fallback',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

const TOKENS = `
/* ===== 1. Tokens ===== */
:root{
--rp-serif:${SERIF};
--rp-sans:${SANS};
--rp-ink:#14252e;--rp-ink-soft:#56666b;--rp-cream:#faf7f0;--rp-paper:#fffdf8;--rp-line:#e6dfce;
--rp-gold:#b08d3c;--rp-gold-soft:#f1dda1;--rp-live:#ff6b57;--rp-open:#2a6b67;
--rp-radius-sm:12px;--rp-radius:18px;--rp-radius-lg:24px;--rp-pill:999px;
--rp-shadow-1:0 1px 2px #14252e0a,0 6px 16px -10px #14252e33;
--rp-shadow-2:0 1px 2px #14252e0a,0 12px 30px -14px #14252e47;
--rp-shadow-3:0 2px 4px #14252e0f,0 24px 48px -18px #14252e5c;
--rp-ease:cubic-bezier(.2,.7,.2,1);
--rp-header-h:73px;
}
@media(max-width:560px){:root{--rp-header-h:53px}}

/* Type: a serif for headings, a sans for everything you tap or read in a row. */
.rp-serif{font-family:var(--rp-serif);font-weight:600;letter-spacing:-.018em;line-height:1.1}
.rp-sans{font-family:var(--rp-sans)}
.rp-eyebrow{font-family:var(--rp-sans);font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:var(--rp-gold)}

/* Depth: three soft shadows, from resting to raised. */
.rp-shadow-1{box-shadow:var(--rp-shadow-1)}
.rp-shadow-2{box-shadow:var(--rp-shadow-2)}
.rp-shadow-3{box-shadow:var(--rp-shadow-3)}

/* A card that lifts on hover, and a photo frame whose image zooms gently. */
.rp-lift{transition:transform .45s var(--rp-ease),box-shadow .45s var(--rp-ease);will-change:transform}
.rp-lift:hover{transform:translateY(-4px);box-shadow:var(--rp-shadow-3)}
.rp-zoom{overflow:hidden}
.rp-zoom img{transition:transform .9s var(--rp-ease);will-change:transform}
.rp-zoom:hover img,.rp-lift:hover .rp-zoom img{transform:scale(1.06)}

/* Live status: <span class="rp-live"><i class="rp-live-dot"></i>Open now</span>. Add .rp-live-gold for happy hour. */
.rp-live{display:inline-flex;align-items:center;gap:8px;font-family:var(--rp-sans);font-weight:800}
.rp-live-dot{position:relative;flex:none;width:9px;height:9px;border-radius:50%;background:var(--rp-live);box-shadow:0 0 0 3px #ff6b5733}
.rp-live-dot::after{content:'';position:absolute;inset:0;border-radius:50%;background:inherit;animation:rpPulse 2s var(--rp-ease) infinite;will-change:transform,opacity}
.rp-live-gold .rp-live-dot{background:#f5cf5e;box-shadow:0 0 0 3px #f5cf5e33}
.rp-live-open .rp-live-dot{background:var(--rp-open);box-shadow:0 0 0 3px #2a6b6726}
@keyframes rpPulse{0%{transform:scale(1);opacity:.75}75%,100%{transform:scale(3.4);opacity:0}}

/* Pill buttons and a card grid. */
.rp-pill{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:9px 18px;border:1px solid #cdc4ab;border-radius:var(--rp-pill);background:var(--rp-paper);color:var(--rp-ink);font-family:var(--rp-sans);font-size:14px;font-weight:800;white-space:nowrap;cursor:pointer;transition:background-color .25s,color .25s,border-color .25s,transform .25s var(--rp-ease)}
.rp-pill:hover{border-color:var(--rp-ink);transform:translateY(-1px)}
.rp-pill[aria-pressed="true"],.rp-pill[aria-selected="true"],.rp-pill.is-active{background:var(--rp-ink);border-color:var(--rp-ink);color:#fff}
.rp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:22px}
@media(max-width:700px){.rp-grid{grid-template-columns:1fr;gap:16px}}
`;

const GUIDE = `
/* ===== 2. Destination / guide template: list pages (body.fd-page) ===== */
/* Header: breadcrumb, banner, title, intro. */
html body.fd-page .category-hero h1{font-family:var(--rp-serif);font-weight:600;font-size:clamp(2.1rem,3.4vw,3rem);line-height:1.06;letter-spacing:-.02em}
html body.fd-page .category-banner{border-radius:var(--rp-radius-lg);box-shadow:var(--rp-shadow-2)}
html body.fd-page .category-banner img{transition:transform 1.2s var(--rp-ease)}
html body.fd-page .category-banner:hover img{transform:scale(1.03)}

/* The filter bar stays with you as you scroll: frosted, under the site header. */
html body.fd-page .fd-toolbar{position:sticky;top:calc(var(--rp-header-h) + 10px);z-index:40;border-radius:var(--rp-radius-lg);border-color:#e6dfcecc;background:#fffaf0e6;-webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%);box-shadow:var(--rp-shadow-2);transition:box-shadow .3s var(--rp-ease)}
html body.fd-page .fd-toolbar .fd-search-input{transition:border-color .2s,box-shadow .25s var(--rp-ease)}
html body.fd-page .fd-toolbar .fd-search-input:focus-visible{outline:0;border-color:var(--rp-ink);box-shadow:0 0 0 3px #f1dda1cc}
html body.fd-page .fd-pop-btn,html body.fd-page .fd-sort select{transition:background-color .2s,color .2s,border-color .2s,transform .25s var(--rp-ease)}
html body.fd-page .fd-pop-btn:hover{border-color:var(--rp-ink);transform:translateY(-1px)}

/* Pages on the older filter layout have no .fd-toolbar: apply() wraps their search box and filter pills in
   .rp-filterbar (or the pills alone, when something sits between the two), which sticks the same way. */
html body.fd-page .rp-filterbar{position:sticky;top:calc(var(--rp-header-h) + 10px);z-index:40;display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;margin:0 0 16px;padding:12px 14px;border:1px solid #e6dfcecc;border-radius:var(--rp-radius-lg);background:#fffaf0e6;-webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%);box-shadow:var(--rp-shadow-2)}
html body.fd-page .rp-filterbar > .fd-search{flex:1 1 300px;max-width:520px;margin:0}
html body.fd-page .rp-filterbar > .fd-search .fd-search-input{width:100%;transition:border-color .2s,box-shadow .25s var(--rp-ease)}
html body.fd-page .rp-filterbar > .fd-search .fd-search-input:focus-visible{outline:0;border-color:var(--rp-ink);box-shadow:0 0 0 3px #f1dda1cc}
html body.fd-page .rp-filterbar > .fd-controls{flex:0 1 auto;width:auto;margin:0}

/* Venue cards: softer depth, a lift and a slow photo zoom on hover. */
html body.golf-page.fd-page .card-grid > li.venue-card.venue-card:not(.rp-off){border-radius:var(--rp-radius);box-shadow:var(--rp-shadow-1);transition:transform .45s var(--rp-ease),box-shadow .45s var(--rp-ease)}
html body.golf-page.fd-page .card-grid > li.venue-card.venue-card:not(.rp-off)::before{transition:transform .9s var(--rp-ease);transform-origin:50% 60%;will-change:transform}
@media(hover:hover){
html body.golf-page.fd-page .card-grid > li.venue-card.venue-card:not(.rp-off):hover{transform:translateY(-4px);box-shadow:var(--rp-shadow-3)}
html body.golf-page.fd-page .card-grid > li.venue-card.venue-card:not(.rp-off):hover::before{transform:scale(1.05)}
}
html body.fd-page .venue-card .venue-card-cue{transition:transform .3s var(--rp-ease)}
html body.fd-page .venue-card:hover .venue-card-cue{transform:translateX(3px)}

/* "Open now" is live: its dot pulses. Closed, unknown and by-appointment stay still. */
html body.fd-page .fd-open-status[data-fd-open="open"]{position:relative}
html body.fd-page .fd-open-status[data-fd-open="open"]::after{content:'';position:absolute;left:0;top:50%;width:8px;height:8px;margin-top:-4px;border-radius:50%;background:currentColor;animation:rpPulse 2.4s var(--rp-ease) infinite;will-change:transform,opacity;pointer-events:none}

/* Phones: only the row of filter pills stays; the search box scrolls away under the header. */
@media(max-width:560px){
html body.fd-page .fd-toolbar{top:calc(var(--rp-header-h) - 60px);border-radius:var(--rp-radius)}
html body.fd-page .rp-filterbar{padding:10px;border-radius:var(--rp-radius)}
html body.fd-page .rp-filterbar.rp-filterbar-search{top:calc(var(--rp-header-h) - 60px)}
html body.fd-page .rp-filterbar > .fd-search{flex-basis:100%;max-width:none}
}
@media(max-width:700px){
html body.fd-page .category-hero h1{font-size:2rem}
}

/* ===== 2b. Town pages (body.town-page, body.kelowna-page) ===== */
body.town-page,body.kelowna-page{font-family:var(--rp-sans);-webkit-font-smoothing:antialiased}
body.town-page h1,body.town-page h2,body.town-page h3,body.kelowna-page h1,body.kelowna-page h2,body.kelowna-page h3{font-family:var(--rp-serif);font-weight:600;letter-spacing:-.018em}
body.town-page .bw-hero h1,body.kelowna-page .bw-hero h1{font-size:clamp(2.5rem,4.6vw,4rem);line-height:1.04;text-shadow:0 2px 26px #0e1f2866}
body.town-page .bw-hero h1,body.town-page .bw-hero p,body.kelowna-page .bw-hero h1,body.kelowna-page .bw-hero p{text-wrap:balance}
body.town-page .bw-eyebrow,body.kelowna-page .bw-eyebrow{letter-spacing:.22em;font-weight:800}
body.town-page .bw-tile,body.town-page .bw-pick,body.kelowna-page .bw-tile,body.kelowna-page .bw-pick{overflow:hidden;border-radius:var(--rp-radius);box-shadow:var(--rp-shadow-1);transition:transform .45s var(--rp-ease),box-shadow .45s var(--rp-ease)}
body.town-page .bw-tile img,body.town-page .bw-pick img,body.kelowna-page .bw-tile img,body.kelowna-page .bw-pick img{transition:transform .9s var(--rp-ease)}
@media(hover:hover){
body.town-page .bw-tile:hover,body.town-page .bw-pick:hover,body.kelowna-page .bw-tile:hover,body.kelowna-page .bw-pick:hover{transform:translateY(-4px);box-shadow:var(--rp-shadow-3)}
body.town-page .bw-tile:hover img,body.town-page .bw-pick:hover img,body.kelowna-page .bw-tile:hover img,body.kelowna-page .bw-pick:hover img{transform:scale(1.06)}
}
body.town-page .bw-pill,body.kelowna-page .bw-pill{font-family:var(--rp-sans);font-weight:800;transition:transform .25s var(--rp-ease),box-shadow .25s var(--rp-ease)}
body.town-page .bw-pill:hover,body.kelowna-page .bw-pill:hover{transform:translateY(-1px);box-shadow:0 8px 18px -8px #14252e80}
body.town-page .bw-essentials,body.kelowna-page .bw-essentials{border-radius:var(--rp-radius);box-shadow:var(--rp-shadow-1)}

/* People who ask for less motion get none. */
@media(prefers-reduced-motion:reduce){
.rp-lift,.rp-zoom img,.rp-pill,.rp-live-dot::after,
html body.fd-page .fd-toolbar,html body.fd-page .rp-filterbar,html body.fd-page .category-banner img,html body.fd-page .card-grid > li.venue-card,html body.fd-page .card-grid > li.venue-card::before,html body.fd-page .fd-open-status::after,html body.fd-page .venue-card .venue-card-cue,
body.town-page .bw-tile,body.town-page .bw-pick,body.town-page .bw-tile img,body.town-page .bw-pick img,body.kelowna-page .bw-tile,body.kelowna-page .bw-pick,body.kelowna-page .bw-tile img,body.kelowna-page .bw-pick img{animation:none!important;transition:none!important;transform:none!important}
}
`;


const VENUE = `
/* ===== 3. Venue profile template: Food & Drink venue pages (body.fd-venue-page) ===== */
/* Large-format photo. */
body.fd-venue-page main > .venue-hero-photo{border-radius:var(--rp-radius-lg);box-shadow:var(--rp-shadow-2)}
body.fd-venue-page main > .venue-hero-photo img{height:clamp(230px,38vw,520px);max-height:none;transition:transform 1.4s var(--rp-ease)}
@media(hover:hover){body.fd-venue-page main > .venue-hero-photo:hover img{transform:scale(1.03)}}
body.fd-venue-page .vg-mosaic{border-radius:var(--rp-radius-lg);overflow:hidden;box-shadow:var(--rp-shadow-2)}

/* Title block. */
body.fd-venue-page .venue-desktop-title{font-family:var(--rp-serif);font-weight:600;font-size:clamp(2.1rem,3.3vw,3rem);line-height:1.05;letter-spacing:-.02em}
body.fd-venue-page .venue-at-a-glance{letter-spacing:.01em}
body.fd-venue-page .venue-open-status[data-open="open"]{position:relative}
body.fd-venue-page .venue-open-status[data-open="open"]::after{content:'';position:absolute;left:0;top:.72em;width:8px;height:8px;margin-top:-4px;border-radius:50%;background:currentColor;animation:rpPulse 2.4s var(--rp-ease) infinite;will-change:transform,opacity;pointer-events:none}

/* Line icons in place of emoji: highlights, the Hours button, the facts in the sidebar. */
body.fd-venue-page .rp-icon{flex:none;width:1.05em;height:1.05em;vertical-align:-.16em;color:var(--rp-gold)}
body.fd-venue-page .fd-highlights span{display:inline-flex;align-items:center;gap:7px}
body.fd-venue-page .venue-key-info .label{display:flex;align-items:center;gap:7px}
body.fd-venue-page .cta .rp-icon{color:currentColor;margin-right:6px}
body.fd-venue-page .cta{transition:transform .25s var(--rp-ease),box-shadow .25s var(--rp-ease),background-color .2s,border-color .2s}
@media(hover:hover){body.fd-venue-page .cta:hover{transform:translateY(-1px);box-shadow:0 8px 18px -10px #14252e80}}

/* Cards and the sidebar. */
body.fd-venue-page .fd-card,body.fd-venue-page .fd-aside .venue-section{border-radius:var(--rp-radius);box-shadow:var(--rp-shadow-1)}
body.fd-venue-page .fd-aside h2{font-family:var(--rp-serif);font-weight:600;letter-spacing:-.01em}
body.fd-venue-page .hours-list li.is-today{font-weight:800;color:var(--rp-ink)}

/* Map card: a real map of the town with this place pinned; the whole card opens directions. */
body.fd-venue-page .rp-map{display:block;position:relative;margin:0 0 16px;border-radius:var(--rp-radius);overflow:hidden;box-shadow:var(--rp-shadow-1);background:#e8eee9;color:var(--rp-ink);text-decoration:none;transition:transform .45s var(--rp-ease),box-shadow .45s var(--rp-ease)}
body.fd-venue-page .rp-map-frame{position:relative;display:block;height:190px;overflow:hidden}
body.fd-venue-page .rp-map-canvas{position:absolute;display:block;transition:transform 1.2s var(--rp-ease);transform-origin:var(--rp-pin-x) var(--rp-pin-y)}
body.fd-venue-page .rp-map-canvas img{display:block;width:100%;height:100%;max-width:none}
body.fd-venue-page .rp-map-pin{position:absolute;left:var(--rp-pin-x);top:var(--rp-pin-y);width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:var(--rp-live);border:3px solid #fff;box-shadow:0 2px 8px #14252e80}
body.fd-venue-page .rp-map-pin::after{content:'';position:absolute;inset:-3px;border-radius:50%;background:var(--rp-live);animation:rpPulse 2.4s var(--rp-ease) infinite;z-index:-1}
body.fd-venue-page .rp-map-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;background:var(--rp-paper);font-family:var(--rp-sans);font-size:14px;font-weight:800}
body.fd-venue-page .rp-map-bar span:last-child{transition:transform .3s var(--rp-ease)}
body.fd-venue-page .rp-map-credit{position:absolute;right:6px;bottom:6px;padding:2px 6px;border-radius:6px;background:#ffffffd9;font-family:var(--rp-sans);font-size:10px;font-weight:600;color:#3d4a50}
@media(hover:hover){
body.fd-venue-page .rp-map:hover{transform:translateY(-3px);box-shadow:var(--rp-shadow-3)}
body.fd-venue-page .rp-map:hover .rp-map-canvas{transform:scale(1.08)}
body.fd-venue-page .rp-map:hover .rp-map-bar span:last-child{transform:translateX(4px)}
}

/* Nearby places. */
body.fd-venue-page .nearby-card{border-radius:var(--rp-radius);box-shadow:var(--rp-shadow-1);transition:transform .45s var(--rp-ease),box-shadow .45s var(--rp-ease)}
body.fd-venue-page .nearby-card img{transition:transform .9s var(--rp-ease)}
body.fd-venue-page .nearby-link{overflow:hidden}
body.fd-venue-page .nearby-name{font-family:var(--rp-serif);font-weight:600}
@media(hover:hover){
body.fd-venue-page .nearby-card:hover{transform:translateY(-4px);box-shadow:var(--rp-shadow-3)}
body.fd-venue-page .nearby-card:hover img{transform:scale(1.05)}
}

@media(max-width:700px){
body.fd-venue-page main > .venue-hero-photo{border-radius:var(--rp-radius)}
body.fd-venue-page .rp-map-frame{height:170px}
}
@media(prefers-reduced-motion:reduce){
body.fd-venue-page .venue-hero-photo img,body.fd-venue-page .venue-open-status::after,body.fd-venue-page .cta,body.fd-venue-page .rp-map,body.fd-venue-page .rp-map-canvas,body.fd-venue-page .rp-map-pin::after,body.fd-venue-page .nearby-card,body.fd-venue-page .nearby-card img{animation:none!important;transition:none!important;transform:none!important}
}
`;

// ---- venue page markup helpers ----
// Line icons (24px grid, 1.8 stroke, like the site's ui-icon set) for the venue page's facts and highlights.
const ICONS = {
  pin: '<path d="M12 21s-6.5-6.1-6.5-11.3a6.5 6.5 0 0 1 13 0C18.5 14.9 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.3"></circle>',
  phone: '<path d="M6.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.500 6.200 2 2 0 0 1 6.500 4z"></path>',
  menu: '<rect x="5" y="4" width="14" height="17" rx="2"></rect><path d="M9 9h6M9 13h6M9 17h4"></path>',
  social: '<circle cx="12" cy="12" r="4"></circle><path d="M16 8v5a3 3 0 0 0 5 0v-1a9 9 0 1 0-3.500 7.100"></path>',
  price: '<path d="M12 3v18M16.500 7.500c-.8-1.300-2.400-2-4.500-2-2.500 0-4.200 1.200-4.200 3 0 4.200 9.200 2 9.200 6.500 0 1.900-1.900 3.300-4.800 3.300-2.300 0-4.100-.8-5-2.300"></path>',
  cuisine: '<path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-1.700 1.500-2.500 3.500-2.500 6.500 0 2 1 3 2.500 3.500V21"></path>',
  glass: '<path d="M5 4h14l-7 8zM12 12v8M8 20h8"></path>',
  clock: '<circle cx="12" cy="12" r="8.500"></circle><path d="M12 7.500V12l3 2"></path>',
  paw: '<circle cx="7" cy="8" r="1.600"></circle><circle cx="12" cy="6" r="1.600"></circle><circle cx="17" cy="8" r="1.600"></circle><path d="M12 11c-3 0-5.500 2.500-5.500 5 0 1.700 1.300 2.500 2.800 2.500 1 0 1.700-.5 2.700-.5s1.700.5 2.700.5c1.500 0 2.800-.8 2.800-2.500 0-2.500-2.500-5-5.500-5z"></path>',
  child: '<circle cx="12" cy="6" r="2.500"></circle><path d="M7 11h10M12 9v6M9.500 21l2.500-6 2.500 6"></path>',
  sun: '<circle cx="12" cy="12" r="3.800"></circle><path d="M12 3v2.200M12 18.800V21M3 12h2.200M18.800 12H21M5.600 5.600l1.600 1.600M16.800 16.800l1.600 1.600M5.600 18.400l1.600-1.600M16.800 7.200l1.600-1.600"></path>',
  waves: '<path d="M3 9c2 0 2-1.500 4.500-1.500S10 9 12 9s2-1.500 4.500-1.500S19 9 21 9M3 14c2 0 2-1.500 4.500-1.500S10 14 12 14s2-1.500 4.500-1.500S19 14 21 14M3 19c2 0 2-1.500 4.500-1.500S10 19 12 19s2-1.500 4.500-1.500S19 19 21 19"></path>',
  wheat: '<path d="M12 21V8M12 8c-2-.5-3-2-3-4 2 .2 3 1.500 3 4zM12 8c2-.5 3-2 3-4-2 .2-3 1.500-3 4zM12 13c-2-.5-3.500-2-3.500-4M12 13c2-.5 3.500-2 3.500-4M12 18c-2-.5-3.500-2-3.500-4M12 18c2-.5 3.500-2 3.500-4"></path>',
  sprout: '<path d="M12 21v-9M12 12c0-3.500-2.500-5.500-6-5.500 0 3.500 2.500 5.500 6 5.500zM12 10c0-3 2-5 5.500-5 0 3-2 5-5.500 5z"></path>',
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19c3-4 6-6.500 10-8.500"></path>',
  music: '<path d="M9 18V6l10-2v12"></path><circle cx="6.500" cy="18" r="2.500"></circle><circle cx="16.500" cy="16" r="2.500"></circle>',
  group: '<circle cx="9" cy="8.500" r="3"></circle><path d="M3 19c.5-3.500 3-5.500 6-5.500s5.500 2 6 5.500M16 5.800a3 3 0 0 1 0 5.400M18 13.800c1.700.8 2.700 2.500 3 5.200"></path>',
  tv: '<rect x="3.500" y="6" width="17" height="11" rx="2"></rect><path d="M8.500 20.500h7"></path>',
  juice: '<path d="M7 8h10l-1 12.500H8zM6 8h12M13 8l1.500-5H17"></path>',
};
function icon(name) {
  const paths = ICONS[name];
  return paths ? `<svg class="rp-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths.replace(/(\d)\.(\d)00\b/g, '$1.$2')}</svg>` : '';
}
// The emoji a Food & Drink venue page uses for its highlights, and the fact labels in its sidebar (English and French).
const HIGHLIGHT_ICONS = { '🐾': 'paw', '🧸': 'child', '🌿': 'sun', '🌅': 'waves', '🌾': 'wheat', '🌱': 'sprout', '🥗': 'leaf', '🎶': 'music', '👥': 'group', '📺': 'tv', '🥤': 'juice' };
const LABEL_ICONS = { Address: 'pin', Adresse: 'pin', Phone: 'phone', 'Téléphone': 'phone', Menu: 'menu', Social: 'social', 'Réseaux': 'social', Price: 'price', Prix: 'price', Cuisine: 'cuisine', 'Happy hour': 'glass' };
function venueIcons(html) {
  let out = html.replace(/(<div class="fd-highlights">)([\s\S]*?)(<\/div>)/, (m, a, body, z) => a + body.replace(/<span>(\S+) /g, (s, e) => (HIGHLIGHT_ICONS[e] ? `<span>${icon(HIGHLIGHT_ICONS[e])}` : s)) + z);
  out = out.replace(/(<div class="venue-section venue-key-info">)([\s\S]*?)(\n<\/div>)/, (m, a, body, z) => a + body.replace(/<span class="label">([^<]+)<\/span>/g, (s, label) => (LABEL_ICONS[label] ? `<span class="label">${icon(LABEL_ICONS[label])}${label}</span>` : s)) + z);
  return out.replace(/(<a class="cta secondary" href="#venueHours">)🕒 /, `$1${icon('clock')}`);
}
// The map card for a venue page's sidebar. \`map\` is the town's pre-rendered map (public/images/regions/maps: src, its
// size in CSS px, its zoom and centre); the pin is placed from the venue's own coordinates (Web Mercator, 512px tiles).
// Returns '' when the place has no coordinates or falls outside the picture, so a wrong pin is never shown.
function mapCard({ lat, lng, map, href, label, credit, esc }) {
  if (!map || !href || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(map.z) || !Array.isArray(map.view)) return '';
  const merc = (la) => { const s = Math.sin(la * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
  const world = 512 * Math.pow(2, map.z);
  const x = map.w / 2 + ((lng - map.view[1]) / 360) * world, y = map.h / 2 + (merc(lat) - merc(map.view[0])) * world;
  if (!(x >= 12 && x <= map.w - 12 && y >= 12 && y <= map.h - 12)) return '';
  const px = Math.round(x * 10) / 10, py = Math.round(y * 10) / 10;
  // The picture is shown at its own size and slid so the pin sits in the middle of the frame, never past an edge.
  const canvas = `width:${map.w}px;height:${map.h}px;left:clamp(calc(100% - ${map.w}px), calc(50% - ${px}px), 0px);top:clamp(calc(100% - ${map.h}px), calc(50% - ${py}px), 0px);--rp-pin-x:${px}px;--rp-pin-y:${py}px`;
  return `<a class="rp-map" href="${esc(href)}" rel="nofollow noopener" target="_blank" data-track="directions"><span class="rp-map-frame"><span class="rp-map-canvas" style="${canvas}"><img src="${esc(map.src)}" alt="" width="${map.w}" height="${map.h}" loading="lazy" decoding="async"><i class="rp-map-pin" aria-hidden="true"></i></span><span class="rp-map-credit">${esc(credit)}</span></span><span class="rp-map-bar"><span>${esc(label)}</span><span aria-hidden="true">→</span></span></a>`;
}

const css = TOKENS + GUIDE + VENUE;
// The block exactly as it is added to a page; server.js swaps it for a <link> to /styles/shared/roam-polish.css.
const block = `<style>${css}</style>`;
// Pages the guide template covers: list pages and town pages.
const COVERED = /<body[^>]*class="(?:[^"]*\s)?(?:fd-page|town-page|kelowna-page|fd-venue-page)(?:\s[^"]*)?"/;
const LIST_PAGE = /<body[^>]*class="(?:[^"]*\s)?fd-page(?:\s[^"]*)?"/;
const VENUE_PAGE = /<body[^>]*class="(?:[^"]*\s)?fd-venue-page(?:\s[^"]*)?"/;
// The end (index after the closing tag) of the <div> that starts at \`from\`, or -1.
function divEnd(html, from) {
  const re = /<(\/?)div\b[^>]*>/g;
  re.lastIndex = from;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return re.lastIndex;
    if (depth < 0) return -1;
  }
  return -1;
}
// A list page on the older filter layout (no .fd-toolbar): its search box and filter pills go into one .rp-filterbar so
// they can stick together. When something sits between them (a guide's type tabs), only the pills are wrapped. The
// elements themselves, their ids and their order are unchanged, so the page's filter script works as before.
function filterBar(html) {
  if (html.indexOf('class="fd-toolbar"') !== -1 || html.indexOf('<div class="rp-filterbar') !== -1) return html;
  const cAt = html.search(/<div class="fd-controls(?: js)?">/);
  if (cAt === -1) return html;
  const cEnd = divEnd(html, cAt);
  if (cEnd === -1) return html;
  const sAt = html.lastIndexOf('<div class="fd-search">', cAt);
  const sEnd = sAt === -1 ? -1 : divEnd(html, sAt);
  const together = sEnd !== -1 && sEnd <= cAt && html.slice(sEnd, cAt).trim() === '';
  const start = together ? sAt : cAt;
  return html.slice(0, start) + '<div class="rp-filterbar' + (together ? ' rp-filterbar-search' : '') + '">' + html.slice(start, cEnd) + '</div>' + html.slice(cEnd);
}
function apply(html) {
  if (typeof html !== 'string' || !COVERED.test(html) || html.indexOf(block) !== -1) return html;
  const at = html.indexOf('</head>');
  if (at === -1) return html;
  const out = html.slice(0, at) + block + '\n' + html.slice(at);
  if (VENUE_PAGE.test(out)) return venueIcons(out);
  return LIST_PAGE.test(out) ? filterBar(out) : out;
}

module.exports = { filterBar, css, block, apply, TOKENS, GUIDE, VENUE, icon, venueIcons, mapCard };
